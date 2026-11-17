// F31: named attendance. An event whose host switched it on keeps a list of the people who checked
// in and left the attendance tick on. This file holds the rules; the routes that call it are in
// events.js (check-in), myevents.js is untouched, and worker/hosts.js (the host's list and CSV).
//
// Rules, in one place:
//   - An event collects only what its host switched on, from the fixed list in src/lib/collects.js.
//   - A person is on the list only because their own request said so (`true`). A missing value, a
//     request with no choices and an old page all mean "not on it". Every item they were shown is
//     written to consent_log with the wording and its version.
//   - The list holds only people who are on it. Unticking deletes the row.
//   - Hosts read it through hostAttendees() only, for their own organisation's event with the list
//     on, and see for each person only the extra items that person left ticked.
//   - Rows go with the person's account, when the host switches the list off, and 12 months
//     after the event ends (purgeAttendees).
import { all, newId, one } from "./db.js";
import { HttpError } from "./session.js";
import { eventEndsAt } from "./presence.js";
import { cardFacts } from "../src/lib/cardmerge.js";
import { subtitleParts } from "../src/lib/profile.js";
import { NOTICE_VERSION, ATTENDANCE, EXTRA_ITEMS, EXTRA_KEYS, cleanWhy, whyProblem, itemsOf, noticeOf, wordingFor } from "../src/lib/collects.js";

export { NOTICE_VERSION };

const DAY = 86400_000;
/** How long a host's list is kept after the event ends: proposed by the build, owner to confirm. */
export const ATTENDEES_KEEP_MS = 365 * DAY;

export const SCOPES = {
  attendance: (eventId) => `event_attendance:${eventId}`,
  email: (eventId) => `event_share_email:${eventId}`,
  card: (eventId) => `event_share_card:${eventId}`,
};

/* ------------------------------ the host's settings ------------------------------ */

/**
 * The host's "What this event collects" settings, checked, as the event columns to save.
 * `undefined` means the request said nothing about it (nothing changes). Anything else is
 * read strictly: only `attendance: true` switches it on; then `why` is required and cleaned,
 * and `items` may hold only keys from the fixed list (anything else is refused). Switching it off
 * clears the items and the line.
 */
export function collectFields(c) {
  if (c === undefined) return null;
  const off = { collect_attendance: 0, collect_items: "[]", collect_why: "" };
  if (c === null || c === false) return off;
  if (typeof c !== "object" || Array.isArray(c)) throw new HttpError(400, "Those settings couldn't be read. Reload the page and try again.");
  if (c.attendance !== true) return off;
  const asked = c.items === undefined ? [] : c.items;
  if (!Array.isArray(asked) || asked.some((k) => typeof k !== "string" || !EXTRA_KEYS.includes(k))) {
    throw new HttpError(400, "That item is not one this event can collect.");
  }
  const why = cleanWhy(c.why);
  const problem = whyProblem(why);
  if (problem) throw new HttpError(400, problem);
  return { collect_attendance: 1, collect_items: JSON.stringify(itemsOf(asked)), collect_why: why };
}

const parseList = (v) => { try { const x = JSON.parse(v || "[]"); return Array.isArray(x) ? x : []; } catch { return []; } };

/** The event's settings as the host's form holds them, or null when the list is off. */
export function collectOf(ev) {
  return ev?.collect_attendance ? { attendance: true, items: itemsOf(parseList(ev.collect_items)), why: ev.collect_why || "" } : null;
}

export const organiserName = async (db, orgId) => (orgId ? (await one(db, "SELECT name FROM orgs WHERE id = ?", orgId))?.name : "") || "";

/** What the check-in page shows for an event: null when the list is off. */
export async function noticeFor(db, ev) {
  const c = collectOf(ev);
  return c ? noticeOf(c, await organiserName(db, ev.org_id)) : null;
}

/* ------------------------------- a person's choices ------------------------------- */

