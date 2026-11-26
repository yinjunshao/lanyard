// F74 (D063): claiming a profile the admin made, from its link /claim/p/<token>. Every route is a POST with the token in
// the JSON body, never in the address or a query string, so it is in no log line or audit row. The routes never make a
// guest account (index.js lists them in noGuest).
//   POST /api/claim/look    { token }                                   the card as it will look, where the details came from
//   POST /api/claim/photo   { token }                                   its photo (the only place it is served before the claim)
//   POST /api/claim/delete  { token }                                   "This isn't me / delete it": erases it at once
//   POST /api/claim/start   { token, email }                            emails a 6-digit code (purpose 'claim')
//   POST /api/claim/finish  { token, email, code, acceptTerms, over18 } the claim: the account becomes theirs, signed in
// A wrong token, one past its time, one replaced by Copy link and one already used all get the same answer (LINK_GONE).
// Every guess takes its place on a per-IP and a per-token counter before it is checked (takeTry, D040); a right token or
// code gives it back. The claim itself is one batch gated on the link row, so two claims at once have one winner.
import { one, run, now } from "./db.js";
import { sha256Hex, createSession, endSession, HttpError } from "./session.js";
import { takeTry, giveBack } from "./codes.js";
import { bump, HOUR } from "./ratelimit.js";
import { getImage } from "./media.js";
import { issue, checkCode, sendLimited, findUserByEmail, normEmail, validEmail } from "./email-auth.js";
import { claimCodeEmail } from "./mail.js";
import { termsScope, claimNoticeStmts } from "./legal.js";
import { linkByToken, erasePremade, isPremade, TOKEN_RE } from "./premade.js";
import { readSuggestion, writeSuggestion, mailSuggestion, copyPhotoToSuggest } from "./suggestedEdits.js";
import { institutionById } from "./institutions.js";

export const LINK_GONE = { error: "This link has expired or was already used.", code: "link_gone" };
export const HAS_ACCOUNT = {
  error: "You already have a Lanyard account with this email. Sign in, and we'll offer these details to you instead.",
  code: "has_account",
};
const THROTTLED = { error: "Too many tries. Wait a few minutes and try again.", code: "throttled" };
const SENDS_PER_LINK = 5; // claim codes one link can send in an hour

/** The counters a request takes a place on: its IP, and the token it carries (as a hash: the token is never a key). */
async function keysOf(c, token) {
  const ip = c.req.header("cf-connecting-ip") || "local";
  const t = typeof token === "string" && token ? (await sha256Hex(`claim-rl:${token.slice(0, 64)}`)).slice(0, 24) : "none";
  return [`code:claim:ip:${ip}`, `code:claim:t:${t}`];
}

/** Takes a try, then reads the link. Returns { link, keys } or a Response to send. */
async function open(c, body) {
  const db = c.env.DB;
  const keys = await keysOf(c, body.token);
  if (!(await takeTry(db, keys))) return { res: c.json(THROTTLED, 429) };
  const link = TOKEN_RE.test(String(body.token || "")) ? await linkByToken(db, body.token) : null;
  if (!link) return { res: c.json(LINK_GONE, 404) };
  return { link, keys };
}

/**
 * F75 (D064). Someone proved (with the emailed code) that they own an email that already has a Lanyard account. Nothing
 * is merged and nobody is signed in: this profile's details and photo become a suggestion on that account, which they
 * see after they sign in (and by email if its address is verified), and the profile made for them is erased with its
 * link. The details go through the same reading as an admin's suggestion (the allow-list and Edit profile's checks).
 * Returns true once it has handed the details over; false (nothing changed, the link keeps working) if the account
 * has no profile to suggest to, or the made profile is gone.
 */
export async function handOffToExistingAccount(env, { premadeId, accountId, source }) {
  const db = env.DB;
  if (!(await isPremade(db, premadeId))) return false;
  const [made, target] = await Promise.all([
    one(db, "SELECT * FROM profiles WHERE user_id = ?", premadeId),
    one(db, "SELECT * FROM profiles WHERE user_id = ?", accountId),
  ]);
  if (!made || !target) return false;
  const body = {};
  for (const k of ["name", "mode", "uni", "course", "year", "company", "role", "headline", "about"]) if (made[k]) body[k] = made[k];
  if (institutionById(made.institution_id)) body.institutionId = made.institution_id;
  if (Array.isArray(made.tags) && made.tags.length) body.tags = made.tags;
  if (made.links && typeof made.links === "object" && Object.keys(made.links).length) body.links = made.links;
  const read = readSuggestion(body, target);
  if (read.error) return false;
  const photoKey = made.photo_key ? await copyPhotoToSuggest(env, made.photo_key) : null;
  if (Object.keys(read.fields).length || photoKey) {
    const s = await writeSuggestion(env, { userId: accountId, fields: read.fields, source, photoKey });
    await mailSuggestion(env, { userId: accountId, id: s.id });
  }
  await erasePremade(env, premadeId);
  return true;
}

/**
 * The claim, as one batch gated on the link row still being there (and in time): the Terms and 18+ record, the account
 * made the claimer's, and the link deleted. A second claim that runs after it finds no link row, so every statement in
 * it changes nothing. Returns true for the one that won.
 */
