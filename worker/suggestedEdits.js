// F75 (D064): details the Lanyard admin suggests for someone's card, for example found on LinkedIn when their card is
// empty. The owner's rule: they approve first. A suggestion is kept apart from the profile (profile_suggestions,
// migration 0047) and nothing about it reaches the card, the card's link preview, search, People, Who to meet, a host
// or anyone else's export until the person presses Accept. Only the person (signed in) and the admin can read it.
//
// - What can be suggested is an allow-list of card fields (SUGGESTIBLE): never email, sign-in, plan, settings or ids.
//   Any other key in the request is a 400 and nothing is stored.
// - The values are cleaned by Edit profile's own checks (profilePayload) when they are suggested, and accepting writes
//   the ticked ones through exactly the Edit profile save (readProfileEdit and profileEditStmt in profileFields.js).
// - One open suggestion per person; a new one replaces the old one and its photo.
// - A suggested photo is stored under suggest/, which /media never serves, and is deleted with the suggestion.
// - Accept and Decline are one conditional write each, gated on the suggestion the person saw (its id), so two at once,
//   or an Accept and a new suggestion at once, leave one consistent answer.
// - It is deleted on Accept, on Decline, when the admin withdraws or replaces it, after 30 days, and with the account.
//   Only counts of how suggestions ended are kept (suggestion_counts), never the values.
import { all, one, run, now, newId } from "./db.js";
import { profilePayload, validMode } from "./profileFields.js";
import { readInstitution } from "./institutions.js";
import { putImage } from "./media.js";
import { drainMediaDeletes } from "./branding.js";

const DAY = 86400_000;
export const SUGGEST_MAX_AGE = 30 * DAY;
export const COUNTS_KEEP = 400 * DAY; // the daily outcome counts, as long as the welcome-step counts
export const LOW_SCORE = 2; // "a low profile score": 2 of 6 or under

/** The fields a suggestion may hold, in the order the review page shows them, with the words used for them. */
export const SUGGESTIBLE = [
  { key: "name", label: "Name" },
  { key: "photo", label: "Photo" },
  { key: "mode", label: "Student or career" },
  { key: "uni", label: "University" },
  { key: "course", label: "Course" },
  { key: "year", label: "Year" },
  { key: "company", label: "Company" },
  { key: "role", label: "Role" },
  { key: "headline", label: "What you do" },
  { key: "about", label: "About" },
  { key: "tags", label: "Come to me for" },
  { key: "links", label: "Links" },
];
export const FIELD_KEYS = SUGGESTIBLE.map((f) => f.key);
export const labelOf = (key) => SUGGESTIBLE.find((f) => f.key === key)?.label || key;
// The keys a suggestion request may carry: the fields in Edit profile's own names, the photo, and where they came from.
// Everything else (email, plan, settings, ids, showAge, projects, anything unknown) is refused.
export const REQUEST_KEYS = new Set(["name", "mode", "uni", "institutionId", "course", "year", "company", "role", "headline", "about", "tags", "links", "photoDataUrl", "source"]);
const TEXT = ["name", "course", "year", "company", "role", "headline", "about"];

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function sameAsNow(key, value, cur, institutionId) {
  if (key === "mode") return value === (cur.mode || "student");
  if (key === "uni") return value === (cur.uni || "") && (institutionId === undefined || institutionId === (cur.institution_id || null));
  if (key === "tags") return sameJson(value, cur.tags || []);
  if (key === "links") return sameJson(value, cur.links || {});
  return value === (cur[key] || "");
}

/**
 * Reads the admin's request into the fields to store. Returns { fields } or { error, code }. `fields` holds only
 * fields that would change the card, cleaned exactly as an Edit profile save cleans them (profilePayload), in Edit
 * profile's shape, so accepting them later is an ordinary Edit profile save of the same values.
 */
export function readSuggestion(body, current) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Send the details as a form." };
  const bad = Object.keys(body).filter((k) => !REQUEST_KEYS.has(k));
  if (bad.length) return { error: `These can't be suggested: ${bad.slice(0, 5).map((k) => String(k).slice(0, 30)).join(", ")}. Only card details can.`, code: "not_allowed" };
  if (!validMode(body)) return { error: "Choose a mode for the card: student or career." };
  const pick = readInstitution(body);
  if (pick.error) return { error: pick.error };
  const pp = profilePayload(body);
  const out = {};
  for (const k of TEXT) if (typeof pp[k] === "string" && pp[k]) out[k] = pp[k];
  if (pick.present && pick.inst) { out.uni = pick.inst.name; out.institutionId = pick.inst.id; }
  else if (typeof pp.uni === "string" && pp.uni) out.uni = pp.uni;
  if (pp.mode) out.mode = pp.mode;
  if (pp.tags) { const t = JSON.parse(pp.tags); if (t.length) out.tags = t; }
  if (pp.links) { const l = JSON.parse(pp.links); if (Object.keys(l).length) out.links = l; }
  for (const k of Object.keys(out)) {
    if (k !== "institutionId" && sameAsNow(k, out[k], current, k === "uni" ? out.institutionId : undefined)) {
      delete out[k];
      if (k === "uni") delete out.institutionId;
    }
  }
  return { fields: out };
}

/** The keys of the fields a stored suggestion offers (photo included), in the review page's order. */
export function offeredKeys(row) {
  const f = parseFields(row);
  return FIELD_KEYS.filter((k) => (k === "photo" ? !!row.photo_key : f[k] !== undefined));
}
export function parseFields(row) {
  try { const f = JSON.parse(row?.fields || "{}"); return f && typeof f === "object" && !Array.isArray(f) ? f : {}; } catch { return {}; }
}

