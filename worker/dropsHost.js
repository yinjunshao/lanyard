// F32: the host's side of drops, on the host site only. Registered on hostApp (worker/hosts.js), so every route
// here sits behind the same guards as every other /api/host/* route: host site only, host cookie only, a
// finished host account, and the event must belong to one of the host's organisations (hostEvent).
//
// What a host gets back: counts, always. After an upload the items are not returned; the only way to read
// them is "download the unused ones" (decrypted, rate limited, audited), and given items are never returned.
import { one } from "./db.js";
import { HttpError } from "./session.js";
import { bump, HOUR } from "./ratelimit.js";
import { dropsReady } from "./dropcrypto.js";
import { collectOf } from "./attendance.js";
import { createDrop, KINDS } from "./drops.js";
import { namedPeople, revokeGive } from "./dropsNamed.js";
import { addItems, auditStmt, deleteUnused, listForHost, resetPin, unusedList, updateDrop } from "./dropsManage.js";

export function registerDropsHost(app, hostEvent) {
  // One of the host's own events (or 404) and one of its drops (or 404).
  async function dropOf(c) {
    const me = c.get("host");
    const ev = await hostEvent(c, me);
    const d = await one(c.env.DB, "SELECT * FROM drops WHERE id = ? AND event_id = ?", c.req.param("did"), ev.id);
    if (!d) throw new HttpError(404, "not found");
    return { me, ev, d };
  }
  const limited = async (c, key, max, what) => {
    if ((await bump(c.env.DB, key, HOUR)) > max) throw new HttpError(429, `Too many ${what}. Wait a while and try again.`, "throttled");
  };
  const audit = (c, ev, d, me, action, n) => auditStmt(c.env.DB, ev, d.id, me.id, action, n).run();

  app.get("/api/host/events/:id/drops", async (c) => {
    const ev = await hostEvent(c, c.get("host"));
    // `named`: this event keeps a list of who checked in (F31), so the host may open "Who has it" for a drop.
    return c.json({ ready: dropsReady(c.env), named: !!collectOf(ev), kinds: KINDS, drops: await listForHost(c.env.DB, ev), now: Date.now() }, 200, { "cache-control": "no-store" });
  });

  app.post("/api/host/events/:id/drops", async (c) => {
    const me = c.get("host");
    const ev = await hostEvent(c, me);
    await limited(c, `drop:make:${me.id}`, 60, "drops made");
    const b = await c.req.json().catch(() => ({}));
    const made = await createDrop(c.env, ev, b);
    // The reply carries the voucher's staff PIN (shown once) and counts. Never an item.
    return c.json({ ok: true, id: made.id, loaded: made.loaded, duplicates: made.duplicates, ...(made.pin ? { pin: made.pin } : {}) }, 201, { "cache-control": "no-store" });
  });

  app.put("/api/host/events/:id/drops/:did", async (c) => {
    const { me, ev, d } = await dropOf(c);
    const b = await c.req.json().catch(() => ({}));
    const r = await updateDrop(c.env.DB, d, b);
    if (r.changed.includes("status")) await audit(c, ev, d, me, b.status === "stopped" ? "stop" : "start", 0);
    return c.json({ ok: true });
  });

  app.post("/api/host/events/:id/drops/:did/items", async (c) => {
    const { me, ev, d } = await dropOf(c);
    await limited(c, `drop:add:${me.id}`, 60, "lists added");
    const b = await c.req.json().catch(() => ({}));
    const r = await addItems(c.env, d, b.items);
    await audit(c, ev, d, me, "add_items", r.added);
    return c.json({ ok: true, ...r }, 200, { "cache-control": "no-store" });
  });

  // The only way a host reads items: the ones nobody has been given. POST (it is counted and logged, and must not
  // be cached or prefetched), host only, at most 5 an hour for each drop.
  app.post("/api/host/events/:id/drops/:did/unused", async (c) => {
    const { me, ev, d } = await dropOf(c);
    if (d.purged_at) throw new HttpError(410, "This drop has been cleared away.", "gone");
    await limited(c, `drop:dl:${me.id}:${d.id}`, 5, "downloads");
    const items = await unusedList(c.env, d);
    await audit(c, ev, d, me, "download_unused", items.length);
    const name = d.title.replace(/[^A-Za-z0-9 _-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "drop";
    return new Response(items.join("\n") + (items.length ? "\n" : ""), {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="lanyard-unused-${name}.txt"`,
        "cache-control": "no-store", "x-content-type-options": "nosniff", "x-unused-count": String(items.length),
      },
    });
  });

  // Who has this drop: only for an event that keeps a named list, only people on it right now, and an item is shown as
  // its number in the host's own list, never its value. 404 for an event with no list.
  app.get("/api/host/events/:id/drops/:did/people", async (c) => {
    const { ev, d } = await dropOf(c);
    const r = await namedPeople(c.env.DB, ev, d);
    if (!r) throw new HttpError(404, "This event does not keep a list of who checked in, so names are not shown.", "list_off");
    return c.json(r, 200, { "cache-control": "no-store" });
  });

  // Withdraw one person's item (a leaked key). Only for a person on the named list right now.
  app.post("/api/host/events/:id/drops/:did/revoke", async (c) => {
    const { me, ev, d } = await dropOf(c);
    const b = await c.req.json().catch(() => ({}));
    return c.json(await revokeGive(c.env.DB, ev, d, b?.giveId, me.id), 200, { "cache-control": "no-store" });
  });

  // A new staff PIN for a voucher: the old one stops working at once. The new one is in this reply only.
  app.post("/api/host/events/:id/drops/:did/pin", async (c) => {
    const { me, ev, d } = await dropOf(c);
    if (d.kind !== "voucher") throw new HttpError(400, "Only a voucher has a staff PIN.", "not_a_voucher");
    if (d.purged_at) throw new HttpError(410, "This drop has been cleared away.", "gone");
    await limited(c, `drop:pin:${me.id}`, 20, "new PINs");
    const pin = await resetPin(c.env, d);
    await audit(c, ev, d, me, "reset_pin", 0);
    return c.json({ ok: true, pin }, 200, { "cache-control": "no-store" });
  });

  app.delete("/api/host/events/:id/drops/:did/unused", async (c) => {
    const { me, ev, d } = await dropOf(c);
    if (d.purged_at) throw new HttpError(410, "This drop has been cleared away.", "gone");
    const n = await deleteUnused(c.env.DB, d);
    await audit(c, ev, d, me, "delete_unused", n);
    return c.json({ ok: true, deleted: n });
  });

  // Deleting a drop takes what was given with it: the people who had items no longer have them to reveal.
  app.delete("/api/host/events/:id/drops/:did", async (c) => {
    const { me, ev, d } = await dropOf(c);
    const given = (await one(c.env.DB, "SELECT COUNT(*) AS n FROM drop_gives WHERE drop_id = ?", d.id))?.n || 0;
    await c.env.DB.batch([auditStmt(c.env.DB, ev, d.id, me.id, "delete_drop", given), c.env.DB.prepare("DELETE FROM drops WHERE id = ?").bind(d.id)]);
    return c.json({ ok: true });
  });
}
