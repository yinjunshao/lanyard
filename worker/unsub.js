// Signed one-click links in emails, no sign-in needed. Each carries an HMAC of
// (kind, user, expiry) so it can't be forged:
//   news    unsubscribe from news and offers            (never expires)
//   events  stop post-event feedback reminders          (never expires)
//   revoke  "this wasn't me": sign out every device     (expires after 7 days)
// GET only shows a confirm button (mail scanners prefetch links); POST acts (it is
// also what mail apps' own "unsubscribe" button sends).
import { Hono } from "hono";
import { run } from "./db.js";
import { logConsentStmt } from "./legal.js";

export const unsubApp = new Hono();

const KINDS = new Set(["news", "events", "revoke"]);

async function mac(env, kind, userId, exp) {
  const secret = env.UNSUB_SECRET || env.TOTP_KEY || env.ADMIN_TOKEN;
  if (!secret) throw new Error("No secret for email links");
  // "news" keeps its original message so links already sent stay valid.
  const msg = kind === "news" ? `unsub:${userId}` : `unsub:${kind}:${userId}:${exp}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** The first APP_ORIGIN is the public address; used when there is no request (cron). */
export const publicOrigin = (env) => String(env.APP_ORIGIN || "").split(",")[0].trim() || "https://lanyd.fyi";

export async function emailLink(env, origin, userId, kind = "news") {
  const exp = kind === "revoke" ? Date.now() + 7 * 864e5 : 0;
  return `${origin}/api/unsubscribe?k=${kind}&u=${userId}&e=${exp}&t=${await mac(env, kind, userId, exp)}`;
}
export const unsubUrl = (c, userId, kind = "news") => emailLink(c.env, new URL(c.req.url).origin, userId, kind);

const page = (body) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lanyard</title>
<body style="font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 16px;line-height:1.5">${body}</body>`,
  { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

// Compares every character, whatever the first difference (F35.7): how long a wrong signature takes
// to refuse says nothing about how much of it was right.
function sameText(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i);
  return diff === 0;
}

async function valid(c) {
  const kind = c.req.query("k") || "news";
  const u = c.req.query("u") || "";
  const exp = Number(c.req.query("e") || 0);
  if (!KINDS.has(kind) || !/^[0-9a-f]{10}$/.test(u)) return null;
  if (kind === "revoke" && !(exp > Date.now())) return null;
  return sameText(c.req.query("t") || "", await mac(c.env, kind, u, kind === "news" ? 0 : exp)) ? { kind, u } : null;
}

const COPY = {
  news: ["Unsubscribe?", "Stop news and offers from Lanyard. You'll still get sign-in codes.", "Unsubscribe", "Unsubscribed", "You won't get news emails from Lanyard any more."],
  events: ["Stop event reminders?", "No more emails asking for feedback after events. You'll still get sign-in codes.", "Stop reminders", "Reminders off", "We won't email you about event feedback again."],
  revoke: ["Sign out everywhere?", "This signs out every device on your account, including this one. Then sign in again with your email or passkey.", "Sign out everywhere", "Signed out everywhere", "Every device was signed out. If you didn't sign in just now, sign back in and add a passkey in Settings."],
};

unsubApp.get("/api/unsubscribe", async (c) => {
  const v = await valid(c);
  if (!v) return page("<h1>Link not valid</h1><p>This link is broken or has expired. You can change this in Lanyard Settings instead.</p>");
  const [h, p, btn] = COPY[v.kind];
  return page(`<h1>${h}</h1><p>${p}</p><form method="post"><button style="font-size:16px;padding:10px 18px">${btn}</button></form>`);
});

unsubApp.post("/api/unsubscribe", async (c) => {
  const v = await valid(c);
  if (!v) return page("<h1>Link not valid</h1>");
  const db = c.env.DB;
  if (v.kind === "news") {
    await db.batch([
      db.prepare("UPDATE users SET marketing_optin = 0, marketing_at = NULL WHERE id = ?").bind(v.u),
      logConsentStmt(db, v.u, "marketing", "withdrawn"),
    ]);
  }
  else if (v.kind === "events") await run(db, "UPDATE users SET notify_events = 0 WHERE id = ?", v.u);
  else await run(db, "DELETE FROM sessions WHERE user_id = ?", v.u);
  const [, , , done, more] = COPY[v.kind];
  return page(`<h1>${done}</h1><p>${more}</p>`);
});
