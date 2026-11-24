// Privacy requests and complaints (UK GDPR / Data (Use and Access) Act 2026 rules):
// anyone can write to us without an account, we acknowledge by email straight
// away, and every request is logged with its deadline until it is closed.
import { Hono } from "hono";
import { newId, now, one, run } from "./db.js";
import { bump, DAY } from "./ratelimit.js";
import { sendMail } from "./mail.js";
import { privacyAckEmail } from "./mail-templates.js";
import { ensureSession } from "./session.js";

export const privacyApp = new Hono();

const KINDS = new Set(["complaint", "access", "erasure", "other"]);
const RESPOND_WITHIN_MS = 30 * DAY;

privacyApp.post("/api/privacy-request", async (c) => {
  const db = c.env.DB;
  await ensureSession(c, db); // reads the session if there is one; never makes a guest
  const b = await c.req.json().catch(() => ({}));
  const kind = KINDS.has(b.kind) ? b.kind : "other";
  const email = String(b.email || "").trim().toLowerCase();
  const message = String(b.message || "").trim().slice(0, 4000);
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: "Add an email so we can reply." }, 400);
  if (message.length < 5) return c.json({ error: "Tell us a little about it." }, 400);
  const ip = c.req.header("cf-connecting-ip") || "local";
  if ((await bump(db, `day:privacy:${ip}`, DAY)) > 5) return c.json({ error: "Too many requests today. Please try again tomorrow." }, 429);

  const id = newId().toUpperCase();
  const ts = now();
  await run(db,
    `INSERT INTO privacy_requests (id, kind, user_id, email, message, status, created_at, respond_by)
     VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
    id, kind, c.get("user")?.id || null, email, message, ts, ts + RESPOND_WITHIN_MS);
  // The acknowledgement is part of the duty, so a failure to send is logged and visible to the admin.
  // A request is always recorded, but one address gets at most 3 acknowledgements a day (F35.6), so
  // the form cannot be used from many networks to fill a stranger's inbox. The admin still sees it.
  const ackOk = (await bump(db, `day:privacy:to:${email}`, DAY)) <= 3;
  const sent = ackOk && await sendMail(c.env, "accounts", { to: email, ...privacyAckEmail({ kind, id }) }).then(() => true, (e) => { console.error(e); return false; });
  if (sent) await run(db, "UPDATE privacy_requests SET acknowledged_at = ? WHERE id = ?", now(), id);
  return c.json({ ok: true, id, acknowledged: sent });
});
