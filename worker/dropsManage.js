// F32: what a host can do to a drop, with the counts a host sees. No route code here (dropsHost.js has that).
// Nothing in this file returns a given item, and the only function that opens items is unusedList(), which
// opens only items nobody has been given.
import { all, newId, one, run } from "./db.js";
import { HttpError } from "./session.js";
import { openItem, pinMac, dropsReady, unavailable } from "./dropcrypto.js";
import { MAX_ITEMS, cleanNote, cleanTitle, insertItems, isList, itemRows, newPin, openness, readItems, readWindow, sealAll } from "./drops.js";

/** A drop as a host sees it: its settings and counts. Never an item, a name or the PIN. */
function hostJson(r, checkins, ts) {
  const base = {
    id: r.id, kind: r.kind, title: r.title, note: r.note, status: r.status, reuse: !!r.reuse,
    perPerson: r.kind === "voucher" ? r.per_person : null, validFrom: r.valid_from || null, validUntil: r.valid_until || null,
    createdAt: r.created_at, purged: !!r.purged_at, state: openness(r, ts),
  };
  if (r.purged_at) return { ...base, loaded: r.final_loaded || 0, given: r.final_given || 0, used: r.final_used || 0 };
  if (r.kind === "voucher") return { ...base, used: r.used, people: r.people, entitled: checkins * r.per_person };
  return { ...base, loaded: r.loaded, given: r.given, unused: r.unused, revoked: r.revoked };
}

/** Every drop of an event, with counts. The counts are all a host sees without named attendance. */
export async function listForHost(db, ev, ts = Date.now()) {
  const rows = await all(
    db,
    `SELECT d.id, d.kind, d.title, d.note, d.status, d.reuse, d.per_person, d.valid_from, d.valid_until, d.created_at, d.purged_at,
            d.final_loaded, d.final_given, d.final_used,
            (SELECT COUNT(*) FROM drop_items i WHERE i.drop_id = d.id) AS loaded,
            (SELECT COUNT(*) FROM drop_gives g WHERE g.drop_id = d.id) AS given,
            (SELECT COUNT(*) FROM drop_gives g WHERE g.drop_id = d.id AND g.revoked_at IS NOT NULL) AS revoked,
            (SELECT COUNT(*) FROM drop_items i WHERE i.drop_id = d.id AND NOT EXISTS (SELECT 1 FROM drop_gives g WHERE g.item_id = i.id)) AS unused,
            (SELECT COUNT(*) FROM voucher_uses u WHERE u.drop_id = d.id) AS used,
            (SELECT COUNT(DISTINCT u.user_id) FROM voucher_uses u WHERE u.drop_id = d.id) AS people
     FROM drops d WHERE d.event_id = ? ORDER BY d.created_at, d.id`,
    ev.id
  );
  const checkins = (await one(db, "SELECT COUNT(*) AS n FROM checkins WHERE event_id = ?", ev.id))?.n || 0;
  return rows.map((r) => hostJson(r, checkins, ts));
}

