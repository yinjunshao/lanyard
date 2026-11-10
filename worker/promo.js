// Promo codes: /redeem/<CODE>. A code grants Lanyard Plus for a number of days
// to the first N people. To stop one person taking every slot with throwaway
// guest accounts, redeeming needs a card AND a verified email (a verified
// address can only belong to one account).
//
// Each person who tries a code gets a place in its queue, once. Taking a place,
// claiming a slot and granting Plus happen in one transaction, so two people
// pressing at the same moment can't both get the 50th slot.
import { Hono } from "hono";
import { now, one, run } from "./db.js";
import { requireUser } from "./session.js";
import { bump, HOUR } from "./ratelimit.js";

export const promoApp = new Hono();
const DAY = 24 * 60 * 60 * 1000;

export const normPromo = (raw) => String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);

function status(row, ts = now()) {
  if (!row || !row.active) return "invalid";
  if (row.starts_at && row.starts_at > ts) return "not_started";
  if (row.expires_at && row.expires_at <= ts) return "expired";
  if (row.max_uses != null && row.uses >= row.max_uses) return "full";
  return "open";
}

function publicView(row) {
  const st = status(row);
  return {
    code: row.code,
    reward: row.reward,
    days: row.days,
    max: row.max_uses,
    left: row.max_uses == null ? null : Math.max(0, row.max_uses - row.uses),
    tried: row.attempts,
    status: st,
    expiresAt: row.expires_at || null,
  };
}

function mine(r, row) {
  return r ? { position: r.position, granted: !!r.granted, at: r.created_at, max: row.max_uses } : null;
}

// What the code is, how many are left, and (if signed in) your own result.
promoApp.get("/api/redeem/:code", async (c) => {
  const db = c.env.DB;
  const ip = c.req.header("cf-connecting-ip") || "local";
  const code = normPromo(c.req.param("code"));
  const row = code ? await one(db, "SELECT * FROM promo_codes WHERE code = ?", code) : null;
  if (!row || !row.active) {
    // Guessing codes is limited per IP.
    if ((await bump(db, `promo:miss:${ip}`, HOUR)) > 30) return c.json({ error: "Too many tries. Wait an hour.", code: "throttled" }, 429);
    return c.json({ error: "That code doesn't exist. Check the spelling.", code: "bad_code" }, 404);
  }
  const u = c.get("user");
  const r = u ? await one(db, "SELECT * FROM promo_claims WHERE code = ? AND user_id = ?", code, u.id) : null;
  return c.json({ promo: publicView(row), mine: mine(r, row) });
});

promoApp.post("/api/redeem/:code", async (c) => {
  const u = requireUser(c);
  const db = c.env.DB;
  const code = normPromo(c.req.param("code"));
  if ((await bump(db, `promo:u:${u.id}`, HOUR)) > 20) {
    return c.json({ error: "Too many tries. Wait an hour.", code: "throttled" }, 429);
  }
  const row = code ? await one(db, "SELECT * FROM promo_codes WHERE code = ?", code) : null;
  if (!row || !row.active) return c.json({ error: "That code doesn't exist. Check the spelling.", code: "bad_code" }, 404);

  const already = await one(db, "SELECT * FROM promo_claims WHERE code = ? AND user_id = ?", code, u.id);
  if (already) return c.json({ promo: publicView(row), mine: mine(already, row), already: true });

  const [profile, user] = await Promise.all([
    one(db, "SELECT user_id FROM profiles WHERE user_id = ?", u.id),
    one(db, "SELECT email_verified FROM users WHERE id = ?", u.id),
  ]);
  if (!profile) return c.json({ error: "Make your card first, then redeem the code.", code: "needs_card" }, 403);
  if (!user?.email_verified) return c.json({ error: "Confirm your email first, then redeem the code.", code: "needs_email" }, 403);

  const st = status(row);
  if (st === "not_started") return c.json({ error: "This code isn't live yet.", code: "not_started" }, 400);
  if (st === "expired") return c.json({ error: "This code has expired.", code: "expired" }, 400);

  const ts = now();
  const ms = row.days * DAY;
  // One transaction: take a place in the queue; take a slot if one is left;
  // grant Plus only if a slot was taken. A full code still records the place,
  // so the person can be told where they came.
  try { await db.batch([
    db.prepare("UPDATE promo_codes SET attempts = attempts + 1 WHERE code = ?").bind(code),
    db.prepare(
      `INSERT INTO promo_claims (code, user_id, position, granted, created_at)
       SELECT code, ?, attempts, CASE WHEN max_uses IS NULL OR uses < max_uses THEN 1 ELSE 0 END, ?
       FROM promo_codes WHERE code = ?`
    ).bind(u.id, ts, code),
    db.prepare(
      `UPDATE promo_codes SET uses = uses + 1
       WHERE code = ? AND EXISTS (SELECT 1 FROM promo_claims WHERE code = ? AND user_id = ? AND granted = 1)`
    ).bind(code, code, u.id),
    // Plus already running: add the days on top. Plus with no end date: leave it.
    db.prepare(
      `UPDATE users SET
         plan_until = CASE WHEN plan = 'plus' AND plan_until IS NULL THEN NULL
                           ELSE MAX(COALESCE(plan_until, 0), ?) + ? END,
         plan = 'plus'
       WHERE id = ? AND EXISTS (SELECT 1 FROM promo_claims WHERE code = ? AND user_id = ? AND granted = 1)`
    ).bind(ts, ms, u.id, code, u.id),
  ]); } catch (e) {
    // The same person pressed twice at once: the second insert hits the key.
    if (!/UNIQUE|constraint/i.test(String(e?.message || e))) throw e;
  }
  const [mineRow, after, plan] = await Promise.all([
    one(db, "SELECT * FROM promo_claims WHERE code = ? AND user_id = ?", code, u.id),
    one(db, "SELECT * FROM promo_codes WHERE code = ?", code),
    one(db, "SELECT plan, plan_until FROM users WHERE id = ?", u.id),
  ]);
  // Missed out: put them on the Plus list so they hear first when it opens.
  if (!mineRow.granted) await run(db, "INSERT OR IGNORE INTO plus_waitlist (user_id, created_at) VALUES (?, ?)", u.id, ts);
  return c.json({ promo: publicView(after), mine: mine(mineRow, after), planUntil: plan?.plan_until ?? null });
});
