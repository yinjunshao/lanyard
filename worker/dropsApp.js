// F32: a person's side of drops, on the main site. Every route needs a signed-in attendee (a guest counts) who
// checked in to the event in the address; anyone else is refused before any drop is looked at:
//   signed out 401 · not checked in 403 · a drop that is not this event's 404 · the host site and the host
//   cookie get nothing (index.js keeps the host site to /api/host/*, and a host cookie is not a session).
// A person sees only their own items, one at a time, and only after they press Show. Hosts reach none of this.
import { Hono } from "hono";
import { all, one } from "./db.js";
import { HttpError, requireUser } from "./session.js";
import { bump, HOUR } from "./ratelimit.js";
import { openItem } from "./dropcrypto.js";
import { openness, revealItem } from "./drops.js";
import { useVoucher } from "./vouchers.js";

export const dropsApp = new Hono();

const MIN10 = 10 * 60 * 1000;
const noStore = { "cache-control": "no-store" };

// The event, if this person checked in to it. 404 for no such event, 403 for one they have not checked in to.
async function myEvent(c) {
  const me = requireUser(c);
  const ev = await one(c.env.DB, "SELECT * FROM events WHERE id = ?", c.req.param("id"));
  if (!ev) throw new HttpError(404, "event not found");
  const here = await one(c.env.DB, "SELECT created_at FROM checkins WHERE event_id = ? AND user_id = ?", ev.id, me.id);
  if (!here) throw new HttpError(403, "Check in to this event to see its drops.", "not_checked_in");
  return { me, ev };
}

// One of this event's drops, or 404 (another event's drop is not found here, whoever is asking).
async function dropIn(c, ev) {
  const d = await one(c.env.DB, "SELECT * FROM drops WHERE id = ? AND event_id = ?", c.req.param("did"), ev.id);
  if (!d) throw new HttpError(404, "That drop isn't part of this event.", "no_such_drop");
  return d;
}

/**
 * The drops of an event as one person sees them: what each is and where it stands for them. Never an item.
 * state: have (they have theirs: press Show), ready (press Show to get one), out (all given out), withdrawn,
 * soon (not started), closed (finished), stopped. A voucher: ready, used (every use taken), soon, closed, stopped.
 */
export async function listForPerson(db, ev, userId, ts = Date.now()) {
  const rows = await all(
    db,
    `SELECT d.id, d.kind, d.title, d.note, d.reuse, d.per_person, d.valid_from, d.valid_until, d.status, d.purged_at,
            g.revoked_at, g.given_at,
            CASE WHEN d.kind = 'one_each' OR (d.kind = 'random' AND d.reuse = 0)
                 THEN (SELECT COUNT(*) FROM drop_items i WHERE i.drop_id = d.id AND i.cipher != '' AND NOT EXISTS (SELECT 1 FROM drop_gives x WHERE x.item_id = i.id))
                 ELSE (SELECT COUNT(*) FROM drop_items i WHERE i.drop_id = d.id AND i.cipher != '') END AS free,
            (SELECT COUNT(*) FROM voucher_uses u WHERE u.drop_id = d.id AND u.user_id = ?1) AS used
     FROM drops d LEFT JOIN drop_gives g ON g.drop_id = d.id AND g.user_id = ?1
     WHERE d.event_id = ?2 AND d.purged_at IS NULL ORDER BY d.created_at, d.id`,
    userId, ev.id
  );
  const uses = await all(db, "SELECT u.drop_id, u.used_at FROM voucher_uses u JOIN drops d ON d.id = u.drop_id WHERE d.event_id = ? AND u.user_id = ? ORDER BY u.n", ev.id, userId);
  return rows.map((r) => {
    const open = openness(r, ts);
    const base = { id: r.id, kind: r.kind, title: r.title, note: r.note, validFrom: r.valid_from || null, validUntil: r.valid_until || null };
    if (r.kind === "voucher") {
      const left = Math.max(0, r.per_person - r.used);
      const state = left === 0 ? "used" : open === "open" ? "ready" : open;
      return { ...base, state, voucher: { perPerson: r.per_person, used: r.used, left, usedAt: uses.filter((u) => u.drop_id === r.id).map((u) => u.used_at) } };
    }
    let state;
    if (r.revoked_at) state = "withdrawn";
    else if (r.given_at) state = "have";
    else if (open !== "open") state = open;
    else state = r.free > 0 ? "ready" : "out";
    return { ...base, state };
  });
}

