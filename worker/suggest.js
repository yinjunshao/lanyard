// F60: intention at check-in and "Who to meet" for everyone checked in (D054). This file holds the rules and the
// retention; worker/suggestApp.js holds the routes, worker/suggestMatch.js the ranking without AI and
// worker/ai/suggestRank.js the AI order.
//
// By the owner's decision of 2026-11-24 everyone checked in to an event can be suggested to the others there,
// whether or not they wrote an intention, unless they untick "Suggest me to people here". That shows people to
// strangers in a room, so (UK GDPR, legitimate interests) the rules below are the feature:
//   - the check-in page says so, and the tick is there, on to start with; a row exists only for someone who was
//     shown that notice (a check-in or a hub choice that carries a real true or false): nothing is assumed;
//   - unticking, at check-in or later (hub, Settings), takes the person out of every list on the next request;
//   - an entry shows only what their card already shows (visibleFields), their intention, and a photo only if they
//     turned on Be easy to find (F17); never a card, link, contact detail or user id;
//   - blocks work both ways; another event's people never; only while the event is on (the shared status rule);
//   - the host can switch suggestions off per event (events.suggest_on, on by default);
//   - rows go 48 hours after the event ends, with the account, and in the host reset;
//   - hosts see counts only, hidden under 3 (suggestCounts); no host-facing file reads this table.
import { all, newId, one } from "./db.js";
import { blockedSet, isBlocked } from "./blocks.js";
import { cleanLine, eventEndsAt, ongoingFor } from "./presence.js";
import { forgetSearchReplies } from "./ai/optout.js";
import { INTENTION_MAX, SUGGEST_NOTICE, SUGGEST_VERSION } from "../src/lib/suggest.js";

export const SUGGEST_KEEP_MS = 48 * 60 * 60 * 1000; // the same 48 hours as event presence (owner decision 2026-11-10)
export const suggestScope = (eventId) => `event_suggest:${eventId}`;
const hex = () => newId() + newId();

/**
 * What a request says about the two choices. `suggest` counts only as a real true or false; `intention` is one line of
 * text, up to 120 characters (cleaned like every other line a person writes). Left out means "no change".
 * Returns { suggest?, intention? } or { error }.
 */
export function readChoice(b) {
  const out = {};
  if (b?.suggest !== undefined) {
    if (typeof b.suggest !== "boolean") return { error: "Tick or untick Suggest me, then try again." };
    out.suggest = b.suggest;
  }
  if (b?.intention !== undefined && b.intention !== null) {
    const t = cleanLine(b.intention, INTENTION_MAX);
    if (t === null) return { error: typeof b.intention === "string" ? `Keep what you're hoping for to ${INTENTION_MAX} characters.` : "Write what you're hoping for as text." };
    out.intention = t;
  }
  return out;
}

/**
 * The statements a check-in adds for an event with suggestions on, when the request carries a real choice. Only the
 * first time: once a row exists, the hub and Settings change it, not checking in again. The history row (the exact
 * words and their version) is written only if the row is new, in the same batch.
 */
export function checkinSuggestStatements(db, ev, userId, choice, ts = Date.now()) {
  const notYet = "NOT EXISTS (SELECT 1 FROM event_suggest WHERE event_id = ? AND user_id = ?)";
  return [
    db.prepare(`INSERT INTO consent_log (id, user_id, scope, action, ref, at, wording, version)
                SELECT ?, ?, ?, ?, 'checkin', ?, ?, ? WHERE ${notYet}`)
      .bind(hex(), userId, suggestScope(ev.id), choice.suggest ? "granted" : "refused", ts, SUGGEST_NOTICE, SUGGEST_VERSION, ev.id, userId),
    db.prepare(`INSERT INTO event_suggest (id, event_id, user_id, suggest, intention, notice_version, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(event_id, user_id) DO NOTHING`)
      .bind(hex(), ev.id, userId, choice.suggest ? 1 : 0, choice.intention || "", SUGGEST_VERSION, ts, ts),
  ];
}

/**
 * A change from the event hub or Settings (`ref` says which). A person with no row yet (checked in before this
 * existed) must send a real true or false, because they are being shown the notice now. Only real changes are
 * written to the history. Unticking deletes every kept AI reply, so nothing about them lingers in anyone's list.
 * Returns the row as it now stands, or { error }.
 */
