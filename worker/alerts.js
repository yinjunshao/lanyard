// "New sign-in" alerts and "sign out other devices". The alert goes to the
// account's verified email when a passkey, one-time code, recovery key or
// authenticator code opens a session. Email sign-in doesn't alert: whoever
// has the inbox already received the code there.
import { one, run, all } from "./db.js";
import { bump, HOUR } from "./ratelimit.js";
import { HttpError, requireUser, sha256Hex } from "./session.js";
import { sendMail } from "./mail.js";
import { signInAlertEmail, passkeyRemovedEmail } from "./mail-templates.js";
import { emailLink } from "./unsub.js";

export function describeDevice(ua = "") {
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return [browser, os].filter(Boolean).join(" on ") || "Unknown device";
}

/** F43: tells the account's verified email that a passkey was removed. Best-effort, like the sign-in alert, and not
 *  rate-limited: each removal is rare and each one should be told. */
export async function notifyPasskeyRemoved(c, db, userId, name) {
  try {
    const u = await one(db, "SELECT recovery_email AS email FROM users WHERE id = ? AND email_verified = 1", userId);
    if (!u?.email) return;
    const origin = new URL(c.req.url).origin;
    await sendMail(c.env, "accounts", {
      to: u.email,
      ...passkeyRemovedEmail({
        name,
        device: describeDevice(c.req.header("user-agent") || ""),
        where: c.req.header("cf-ipcountry") || "",
        at: Date.now(),
        revokeUrl: await emailLink(c.env, origin, userId, "revoke"),
        settingsUrl: `${origin}/app/settings/security`,
      }),
    });
  } catch (e) { console.error(e); }
}

/** Best-effort: a failed alert must never block the sign-in itself. */
export async function notifySignIn(c, db, userId, how) {
  try {
    const u = await one(db, "SELECT recovery_email AS email FROM users WHERE id = ? AND email_verified = 1", userId);
    if (!u?.email) return;
    if ((await bump(db, `alert:${userId}`, 10 * 60 * 1000)) > 1) return; // one alert per 10 minutes
    const origin = new URL(c.req.url).origin;
    await sendMail(c.env, "accounts", {
      to: u.email,
      ...signInAlertEmail({
        how,
        device: describeDevice(c.req.header("user-agent") || ""),
        where: c.req.header("cf-ipcountry") || "",
        at: Date.now(),
        revokeUrl: await emailLink(c.env, origin, userId, "revoke"),
        settingsUrl: `${origin}/app/settings/security`,
      }),
    });
  } catch (e) { console.error(e); }
}

// An opaque, short handle for one session row, so the page can name a device
// without ever seeing the stored session id (which is itself a hash of the cookie,
// or on a very old row the cookie itself). It cannot be turned back into either.
const handleOf = async (sessionId) => (await sha256Hex(`session-handle:${sessionId}`)).slice(0, 16);

// Signed-in devices, newest first.
export async function listSessions(c, db) {
  const user = requireUser(c);
  const rows = await all(db, "SELECT id, created_at, expires_at, user_agent FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 20", user.id, Date.now());
  return c.json({
    sessions: await Promise.all(rows.map(async (r) => ({
      id: await handleOf(r.id),
      current: r.id === c.get("sessionId"),
      device: describeDevice(r.user_agent || ""),
      at: r.created_at,
      until: r.expires_at,
    }))),
  });
}

// Ends one of the caller's own other sessions. A handle that is not theirs looks
// the same as one that does not exist.
export async function signOutDevice(c, db, handle) {
  const user = requireUser(c);
  if (!/^[0-9a-f]{16}$/.test(handle || "")) throw new HttpError(404, "That device is not signed in any more.", "not_found");
  const rows = await all(db, "SELECT id FROM sessions WHERE user_id = ? AND expires_at > ? LIMIT 50", user.id, Date.now());
  let target = null;
  for (const r of rows) if ((await handleOf(r.id)) === handle) { target = r.id; break; }
  if (!target) throw new HttpError(404, "That device is not signed in any more.", "not_found");
  if (target === c.get("sessionId")) throw new HttpError(400, "That is this device. Use Log out instead.", "this_device");
  await run(db, "DELETE FROM sessions WHERE id = ? AND user_id = ?", target, user.id);
  return c.json({ ok: true });
}

export async function signOutOthers(c, db) {
  const user = requireUser(c);
  const r = await run(db, "DELETE FROM sessions WHERE user_id = ? AND id != ?", user.id, c.get("sessionId") || "");
  return c.json({ ok: true, signedOut: r.meta?.changes || 0 });
}

// F48: the one switch for emails about reminders you set (and, in F49, finish-your-profile emails).
export async function setReminderEmails(c, db, on) {
  const user = requireUser(c);
  await run(db, "UPDATE users SET notify_reminders = ? WHERE id = ?", on ? 1 : 0, user.id);
  return c.json({ ok: true });
}

export async function setEventEmails(c, db, on) {
  const user = requireUser(c);
  await run(db, "UPDATE users SET notify_events = ? WHERE id = ?", on ? 1 : 0, user.id);
  return c.json({ ok: true });
}