const logStmt = (db, userId, scope, action, eventId, wording, ts) =>
  db.prepare("INSERT INTO consent_log (id, user_id, scope, action, ref, at, wording, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(newId() + newId(), userId, scope, action, eventId, ts, wording, NOTICE_VERSION);

/**
 * What a request says about each item the event offers, as true or false. An item is granted only
 * when the request says `true` for it: a missing key, `"true"`, `1` and anything else mean no. The
 * extra items also need the attendance tick, because they are only ever shown on the list.
 */
export function readChoices(sent, notice) {
  const s = sent && typeof sent === "object" && !Array.isArray(sent) ? sent : {};
  const attendance = s.attendance === true;
  const out = { attendance };
  for (const i of notice.items) if (i.key !== "attendance") out[i.key] = attendance && s[i.key] === true;
  return out;
}

/**
 * The statements that record a person's choices at one event (inside the caller's batch): a
 * consent_log row for each item offered (granted, refused or withdrawn, with the exact wording and
 * its version), and the person's row on the list, made or updated when they are on it and deleted
 * when they are not. `onlyChanges` (a change of mind, not a check-in) logs just the items whose
 * state changed. Returns [] for an event that does not collect.
 */
export async function choiceStatements(db, ev, userId, sent, { onlyChanges = false, ts = Date.now() } = {}) {
  const notice = await noticeFor(db, ev);
  if (!notice) return [];
  const had = await one(db, "SELECT items FROM event_attendees WHERE event_id = ? AND user_id = ?", ev.id, userId);
  const hadItems = had ? itemsOf(parseList(had.items)) : [];
  const choice = readChoices(sent, notice);
  const stmts = [];
  for (const item of notice.items) {
    const granted = choice[item.key] === true;
    const was = item.key === "attendance" ? !!had : hadItems.includes(item.key);
    if (onlyChanges && granted === was) continue;
    const action = granted ? "granted" : was ? "withdrawn" : "refused";
    stmts.push(logStmt(db, userId, SCOPES[item.key](ev.id), action, ev.id, wordingFor(item, notice), ts));
  }
  if (choice.attendance) {
    const items = notice.items.filter((i) => i.key !== "attendance" && choice[i.key]).map((i) => i.key);
    stmts.push(db.prepare(
      `INSERT INTO event_attendees (event_id, user_id, items, notice_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(event_id, user_id) DO UPDATE SET items = excluded.items, notice_version = excluded.notice_version, updated_at = excluded.updated_at`
    ).bind(ev.id, userId, JSON.stringify(items), NOTICE_VERSION, ts, ts));
  } else {
    stmts.push(db.prepare("DELETE FROM event_attendees WHERE event_id = ? AND user_id = ?").bind(ev.id, userId));
  }
  return stmts;
}

/* ------------------------------- the host's list ------------------------------- */

export const LIST_LIMIT = 5000;
const iso = (ms) => new Date(ms).toISOString();

/**
 * The list an event's host sees: people on it, with the time they checked in and only the extra
 * items each of them left ticked, and only the items the event still offers. `null` when the event
 * does not keep a list (the caller answers 404). The email and the card are chosen in SQL by
 * CASE, so what a person did not share never leaves the database. Nothing here names who
 * connected with whom, or reads anything the person did not tick.
 */
export async function hostAttendees(db, ev) {
  const c = collectOf(ev);
  if (!c) return null;
  const wantEmail = c.items.includes("email") ? 1 : 0;
  const wantCard = c.items.includes("card") ? 1 : 0;
  const CARD = `?3 = 1 AND ea.items LIKE '%"card"%'`;
  const rows = await all(
    db,
    `SELECT ea.items AS shared, ch.created_at AS checked_in_at, p.name,
            CASE WHEN ?2 = 1 AND ea.items LIKE '%"email"%' AND u.email_verified = 1 THEN u.recovery_email END AS email,
            CASE WHEN ${CARD} THEN p.mode END AS mode,
            CASE WHEN ${CARD} THEN p.course END AS course,
            CASE WHEN ${CARD} THEN p.uni END AS uni,
            CASE WHEN ${CARD} THEN p.company END AS company,
            CASE WHEN ${CARD} THEN p.role END AS role,
            CASE WHEN ${CARD} THEN p.links END AS links,
            CASE WHEN ${CARD} THEN p.headline END AS headline,
            CASE WHEN ${CARD} THEN k.headline END AS card_headline,
            CASE WHEN ${CARD} THEN k.visible_links END AS visible_links
     FROM event_attendees ea
     JOIN checkins ch ON ch.event_id = ea.event_id AND ch.user_id = ea.user_id
     JOIN profiles p ON p.user_id = ea.user_id
     JOIN users u ON u.id = ea.user_id
     LEFT JOIN cards k ON k.user_id = ea.user_id AND k.is_default = 1
     WHERE ea.event_id = ?1
     ORDER BY ch.created_at, p.name
     LIMIT ${LIST_LIMIT + 1}`,
    ev.id, wantEmail, wantCard
  );
  const truncated = rows.length > LIST_LIMIT;
  const attendees = rows.slice(0, LIST_LIMIT).map((r) => {
    const out = { name: r.name, checkedInAt: r.checked_in_at };
    const shared = itemsOf(parseList(r.shared));
    if (wantEmail && shared.includes("email")) out.email = r.email || null;
    if (wantCard && shared.includes("card")) {
      const facts = cardFacts(
        { visible_links: r.visible_links, tags: [], headline: r.card_headline, about: "" },
        { links: r.links || {}, tags: [], headline: r.headline, about: "" }
      );
      out.card = {
        headline: facts.headline || "",
        line: subtitleParts({ mode: r.mode, course: r.course, uni: r.uni, company: r.company, role: r.role }).join(" · "),
        links: Object.entries(facts.links || {}).map(([label, url]) => ({ label, url })).filter((l) => /^https?:\/\//.test(String(l.url))),
      };
    }
    return out;
  });
  return { event: { id: ev.id, name: ev.name }, items: c.items, count: attendees.length, truncated, attendees, generatedAt: Date.now() };
}

// CSV with every cell escaped so a name or a link can never run as a formula when the file is opened.
const cell = (v) => {
  let t = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** The list as a spreadsheet: a name, the check-in time and a column for each extra item the event offers. */
export function attendeesCsv(list) {
  const head = ["Name", "Checked in (UTC)", ...(list.items.includes("email") ? ["Email"] : []),
    ...(list.items.includes("card") ? ["Card headline", "Card line", "Card links"] : [])];
  const rows = [head, ...list.attendees.map((a) => [
    a.name, iso(a.checkedInAt),
    ...(list.items.includes("email") ? [a.email || ""] : []),
    ...(list.items.includes("card") ? [a.card?.headline || "", a.card?.line || "", (a.card?.links || []).map((l) => `${l.label}: ${l.url}`).join(" | ")] : []),
  ])];
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

export const attendeesFileName = (name) =>
  `lanyard-attendees-${String(name || "").replace(/[^A-Za-z0-9 _-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "event"}.csv`;

/** Every list a host account's organisations keep, with its CSV, for the host's own data download. */
export async function exportAttendeeLists(db, hostAccountId) {
  const evs = await all(
    db,
    `SELECT e.* FROM events e JOIN host_org_members m ON m.org_id = e.org_id
     WHERE m.host_account_id = ? AND e.collect_attendance = 1 ORDER BY e.created_at`,
    hostAccountId
  );
  const out = [];
  for (const ev of evs) {
    const list = await hostAttendees(db, ev);
    if (list) out.push({ eventId: ev.id, eventName: ev.name, items: list.items, count: list.count, attendees: list.attendees, csv: attendeesCsv(list) });
  }
  return out;
}

/* ------------------------------ a person's own copy ------------------------------ */

/** What a person's data download says about named attendance: the lists they are on, and every choice with its wording. Null when there is nothing. */
export async function exportNamedAttendance(db, userId) {
  const [rows, log] = await Promise.all([
    all(db, `SELECT ea.event_id, ea.items, ea.notice_version, ea.created_at, ea.updated_at, e.name
             FROM event_attendees ea JOIN events e ON e.id = ea.event_id WHERE ea.user_id = ? ORDER BY ea.created_at`, userId),
    all(db, `SELECT scope, action, ref, at, wording, version FROM consent_log
             WHERE user_id = ? AND (scope LIKE 'event_attendance:%' OR scope LIKE 'event_share_email:%' OR scope LIKE 'event_share_card:%') ORDER BY at`, userId),
  ]);
  if (!rows.length && !log.length) return null;
  return {
    note: "Events whose organisers keep a list of who checked in: whether you are on it now, what you share with them, and every choice you made, with the words you were shown.",
    onLists: rows.map((r) => ({ eventId: r.event_id, eventName: r.name, sharing: itemsOf(parseList(r.items)), wording: r.notice_version, since: r.created_at, changed: r.updated_at })),
    choices: log.map((l) => ({ scope: l.scope, eventId: l.ref, action: l.action, at: l.at, wording: l.wording, version: l.version })),
  };
}

/* --------------------------- the person's change of mind --------------------------- */

/** Where a person stands at one event that keeps a list: null when it keeps none. */
export async function myStanding(db, ev, userId) {
  const notice = await noticeFor(db, ev);
  if (!notice) return null;
  const row = await one(db, "SELECT items FROM event_attendees WHERE event_id = ? AND user_id = ?", ev.id, userId);
  const items = row ? itemsOf(parseList(row.items)) : [];
  return {
    organiser: notice.organiser, why: notice.why,
    attendance: !!row, label: notice.items[0].label,
    items: notice.items.filter((i) => i.key !== "attendance").map((i) => ({ key: i.key, label: i.label, on: items.includes(i.key) })),
  };
}

/**
 * Which of these people are on this event's named list right now (F32 uses it for the host's view of who has
 * which drop item): a Set of user ids, or null when the event keeps no list. An event whose list is off is not
 * read at all, and a person with no row is never counted as on it. Asked again on every request, so a person
 * who unticks in the hub is gone from the very next answer.
 */
export async function namedAmong(db, ev, userIds) {
  if (!collectOf(ev)) return null;
  const out = new Set();
  const ids = [...new Set(userIds)];
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    for (const r of await all(db, `SELECT user_id FROM event_attendees WHERE event_id = ? AND user_id IN (${part.map(() => "?").join(",")})`, ev.id, ...part)) out.add(r.user_id);
  }
  return out;
}

/** Every list a person is on, for Settings. */
export async function myLists(db, userId) {
  const rows = await all(
    db,
    `SELECT e.* FROM event_attendees ea JOIN events e ON e.id = ea.event_id
     WHERE ea.user_id = ? AND e.collect_attendance = 1 ORDER BY ea.created_at DESC`,
    userId
  );
  const out = [];
  for (const ev of rows) out.push({ id: ev.id, name: ev.name, startsAt: ev.starts_at || null, ...(await myStanding(db, ev, userId)) });
  return out;
}

/* --------------------------------- retention --------------------------------- */

/**
 * The retention rule: a host's list goes 12 months after the event ends (the same end rule as the
 * event's status and the presence purge). Run by the daily purge; safe to run again. Returns how
 * many rows it deleted.
 */
export async function purgeAttendees(db, ts = Date.now()) {
  const cutoff = ts - ATTENDEES_KEEP_MS;
  const rows = await all(
    db,
    `SELECT ea.event_id, ea.user_id, ea.created_at, e.starts_at, e.ends_at, e.ended_at, ch.created_at AS checked_in_at
     FROM event_attendees ea
     JOIN events e ON e.id = ea.event_id
     LEFT JOIN checkins ch ON ch.event_id = ea.event_id AND ch.user_id = ea.user_id
     WHERE ea.created_at <= ?1 OR e.ended_at <= ?1 OR e.ends_at <= ?1
     LIMIT 2000`,
    cutoff
  );
  const gone = rows.filter((r) => ts >= eventEndsAt(r, r.checked_in_at || r.created_at) + ATTENDEES_KEEP_MS);
  for (let i = 0; i < gone.length; i += 100) {
    await db.batch(gone.slice(i, i + 100).map((r) => db.prepare("DELETE FROM event_attendees WHERE event_id = ? AND user_id = ?").bind(r.event_id, r.user_id)));
  }
  return gone.length;
}
