// Email sign-in: a 6-digit code sent to the address, valid 10 minutes, single
// use, 5 tries. Also how an address gets added to an account (same code, 'verify').
// Start never reveals whether an address has an account.
import { one, run, now } from "./db.js";
import { bump, HOUR } from "./ratelimit.js";
import { isThrottled, recordMiss } from "./codes.js";
import { createSession, requireUser, sha256Hex, HttpError } from "./session.js";
import { sendMail, codeEmail, welcomeEmail } from "./mail.js";
import { logConsentStmt } from "./legal.js";

const TTL_MS = 10 * 60 * 1000;
const MAX_TRIES = 5;

export const normEmail = (raw) => String(raw || "").trim().toLowerCase();
export const validEmail = (e) => e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

const sixDigits = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
const hashCode = (email, code) => sha256Hex(`${email}:${code}`);

/** The account that signs in with this address. Verified owners win; legacy unverified entries are a fallback. */
export function findUserByEmail(db, email) {
  return one(db,
    `SELECT u.id FROM users u WHERE u.recovery_email = ?
     ORDER BY u.email_verified DESC, EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = u.id) DESC, u.created_at ASC LIMIT 1`,
    email);
}

async function issue(c, db, email, purpose, userId) {
  const code = sixDigits();
  const ts = now();
  await run(db, "DELETE FROM email_codes WHERE expires_at < ?", ts);
  await run(db,
    `INSERT OR REPLACE INTO email_codes (email, purpose, user_id, code_hash, attempts, created_at, expires_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
    email, purpose, userId || "", await hashCode(email, code), ts, ts + TTL_MS);
  const link = `${new URL(c.req.url).origin}/signin?email=${encodeURIComponent(email)}&otp=${code}`;
  await sendMail(c.env, "accounts", { to: email, ...codeEmail(code, link) });
}

// Spends one try; true when the code is right (and consumed).
async function checkCode(db, email, purpose, userId, code) {
  const row = await one(db,
    "SELECT code_hash, attempts FROM email_codes WHERE email = ? AND purpose = ? AND user_id = ? AND expires_at > ?",
    email, purpose, userId || "", now());
  if (!row || row.attempts >= MAX_TRIES) return false;
  if (row.code_hash !== await hashCode(email, code)) {
    await run(db, "UPDATE email_codes SET attempts = attempts + 1 WHERE email = ? AND purpose = ? AND user_id = ?",
      email, purpose, userId || "");
    return false;
  }
  const used = await run(db, "DELETE FROM email_codes WHERE email = ? AND purpose = ? AND user_id = ?", email, purpose, userId || "");
  return used.meta?.changes === 1;
}

async function sendLimited(c, db, email) {
  const ip = c.req.header("cf-connecting-ip") || "local";
  if ((await bump(db, `mail:ip:${ip}`, HOUR)) > 20 || (await bump(db, `mail:e:${email}`, HOUR)) > 6) {
    throw new HttpError(429, "Too many emails requested. Try again in a bit.", "throttled");
  }
}

export async function start(c, db, rawEmail) {
  const email = normEmail(rawEmail);
  if (!validEmail(email)) throw new HttpError(400, "That email doesn't look right.");
  await sendLimited(c, db, email);
  const user = await findUserByEmail(db, email);
  if (user) await issue(c, db, email, "signin", null).catch((e) => console.error(e));
  return c.json({ ok: true });
}

export async function verify(c, db, rawEmail, rawCode) {
  const email = normEmail(rawEmail);
  const code = String(rawCode || "").replace(/\s/g, "");
  const keys = [`auth:ip:${c.req.header("cf-connecting-ip") || "local"}`, `auth:email:${email.slice(0, 120)}`];
  if (await isThrottled(db, keys)) return c.json({ error: "Too many wrong tries. Wait a few minutes and try again.", code: "throttled" }, 429);
  const user = /^\d{6}$/.test(code) && validEmail(email) ? await findUserByEmail(db, email) : null;
  if (!user || !(await checkCode(db, email, "signin", null, code))) {
    await recordMiss(db, keys);
    return c.json({ error: "That code isn't right or has expired. Ask for a new one.", code: "bad_code" }, 404);
  }
  // Receiving the code proves the address, so a legacy entry becomes verified.
  await run(db,
    `UPDATE users SET email_verified = 1 WHERE id = ? AND email_verified = 0
       AND NOT EXISTS (SELECT 1 FROM users o WHERE o.recovery_email = ? AND o.email_verified = 1)`,
    user.id, email).catch(() => {});
  await createSession(c, db, user.id);
  return c.json({ ok: true });
}

// Signed in: send a code to a new address. Nothing is saved until it's confirmed.
export async function addStart(c, db, rawEmail) {
  const user = requireUser(c);
  const email = normEmail(rawEmail);
  if (!validEmail(email)) throw new HttpError(400, "That email doesn't look right.");
  const taken = await one(db, "SELECT id FROM users WHERE recovery_email = ? AND email_verified = 1 AND id != ?", email, user.id);
  if (taken) throw new HttpError(409, "That email already has a Lanyard account. Sign in with it instead.", "email_taken");
  await sendLimited(c, db, email);
  try { await issue(c, db, email, "verify", user.id); }
  catch (e) { console.error(e); throw new HttpError(502, "We couldn't send that email. Try again in a moment."); }
  return c.json({ ok: true });
}

export async function addConfirm(c, db, rawEmail, rawCode, marketing) {
  const user = requireUser(c);
  const email = normEmail(rawEmail);
  const keys = [`auth:ip:${c.req.header("cf-connecting-ip") || "local"}`, `auth:verify:${user.id}`];
  if (await isThrottled(db, keys)) throw new HttpError(429, "Too many wrong tries. Wait a few minutes and try again.", "throttled");
  const code = String(rawCode || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code) || !(await checkCode(db, email, "verify", user.id, code))) {
    await recordMiss(db, keys);
    throw new HttpError(400, "That code isn't right or has expired.");
  }
  try {
    await db.batch([
      db.prepare(`UPDATE users SET recovery_email = ?, email_domain = ?, email_verified = 1, is_guest = 0,
         marketing_optin = ?, marketing_at = ? WHERE id = ?`)
        .bind(email, email.split("@")[1], marketing ? 1 : 0, marketing ? now() : null, user.id),
      ...(marketing ? [logConsentStmt(db, user.id, "marketing", "granted")] : []),
    ]);
  } catch {
    throw new HttpError(409, "That email already has a Lanyard account. Sign in with it instead.", "email_taken");
  }
  // A failed welcome mail must not fail the confirmation.
  await sendMail(c.env, "accounts", { to: email, ...welcomeEmail(new URL(c.req.url).origin) }).catch((e) => console.error(e));
  return c.json({ ok: true });
}

export async function setMarketing(c, db, optin) {
  const user = requireUser(c);
  await db.batch([
    db.prepare("UPDATE users SET marketing_optin = ?, marketing_at = ? WHERE id = ?").bind(optin ? 1 : 0, optin ? now() : null, user.id),
    logConsentStmt(db, user.id, "marketing", optin ? "granted" : "withdrawn"),
  ]);
  return c.json({ ok: true });
}
