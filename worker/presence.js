// F17: event presence ("Be easy to find") and who to meet. This file holds the rules and the
// retention; worker/presenceApp.js holds the routes.
//
// What it is: someone who is checked in to an event that is on may choose, for that event only,
// to show a selfie, a short line about themselves and what sort of person they want to meet to
// the others who have made the same choice. A row in `event_presence` exists only while that
// choice stands. Everything here follows from that:
//   - turning it off or withdrawing deletes the row and the selfie at once;
//   - the daily purge deletes any that are left 48 hours after the event ends (owner decision
//     2026-11-10), using the same end rule as eventStatus;
//   - no host-facing file imports this module (D004): hosts see only events.presence_used.
import { all, newId } from "./db.js";
import { deleteImage } from "./media.js";
import { NO_END_GRACE_MS } from "./eventstatus.js";

export const PRESENCE_KEEP_MS = 48 * 60 * 60 * 1000;
export const presenceScope = (eventId) => `event_presence:${eventId}`;

/**
 * When an event is over for one person, in ms: the earlier of the host ending it and its end
 * time; with neither, 12 hours after the later of the start and their check-in. This is the
 * moment eventStatus first returns "ended" (test/presence.mjs checks the two agree).
 */
export function eventEndsAt(ev, checkedInAt) {
  const set = [ev?.ended_at, ev?.ends_at].filter(Boolean);
  if (set.length) return Math.min(...set);
  return Math.max(ev?.starts_at || 0, checkedInAt || 0) + NO_END_GRACE_MS + 1;
}

const lowerHex = () => newId() + newId();

/** Deletes one person's presence (row, selfie, and the consent) for an event. Safe if there is none. */
export async function removePresence(env, eventId, userId, { why = "withdrawn", ref = null } = {}) {
  const db = env.DB;
  const row = await db.prepare("SELECT selfie_key FROM event_presence WHERE event_id = ? AND user_id = ?").bind(eventId, userId).first();
  if (!row) return false;
  // The object first: if that fails the row stays and the person can try again, rather than the
  // row going while a face photo is left behind with nothing pointing at it.
  if (row.selfie_key) await deleteImage(env, row.selfie_key);
  const ts = Date.now();
  await db.batch([
    db.prepare("DELETE FROM event_presence WHERE event_id = ? AND user_id = ?").bind(eventId, userId),
    db.prepare("UPDATE consents SET granted = 0, created_at = ? WHERE user_id = ? AND scope = ?").bind(ts, userId, presenceScope(eventId)),
    db.prepare("INSERT INTO consent_log (id, user_id, scope, action, ref, at) VALUES (?, ?, ?, 'withdrawn', ?, ?)")
      .bind(lowerHex(), userId, presenceScope(eventId), ref || why, ts),
  ]);
  return true;
}

/**
 * The retention rule: every row whose event ended 48 hours ago or more goes, with its selfie.
 * Run by the daily purge; safe to run again. Returns how many rows it deleted.
 */
export async function purgePresence(env, ts = Date.now()) {
  const rows = await all(
    env.DB,
    `SELECT p.event_id, p.user_id, p.created_at, e.starts_at, e.ends_at, e.ended_at, ch.created_at AS checked_in_at
     FROM event_presence p
     JOIN events e ON e.id = p.event_id
     LEFT JOIN checkins ch ON ch.event_id = p.event_id AND ch.user_id = p.user_id
     WHERE p.created_at <= ?`, // a row is made while the event is on, so it cannot expire before it is 48 hours old
    ts - PRESENCE_KEEP_MS
  );
  let n = 0;
  for (const r of rows) {
    if (ts < eventEndsAt(r, r.checked_in_at || r.created_at) + PRESENCE_KEEP_MS) continue;
    try { if (await removePresence(env, r.event_id, r.user_id, { why: "retention" })) n += 1; } catch (e) { console.error(e); }
  }
  return n;
}

/** Everything a person's presence rows hold, for the data export. No ids of anyone else. */
export async function exportPresence(db, userId) {
  const rows = await all(
    db,
    "SELECT event_id, selfie_key, intro, looking_for, created_at, updated_at FROM event_presence WHERE user_id = ? ORDER BY created_at",
    userId
  );
  return rows.map((r) => ({
    eventId: r.event_id, selfie: r.selfie_key ? `/media/${r.selfie_key}` : null,
    intro: r.intro, lookingFor: r.looking_for, createdAt: r.created_at, updatedAt: r.updated_at,
  }));
}

/** Deletes the selfies of every presence row a user has, before the user row is deleted. */
export async function eraseUserPresence(env, userId) {
  const rows = await all(env.DB, "SELECT selfie_key FROM event_presence WHERE user_id = ? AND selfie_key IS NOT NULL", userId);
  for (const r of rows) await deleteImage(env, r.selfie_key).catch(() => {});
}