export async function claimWrite(db, { userId, hash, email, ts = now() }) {
  const live = "EXISTS (SELECT 1 FROM claim_links WHERE user_id = ? AND token_hash = ? AND expires_at > ?)";
  const args = [userId, hash, ts];
  const out = await db.batch([
    ...claimNoticeStmts(db, userId, termsScope(), live, args),
    db.prepare(`UPDATE users SET is_guest = 0, email_verified = 1, recovery_email = ?, email_domain = ?, over_18 = 1,
        age_confirmed_at = ?, claimed_at = ?, last_seen_at = ?, inactive_warned_at = NULL
      WHERE id = ? AND admin_made = 1 AND is_guest = 1 AND ${live}`)
      .bind(email, email.split("@")[1], ts, ts, ts, userId, ...args),
    db.prepare("DELETE FROM claim_links WHERE user_id = ? AND token_hash = ?").bind(userId, hash),
  ]);
  return out[2]?.meta?.changes === 1;
}

export function registerClaimRoutes(app, { cardView }) {
  app.post("/api/claim/look", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { res, link, keys } = await open(c, body);
    if (res) return res;
    const db = c.env.DB;
    const card = await one(db, "SELECT * FROM cards WHERE user_id = ? ORDER BY is_default DESC, created_at LIMIT 1", link.userId);
    const profile = await one(db, "SELECT * FROM profiles WHERE user_id = ?", link.userId);
    const view = card && profile ? await cardView(db, card, { profile }) : null;
    if (!view) return c.json(LINK_GONE, 404);
    await giveBack(db, keys);
    const hasPhoto = !!view.profile.photo;
    // The photo is fetched with the token (POST /api/claim/photo); its storage address is not given out before the claim.
    view.profile = { ...view.profile, photo: null, userId: undefined };
    return c.json({ card: view, hasPhoto, source: link.source, expiresAt: link.expiresAt });
  });

  app.post("/api/claim/photo", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { res, link, keys } = await open(c, body);
    if (res) return res;
    await giveBack(c.env.DB, keys);
    const p = await one(c.env.DB, "SELECT photo_key FROM profiles WHERE user_id = ?", link.userId);
    const img = p?.photo_key ? await getImage(c.env, p.photo_key, { noStore: true }) : null;
    return img || c.json({ error: "This card has no photo." }, 404);
  });

  // "This isn't me / delete it": the token is enough. Its only job is this one card.
  app.post("/api/claim/delete", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { res, link, keys } = await open(c, body);
    if (res) return res;
    await giveBack(c.env.DB, keys);
    await erasePremade(c.env, link.userId);
    return c.json({ ok: true });
  });

  // A code goes to any address typed here, whether or not it has an account, so this never says which do.
  app.post("/api/claim/start", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const email = normEmail(body.email);
    if (!validEmail(email)) return c.json({ error: "That email doesn't look right." }, 400);
    const { res, link, keys } = await open(c, body);
    if (res) return res;
    const db = c.env.DB;
    await giveBack(db, keys);
    if ((await bump(db, `claim:send:${link.hash.slice(0, 24)}`, HOUR)) > SENDS_PER_LINK) return c.json({ error: "That's a lot of codes for one link. Wait an hour and try again.", code: "throttled" }, 429);
    await sendLimited(c, db, email);
    try { await issue(c, db, email, "claim", link.userId, claimCodeEmail); }
    catch (e) { console.error("claim code mail failed", e?.message || e); throw Object.assign(new HttpError(502, "We couldn't send that email. Try again in a moment."), { expose: true }); }
    return c.json({ ok: true });
  });

  app.post("/api/claim/finish", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const db = c.env.DB;
    const email = normEmail(body.email);
    const code = String(body.code || "").replace(/\s/g, "");
    const { res, link, keys } = await open(c, body);
    if (res) return res;
    // Claiming is signing up, so it needs what sign-up needs. The person agrees here: the admin never can.
    if (body.acceptTerms !== true || body.over18 !== true) {
      await giveBack(db, keys);
      return c.json({ error: "Please confirm you're 18 or over and agree to the Terms and Privacy Policy.", code: "terms_required" }, 400);
    }
    if (!validEmail(email) || !/^\d{6}$/.test(code) || !(await checkCode(db, email, "claim", link.userId, code))) {
      return c.json({ error: "That code isn't right or has expired. Ask for a new one.", code: "bad_code" }, 400);
    }
    await giveBack(db, keys);
    // An email that already has an account: no merge, no sign-in, no session. F75: the details become a suggestion on
    // that account and this profile is erased (handOffToExistingAccount); the answer is the same either way.
    const holder = await findUserByEmail(db, email);
    if (holder && holder.id !== link.userId) {
      await handOffToExistingAccount(c.env, { premadeId: link.userId, accountId: holder.id, source: link.source });
      return c.json(HAS_ACCOUNT, 409);
    }
    let won;
    try { won = await claimWrite(db, { userId: link.userId, hash: link.hash, email }); }
    catch (e) {
      // The one unique rule on users: a verified email belongs to one account. Someone took it in the meantime.
      if (/UNIQUE|constraint/i.test(String(e?.message || e))) return c.json(HAS_ACCOUNT, 409);
      throw e;
    }
    if (!won) return c.json(LINK_GONE, 404);
    // One browser, one account: whoever was signed in here is signed out, and the claimer is signed in.
    if (c.get("user")) await endSession(c, db);
    await run(db, "DELETE FROM email_codes WHERE email = ? AND purpose = 'claim'", email);
    await createSession(c, db, link.userId);
    return c.json({ ok: true, next: "/app/profile?claimed=1" });
  });
}
