// F45: the email a new person types when they connect or make a card (D049).
//
// - It is kept only in users.pending_email. It is never written to recovery_email, so sign-in
//   (findUserByEmail, which reads only recovery_email) can never find an account by it, and it is
//   never shown to anyone but its own account (/api/me and the person's own data download).
// - Our first email to it carries a "Confirm it's you" link. The link is random, only its SHA-256 is
//   stored, it works once and for 14 days, and it is compared in constant time. Opening it shows a
//   button (mail scanners open links); pressing it confirms the address and signs nobody in.
// - While unconfirmed the address gets at most PENDING_MAIL_CAP emails in total. Anything that
//   emails a person (F48, F49) asks mailableAddress(), which claims the send in one conditional write.
// - Never confirmed, it is cleared 30 days after it was typed (purgePending, daily).
import { Hono } from "hono";
import { one, run, newId, newToken, now } from "./db.js";
import { sha256Hex } from "./session.js";
import { bump, DAY } from "./ratelimit.js";
import { takeTry, giveBack } from "./codes.js";
import { sendMail, escapeHtml } from "./mail.js";
import { confirmEmail } from "./mail-templates.js";
import { sameText } from "./unsub.js";

export const CONFIRM_TTL = 14 * DAY;      // a confirm link works this long
export const PENDING_KEEP = 30 * DAY;     // an address nobody confirms is cleared after this
export const PENDING_MAIL_CAP = 2;        // emails to an address while it is unconfirmed, in total
const CONFIRMS_PER_ADDRESS_A_DAY = 3;     // first emails to one address from all accounts together

/** An IANA time zone the runtime's Intl knows (canonical spelling), or null. Anything else is ignored. */
export function validTz(raw) {
  if (typeof raw !== "string" || !raw || raw.length > 64) return null;
  try { return new Intl.DateTimeFormat("en-GB", { timeZone: raw }).resolvedOptions().timeZone || null; } catch { return null; }
}

/** Stores the browser's time zone when it is valid and new. Never fails the request it rides on. */
export async function saveTz(db, userId, raw) {
  const tz = validTz(raw);
  if (tz) await run(db, "UPDATE users SET tz = ? WHERE id = ? AND tz IS NOT ?", tz, userId, tz).catch(() => {});
}

/**
 * Keeps `email` (already normalised and valid) as the person's unconfirmed address. A new address starts at
 * 0 emails and a new 30-day clock, and links for any older address stop working; typing the same address
 * again changes neither. Does nothing for an account with a confirmed email.
 * Returns { saved, unmailed }: unmailed is true when nothing has been sent to this address yet.
 */
export async function setPending(db, userId, email) {
  const row = await one(db,
    `UPDATE users SET
       pending_mails = CASE WHEN pending_email IS ? THEN pending_mails ELSE 0 END,
       pending_email_at = CASE WHEN pending_email IS ? THEN pending_email_at ELSE ? END,
       pending_email = ?
     WHERE id = ? AND email_verified = 0
     RETURNING pending_mails`, email, email, now(), email, userId);
  await run(db, "DELETE FROM email_confirms WHERE user_id = ? AND email != ?", userId, email);
  return { saved: !!row, unmailed: !!row && row.pending_mails === 0 };
}

/**
 * Where to email this person, for F48, F49 and anything else that writes to them.
 * - A confirmed address: { to, pending: false }, always (no claim; the caller's own switches still apply).
 * - An unconfirmed one: { to, pending: true } only while fewer than PENDING_MAIL_CAP emails have gone to it.
 *   This call IS the claim: pending_mails goes up in the same conditional UPDATE that reads the address, so two
 *   jobs at once can never both send the third email. Add withConfirm(message, await confirmLink(...)).
 *   If the send then fails, hand it back with releaseMail().
 * - Otherwise null: send nothing.
 * Sign-in codes, security alerts and feedback reminders do not use this: they go only to confirmed addresses.
 */
export async function mailableAddress(db, userId) {
  const u = await one(db, "SELECT recovery_email, email_verified FROM users WHERE id = ?", userId);
  if (!u) return null;
  if (u.email_verified === 1 && u.recovery_email) return { to: u.recovery_email, pending: false };
  const row = await one(db,
    `UPDATE users SET pending_mails = pending_mails + 1
      WHERE id = ? AND email_verified = 0 AND pending_email IS NOT NULL AND pending_mails < ?
      RETURNING pending_email`, userId, PENDING_MAIL_CAP);
  return row ? { to: row.pending_email, pending: true } : null;
}

