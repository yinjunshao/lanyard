// Sign-in without a passkey: one-time device-link codes (sign in on a second
// device from one that is already signed in) and long recovery keys (for a
// lost phone). Both end in an ordinary session cookie, like a passkey login.
import { all, one, run, newToken, now } from "./db.js";
import { isThrottled, recordMiss } from "./codes.js";

// Same cookie name as session.js (not imported so this file has no framework deps).
const SESSION_COOKIE = "lanyard_session";
const SESSION_MS = 365 * 24 * 60 * 60 * 1000;
export const LINK_TTL_MS = 5 * 60 * 1000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 symbols, so byte & 31 is unbiased

function randomChars(n) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map((b) => ALPHABET[b & 31]).join("");
}
const group = (s, size) => s.match(new RegExp(`.{1,${size}}`, "g")).join("-");
export const normaliseSecret = (raw) => String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const throttleKeys = (c) => [`auth:ip:${c.req.header("cf-connecting-ip") || "local"}`];

// Opens a session for userId and sets the cookie.
export async function startSession(c, db, userId) {
  const sid = newToken();
  const ts = now();
  await run(
    db,
    "INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)",
    sid, userId, ts, ts + SESSION_MS, c.req.header("user-agent")?.slice(0, 200) || null
  );
  const secure = c.req.url.startsWith("https://") ? "; Secure" : "";
  c.header(
    "Set-Cookie",
    `${SESSION_COOKIE}=${sid}; Max-Age=${SESSION_MS / 1000}; Path=/; HttpOnly; SameSite=Lax${secure}`,
    { append: true }
  );
  return sid;
}

// Signed-in device asks for a code to sign in somewhere else.
export async function createLinkCode(c, db) {
  const user = c.get("user");
  const ts = now();
  await run(db, "DELETE FROM login_codes WHERE user_id = ? OR expires_at < ?", user.id, ts);
  const code = randomChars(8);
  await run(
    db,
    "INSERT INTO login_codes (code, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    code, user.id, ts, ts + LINK_TTL_MS
  );
  return c.json({ code: group(code, 4), expiresAt: ts + LINK_TTL_MS });
}

// The other device presents the code. Single use.
export async function redeemLinkCode(c, db, raw) {
  const keys = throttleKeys(c);
  if (await isThrottled(db, keys)) {
    return c.json({ error: "Too many wrong tries. Wait a few minutes and try again.", code: "throttled" }, 429);
  }
  const code = normaliseSecret(raw);
  const row = code.length === 8
    ? await one(db, "SELECT user_id FROM login_codes WHERE code = ? AND expires_at > ?", code, now())
    : null;
  if (!row) {
    await recordMiss(db, keys);
    return c.json({ error: "That code isn't valid or has expired. Ask for a fresh one on your other device.", code: "bad_code" }, 404);
  }
  const used = await db.prepare("DELETE FROM login_codes WHERE code = ?").bind(code).run();
  if (used.meta?.changes === 0) return c.json({ error: "That code was already used.", code: "bad_code" }, 404);
  await startSession(c, db, row.user_id);
  return c.json({ ok: true });
}

// Makes (or replaces) the account's recovery key. Shown once; only a hash is kept.
export async function createRecoveryKey(c, db) {
  const user = c.get("user");
  const key = randomChars(16);
  const hash = await sha256Hex(key);
  await db.batch([
    db.prepare(
      `INSERT INTO recovery_keys (user_id, key_hash, created_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET key_hash = excluded.key_hash, created_at = excluded.created_at`
    ).bind(user.id, hash, now()),
    db.prepare("UPDATE users SET has_recovery = 1 WHERE id = ?").bind(user.id),
  ]);
  return c.json({ key: group(key, 4) });
}

export async function redeemRecoveryKey(c, db, raw) {
  const keys = throttleKeys(c);
  if (await isThrottled(db, keys)) {
    return c.json({ error: "Too many wrong tries. Wait a few minutes and try again.", code: "throttled" }, 429);
  }
  const key = normaliseSecret(raw);
  const row = key.length === 16
    ? await one(db, "SELECT user_id FROM recovery_keys WHERE key_hash = ?", await sha256Hex(key))
    : null;
  if (!row) {
    await recordMiss(db, keys);
    return c.json({ error: "That recovery key doesn't match. Check for typos.", code: "bad_key" }, 404);
  }
  await startSession(c, db, row.user_id);
  return c.json({ ok: true });
}
