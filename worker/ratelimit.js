// Fixed-window counters in the rate_limits table (shared with code-guess throttling).
// Keys starting "day:" live for a day; the daily purge clears anything older.
import { now, one } from "./db.js";

/** Adds one to `key` within a window of `windowMs`; returns the new count. */
export async function bump(db, key, windowMs) {
  const ts = now();
  const since = ts - windowMs;
  const row = await one(
    db,
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN window_start > ? THEN count + 1 ELSE 1 END,
       window_start = CASE WHEN window_start > ? THEN window_start ELSE ? END
     RETURNING count`,
    key, ts, since, since, ts
  );
  return row?.count ?? 1;
}

/** Current count for `key` within the window, without adding to it. */
export async function peek(db, key, windowMs) {
  const row = await one(db, "SELECT count FROM rate_limits WHERE key = ? AND window_start > ?", key, now() - windowMs);
  return row?.count || 0;
}

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