/** SQL for "this users row has an address mailableAddress() could give": a quick filter for jobs, never a claim. */
export const hasMailableSql = (u) => `((${u}.email_verified = 1 AND ${u}.recovery_email IS NOT NULL) OR (${u}.pending_email IS NOT NULL AND ${u}.pending_mails < ${PENDING_MAIL_CAP}))`;

/** Gives back a send claimed by mailableAddress() when the email could not be sent. */
export async function releaseMail(db, userId, to) {
  await run(db, "UPDATE users SET pending_mails = pending_mails - 1 WHERE id = ? AND pending_email = ? AND pending_mails > 0", userId, to);
}

/**
 * A new "Confirm it's you" link for `email`, which must still be this person's unconfirmed address; null if
 * it is not. Each email gets its own link (an earlier one keeps working until it is used or expires).
 * `origin` is the site's address: new URL(c.req.url).origin in a request, publicOrigin(env) in a cron job.
 */
export async function confirmLink(db, origin, userId, email) {
  const id = newId(), secret = newToken(), ts = now();
  const out = await run(db,
    `INSERT INTO email_confirms (id, user_id, email, secret_hash, created_at, expires_at)
     SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND pending_email = ? AND email_verified = 0)`,
    id, userId, email, await sha256Hex(secret), ts, ts + CONFIRM_TTL, userId, email);
  return out.meta?.changes === 1 ? `${origin}/api/email/confirm?t=${id}${secret}` : null;
}

/** The first email to a new unconfirmed address. Never throws; a send that fails is handed back. */
export async function sendConfirm(env, origin, userId, reason) {
  const db = env.DB;
  try {
    const u = await one(db, "SELECT pending_email FROM users WHERE id = ? AND email_verified = 0 AND pending_mails = 0", userId);
    if (!u?.pending_email) return false;
    // Many throwaway accounts typing one address cannot fill its inbox. The counter's key is a hash, so the
    // address itself is not kept in rate_limits after the account is deleted.
    const key = `pendmail:${(await sha256Hex(u.pending_email)).slice(0, 32)}`;
    if ((await bump(db, key, DAY)) > CONFIRMS_PER_ADDRESS_A_DAY) return false;
    const to = await mailableAddress(db, userId);
    if (!to?.pending) return false;
    const url = await confirmLink(db, origin, userId, to.to);
    if (!url) { await releaseMail(db, userId, to.to); return false; }
    try { await sendMail(env, "accounts", { to: to.to, ...confirmEmail({ url, reason }) }); }
    catch (e) { console.error("pending email: the confirm email could not be sent"); await releaseMail(db, userId, to.to); return false; }
    return true;
  } catch (e) {
    console.error("pending email: could not prepare the confirm email");
    return false;
  }
}

/**
 * Confirms `email` for this person. "confirmed": it is now their sign-in email. "taken": another account already
 * has it confirmed, so it is not confirmed here and the pending address is cleared (which account is never said).
 * "invalid": it is no longer their pending address.
 */
export async function confirmAddress(db, userId, email) {
  let changed = 0;
  try {
    const out = await run(db,
      `UPDATE users SET recovery_email = ?, email_domain = ?, email_verified = 1, is_guest = 0,
         pending_email = NULL, pending_email_at = NULL, pending_mails = 0
       WHERE id = ? AND pending_email = ? AND email_verified = 0
         AND NOT EXISTS (SELECT 1 FROM users o WHERE o.recovery_email = ? AND o.email_verified = 1 AND o.id != ?)`,
      email, email.split("@")[1], userId, email, email, userId);
    changed = out.meta?.changes || 0;
  } catch { changed = 0; /* the unique index on confirmed emails: someone confirmed it a moment ago */ }
  if (changed === 1) {
    await run(db, "DELETE FROM email_confirms WHERE user_id = ?", userId);
    return "confirmed";
  }
  const cleared = await run(db,
    "UPDATE users SET pending_email = NULL, pending_email_at = NULL, pending_mails = 0 WHERE id = ? AND pending_email = ? AND email_verified = 0",
    userId, email);
  if (cleared.meta?.changes === 1) {
    await run(db, "DELETE FROM email_confirms WHERE user_id = ?", userId);
    return "taken";
  }
  return "invalid";
}

/** Daily: clears addresses nobody confirmed within 30 days, and links that expired or point at an old address. */
export async function purgePending(db, ts = now()) {
  const r = await run(db,
    "UPDATE users SET pending_email = NULL, pending_email_at = NULL, pending_mails = 0 WHERE pending_email IS NOT NULL AND pending_email_at < ?",
    ts - PENDING_KEEP);
  await run(db,
    `DELETE FROM email_confirms WHERE expires_at < ?
       OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = email_confirms.user_id AND u.pending_email = email_confirms.email AND u.email_verified = 0)`, ts);
  return r.meta?.changes || 0;
}

