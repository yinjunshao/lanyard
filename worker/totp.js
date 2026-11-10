// Authenticator-app sign-in (RFC 6238 TOTP: Authy, Google Authenticator, 1Password...).
// A backup for passkeys: the account ID picks the account, the 6-digit code
// proves it. Wrong tries are throttled per IP and per account, and a code
// can't be used twice. Secrets are AES-GCM encrypted at rest when TOTP_KEY is set.
import { one, run, now } from "./db.js";
import { isThrottled, recordMiss } from "./codes.js";
import { createSession, requireUser, HttpError } from "./session.js";
import { notifySignIn } from "./alerts.js";
import { findUserByEmail, normEmail } from "./email-auth.js";

const STEP = 30;
const DIGITS = 6;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32(bytes) {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function unbase32(s) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of s) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

export async function hotp(secretBytes, counter) {
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new DataView(new ArrayBuffer(8));
  msg.setUint32(0, Math.floor(counter / 2 ** 32));
  msg.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = h[19] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** The step a code matches (within one step of clock drift), or null. */
export async function matchStep(secretB32, code, at = Date.now()) {
  const secret = unbase32(secretB32);
  const cur = Math.floor(at / 1000 / STEP);
  for (const step of [cur, cur - 1, cur + 1]) {
    if ((await hotp(secret, step)) === code) return step;
  }
  return null;
}

/* --------------------------- secret encryption --------------------------- */

async function aesKey(env) {
  if (!env.TOTP_KEY) return null;
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.TOTP_KEY));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function seal(env, plain) {
  const key = await aesKey(env);
  if (!key) return plain;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
  const all = new Uint8Array(12 + ct.length);
  all.set(iv); all.set(ct, 12);
  return "v1:" + btoa(String.fromCharCode(...all));
}

async function open(env, stored) {
  if (!stored.startsWith("v1:")) return stored;
  const key = await aesKey(env);
  if (!key) throw new HttpError(500, "Authenticator sign-in is misconfigured.");
  const all = Uint8Array.from(atob(stored.slice(3)), (ch) => ch.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, key, all.slice(12));
  return new TextDecoder().decode(pt);
}

/* -------------------------------- handlers -------------------------------- */

const normCode = (raw) => String(raw || "").replace(/\s+/g, "");
const validCode = (s) => /^\d{6}$/.test(s);

// Starts (or restarts) setup. The secret is shown once here and is not active
// until a first code is confirmed. Replacing an active one needs the old code.
export async function setup(c, db) {
  const user = requireUser(c);
  if (user.has_totp) throw new HttpError(409, "Authenticator sign-in is already on. Turn it off first to set it up again.");
  const secret = base32(crypto.getRandomValues(new Uint8Array(20)));
  await run(db,
    `INSERT INTO totp_secrets (user_id, secret, confirmed, last_step, created_at) VALUES (?, ?, 0, 0, ?)
     ON CONFLICT(user_id) DO UPDATE SET secret = excluded.secret, confirmed = 0, last_step = 0, created_at = excluded.created_at`,
    user.id, await seal(c.env, secret), now());
  const label = encodeURIComponent(`Lanyard:${user.id}`);
  return c.json({
    accountId: user.id,
    secret,
    uri: `otpauth://totp/${label}?secret=${secret}&issuer=Lanyard&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`,
  });
}

export async function confirm(c, db, rawCode) {
  const user = requireUser(c);
  const code = normCode(rawCode);
  const row = await one(db, "SELECT secret FROM totp_secrets WHERE user_id = ? AND confirmed = 0", user.id);
  if (!row) throw new HttpError(400, "Start authenticator setup first.");
  const step = validCode(code) ? await matchStep(await open(c.env, row.secret), code) : null;
  if (step === null) throw new HttpError(400, "That code doesn't match. Check the time on your phone and try the next one.");
  await db.batch([
    db.prepare("UPDATE totp_secrets SET confirmed = 1, last_step = ? WHERE user_id = ?").bind(step, user.id),
    db.prepare("UPDATE users SET has_totp = 1, is_guest = 0 WHERE id = ?").bind(user.id),
  ]);
  return c.json({ ok: true });
}

export async function disable(c, db) {
  const user = requireUser(c);
  await db.batch([
    db.prepare("DELETE FROM totp_secrets WHERE user_id = ?").bind(user.id),
    db.prepare("UPDATE users SET has_totp = 0 WHERE id = ?").bind(user.id),
  ]);
  return c.json({ ok: true });
}

export async function redeem(c, db, rawId, rawCode) {
  const ip = c.req.header("cf-connecting-ip") || "local";
  const id = String(rawId || "").trim().toLowerCase();
  const keys = [`auth:ip:${ip}`, `auth:totp:${id.slice(0, 32)}`];
  if (await isThrottled(db, keys)) {
    return c.json({ error: "Too many wrong tries. Wait a few minutes and try again.", code: "throttled" }, 429);
  }
  const code = normCode(rawCode);
  // The account is named by its email (or, for accounts without one, its ID).
  const userId = id.includes("@") ? (await findUserByEmail(db, normEmail(id)))?.id : id;
  const row = validCode(code) && /^[0-9a-f]{10}$/.test(userId || "")
    ? await one(db, "SELECT user_id, secret, last_step FROM totp_secrets WHERE user_id = ? AND confirmed = 1", userId)
    : null;
  const step = row ? await matchStep(await open(c.env, row.secret), code) : null;
  // The step is claimed atomically, so one code can't sign in twice.
  const claimed = step !== null && step > row.last_step
    ? (await db.prepare("UPDATE totp_secrets SET last_step = ? WHERE user_id = ? AND last_step < ?").bind(step, userId, step).run()).meta?.changes === 1
    : false;
  if (!claimed) {
    await recordMiss(db, keys);
    return c.json({ error: "That email (or account ID) and code don't match. Codes change every 30 seconds.", code: "bad_totp" }, 404);
  }
  await createSession(c, db, userId);
  await notifySignIn(c, db, userId, "authenticator app");
  return c.json({ ok: true });
}
