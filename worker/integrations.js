// Integrations without per-platform code:
// - Outbound: one signed webhook per organisation (event.ended, test). Zapier,
//   Make or the host's own server can forward it to Luma, Sheets, Slack...
// - Inbound: POST /api/integrations/rsvp with the organisation's API key sets
//   an event's RSVP count (e.g. from a Luma or Union sign-up list), so the
//   report can show sign-ups vs check-ins. Counts only, never names or emails.
import { Hono } from "hono";
import { now, one, run } from "./db.js";
import { HttpError, sha256Hex } from "./session.js";
import { bump, HOUR } from "./ratelimit.js";

export const integrationsApp = new Hono();

const rand = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
export const newWebhookSecret = () => "whsec_" + rand(24);
export const newApiKey = () => "lyk_" + rand(24);

/** https only, a real hostname (no IP literals, localhost or internal names), no credentials. */
export function validateWebhookUrl(raw) {
  const s = String(raw || "").trim();
  if (!s || s.length > 300) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h.startsWith("[") || /^[\d.]+$/.test(h)) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|test|invalid|example)$/.test(h)) return null;
  if (u.port && u.port !== "443") return null;
  return u.toString();
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Sends a signed webhook. Header: Lanyard-Signature: t=<unix ms>,v1=<hex HMAC-SHA256 of "t.body">.
 * Returns { ok, status } and never throws.
 */
export async function sendWebhook(db, orgId, type, data) {
  const row = await one(db, "SELECT webhook_url, webhook_secret FROM org_integrations WHERE org_id = ?", orgId);
  if (!row?.webhook_url || !row.webhook_secret) return { ok: false, status: 0, skipped: true };
  const url = validateWebhookUrl(row.webhook_url);
  if (!url) return { ok: false, status: 0 };
  const t = now();
  const body = JSON.stringify({ type, sentAt: t, data });
  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "manual", // never follow a redirect somewhere else
      headers: {
        "content-type": "application/json",
        "user-agent": "Lanyard-Webhooks/1",
        "lanyard-event": type,
        "lanyard-signature": `t=${t},v1=${await hmacHex(row.webhook_secret, `${t}.${body}`)}`,
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

// Inbound: set the RSVP count for one of your events.
integrationsApp.post("/api/integrations/rsvp", async (c) => {
  const db = c.env.DB;
  const auth = c.req.header("authorization") || "";
  const key = /^Bearer (lyk_[0-9a-f]{48})$/.exec(auth)?.[1];
  const ip = c.req.header("cf-connecting-ip") || "local";
  if ((await bump(db, `int:ip:${ip}`, HOUR)) > 300) throw new HttpError(429, "Too many requests.");
  if (!key) throw new HttpError(401, "Send your Lanyard API key as: Authorization: Bearer lyk_…");
  const integ = await one(db, "SELECT org_id FROM org_integrations WHERE api_key_hash = ?", await sha256Hex(key));
  if (!integ) throw new HttpError(401, "That API key isn't valid.");
  const b = await c.req.json().catch(() => ({}));
  const count = Number(b.count);
  if (!Number.isInteger(count) || count < 0 || count > 100000) throw new HttpError(400, "count must be a whole number.");
  const code = String(b.eventCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const ev = await one(db, "SELECT id FROM events WHERE org_id = ? AND (code = ? OR id = ?)", integ.org_id, code, String(b.eventId || ""));
  if (!ev) throw new HttpError(404, "No event with that code in your organisation.");
  await run(db, "UPDATE events SET rsvp_count = ? WHERE id = ?", count, ev.id);
  return c.json({ ok: true, eventId: ev.id, rsvpCount: count });
});