/* --------------------------- the confirm link --------------------------- */

export const confirmApp = new Hono();

const TOKEN = /^([0-9a-f]{10})([0-9a-f]{32})$/;
// Referrer-Policy same-origin: the token never leaves in a Referer, and the button still sends a real Origin (no-referrer
// would send "Origin: null", which the same-origin check refuses). Paper and ink, with a dark version; the button is the strap colour dark enough for white text (4.5:1).
const STYLE = `body{font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 16px;line-height:1.5;background:#F4F1EA;color:#1B1A17}
a{color:#B03E1F}.quiet{color:#6B675F;font-size:13px}
button{font:inherit;font-size:16px;padding:10px 18px;min-height:44px;background:#B03E1F;color:#fff;border:0;border-radius:6px}
@media (prefers-color-scheme:dark){body{background:#1B1A17;color:#F4F1EA}a{color:#F08A66}.quiet{color:#B5B0A6}}`;
const page = (status, body) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Lanyard</title>
<style>${STYLE}</style><body>${body}</body>`,
  { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "same-origin" } });
const linkTo = (href, label) => `<p><a href="${href}">${label}</a></p>`;
// One answer for a used, expired, wrong, made-up or out-of-date link: it says nothing about which.
const notValid = () => page(400, `<h1>This link doesn't work</h1><p>It has expired, has already been used, or is not complete. You can confirm your email with a code in Lanyard instead, under Settings, Account.</p>${linkTo("/app/settings/account", "Open Lanyard")}`);
const tooMany = () => page(429, "<h1>Too many tries</h1><p>Wait a few minutes and try again.</p>");

// Counted before it is checked, and given back when it was right (D040), so only wrong links stay counted.
const keysOf = (c) => [`confirm:ip:${c.req.header("cf-connecting-ip") || "local"}`];

// The row behind a link, or null. The secret is hashed even when there is no row, and compared in constant time.
async function lookup(db, t) {
  const m = TOKEN.exec(typeof t === "string" ? t : "");
  if (!m) return null;
  const [row, hash] = await Promise.all([
    one(db, "SELECT id, user_id, email, secret_hash, expires_at FROM email_confirms WHERE id = ?", m[1]),
    sha256Hex(m[2]),
  ]);
  if (!row || !sameText(hash, row.secret_hash) || !(row.expires_at > now())) return null;
  const u = await one(db, "SELECT 1 AS x FROM users WHERE id = ? AND pending_email = ? AND email_verified = 0", row.user_id, row.email);
  return u ? row : null;
}

confirmApp.get("/api/email/confirm", async (c) => {
  const db = c.env.DB;
  const keys = keysOf(c);
  if (!(await takeTry(db, keys))) return tooMany();
  const t = c.req.query("t");
  const row = await lookup(db, t);
  if (!row) return notValid();
  await giveBack(db, keys);
  return page(200, `<h1>Confirm your email</h1><p>Is <strong>${escapeHtml(row.email)}</strong> your email? Once it is confirmed you can sign in to Lanyard with it on any device.</p>
<form method="post" action="/api/email/confirm?t=${escapeHtml(t)}"><button>Confirm it's me</button></form>
<p class="quiet">If this wasn't you, close this page. Nothing changes.</p>`);
});

confirmApp.post("/api/email/confirm", async (c) => {
  const db = c.env.DB;
  const keys = keysOf(c);
  if (!(await takeTry(db, keys))) return tooMany();
  const row = await lookup(db, c.req.query("t"));
  if (!row) return notValid();
  // Single use: only one request can delete the row, however many arrive together.
  const used = await one(db, "DELETE FROM email_confirms WHERE id = ? AND secret_hash = ? RETURNING user_id, email", row.id, row.secret_hash);
  if (!used) return notValid();
  await giveBack(db, keys);
  const outcome = await confirmAddress(db, used.user_id, used.email);
  if (outcome === "confirmed") {
    return page(200, `<h1>Email confirmed</h1><p>You can now sign in to Lanyard with <strong>${escapeHtml(used.email)}</strong> on any device.</p>${linkTo("/app", "Open Lanyard")}`);
  }
  if (outcome === "taken") {
    return page(409, `<h1>That email already has an account</h1><p>That email already has a Lanyard account. Sign in with it instead.</p>${linkTo("/signin", "Sign in")}`);
  }
  return notValid();
});
