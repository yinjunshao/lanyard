// Retention + erasure helpers (UK GDPR storage limitation / right to erasure).
import { all, one, run } from "./db.js";
import { deleteImage } from "./media.js";

const DAY = 86400_000;
export const SELFIE_MAX_AGE = 365 * DAY;
export const GUEST_MAX_AGE = 30 * DAY;
export const CONSENT_KEEP = 6 * 365 * DAY;

const tryDel = (env, key) => (key ? deleteImage(env, key).catch(() => {}) : null);

function projectKeys(json) {
  try { return (JSON.parse(json || "[]") || []).map((p) => p?.image_key).filter(Boolean); } catch { return []; }
}

/** Delete everything a user owns, including R2 objects, then the user row. */
export async function eraseUser(env, userId) {
  const db = env.DB;
  const conns = await all(db, "SELECT selfie_key FROM connections WHERE user_a = ? OR user_b = ?", userId, userId);
  for (const c of conns) await tryDel(env, c.selfie_key);
  const msgs = await all(db,
    `SELECT m.photo_key FROM messages m JOIN connections c ON c.id = m.connection_id
     WHERE m.photo_key IS NOT NULL AND (c.user_a = ? OR c.user_b = ?)`, userId, userId);
  for (const m of msgs) await tryDel(env, m.photo_key);
  const prof = await one(db, "SELECT photo_key, projects FROM profiles WHERE user_id = ?", userId);
  if (prof) {
    await tryDel(env, prof.photo_key);
    for (const k of projectKeys(prof.projects)) await tryDel(env, k);
  }
  // Organisations where this person is the only member: remove them (and their
  // events) unless there are invoice records, which we must keep.
  const orgs = await all(db,
    `SELECT om.org_id FROM org_members om WHERE om.user_id = ?
       AND (SELECT COUNT(*) FROM org_members x WHERE x.org_id = om.org_id) = 1`, userId);
  for (const { org_id } of orgs) {
    const billed = await one(db, "SELECT 1 AS x FROM billing_requests WHERE org_id = ? LIMIT 1", org_id);
    if (billed) continue;
    const sp = await all(db,
      "SELECT logo_key FROM sponsors WHERE event_id IN (SELECT id FROM events WHERE org_id = ?)", org_id);
    for (const s of sp) await tryDel(env, s.logo_key);
    await run(db, "DELETE FROM events WHERE org_id = ?", org_id);
    await run(db, "DELETE FROM orgs WHERE id = ?", org_id);
  }
  await run(db, "DELETE FROM users WHERE id = ?", userId); // cascades the rest
}

/** Scheduled clean-up. Safe to run repeatedly. */
export async function purgeExpired(env, ts = Date.now()) {
  const db = env.DB;
  const out = {};

  // Shared selfies older than 12 months.
  const old = await all(db,
    "SELECT id, selfie_key FROM connections WHERE selfie_key IS NOT NULL AND created_at < ?", ts - SELFIE_MAX_AGE);
  for (const c of old) {
    await tryDel(env, c.selfie_key);
    await run(db, "UPDATE connections SET selfie_key = NULL WHERE id = ?", c.id);
  }
  out.selfies = old.length;

  await run(db, "DELETE FROM sessions WHERE expires_at < ?", ts);
  await run(db, "DELETE FROM login_codes WHERE expires_at < ?", ts);
  await run(db, "DELETE FROM org_invites WHERE expires_at < ?", ts);
  await run(db, "DELETE FROM rate_limits WHERE window_start < ?", ts - DAY);
  await run(db, "DELETE FROM card_notes WHERE redeemed_at IS NULL AND created_at < ?", ts - DAY);

  // Guests who never made a profile and have no live session.
  const stale = await all(db,
    `SELECT u.id FROM users u
      WHERE u.is_guest = 1 AND u.created_at < ?
        AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?)
      LIMIT 500`, ts - GUEST_MAX_AGE, ts);
  for (const u of stale) await run(db, "DELETE FROM users WHERE id = ?", u.id);
  out.guests = stale.length;
  return out;
}
