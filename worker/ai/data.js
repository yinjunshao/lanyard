// What the AI foundation keeps about a person, and its life cycle (UK GDPR): shown in their data download,
// removed when their account is, and removed by the daily purge after its retention period.
//   ai_cache  a checked reply, for at most 7 days (the only place any generated text is stored)
//   ai_usage  counts, tokens and cost per day and feature, for 13 months. No text.
//   ai_daily  the whole app's spend per day, 13 months. Not about anyone.
import { all, one, run } from "../db.js";

export const CACHE_KEEP_MS = 7 * 24 * 3600e3;

/** For the data download: the person's own usage rows and any reply still held. */
export async function exportAi(db, kind, id) {
  const usage = await all(db,
    "SELECT day, feature, scope, calls, input_tokens AS inputTokens, output_tokens AS outputTokens, cost_micros AS costMicros, cache_hits AS cacheHits, fallbacks, limited FROM ai_usage WHERE actor_kind = ? AND actor_id = ? ORDER BY day, feature",
    kind, id);
  const replies = await all(db,
    "SELECT feature, result, created_at AS createdAt, expires_at AS expiresAt FROM ai_cache WHERE actor_kind = ? AND actor_id = ? ORDER BY created_at",
    kind, id);
  const pref = kind === "user" ? await one(db, "SELECT ai_search_ok FROM users WHERE id = ?", id) : null;
  return {
    ...(pref ? { searchByConnections: !!pref.ai_search_ok } : {}),
    note: "Usage is counts only (no text). A reply is kept for at most 7 days so asking again is free, then deleted. Costs are millionths of a US dollar.",
    usage,
    replies: replies.map((r) => { let result = r.result; try { result = JSON.parse(r.result); } catch { /* keep the text */ } return { ...r, result }; }),
  };
}

/** Account deletion: everything held for this person, at once. */
export async function eraseAi(db, kind, id) {
  await run(db, "DELETE FROM ai_cache WHERE actor_kind = ? AND actor_id = ?", kind, id);
  await run(db, "DELETE FROM ai_usage WHERE actor_kind = ? AND actor_id = ?", kind, id);
}

/** The daily purge. Safe to run repeatedly. */
export async function purgeAi(db, ts = Date.now()) {
  const out = {};
  out.aiCache = (await run(db, "DELETE FROM ai_cache WHERE expires_at < ? OR created_at < ?", ts, ts - CACHE_KEEP_MS)).meta?.changes || 0;
  // 13 calendar months of counts, then gone.
  const d = new Date(ts);
  d.setUTCMonth(d.getUTCMonth() - 13);
  const cutoff = d.toISOString().slice(0, 10);
  out.aiUsage = (await run(db, "DELETE FROM ai_usage WHERE day < ?", cutoff)).meta?.changes || 0;
  await run(db, "DELETE FROM ai_daily WHERE day < ?", cutoff);
  // Anything left for an account that no longer exists (a host account removed by the reset, say).
  const gone = (t) => `(${t}.actor_kind = 'user' AND ${t}.actor_id NOT IN (SELECT id FROM users)) OR (${t}.actor_kind = 'host' AND ${t}.actor_id NOT IN (SELECT id FROM host_accounts))`;
  await run(db, `DELETE FROM ai_cache WHERE ${gone("ai_cache")}`);
  await run(db, `DELETE FROM ai_usage WHERE ${gone("ai_usage")}`);
  return out;
}
