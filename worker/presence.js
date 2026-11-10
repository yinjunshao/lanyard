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
import { all, newId, one } from "./db.js";
import { deleteImage } from "./media.js";
import { NO_END_GRACE_MS, eventStatus } from "./eventstatus.js";
import { blockedSet, isBlocked } from "./blocks.js";

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

/* -------------------------------- who can see -------------------------------- */

export const INTRO_MAX = 80;
export const LOOKING_MAX = 120;

const eventTimes = (e) => ({ startsAt: e.starts_at || null, endsAt: e.ends_at || null, endedAt: e.ended_at || null });

/** Whether the event is on for this person (the shared status rule). */
export const ongoingFor = (e, checkedInAt, clock = Date.now()) => eventStatus(eventTimes(e), checkedInAt, clock) === "ongoing";

/**
 * Where someone stands for presence at an event: the event, their check-in and their own row.
 * `why` is null when they may use it, otherwise why not (a code the app can word).
 */
export async function presenceStanding(db, eventId, userId, clock = Date.now()) {
  const ev = await one(db, "SELECT * FROM events WHERE id = ?", eventId);
  if (!ev) return { ev: null, why: "no_event" };
  const ch = await one(db, "SELECT created_at FROM checkins WHERE event_id = ? AND user_id = ?", ev.id, userId);
  const mine = await one(db, "SELECT * FROM event_presence WHERE event_id = ? AND user_id = ?", ev.id, userId);
  let why = null;
  if (!ch) why = "not_checked_in";
  else if (!ev.directory_on) why = "directory_off";
  else if (!ongoingFor(ev, ch.created_at, clock)) why = "not_ongoing";
  return { ev, checkedInAt: ch?.created_at || null, mine, why };
}

/**
 * The name others see: first name and last initial ("Alice Hub" -> "Alice H."). Nothing else
 * from the profile goes into an entry.
 */
export function displayName(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "Someone";
  const first = words[0].slice(0, 30);
  return words.length > 1 ? `${first} ${[...words[words.length - 1]][0].toUpperCase()}.` : first;
}

/** One line of text from a person: control characters and runs of spaces become one space. Null if too long. */
export function cleanLine(value, max) {
  if (typeof value !== "string") return null;
  const t = value.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ").replace(/\s+/g, " ").trim();
  return [...t].length > max ? null : t;
}

/**
 * Whether `viewerId` may be served the selfie with this key. The owner may, while the row exists.
 * Anyone else must be checked in to the same event, with presence on themselves, while it is
 * on, with the directory on, and not blocked either way. A key with no row is nobody's.
 */
export async function canViewPresenceSelfie(db, viewerId, key, clock = Date.now()) {
  if (!viewerId) return false;
  const row = await one(db, "SELECT event_id, user_id FROM event_presence WHERE selfie_key = ?", key);
  if (!row) return false;
  if (row.user_id === viewerId) return true;
  const [mine, theirs] = await Promise.all([
    presenceStanding(db, row.event_id, viewerId, clock),
    one(db, "SELECT created_at FROM checkins WHERE event_id = ? AND user_id = ?", row.event_id, row.user_id),
  ]);
  if (mine.why || !mine.mine || !theirs || !ongoingFor(mine.ev, theirs.created_at, clock)) return false;
  return !(await isBlocked(db, viewerId, row.user_id));
}

/**
 * The other people at this event who have presence on and whom `viewerId` may see: checked in,
 * the event on for them too, not blocked either way. Rows carry what matching reads; the Worker
 * turns them into entries (name, selfie, intro, reason) and drops the rest.
 */
export async function presenceCandidates(db, eventId, viewerId, clock = Date.now()) {
  const [rows, blocked, ev] = await Promise.all([
    all(
      db,
      `SELECT p.id, p.user_id, p.selfie_key, p.intro, p.looking_for, ch.created_at AS checked_in_at,
              pr.name, pr.mode, pr.uni, pr.institution_id, pr.course, pr.company, pr.role, pr.headline, pr.tags,
              c.headline AS card_headline, c.tags AS card_tags
       FROM event_presence p
       JOIN checkins ch ON ch.event_id = p.event_id AND ch.user_id = p.user_id
       JOIN profiles pr ON pr.user_id = p.user_id
       LEFT JOIN cards c ON c.user_id = p.user_id AND c.is_default = 1
       WHERE p.event_id = ?1 AND p.user_id != ?2
       ORDER BY ch.created_at DESC`,
      eventId, viewerId
    ),
    blockedSet(db, viewerId), // both directions
    one(db, "SELECT * FROM events WHERE id = ?", eventId),
  ]);
  return rows.filter((r) => !blocked.has(r.user_id) && ongoingFor(ev, r.checked_in_at, clock));
}
