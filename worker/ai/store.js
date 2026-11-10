// D1 reads and writes for the AI foundation: settings, usage counts, spend and the reply cache.
// Nothing here stores a prompt. Callers pass days as "YYYY-MM-DD" (UTC).
import { all, one, run } from "../db.js";

export const ROLLOUTS = ["allowlist", "plus", "everyone"];
export const MAX_ALLOW = 50;
export const normEmail = (e) => String(e || "").trim().toLowerCase();

/** Kill switch, rollout stage and allow-list. Unset means: not killed, allow-list only, nobody listed. */
export async function getSettings(db) {
  const rows = await all(db, "SELECT key, value FROM ai_settings");
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  let allow = [];
  try { allow = (JSON.parse(m.allow || "[]") || []).map(normEmail).filter(Boolean); } catch { allow = []; }
  return { killed: m.killed === "1", rollout: ROLLOUTS.includes(m.rollout) ? m.rollout : "allowlist", allow };
}

export const setSetting = (db, key, value) => run(db,
  "INSERT INTO ai_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  key, String(value), Date.now());

const COLS = ["calls", "input_tokens", "output_tokens", "cost_micros", "cache_hits", "fallbacks", "limited"];

/** Adds to this person's row for the day, feature and scope (creating it). deltas: { calls: 1, ... }. */
export function addUsage(db, actor, day, feature, scope, deltas) {
  const d = COLS.map((c) => Math.round(deltas[c] || 0));
  return run(db,
    `INSERT INTO ai_usage (day, actor_kind, actor_id, feature, scope, ${COLS.join(", ")})
     VALUES (?, ?, ?, ?, ?, ${COLS.map(() => "?").join(", ")})
     ON CONFLICT(day, actor_kind, actor_id, feature, scope) DO UPDATE SET
       ${COLS.map((c) => `${c} = MAX(0, ${c} + excluded.${c})`).join(", ")}`,
    day, actor.kind, actor.id, feature, scope || "", ...d);
}

export function addDaily(db, day, { cost_micros = 0, calls = 0, cache_hits = 0, fallbacks = 0 } = {}) {
  return run(db,
    `INSERT INTO ai_daily (day, cost_micros, calls, cache_hits, fallbacks) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET cost_micros = cost_micros + excluded.cost_micros, calls = calls + excluded.calls,
       cache_hits = cache_hits + excluded.cache_hits, fallbacks = fallbacks + excluded.fallbacks`,
    day, Math.round(cost_micros), calls, cache_hits, fallbacks);
}

/** What this person has used: today, this month, and (for per-event limits) all time for one scope. */
export async function usedBy(db, actor, feature, scope, day, monthStart) {
  const r = await one(db,
    `SELECT COALESCE(SUM(CASE WHEN day = ? THEN calls END), 0) AS d, COALESCE(SUM(CASE WHEN day >= ? THEN calls END), 0) AS m,
            COALESCE(SUM(CASE WHEN scope = ? THEN calls END), 0) AS s
       FROM ai_usage WHERE actor_kind = ? AND actor_id = ? AND feature = ?`,
    day, monthStart, scope || "", actor.kind, actor.id, feature);
  return { day: r?.d || 0, month: r?.m || 0, scope: scope ? r?.s || 0 : 0 };
}

/** Money spent today and so far this month, in micro-dollars. */
export async function spent(db, day, monthStart) {
  const r = await one(db,
    "SELECT COALESCE(SUM(CASE WHEN day = ? THEN cost_micros END), 0) AS d, COALESCE(SUM(cost_micros), 0) AS m FROM ai_daily WHERE day >= ?",
    day, monthStart);
  return { day: r?.d || 0, month: r?.m || 0 };
}

export async function cacheGet(db, key, actor, ts) {
  const r = await one(db,
    "SELECT result FROM ai_cache WHERE key = ? AND actor_kind = ? AND actor_id = ? AND expires_at > ?", key, actor.kind, actor.id, ts);
  if (!r) return null;
  try { return JSON.parse(r.result); } catch { return null; }
}

export const cachePut = (db, key, actor, feature, resultJson, ts, ttlMs) => run(db,
  `INSERT INTO ai_cache (key, feature, actor_kind, actor_id, result, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(key) DO UPDATE SET result = excluded.result, created_at = excluded.created_at, expires_at = excluded.expires_at`,
  key, feature, actor.kind, actor.id, resultJson, ts, ts + ttlMs);