export async function changeSuggest(env, ev, userId, choice, ref = "hub", ts = Date.now()) {
  const db = env.DB;
  const row = await one(db, "SELECT * FROM event_suggest WHERE event_id = ? AND user_id = ?", ev.id, userId);
  const stmts = [];
  const log = (action) => db.prepare("INSERT INTO consent_log (id, user_id, scope, action, ref, at, wording, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(hex(), userId, suggestScope(ev.id), action, ref, ts, SUGGEST_NOTICE, SUGGEST_VERSION);
  if (!row) {
    if (choice.suggest === undefined) return { error: "Tick or untick Suggest me, then try again." };
    stmts.push(
      db.prepare(`INSERT INTO event_suggest (id, event_id, user_id, suggest, intention, notice_version, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(event_id, user_id) DO NOTHING`)
        .bind(hex(), ev.id, userId, choice.suggest ? 1 : 0, choice.intention || "", SUGGEST_VERSION, ts, ts),
      log(choice.suggest ? "granted" : "refused"),
    );
  } else {
    const sets = [], vals = [];
    if (choice.suggest !== undefined && !!row.suggest !== choice.suggest) {
      sets.push("suggest = ?", "notice_version = ?"); vals.push(choice.suggest ? 1 : 0, SUGGEST_VERSION);
      stmts.push(log(choice.suggest ? "granted" : "withdrawn"));
    }
    if (choice.intention !== undefined && choice.intention !== row.intention) { sets.push("intention = ?"); vals.push(choice.intention); }
    if (sets.length) stmts.unshift(db.prepare(`UPDATE event_suggest SET ${sets.join(", ")}, updated_at = ? WHERE event_id = ? AND user_id = ?`).bind(...vals, ts, ev.id, userId));
  }
  if (stmts.length) await db.batch(stmts);
  if (choice.suggest === false || (row && choice.intention !== undefined && choice.intention !== row.intention)) {
    await forgetSearchReplies(db); // F25's rule: a kept AI reply could hold their words or rank on old ones
  }
  return await one(db, "SELECT * FROM event_suggest WHERE event_id = ? AND user_id = ?", ev.id, userId);
}

/**
 * Where someone stands at an event: the event, their check-in and their own row. `why` is null when they may see
 * the list, otherwise why not: no_event, not_checked_in, suggest_off (the host's switch), not_ongoing.
 */
export async function suggestStanding(db, eventId, userId, clock = Date.now()) {
  const ev = await one(db, "SELECT * FROM events WHERE id = ?", eventId);
  if (!ev) return { ev: null, why: "no_event" };
  const [ch, mine] = await Promise.all([
    one(db, "SELECT created_at FROM checkins WHERE event_id = ? AND user_id = ?", ev.id, userId),
    one(db, "SELECT * FROM event_suggest WHERE event_id = ? AND user_id = ?", ev.id, userId),
  ]);
  let why = null;
  if (!ch) why = "not_checked_in";
  else if (!ev.suggest_on) why = "suggest_off";
  else if (!ongoingFor(ev, ch.created_at, clock)) why = "not_ongoing";
  return { ev, checkedInAt: ch?.created_at || null, mine, why };
}

/**
 * The people `viewerId` may be shown at this event: checked in, Suggest me ticked, the event on for them too, not
 * blocked either way, not the viewer. Rows carry only what the ranking and the entry read: the fields visibleFields()
 * filters, their intention, and their Be easy to find photo key when the room is on (F17's own rule for the photo).
 */
export async function suggestCandidates(db, ev, viewerId, clock = Date.now()) {
  if (!ev?.suggest_on) return [];
  const [rows, blocked] = await Promise.all([
    all(
      db,
      `SELECT s.id, s.user_id, s.intention, ch.created_at AS checked_in_at,
              pr.name, pr.mode, pr.uni, pr.institution_id, pr.course, pr.company, pr.role, pr.headline, pr.tags,
              c.headline AS card_headline, c.tags AS card_tags, ep.selfie_key AS photo_key
       FROM event_suggest s
       JOIN checkins ch ON ch.event_id = s.event_id AND ch.user_id = s.user_id
       JOIN profiles pr ON pr.user_id = s.user_id
       LEFT JOIN cards c ON c.user_id = s.user_id AND c.is_default = 1
       LEFT JOIN event_presence ep ON ep.event_id = s.event_id AND ep.user_id = s.user_id
       WHERE s.event_id = ?1 AND s.user_id != ?2 AND s.suggest = 1
       ORDER BY ch.created_at DESC`,
      ev.id, viewerId
    ),
    blockedSet(db, viewerId), // both directions
  ]);
  return rows
    .filter((r) => !blocked.has(r.user_id) && ongoingFor(ev, r.checked_in_at, clock))
    .map((r) => ({ ...r, intro: "", photo_key: ev.directory_on ? r.photo_key : null }));
}

/**
 * Whether `viewerId` may be served the Be easy to find photo with this key because its owner is in their Who to meet
 * right now: the same rules as the list, for both of them (checked in, the event on, the host's switch on, both with
 * Suggest me ticked, the room on, no block either way). F17's own rule (canViewPresenceSelfie) is checked first.
 */
export async function canViewSuggestPhoto(db, viewerId, key, clock = Date.now()) {
  if (!viewerId) return false;
  const p = await one(db, "SELECT event_id, user_id FROM event_presence WHERE selfie_key = ?", key);
  if (!p || p.user_id === viewerId) return false;
  const st = await suggestStanding(db, p.event_id, viewerId, clock);
  if (st.why || !st.mine?.suggest || !st.ev.directory_on) return false;
  const [theirs, ch] = await Promise.all([
    one(db, "SELECT suggest FROM event_suggest WHERE event_id = ? AND user_id = ?", p.event_id, p.user_id),
    one(db, "SELECT created_at FROM checkins WHERE event_id = ? AND user_id = ?", p.event_id, p.user_id),
  ]);
  if (!theirs?.suggest || !ch || !ongoingFor(st.ev, ch.created_at, clock)) return false;
  return !(await isBlocked(db, viewerId, p.user_id));
}

/**
 * The retention rule: every row whose event ended 48 hours ago or more goes (the same end rule as the event status
 * and F17). Run by the daily purge; safe to run again. Returns how many rows it deleted. The history rows in
 * consent_log stay 6 years, like every other record of a choice.
 */
export async function purgeSuggest(env, ts = Date.now()) {
  const db = env.DB;
  const edge = ts - SUGGEST_KEEP_MS;
  const rows = await all(
    db,
    `SELECT s.event_id, s.user_id, s.created_at, e.starts_at, e.ends_at, e.ended_at, ch.created_at AS checked_in_at
     FROM event_suggest s
     JOIN events e ON e.id = s.event_id
     LEFT JOIN checkins ch ON ch.event_id = s.event_id AND ch.user_id = s.user_id
     WHERE (e.ended_at IS NOT NULL AND e.ended_at <= ?1) OR (e.ends_at IS NOT NULL AND e.ends_at <= ?1)
        OR (e.ended_at IS NULL AND e.ends_at IS NULL)`,
    edge
  );
  const gone = rows.filter((r) => ts >= eventEndsAt(r, r.checked_in_at || r.created_at) + SUGGEST_KEEP_MS);
  for (let i = 0; i < gone.length; i += 50) {
    await db.batch(gone.slice(i, i + 50).map((r) => db.prepare("DELETE FROM event_suggest WHERE event_id = ? AND user_id = ?").bind(r.event_id, r.user_id)));
  }
  if (gone.length) await forgetSearchReplies(db);
  return gone.length;
}

/**
 * For the data download: a person's own rows (event, the Suggest me choice, the intention) and every choice they made,
 * with the words they were shown and their version. Nothing about anyone else. Null when there is nothing to say.
 */
export async function exportSuggest(db, userId) {
  const [rows, log] = await Promise.all([
    all(db,
      `SELECT s.event_id, e.name AS event_name, s.suggest, s.intention, s.notice_version, s.created_at, s.updated_at
       FROM event_suggest s LEFT JOIN events e ON e.id = s.event_id WHERE s.user_id = ? ORDER BY s.created_at`, userId),
    all(db, "SELECT scope, action, ref, at, wording, version FROM consent_log WHERE user_id = ? AND scope LIKE 'event_suggest:%' ORDER BY at", userId),
  ]);
  if (!rows.length && !log.length) return null;
  return {
    note: "Your choice to be suggested to people at an event, and what you hoped to get from it. Deleted 48 hours after the event ends; the record of each choice is kept 6 years.",
    events: rows.map((r) => ({
      eventId: r.event_id, eventName: r.event_name || null, suggestMe: !!r.suggest, intention: r.intention,
      noticeVersion: r.notice_version, createdAt: r.created_at, updatedAt: r.updated_at,
    })),
    choices: log.map((l) => ({ eventId: l.scope.slice("event_suggest:".length), action: l.action, where: l.ref, at: l.at, wording: l.wording, version: l.version })),
  };
}

/** Every event where the person has a choice, for Settings. */
export async function mySuggestChoices(db, userId) {
  const rows = await all(
    db,
    `SELECT s.event_id, e.name, e.suggest_on, s.suggest, s.intention FROM event_suggest s JOIN events e ON e.id = s.event_id
     WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 50`,
    userId
  );
  return rows.map((r) => ({ id: r.event_id, name: r.name, hostOn: !!r.suggest_on, suggest: !!r.suggest, intention: r.intention }));
}

/**
 * The only thing a host sees: how many people here wrote an intention and how many unticked Suggest me, each hidden
 * under 3 so a count cannot point at anyone (D004). Counts, never rows.
 */
export async function suggestCounts(db, eventId) {
  const r = await one(
    db,
    "SELECT COALESCE(SUM(CASE WHEN intention != '' THEN 1 ELSE 0 END), 0) AS wrote, COALESCE(SUM(CASE WHEN suggest = 0 THEN 1 ELSE 0 END), 0) AS out FROM event_suggest WHERE event_id = ?",
    eventId
  );
  const shown = (n) => (n >= 3 ? n : null);
  return { intentions: shown(r?.wrote || 0), unticked: shown(r?.out || 0) };
}
