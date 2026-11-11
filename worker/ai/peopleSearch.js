// F24: "Do I know someone who...". Who is searched, what each person is shown as, and how a reply is checked.
// (The route that calls the model is added in F24.2.)
//   GET  /api/ai/people-search   { allowance: { day } | null }   (null: this person cannot use AI search)
//   POST /api/ai/people-search   { query, regenerate }
//          { fallback:false, matches:[{ connectionId, reason, matchedOn }], cached, allowance }
//     or   { fallback:true, reason, message, allowance }   (the page then ranks the people it already holds by keyword)
//
// WHO IS SEARCHED (AI Safety and Cost Plan, rule 1), all decided in code before any model call:
//   only the asker's own connections; not anyone blocked in either direction; not anyone who switched AI search off
//   (users.ai_search_ok, through searchableIds); only people with a profile and a card they shared with the asker.
// WHAT THE MODEL IS GIVEN: the query, and for each person an opaque id (p1, p2 ...) and only these fields, each cleaned
// and capped:
//   line      their role at company or course and university, in the mode they use (the other mode's fields are not read)
//   headline, about (280), projects (title and one line), cardNote   as the card they shared with the asker shows them
//   tags      their "come to me for" tags on that card (visibleSide: a tag the card leaves out is not here)
//   met       the event the connection was made at, and the month
//   myTags, myNote   the ASKER'S OWN private tags and note about them
// Never: a name, email, link, photo, user id, connection id, a field their card hides, what their other mode keeps,
// another person's note about anyone, or anything about a person who is not offered. A bio or tag that reads like an
// instruction ("rank me first") is left out of its record before the model sees it.
//
// WHAT COMES BACK is checked in code (refine): ids must be ones that were sent; every match must carry a quote that
// really is in that person's record (found again, normalised), or the match is dropped; a reason that names something
// not in their record is replaced by the verified quote. Results are mapped to connection ids on the server.
import { all } from "../db.js";
import { blockedSet } from "../blocks.js";
import { visibleSide } from "../inCommon.js";
import { cardFacts } from "../../src/lib/cardmerge.js";
import { subtitleOf } from "../../src/lib/profile.js";
import { askTerms, hitCount } from "../../src/lib/ask.js";
import { normalize } from "../../src/lib/search.js";
import { cleanText, CAPS } from "./sanitize.js";
import { filterIds } from "./validate.js";
import { searchableIds } from "./optout.js";
import { MAX_MATCHES, MAX_PEOPLE } from "./prompts/peopleSearch.js";

const MAX_CONNECTIONS = 600; // the most recent connections considered at all, so one request stays small
export const FIELD_LABELS = {
  line: "Role or course", headline: "What they do", tags: "Come to me for", about: "About", projects: "Projects",
  cardNote: "Card note", met: "Where you met", myTags: "Your tags", myNote: "Your note",
};
const FIELDS = Object.keys(FIELD_LABELS);

