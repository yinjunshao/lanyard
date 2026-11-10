// "New sign-in" alerts and "sign out other devices". The alert goes to the
// account's verified email when a passkey, one-time code, recovery key or
// authenticator code opens a session. Email sign-in doesn't alert: whoever
// has the inbox already received the code there.
import { one, run, all } from "./db.js";
import { bump, HOUR } from "./ratelimit.js";
import { requireUser } from "./session.js";
import { sendMail } from "./mail.js";
import { signInAlertEmail } from "./mail-templates.js";
import { emailLink } from "./unsub.js";

export function describeDevice(ua = "") {
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return [browser, os].filter(Boolean).join(" on ") || "Unknown device";
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
        settingsUrl: `${origin}/app/settings`,
      }),
    });
  } catch (e) { console.error(e); }
}

// Signed-in devices, newest first.
export async function listSessions(c, db) {
  const user = requireUser(c);
  const rows = await all(db, "SELECT id, created_at, user_agent FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 20", user.id, Date.now());
  return c.json({
    sessions: rows.map((r) => ({ current: r.id === c.get("sessionId"), device: describeDevice(r.user_agent || ""), at: r.created_at })),
  });
}

export async function signOutOthers(c, db) {
  const user = requireUser(c);
  const r = await run(db, "DELETE FROM sessions WHERE user_id = ? AND id != ?", user.id, c.get("sessionId") || "");
  return c.json({ ok: true, signedOut: r.meta?.changes || 0 });
}

export async function setEventEmails(c, db, on) {
  const user = requireUser(c);
  await run(db, "UPDATE users SET notify_events = ? WHERE id = ?", on ? 1 : 0, user.id);
  return c.json({ ok: true });
}
