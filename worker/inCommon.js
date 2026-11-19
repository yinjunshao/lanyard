// F16: shared ground between two people, worked out from fields, never by AI and never stored.
// Computed on the fly for one viewer and one person; nothing here is written to the database.
//
// The rule that matters: a fact may only be built from what EACH person has already chosen to
// show the other. So both sides go through `visibleSide`, which keeps only the fields their
// mode prints (Student: institution and course; Career: institution as "Studied at", company
// and role) and the "come to me for" tags of the card that was shared. A kept-but-hidden field
// (a career profile's course, a student profile's company, a tag the shared card leaves out)
// never produces a fact, on either side: otherwise "Both at Acme" would tell the other person
// about a company you chose not to show.
//
// F17 (who to meet) and F22 (follow-up drafts) call `sharedGround` / `inCommon` from the Worker
// and use `kind` and `text`; the first fact is the reason. They must not widen what it reads.
import { one, all } from "./db.js";
import { isBlocked } from "./blocks.js";
import { eventStatus } from "./eventstatus.js";
import { shareOf } from "./shares.js";

export const MAX_FACTS = 3;

/* ------------------------------- normalisers ------------------------------ */

// Lower case, accents off, "&" as "and", punctuation to spaces, one space between words.
function base(value) {
  return String(value ?? "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

// Fold a plural to its singular so "robot" and "robots" meet: ies to y, a final s dropped
// (not ss, us or is), only on words of four letters or more.
function singular(word) {
  if (word.length < 4) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(ss|us|is)$/.test(word) || !word.endsWith("s")) return word;
  return word.slice(0, -1);
}

export const normTag = (value) => base(value).split(" ").filter(Boolean).map(singular).join(" ");

const COMPANY_NOISE = new Set(["ltd", "limited", "plc", "llp", "llc", "inc", "incorporated", "corp", "co", "uk", "the"]);
export function normCompany(value) {
  const words = base(value).split(" ").filter((w) => w && !COMPANY_NOISE.has(w));
  return words.join(" ");
}

const DEGREE = /^(?:(?:bsc|ba|msc|ma|meng|beng|mphil|phd|llb|llm|mbiol|mchem|mmath|mphys|mres|bed|pgce)(?:\s+hons)?\s+)+/;
export const normCourse = (value) => base(value).replace(DEGREE, "").replace(/^hons\s+/, "").split(" ").filter(Boolean).map(singular).join(" ");

// "University of Example" typed by hand and picked from the list both reduce to the same words.
export const normInstitution = (value) => base(value).replace(/^the\s+/, "");

/* --------------------------- what each side shows -------------------------- */

const t = (v) => (typeof v === "string" ? v.trim() : "");
const asArray = (v) => (Array.isArray(v) ? v : []);

/**
 * What one person has chosen to show the other.
 * profile: { mode, uni, institution_id, course, company, role, tags }
 * card: the card that person shared (or null): its tags replace the profile's when it has any,
 * the same rule `cardView` uses for the page.
 */
export function visibleSide(profile, card) {
  if (!profile) return null;
  const career = profile.mode === "career";
  const tags = asArray(card?.tags).length ? card.tags : profile.tags;
  const uni = t(profile.uni);
  return {
    career,
    institution: uni ? { id: profile.institution_id || null, name: uni, key: normInstitution(uni) } : null,
    course: career ? "" : t(profile.course),
    company: career ? t(profile.company) : "",
    tags: asArray(tags).filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()),
  };
}

// Same institution: the same id on both, or the same words when at least one has no id (typed in).
function sameInstitution(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id) return a.id === b.id;
  return !!a.key && a.key === b.key;
}

/* ---------------------------------- facts --------------------------------- */

