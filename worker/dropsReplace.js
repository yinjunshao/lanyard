// F34: withdraw and replace. In one step a host takes back one person's item (a leaked key) and gives that
// person the next unused one. Only for a list drop whose items go to one person each (one-each, and random
// without reuse), only for a person who is on the named list right now (F31), and every other case is the same
// 404 as revoke. It never opens an item and never returns one: the person sees their new item the next time they
// press Show.
//
// The move is ONE conditional UPDATE of the person's give row, so it follows the same rules as giving:
//   - the new item is one nobody holds and nobody has been given (the subquery, and the unique index on
//     drop_gives(item_id) for exclusive gives as the second lock), so two replaces, or a replace and a new
//     attendee racing for the last unused item, can never give it to two people;
//   - it changes nothing unless such an item exists, so with none left nothing is withdrawn;
//   - it only fires if the person still holds the item the host was looking at (a double press is one replace).
// The old item is wiped in the same batch, but only if the move happened, so it is never given again; the
// audit row is written in that batch too, and only if the move happened (a count, never a value or a name).
import { newId, one } from "./db.js";
import { HttpError } from "./session.js";
import { namedAmong } from "./attendance.js";
import { isExclusive, isList, openness } from "./drops.js";

const FREE = `i.drop_id = ?2 AND i.cipher != '' AND NOT EXISTS (SELECT 1 FROM drop_gives x WHERE x.item_id = i.id)`;
const OPEN = `EXISTS (SELECT 1 FROM drops d WHERE d.id = ?2 AND d.status = 'on' AND d.purged_at IS NULL
  AND (d.valid_from IS NULL OR d.valid_from <= ?4) AND (d.valid_until IS NULL OR d.valid_until > ?4))`;

const moveSql = (ordered) => `
UPDATE drop_gives
SET item_id = (SELECT i.id FROM drop_items i WHERE ${FREE} ORDER BY ${ordered ? "i.seq" : "random()"} LIMIT 1),
    given_at = ?4, replaced_at = ?4, revoked_at = NULL
WHERE id = ?1 AND drop_id = ?2 AND item_id = ?3 AND exclusive = 1
  AND EXISTS (SELECT 1 FROM drop_items i WHERE ${FREE})
  AND ${OPEN}`;

const WHY = {
  stopped: () => new HttpError(409, "This drop is stopped. Start it again to replace an item.", "stopped"),
  soon: () => new HttpError(409, "This drop hasn't started yet.", "not_yet"),
  closed: () => new HttpError(409, "This drop has finished.", "closed"),
  gone: () => new HttpError(410, "This drop has been cleared away.", "gone"),
};

/**
 * Returns { ok: true } once the person holds a different unused item and the old one is wiped. Throws a plain
 * HttpError for every refusal: 404 (not a person on the named list, or no such handle), 400 (a kind with
 * nothing to replace), 409 `none_left` (no unused item: nothing was changed), `changed` (already replaced a
 * moment ago) or the drop's own state (stopped, not started, finished).
 */
export async function replaceGive(db, ev, drop, giveId, hostId, ts = Date.now()) {
  const nope = () => new HttpError(404, "not found");
  if (drop.kind === "voucher") throw new HttpError(400, "A voucher has no item to replace.", "not_an_item");
  if (!isList(drop) || !isExclusive(drop)) throw new HttpError(400, "Everyone has the same one from this drop, so there is nothing to replace. Withdraw it instead.", "not_replaceable");
  if (typeof giveId !== "string" || !/^[0-9a-f]{20}$/.test(giveId)) throw nope();
  const g = await one(db, "SELECT id, user_id, item_id, exclusive FROM drop_gives WHERE id = ? AND drop_id = ?", giveId, drop.id);
  if (!g || !g.exclusive) throw nope();
  const named = await namedAmong(db, ev, [g.user_id]);
  if (!named || !named.has(g.user_id)) throw nope();
  const why = openness(drop, ts);
  if (why !== "open") throw WHY[why]();

  const sql = moveSql(drop.kind !== "random");
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await db.batch([
        db.prepare(sql).bind(g.id, drop.id, g.item_id, ts),
        // Only if the person's row has left the old item: wipe it, so it can never be given again, and write the audit row.
        db.prepare("UPDATE drop_items SET cipher = '' WHERE id = ?1 AND EXISTS (SELECT 1 FROM drop_gives m WHERE m.id = ?2 AND m.item_id != ?1)").bind(g.item_id, g.id),
        db.prepare(
          `INSERT INTO drop_audit (id, event_id, drop_id, host_account_id, action, n, at)
           SELECT ?1, ?2, ?3, ?4, 'replace', 1, ?5 WHERE EXISTS (SELECT 1 FROM drop_gives m WHERE m.id = ?6 AND m.item_id != ?7)`
        ).bind(newId() + newId(), ev.id, drop.id, hostId, ts, g.id, g.item_id),
      ]);
    } catch (e) {
      // The unique index refused: someone else took that unused item at the same instant. The batch rolled back whole. Try again.
      if (/UNIQUE|constraint/i.test(String(e?.message))) continue;
      throw e;
    }
    if ((res[0]?.meta?.changes || 0) === 1) return { ok: true };
    break;
  }
  // Nothing moved. Say why, from what the database says now.
  const now = await one(db, "SELECT item_id FROM drop_gives WHERE id = ?", g.id);
  if (!now) throw nope();
  if (now.item_id !== g.item_id) throw new HttpError(409, "That was just replaced. Reload to see the new state.", "changed");
  const live = await one(db, "SELECT status, valid_from, valid_until, purged_at FROM drops WHERE id = ?", drop.id);
  const open = live ? openness(live, ts) : "gone";
  if (open !== "open") throw WHY[open]();
  throw new HttpError(409, "No unused items left to replace it with.", "none_left");
}