/** A line in the host's audit trail (no values, no names). */
export const auditStmt = (db, ev, dropId, hostId, action, n = 0, ts = Date.now()) =>
  db.prepare("INSERT INTO drop_audit (id, event_id, drop_id, host_account_id, action, n, at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(newId() + newId(), ev.id, dropId, hostId, action, n, ts);

/** Adds more items to a list drop. Same checks as creating; if writing fails halfway the new rows are removed again. */
export async function addItems(env, drop, raw, ts = Date.now()) {
  if (!dropsReady(env)) throw unavailable();
  if (!isList(drop)) throw new HttpError(400, "This kind of drop has no list to add to.", "not_a_list");
  if (drop.purged_at) throw new HttpError(410, "This drop has been cleared away.", "gone");
  const db = env.DB;
  const r = readItems(raw);
  if (!r.items.length) throw new HttpError(400, "Paste at least one item.", "bad_items");
  const have = (await one(db, "SELECT COUNT(*) AS n, COALESCE(MAX(seq), 0) AS m FROM drop_items WHERE drop_id = ?", drop.id)) || { n: 0, m: 0 };
  // An item already in the drop (given or not) is never added a second time, or one key could go to two people.
  // Compared in memory only, inside this request: nothing opened here is returned, logged or kept.
  const there = new Set();
  for (const row of await all(db, "SELECT id, cipher FROM drop_items WHERE drop_id = ? AND cipher != ''", drop.id)) there.add(await openItem(env, drop.id, row.id, row.cipher));
  const fresh = r.items.filter((v) => !there.has(v));
  const already = r.items.length - fresh.length;
  if (!fresh.length) throw new HttpError(400, "Every one of those is already in this drop, so nothing was added.", "already_loaded");
  if (have.n + fresh.length > MAX_ITEMS) throw new HttpError(400, `A drop holds up to ${MAX_ITEMS} items. This one has ${have.n}.`, "too_many");
  const sealed = await sealAll(env, drop.id, fresh);
  try {
    await insertItems(db, itemRows(drop.id, sealed, have.m + 1, ts));
  } catch (e) {
    for (let i = 0; i < sealed.length; i += 90) {
      const ids = sealed.slice(i, i + 90).map((s) => s.id);
      await db.prepare(`DELETE FROM drop_items WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).run().catch(() => {});
    }
    if (/UNIQUE/i.test(String(e?.message))) throw new HttpError(409, "Someone else changed this list at the same moment. Try again.", "conflict");
    throw e;
  }
  return { added: sealed.length, duplicates: r.duplicates, alreadyThere: already, loaded: have.n + sealed.length };
}

/** The host's edits to a drop: title, note, window, and stopping or restarting it. Kind, reuse and count never change. */
export async function updateDrop(db, drop, b, ts = Date.now()) {
  if (drop.purged_at) throw new HttpError(410, "This drop has been cleared away.", "gone");
  const set = {};
  if (b.title !== undefined) {
    const t = cleanTitle(b.title);
    if (t.length < 2) throw new HttpError(400, "Give the drop a title, for example Wi-Fi password.", "bad_title");
    set.title = t;
  }
  if (b.note !== undefined) set.note = cleanNote(b.note);
  if (b.status !== undefined) {
    if (b.status !== "on" && b.status !== "stopped") throw new HttpError(400, "A drop is either on or stopped.", "bad_status");
    set.status = b.status;
  }
  if (b.validFrom !== undefined || b.validUntil !== undefined) {
    const w = readWindow({
      validFrom: b.validFrom !== undefined ? b.validFrom : drop.valid_from,
      validUntil: b.validUntil !== undefined ? b.validUntil : drop.valid_until,
    });
    set.valid_from = w.from; set.valid_until = w.until;
  }
  const keys = Object.keys(set);
  if (!keys.length) return { changed: [] };
  await run(db, `UPDATE drops SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`, ...Object.values(set), ts, drop.id);
  return { changed: keys };
}

/** The items nobody has been given, opened, in the host's order. Only a list drop has them. */
export async function unusedList(env, drop) {
  if (!isList(drop)) throw new HttpError(400, "This kind of drop has no list.", "not_a_list");
  const rows = await all(
    env.DB,
    `SELECT i.id, i.cipher FROM drop_items i WHERE i.drop_id = ? AND i.cipher != '' AND NOT EXISTS (SELECT 1 FROM drop_gives g WHERE g.item_id = i.id) ORDER BY i.seq`,
    drop.id
  );
  const out = [];
  for (const r of rows) out.push(await openItem(env, drop.id, r.id, r.cipher));
  return out;
}

/** Deletes the items nobody has been given (one statement: an item someone is given at the same moment stays). Returns how many. */
export async function deleteUnused(db, drop) {
  if (!isList(drop)) throw new HttpError(400, "This kind of drop has no list.", "not_a_list");
  const r = await run(db, "DELETE FROM drop_items WHERE drop_id = ? AND NOT EXISTS (SELECT 1 FROM drop_gives g WHERE g.item_id = drop_items.id)", drop.id);
  return r.meta?.changes || 0;
}

/** Replaces a voucher's staff PIN. Returns the new PIN, which the caller shows once; only its HMAC is kept. */
export async function resetPin(env, drop, ts = Date.now()) {
  if (!dropsReady(env)) throw unavailable();
  const pin = newPin();
  await run(env.DB, "UPDATE drops SET pin_mac = ?, updated_at = ? WHERE id = ?", await pinMac(env, drop.id, pin), ts, drop.id);
  return pin;
}