const overlap = (a, b) => {
  const mine = new Set(a.map(normTag).filter(Boolean));
  const seen = new Set();
  return b.filter((tag) => {
    const k = normTag(tag);
    if (!k || !mine.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

const list = (items) => (items.length === 1 ? items[0] : `${items[0]} and ${items[1]}`);

/**
 * The facts two visible sides have in common, most specific first, at most MAX_FACTS.
 * me, peer: the output of `visibleSide`. events: names of events both attended that the
 * viewer may be told about, most recent first (the caller decides which; see `sharedGround`).
 * The words come from the peer's side, which the viewer can already see.
 */
export function inCommon(me, peer, events = []) {
  if (!me || !peer) return [];
  const out = [];
  const tags = overlap(me.tags, peer.tags).slice(0, 2);
  if (tags.length) out.push({ kind: "tags", text: `Both into ${list(tags)}` });
  const inst = sameInstitution(me.institution, peer.institution);
  if (inst && me.course && peer.course && normCourse(me.course) === normCourse(peer.course)) {
    out.push({ kind: "course", text: "Same course" });
  }
  if (me.company && peer.company && normCompany(me.company) === normCompany(peer.company) && normCompany(peer.company)) {
    out.push({ kind: "company", text: `Both at ${peer.company}` });
  }
  if (events.length) out.push({ kind: "event", text: `Both at ${events[0]}` });
  if (inst) {
    out.push({ kind: "institution", text: `${me.career || peer.career ? "Both studied at" : "Both at"} ${peer.institution.name}` });
  }
  return out.slice(0, MAX_FACTS);
}

/* ------------------------------ with the database ------------------------- */

// The card this person shared with the other: the card the connection was made through if it is
// theirs, otherwise their default card. Read only (the Worker's own helper may create one).
export async function sharedCard(db, userId, cn) {
  if (cn) return (await shareOf(db, cn, userId)).card; // the card this person picked for this connection (worker/shares.js)
  return one(db, "SELECT * FROM cards WHERE user_id = ? ORDER BY is_default DESC, created_at LIMIT 1", userId);
}

/**
 * Shared ground for `viewerId` looking at `peerId`.
 *   cn:       the connection between them (a row of `connections`), or null if not connected.
 *   peerCard: the card the viewer is looking at (null: the card the peer shared, or their default).
 *   clock:    ms, for "past events" (defaults to now).
 * Returns [{ kind, text }] and nothing else, so nothing about the peer leaks except the words.
 *
 * Event facts are only for events the viewer is already allowed to know the peer was at: the
 * event this connection was made at, or one whose attendee directory the peer joined. A
 * connection alone does not reveal every event the peer has checked in to. Only past events.
 */
export async function sharedGround(db, { viewerId, peerId, cn = null, peerCard = null, clock = Date.now() }) {
  if (!viewerId || !peerId || viewerId === peerId) return [];
  if (await isBlocked(db, viewerId, peerId)) return [];
  const [mine, theirs] = await Promise.all([
    one(db, "SELECT * FROM profiles WHERE user_id = ?", viewerId),
    one(db, "SELECT * FROM profiles WHERE user_id = ?", peerId),
  ]);
  if (!mine || !theirs) return [];
  const [myCard, theirCard] = await Promise.all([sharedCard(db, viewerId, cn), peerCard || sharedCard(db, peerId, cn)]);

  const rows = await all(
    db,
    `SELECT e.id, e.name, e.starts_at, e.ends_at, e.ended_at, e.directory_on, v.created_at AS checked_in_at,
            EXISTS (SELECT 1 FROM consents cs WHERE cs.user_id = o.user_id
                    AND cs.scope = 'event_directory:' || o.event_id AND cs.granted = 1) AS peer_in_directory
     FROM checkins v
     JOIN checkins o ON o.event_id = v.event_id AND o.user_id = ?
     JOIN events e ON e.id = v.event_id
     WHERE v.user_id = ?
     ORDER BY COALESCE(e.starts_at, v.created_at) DESC`,
    peerId, viewerId
  );
  const events = rows
    .filter((e) => (cn && cn.event_id === e.id) || (e.directory_on && e.peer_in_directory))
    .filter((e) => eventStatus({ startsAt: e.starts_at, endsAt: e.ends_at, endedAt: e.ended_at }, e.checked_in_at, clock) === "ended")
    .map((e) => e.name)
    .filter(Boolean);

  return inCommon(visibleSide(mine, myCard), visibleSide(theirs, theirCard), events);
}
