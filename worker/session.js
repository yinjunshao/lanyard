// HTTP-only cookie sessions.
//
// - The cookie holds a random token; the database stores only its SHA-256, so a
//   leaked database backup can't be replayed as live sessions. Rows created
//   before hashing (id = raw token) still work and are upgraded on next use.
// - Reading pages never creates an account. A guest user + session is minted
//   only when a browser does something that needs one (a POST/PUT/DELETE such
//   as connecting or checking in), and that is rate-limited per IP so a bot
//   can't fill the users table.
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { newId, newToken, now, one, run } from "./db.js";
import { bump } from "./ratelimit.js";

export const COOKIE = "lanyard_session";
const SESSION_DAYS = 365;
export const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const GUESTS_PER_IP = 120;            // per 10 minutes; a busy venue shares one IP
const GUEST_WINDOW_MS = 10 * 60 * 1000;

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const isSecure = (c) => c.req.url.startsWith("https://");

function cookieOptions(c) {
  return { httpOnly: true, sameSite: "Lax", path: "/", secure: isSecure(c), maxAge: SESSION_DAYS * 24 * 3600 };
}

function userFromRow(row) {
  return {
    id: row.id,
    created_at: row.created_at,
    is_guest: row.is_guest,
    recovery_email: row.recovery_email,
    email_domain: row.email_domain,
    verified_student: row.verified_student,
    has_passkey: row.has_passkey,
    has_recovery: row.has_recovery,
    has_totp: row.has_totp,
    email_verified: row.email_verified,
    marketing_optin: row.marketing_optin,
    notify_events: row.notify_events,
    over_18: row.over_18,
  };
}

/** Opens a new session for userId and sets the cookie. */
export async function createSession(c, db, userId) {
  const token = newToken();
  const hashed = await sha256Hex(token);
  const ts = now();
  await run(
    db,
    "INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)",
    hashed, userId, ts, ts + SESSION_MS, c.req.header("user-agent")?.slice(0, 200) || null
  );
  setCookie(c, COOKIE, token, cookieOptions(c));
  c.set("sessionId", hashed);
  await run(db, "UPDATE users SET last_seen_at = ?, inactive_warned_at = NULL WHERE id = ?", ts, userId);
}

// Loads the session for this request. With { create: true }, a browser with no
// valid session becomes a new guest (rate-limited per IP).
export async function ensureSession(c, db, { create = false } = {}) {
  const token = getCookie(c, COOKIE);
  if (token && /^[0-9a-f]{32}$/.test(token)) {
    const hashed = await sha256Hex(token);
    const row = await one(
      db,
      `SELECT s.id AS sid, u.* FROM sessions s
       JOIN users u ON u.id = s.user_id WHERE s.id IN (?, ?) AND s.expires_at > ?`,
      hashed, token, now()
    );
    if (row) {
      if (row.sid === token) await run(db, "UPDATE sessions SET id = ? WHERE id = ?", hashed, token); // upgrade legacy row
      c.set("sessionId", hashed);
      c.set("user", userFromRow(row));
      // Once a day is enough: it only decides when an unused account expires.
      if (!row.last_seen_at || now() - row.last_seen_at > 86_400_000) {
        await run(db, "UPDATE users SET last_seen_at = ?, inactive_warned_at = NULL WHERE id = ?", now(), row.id);
      }
      return;
    }
  }
  c.set("user", null);
  if (!create) return;

  const ip = c.req.header("cf-connecting-ip") || "local";
  if ((await bump(db, `guest:ip:${ip}`, GUEST_WINDOW_MS)) > GUESTS_PER_IP) {
    throw new HttpError(429, "Too many new visitors from this network. Wait a few minutes and try again.", "throttled");
  }
  const userId = newId();
  const ts = now();
  await run(db, "INSERT INTO users (id, created_at, is_guest) VALUES (?, ?, 1)", userId, ts);
  await createSession(c, db, userId);
  c.set("user", { id: userId, created_at: ts, is_guest: 1 });
}

export async function endSession(c, db) {
  const sid = c.get("sessionId");
  if (sid) await run(db, "DELETE FROM sessions WHERE id = ?", sid);
  deleteCookie(c, COOKIE, { path: "/", secure: isSecure(c) });
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

// Hono middleware. Reads never create users; writes do (as a guest).
export const sessionMiddleware = (envName = "DB") => async (c, next) => {
  await ensureSession(c, c.env[envName], { create: !SAFE.has(c.req.method) });
  await next();
};

/** The signed-in (or guest) user, or a 401. */
export function requireUser(c) {
  const u = c.get("user");
  if (!u) throw new HttpError(401, "Please sign in or make a card first.", "no_session");
  return u;
}