dropsApp.get("/api/e/:id/drops", async (c) => {
  const { me, ev } = await myEvent(c);
  const db = c.env.DB;
  const p = await one(db, "SELECT name, photo_key FROM profiles WHERE user_id = ?", me.id);
  return c.json({
    now: Date.now(),
    event: { id: ev.id, name: ev.name },
    // What the voucher screen shows beside the use count: the person's own first name and photo.
    me: { firstName: String(p?.name || "").trim().split(/\s+/)[0] || "", photo: p?.photo_key ? `/media/${p.photo_key}` : null },
    drops: await listForPerson(db, ev, me.id),
  }, 200, noStore);
});

// "Show": gives the person their item if they have none yet, and returns it. Its own limit per drop, and an
// overall one, because every press can open a secret.
dropsApp.post("/api/e/:id/drops/:did/reveal", async (c) => {
  const { me, ev } = await myEvent(c);
  const db = c.env.DB;
  const d = await dropIn(c, ev);
  if ((await bump(db, `drop:rev:${me.id}:${d.id}`, MIN10)) > 12 || (await bump(db, `drop:revall:${me.id}`, HOUR)) > 60) {
    throw new HttpError(429, "That's a lot of presses. Wait a few minutes and try again.", "throttled");
  }
  const r = await revealItem(c.env, d, me.id);
  return c.json({ ok: true, id: d.id, title: d.title, value: r.value, givenAt: r.givenAt }, 200, noStore);
});

// A voucher is marked as used by staff, with the PIN the host gave them (worker/vouchers.js, D039). The request
// is the holder's own, so it can only ever mark the holder's own voucher.
dropsApp.post("/api/e/:id/drops/:did/use", async (c) => {
  const { me, ev } = await myEvent(c);
  const d = await dropIn(c, ev);
  const body = await c.req.json().catch(() => ({}));
  return c.json(await useVoucher(c.env, d, me.id, body?.pin), 200, noStore);
});

/** A person's own drops for their data download: what they were given (opened), and each voucher use. Nobody else's. */
export async function exportDrops(env, userId) {
  const gives = await all(
    env.DB,
    `SELECT g.drop_id, g.item_id, g.given_at, g.revoked_at, i.cipher, d.title, d.kind, d.event_id, e.name AS event_name
     FROM drop_gives g JOIN drop_items i ON i.id = g.item_id JOIN drops d ON d.id = g.drop_id JOIN events e ON e.id = d.event_id
     WHERE g.user_id = ? ORDER BY g.given_at`,
    userId
  );
  const uses = await all(
    env.DB,
    `SELECT u.drop_id, u.n, u.used_at, d.title, d.per_person, d.event_id, e.name AS event_name
     FROM voucher_uses u JOIN drops d ON d.id = u.drop_id JOIN events e ON e.id = d.event_id WHERE u.user_id = ? ORDER BY u.used_at`,
    userId
  );
  if (!gives.length && !uses.length) return null;
  const items = [];
  for (const g of gives) {
    let value = null, unreadable = false;
    if (!g.revoked_at) { try { value = await openItem(env, g.drop_id, g.item_id, g.cipher); } catch { unreadable = true; } }
    items.push({ eventId: g.event_id, eventName: g.event_name, title: g.title, given: value, ...(unreadable ? { note: "This server can't open it any more (its key changed)." } : {}),
      givenAt: g.given_at, withdrawn: !!g.revoked_at });
  }
  return {
    note: "What organisers gave you at events: keys, codes, passwords and vouchers. Only yours is here.",
    items,
    voucherUses: uses.map((u) => ({ eventId: u.event_id, eventName: u.event_name, title: u.title, use: u.n, of: u.per_person, usedAt: u.used_at })),
  };
}
