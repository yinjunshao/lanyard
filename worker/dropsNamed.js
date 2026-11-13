// F32: what a host sees about WHO has a drop, and revoking one person's item. Hosts see counts always (dropsManage.js).
// Names and who got which item come only from here, and only when the event keeps a named list (F31, D038):
//   - the list must be on for the event (otherwise 404, and the list table is never read);
//   - a person appears only if they are on that list at this moment (namedAmong asks on every request, so
//     unticking in the hub removes them from the next answer);
//   - an item is shown as its NUMBER in the host's own list ("item 17"), never its value: a host never sees
//     a given item decrypted;
//   - revoke is open only for a person who is on the list right now, named by an opaque give id.
import { all, one } from "./db.js";
import { HttpError } from "./session.js";
import { namedAmong } from "./attendance.js";
import { auditStmt } from "./dropsManage.js";

export const PEOPLE_LIMIT = 2000;

const profiles = async (db, ids) => {
  const names = new Map();
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    for (const r of await all(db, `SELECT user_id, name FROM profiles WHERE user_id IN (${part.map(() => "?").join(",")})`, ...part)) names.set(r.user_id, r.name);
  }
  return names;
};

/**
 * Who has this drop, for an event that keeps a list: the people on the list with when they got it and which
 * item (its number), or how many uses of a voucher; and how many people hold one who are not named (counts
 * only). Null when the event keeps no list (the caller answers 404).
 */
export async function namedPeople(db, ev, drop) {
  if (drop.kind === "voucher") {
    const rows = await all(db, "SELECT user_id, COUNT(*) AS used, MAX(used_at) AS last FROM voucher_uses WHERE drop_id = ? GROUP BY user_id LIMIT ?", drop.id, PEOPLE_LIMIT + 1);
    const named = await namedAmong(db, ev, rows.map((r) => r.user_id));
    if (!named) return null;
    const on = rows.filter((r) => named.has(r.user_id)).slice(0, PEOPLE_LIMIT);
    const names = await profiles(db, on.map((r) => r.user_id));
    return { kind: "voucher", people: on.map((r) => ({ name: names.get(r.user_id) || "", used: r.used, lastUsedAt: r.last })), others: rows.length - on.length, truncated: rows.length > PEOPLE_LIMIT };
  }
  const rows = await all(
    db,
    `SELECT g.id AS give_id, g.user_id, g.given_at, g.revoked_at, i.seq FROM drop_gives g JOIN drop_items i ON i.id = g.item_id
     WHERE g.drop_id = ? ORDER BY g.given_at, g.id LIMIT ?`,
    drop.id, PEOPLE_LIMIT + 1
  );
  const named = await namedAmong(db, ev, rows.map((r) => r.user_id));
  if (!named) return null;
  const on = rows.filter((r) => named.has(r.user_id)).slice(0, PEOPLE_LIMIT);
  const names = await profiles(db, on.map((r) => r.user_id));
  return {
    kind: drop.kind,
    people: on.map((r) => ({ giveId: r.give_id, name: names.get(r.user_id) || "", item: r.seq, givenAt: r.given_at, withdrawn: !!r.revoked_at })),
    others: rows.length - on.length, truncated: rows.length > PEOPLE_LIMIT,
  };
}

/**
 * Withdraws one person's item (a leaked key): they can no longer reveal it, nobody else is given it, and no
 * replacement is made. Only for a person on the named list right now, and only for an item drop. Every other
 * case is the same 404, so it says nothing about who holds what. Returns once, whether or not it was already withdrawn.
 */
export async function revokeGive(db, ev, drop, giveId, hostId, ts = Date.now()) {
  const nope = () => new HttpError(404, "not found");
  if (drop.kind === "voucher") throw new HttpError(400, "A voucher has no item to withdraw.", "not_an_item");
  if (typeof giveId !== "string" || !/^[0-9a-f]{20}$/.test(giveId)) throw nope();
  const g = await one(db, "SELECT id, user_id, item_id, exclusive, revoked_at FROM drop_gives WHERE id = ? AND drop_id = ?", giveId, drop.id);
  if (!g) throw nope();
  const named = await namedAmong(db, ev, [g.user_id]);
  if (!named || !named.has(g.user_id)) throw nope();
  if (g.revoked_at) return { ok: true, already: true };
  await db.batch([
    db.prepare("UPDATE drop_gives SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(ts, g.id),
    // An item that only this person had is wiped: it was leaked, so it must not be kept or given again.
    db.prepare("UPDATE drop_items SET cipher = '' WHERE id = ? AND ? = 1").bind(g.item_id, g.exclusive),
    auditStmt(db, ev, drop.id, hostId, "revoke", 1, ts),
  ]);
  return { ok: true };
}
