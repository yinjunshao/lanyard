// HTTP-only cookie sessions. Guests get an anonymous session immediately so the
// browser remembers them; claiming turns the user row into a passkey account.
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { newToken, now, one, run } from "./db.js";

export const COOKIE = "lanyard_session";
const SESSION_DAYS = 365;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

function secure(c) {
  return c.req.url.startsWith("https://");
}

function baseCookie(c) {
  return {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: secure(c),
    maxAge: SESSION_DAYS * 24 * 3600,
  };
}

// Creates (or returns) the session row + user for the current browser.
// A first-time visitor becomes a guest user with no profile yet.
export async function ensureSession(c, db) {
  const sid = getCookie(c, COOKIE);
  if (sid) {
    const session = await one(
      db,
      `SELECT s.id AS sid, s.expires_at, u.* FROM sessions s
       JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
      sid
    );
    if (session) {
      c.set("sessionId", session.sid);
      c.set("user", {
        id: session.id,
        created_at: session.created_at,
        is_guest: session.is_guest,
        recovery_email: session.recovery_email,
        email_domain: session.email_domain,
        verified_student: session.verified_student,
        has_passkey: session.has_passkey,
        has_recovery: session.has_recovery,
        over_18: session.over_18,
      });
      return;
    }
  }

  // First visit: mint guest user + session.
  const { newId } = await import("./db.js");
  const userId = newId();
  const sessionId = newToken();
  const ts = now();
  await db.batch([
    db.prepare(
      `INSERT INTO users (id, created_at, is_guest) VALUES (?, ?, 1)`
    ).bind(userId, ts),
    db.prepare(
      `INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(sessionId, userId, ts, ts + SESSION_MS, c.req.header("user-agent")?.slice(0, 200) || null),
  ]);
  setCookie(c, COOKIE, sessionId, baseCookie(c));
  c.set("sessionId", sessionId);
  c.set("user", { id: userId, created_at: ts, is_guest: 1 });
}

// Refresh sliding expiry periodically (only if >30 days left).
export async function touchSession(c, db) {
  const sid = c.get("sessionId");
  if (!sid) return;
  const s = await one(db, "SELECT expires_at FROM sessions WHERE id = ?", sid);
  if (s && s.expires_at - now() < SESSION_MS / 12) {
    await run(db, "UPDATE sessions SET expires_at = ? WHERE id = ?", now() + SESSION_MS, sid);
    setCookie(c, COOKIE, sid, baseCookie(c));
  }
}

export function endSession(c, db) {
  const sid = c.get("sessionId");
  if (sid) run(db, "DELETE FROM sessions WHERE id = ?", sid);
  deleteCookie(c, COOKIE, { path: "/", secure: secure(c) });
}

// Hono middleware factory.
export const sessionMiddleware = (envName = "DB") => async (c, next) => {
  await ensureSession(c, c.env[envName]);
  await next();
};

export function requireUser(c) {
  const u = c.get("user");
  if (!u) return c.json({ error: "no session" }, 401);
  return u;
}
