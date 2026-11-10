// The AI search opt-out (owner decision 2026-11-10: on by default, switched off in Settings, users.ai_search_ok)
// and the block rule, kept in the foundation so no feature has to remember them.
//
// Features call searchableIds() when they gather people, so opted-out people are never in the prompt. They
// also pass the people they used as `subjects` to callModel, which checks again (and blocks, in both
// directions) and refuses the whole call if anyone fails: a cached reply is never served for someone who has
// opted out since, because the check runs before the cache is read.
import { all, newId, one } from "../db.js";

const CHUNK = 40; // D1 allows 100 bound values in one statement

const chunks = (ids) => { const out = []; for (let i = 0; i < ids.length; i += CHUNK) out.push(ids.slice(i, i + CHUNK)); return out; };
const marks = (n) => Array(n).fill("?").join(",");

/** Of these user ids, the ones who have not opted out of AI search. A deleted account is not included. */
export async function searchableIds(db, userIds) {
  const ids = [...new Set((userIds || []).filter((x) => typeof x === "string"))];
  const ok = new Set();
  for (const part of chunks(ids)) {
    const rows = await all(db, `SELECT id FROM users WHERE ai_search_ok = 1 AND id IN (${marks(part.length)})`, ...part);
    for (const r of rows) ok.add(r.id);
  }
  return ok;
}

export async function aiSearchAllowed(db, userId) {
  return (await searchableIds(db, [userId])).has(userId);
}

/** Of these user ids, the ones the asker has blocked or been blocked by. */
export async function blockedAmong(db, askerId, userIds) {
  const ids = [...new Set((userIds || []).filter((x) => typeof x === "string"))];
  const out = new Set();
  for (const part of chunks(ids)) {
    const rows = await all(db,
      `SELECT blocked_id AS id FROM blocks WHERE blocker_id = ? AND blocked_id IN (${marks(part.length)})
       UNION SELECT blocker_id AS id FROM blocks WHERE blocked_id = ? AND blocker_id IN (${marks(part.length)})`,
      askerId, ...part, askerId, ...part);
    for (const r of rows) out.add(r.id);
  }
  return out;
}

/**
 * Sets a person's choice and records it in the consent history (what they chose, and when), like the other
 * privacy choices. The basis is legitimate interests, so this is an opt-out, not a consent; the log is for
 * them to see and for us to show.
 */
export async function setAiSearchOk(db, userId, ok) {
  const row = await one(db, "SELECT ai_search_ok FROM users WHERE id = ?", userId);
  if (!row) return false;
  const value = ok ? 1 : 0;
  const stmts = [db.prepare("UPDATE users SET ai_search_ok = ? WHERE id = ?").bind(value, userId)];
  if (row.ai_search_ok !== value) {
    stmts.push(db.prepare("INSERT INTO consent_log (id, user_id, scope, action, ref, at) VALUES (?, ?, 'ai_search', ?, NULL, ?)")
      .bind(newId() + newId(), userId, ok ? "granted" : "withdrawn", Date.now()));
  }
  await db.batch(stmts);
  return true;
}
