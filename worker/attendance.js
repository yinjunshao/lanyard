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
  if (typeof c !== "object" || Array.isArray(c)) throw new HttpError(400, "Those collection settings are not understood.");
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