/** The open suggestion for an account, or null. One past its 30 days counts as gone (the nightly purge removes it). */
export function openSuggestion(db, userId, ts = now()) {
  return one(db, "SELECT * FROM profile_suggestions WHERE user_id = ? AND expires_at > ?", String(userId || ""), ts);
}

/** Stores a suggested photo under suggest/ (never served at /media), with the same checks as every upload. */
export function putSuggestedPhoto(env, dataUrl) {
  return putImage(env, dataUrl, "suggest");
}

/** SQL that is true while the suggestion with this id is still the open one. */
const LIVE = "EXISTS (SELECT 1 FROM profile_suggestions WHERE user_id = ? AND id = ?)";
/** Counts one outcome for today, only if the gate holds (in the same batch as the delete, so it is counted once). */
export const countStmt = (db, outcome, ts, userId, id) => db.prepare(
  `INSERT INTO suggestion_counts (day, outcome, n) SELECT ?, ?, 1 WHERE ${LIVE}
   ON CONFLICT(day, outcome) DO UPDATE SET n = n + 1`).bind(new Date(ts).toISOString().slice(0, 10), outcome, userId, id);
/** Queues the suggestion's photo for deletion (F66's media_deletes), only if the gate holds. */
const queuePhotoStmt = (db, ts, userId, id) => db.prepare(
  "INSERT OR IGNORE INTO media_deletes (key, queued_at) SELECT photo_key, ? FROM profile_suggestions WHERE user_id = ? AND id = ? AND photo_key IS NOT NULL").bind(ts, userId, id);
const deleteStmt = (db, userId, id) => db.prepare("DELETE FROM profile_suggestions WHERE user_id = ? AND id = ?").bind(userId, id);
export const gate = (userId, id) => ({ sql: LIVE, args: [userId, id] });
/** The last statements of an Accept or Decline: count it, queue the photo, delete the row (the last one says who won). */
export const endStmts = (db, { userId, id, outcome, ts = now() }) => [
  ...(outcome ? [countStmt(db, outcome, ts, userId, id)] : []),
  queuePhotoStmt(db, ts, userId, id),
  deleteStmt(db, userId, id),
];

/**
 * Makes (or replaces) the suggestion on an account. The old one's photo is queued for deletion in the same write, so a
 * photo is never left behind. Returns { id, createdAt, expiresAt }.
 */
export async function writeSuggestion(env, { userId, fields, source, photoKey = null, ts = now() }) {
  const db = env.DB;
  const old = await one(db, "SELECT photo_key FROM profile_suggestions WHERE user_id = ?", userId);
  const id = newId() + newId();
  const expiresAt = ts + SUGGEST_MAX_AGE;
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO media_deletes (key, queued_at) SELECT photo_key, ? FROM profile_suggestions WHERE user_id = ? AND photo_key IS NOT NULL").bind(ts, userId),
    db.prepare(`INSERT INTO profile_suggestions (user_id, id, fields, photo_key, source, created_at, expires_at, emailed_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(user_id) DO UPDATE SET id = excluded.id, fields = excluded.fields, photo_key = excluded.photo_key, source = excluded.source,
        created_at = excluded.created_at, expires_at = excluded.expires_at, emailed_at = NULL`)
      .bind(userId, id, JSON.stringify(fields), photoKey, source, ts, expiresAt),
  ]);
  if (old?.photo_key) await drainMediaDeletes(env, [old.photo_key]);
  return { id, createdAt: ts, expiresAt };
}

/**
 * Ends the open suggestion on an account: Decline (outcome "declined"), the admin's Withdraw (no outcome), the purge
 * ("expired"). `id`, when given, must be the open one. Its photo goes too. Returns true for the call that ended it.
 */
export async function endSuggestion(env, userId, { id = null, outcome = null, ts = now() } = {}) {
  const db = env.DB;
  const row = await one(db, "SELECT id, photo_key FROM profile_suggestions WHERE user_id = ?", userId);
  if (!row || (id && row.id !== id)) return false;
  const out = await db.batch(endStmts(db, { userId, id: row.id, outcome, ts }));
  const won = out.at(-1)?.meta?.changes === 1;
  if (won && row.photo_key) await drainMediaDeletes(env, [row.photo_key]);
  return won;
}

/** How suggestions ended in the last 30 days, and how many are open: counts only. */
export async function suggestionTotals(db, ts = now()) {
  const day30 = new Date(ts - 30 * DAY).toISOString().slice(0, 10);
  const [open, counts] = await Promise.all([
    one(db, "SELECT COUNT(*) AS n FROM profile_suggestions WHERE expires_at > ?", ts),
    all(db, "SELECT outcome, COALESCE(SUM(n), 0) AS n FROM suggestion_counts WHERE day >= ? GROUP BY outcome", day30),
  ]);
  const by = Object.fromEntries(counts.map((r) => [r.outcome, r.n]));
  return { open: open?.n || 0, accepted30d: by.accepted || 0, declined30d: by.declined || 0, expired30d: by.expired || 0 };
}

/** The 30-day purge: suggestions past their time are deleted with their photos and counted as expired. */
export async function purgeSuggestions(env, ts = now()) {
  const db = env.DB;
  const old = await all(db, "SELECT user_id FROM profile_suggestions WHERE expires_at <= ? LIMIT 500", ts);
  let n = 0;
  for (const r of old) if (await endSuggestion(env, r.user_id, { outcome: "expired", ts })) n += 1;
  await run(db, "DELETE FROM suggestion_counts WHERE day < ?", new Date(ts - COUNTS_KEEP).toISOString().slice(0, 10));
  return n;
}
