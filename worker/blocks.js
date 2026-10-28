// Blocking works both ways: neither person can see, find or connect with the other.
import { one, all } from "./db.js";

export async function isBlocked(db, a, b) {
  if (!a || !b) return false;
  return !!(await one(
    db,
    "SELECT 1 AS x FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1",
    a, b, b, a
  ));
}

/** Everyone this user has blocked or been blocked by. */
export async function blockedSet(db, userId) {
  const rows = await all(
    db,
    "SELECT blocked_id AS id FROM blocks WHERE blocker_id = ? UNION SELECT blocker_id AS id FROM blocks WHERE blocked_id = ?",
    userId, userId
  );
  return new Set(rows.map((r) => r.id));
}