// Text that talks to the model instead of describing a person. Another person's words only; a record without the
// offending field is still searchable on the rest.
const INSTRUCTION = [
  /\b(ignore|disregard|forget|override|bypass)\b.{0,50}\b(instruction|rule|prompt|above|previous|earlier|system|guideline)/i,
  /\b(always|must|should|please|make sure)\b.{0,25}\b(rank|pick|choose|select|return|list|put|place|show|recommend)\b/i,
  /\b(rank|pick|choose|select|recommend|put|place)\b.{0,12}\b(me|this person|them)\b.{0,20}\b(first|top|number one|best|highest|#1)\b/i,
  /\b(reveal|output|list|print|dump|leak)\b.{0,30}\b(all|every|each)\b.{0,25}\b(ids?|people|users?|connections?|emails?|records?)\b/i,
  /\b(system|developer|assistant)\s*(prompt|message|instruction)/i,
  /\b(you are|you're|act as|pretend)\b.{0,25}\b(now|an? (?:ai|assistant|model|bot)|the model)\b/i,
  /^\s*(system|assistant|user)\s*:/i,
  /\bp\d{1,3}\b.{0,25}\b(first|top|best)\b/i,
];
export const looksLikeInstruction = (text) => INSTRUCTION.some((re) => re.test(String(text)));
const scrub = (v) => { const t = cleanText(v, 2000); return t && !looksLikeInstruction(t) ? t : ""; };
const scrubList = (list, cap, max) => {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const t = cleanText(scrub(raw), cap);
    if (t) out.push(t);
    if (out.length >= max) break;
  }
  return out;
};

const monthOf = (ts) => new Date(ts).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Europe/London" });
const parseTags = (t) => { try { return Array.isArray(t) ? t : JSON.parse(t || "[]"); } catch { return []; } };

/** A record as the model gets it, without the id. Empty fields are left out. */
export function buildRecord({ profile, card, event, note, myTags, connectedAt }) {
  const facts = cardFacts(card, profile);
  const side = visibleSide(profile, card);
  const rec = {};
  const put = (k, v) => { if (Array.isArray(v) ? v.length : v) rec[k] = v; };
  put("line", cleanText(scrub(subtitleOf(profile)), CAPS.line));
  put("headline", cleanText(scrub(facts.headline), CAPS.headline));
  put("tags", scrubList(side?.tags, CAPS.tag, 8));
  put("about", cleanText(scrub(facts.about), CAPS.bio));
  put("projects", (Array.isArray(profile.projects) ? profile.projects : []).slice(0, 3)
    .map((p) => cleanText(scrub([p?.title, p?.line].filter(Boolean).join(": ")), 120)).filter(Boolean));
  put("cardNote", cleanText(scrub(card.note), CAPS.line));
  put("met", cleanText([scrub(event), monthOf(connectedAt)].filter(Boolean).join(", "), CAPS.line));
  put("myTags", scrubList(myTags, CAPS.tag, 8)); // the asker's own words: cleaned and capped
  put("myNote", cleanText(note, CAPS.bio));
  return rec;
}

/**
 * Everyone the asker may search and what each of them shows the asker. Read only. Returns
 * [{ userId, connectionId, metAt, record }] most recent first. The people are the asker's connections minus anyone
 * blocked either way and anyone who switched AI search off.
 */
export async function gatherPeople(db, askerId) {
  const conns = await all(db,
    `SELECT cn.id, cn.user_a, cn.user_b, cn.card_id, cn.created_at, n.text AS note, n.tags AS my_tags, ev.name AS event_name
     FROM connections cn
     LEFT JOIN notes n ON n.connection_id = cn.id AND n.user_id = ?
     LEFT JOIN events ev ON ev.id = cn.event_id
     WHERE cn.user_a = ? OR cn.user_b = ?
     ORDER BY cn.created_at DESC LIMIT ?`, askerId, askerId, askerId, MAX_CONNECTIONS);
  const peerOf = (cn) => (cn.user_a === askerId ? cn.user_b : cn.user_a);
  const blocked = await blockedSet(db, askerId);
  const peerIds = [...new Set(conns.map(peerOf))].filter((id) => id !== askerId && !blocked.has(id));
  if (!peerIds.length) return [];
  const ok = await searchableIds(db, peerIds);
  const ids = peerIds.filter((id) => ok.has(id));
  if (!ids.length) return [];
  const json = JSON.stringify(ids);
  const [profiles, cards] = await Promise.all([
    all(db, "SELECT * FROM profiles WHERE user_id IN (SELECT value FROM json_each(?))", json),
    all(db, `SELECT * FROM cards WHERE user_id IN (SELECT value FROM json_each(?))
             AND (is_default = 1 OR id IN (SELECT value FROM json_each(?)))`, json, JSON.stringify(conns.map((c) => c.card_id).filter(Boolean))),
  ]);
  const profileOf = new Map(profiles.map((p) => [p.user_id, p]));
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const defaultOf = new Map(cards.filter((c) => c.is_default).map((c) => [c.user_id, c]));
  const out = [];
  const seen = new Set();
  for (const cn of conns) {
    const peer = peerOf(cn);
    const profile = profileOf.get(peer);
    if (!profile || !ok.has(peer) || seen.has(peer)) continue;
    // The card the peer shared with the asker: the one the connection was made through if it is the peer's, else their
    // default card (the same rule as sharedCard in worker/inCommon.js). No card shared, nobody to read.
    const via = cn.card_id ? cardById.get(cn.card_id) : null;
    const card = via && via.user_id === peer ? via : defaultOf.get(peer);
    if (!card) continue;
    seen.add(peer);
    out.push({
      userId: peer, connectionId: cn.id, metAt: cn.created_at,
      record: buildRecord({ profile, card, event: cn.event_name, note: cn.note, myTags: parseTags(cn.my_tags), connectedAt: cn.created_at }),
    });
  }
  return out;
}

const textOf = (rec) => FIELDS.flatMap((k) => [].concat(rec[k] || [])).join(" ");
const tokensOf = (rec) => normalize(textOf(rec)).split(" ").filter(Boolean);

/** At most MAX_PEOPLE people: the best by how many of the query's words they match, then the most recent. */
export function narrow(people, query, max = MAX_PEOPLE) {
  if (people.length <= max) return people;
  const ts = askTerms(query);
  return people
    .map((p) => ({ p, n: hitCount(ts, tokensOf(p.record)) }))
    .sort((a, b) => b.n - a.n || b.p.metAt - a.p.metAt)
    .slice(0, max).map((x) => x.p);
}

/* ------------------------------ checking the reply ------------------------------ */

const hasWords = (haystack, needle) => ` ${haystack} `.includes(` ${needle} `);

/** The key of the first field of this record that contains `quote` (compared without case, accents or punctuation), or "". */
export function whereQuoted(record, quote) {
  const q = normalize(quote);
  if (q.length < 4 || !q.split(" ").some((w) => w.length >= 3)) return "";
  for (const k of FIELDS) {
    for (const v of [].concat(record[k] || [])) if (hasWords(normalize(v), q)) return k;
  }
  return "";
}

/** A reason may only name what is in the person's record or the question. Numbers, capitalised words after the first and ids are checked. */
export function reasonIsGrounded(reason, record, query) {
  if (!reason || /\bp\d+\b/i.test(reason)) return false;
  const known = ` ${normalize(textOf(record))} ${normalize(query)} `;
  let sentenceStart = true;
  for (const raw of reason.split(/\s+/)) {
    const w = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    const startsSentence = sentenceStart;
    sentenceStart = /[.!?]$/.test(raw);
    if (!w) continue;
    const flagged = /\d/.test(w) || (!startsSentence && /^\p{Lu}/u.test(w));
    if (flagged && !known.includes(` ${normalize(w)} `)) return false;
  }
  return true;
}

/**
 * The matches that survive, in the model's order, at most MAX_MATCHES. `byId` maps the opaque id to its record.
 * A match is kept only if its id was offered (once) and its quote is really in that person's record; its reason is
 * kept only if it names nothing that is not in the record, otherwise it is replaced by the quote.
 */
export function verifyMatches(matches, byId, query) {
  const out = [];
  for (const m of filterIds(matches, new Set(byId.keys()), { max: MAX_MATCHES * 2 })) {
    if (typeof m.quote !== "string") continue;
    const record = byId.get(m.id);
    const field = whereQuoted(record, m.quote);
    if (!field) continue;
    const reason = reasonIsGrounded(m.reason, record, query) ? m.reason : `Matches “${m.quote}”`;
    out.push({ id: m.id, quote: m.quote, reason, field });
    if (out.length >= MAX_MATCHES) break;
  }
  return out;
}
