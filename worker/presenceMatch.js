// F17: who to meet. No AI, nothing stored: each request scores the other people who have presence
// on at this event against what the viewer wrote in "I want to meet someone who...".
//
//   +3 for each distinct word of the wish that appears in what the other person shows
//   +1 for each shared-ground fact from F16 (same tags, course, company, institution)
//   ties: the one who checked in more recently comes first
//
// The top five with a score above nothing are shown, each with one reason. With nothing in common
// with anyone, three people at random are shown as "Say hi to someone new".
//
// The rule that matters is F16's: a word or fact may only come from what that person has chosen
// to show. So the fields read here are the same ones `visibleSide` keeps (a career profile's kept
// course and a student profile's kept company are never read; the tags are the ones on the card
// they would share, the default card), plus the line they wrote for this event, and the headline
// and role that card page shows. A hidden field never makes a hit, and so never shows in a reason.
// F25 (the AI ranking) must start from the same candidates and the same visible fields.
import { one } from "./db.js";
import { inCommon, normTag, visibleSide } from "./inCommon.js";
import { presenceCandidates } from "./presence.js";

export const NEW_REASON = "Say hi to someone new";
export const NEW_COUNT = 3;
export const TOP = 5;
export const WORD_SCORE = 3;
export const FACT_SCORE = 1;

// Words that say nothing about a person.
const STOP = new Set(("a an the and or of to in on at for with who whom that this those these is are was be been being has have had do does doing did " +
  "me my we our you your they them their it its i am as by from up out about into onto over some someone somebody anyone anybody people person " +
  "folk folks others other like likes love loves want wants wanted meet meeting looking look find keen interested interest interests " +
  "working work works worked also just any all not but get got can could will would should there than then very really").split(" "));

/** Distinct words of a text, folded the way tags are, stop words and one-letter words dropped. Original spelling is kept for the reason. */
export function words(text) {
  const out = new Map();
  for (const raw of String(text ?? "").split(/[^\p{L}\p{N}]+/u)) {
    const shown = raw.toLowerCase();
    const token = normTag(raw);
    if (token.length < 2 || STOP.has(token) || STOP.has(shown) || out.has(token)) continue;
    out.set(token, shown);
  }
  return out; // token -> the word as typed, lower case
}

const parse = (json) => { try { const v = typeof json === "string" ? JSON.parse(json) : json; return Array.isArray(v) ? v : []; } catch { return []; } };

// What a candidate row has chosen to show, in the order a reason prefers.
export function visibleFields(row) {
  const side = visibleSide(
    { mode: row.mode, uni: row.uni, institution_id: row.institution_id, course: row.course, company: row.company, tags: row.tags },
    { tags: parse(row.card_tags) }
  );
  const career = side.career;
  return {
    side,
    tags: side.tags,
    course: side.course,
    company: side.company,
    role: career ? String(row.role || "").trim() : "",
    headline: String(row.card_headline || row.headline || "").trim(), // the card's own line replaces the profile's
    institution: side.institution?.name || "",
    intro: String(row.intro || "").trim(),
  };
}

// The first field (in this order) a wish word is found in, as a reason.
function hitReasons(wish, f) {
  const have = (text) => words(text);
  const tagTokens = f.tags.map((t) => ({ t, w: have(t) }));
  const fields = [
    ...[...wish].map(([tok, shown]) => {
      const tag = tagTokens.find((x) => x.w.has(tok));
      if (tag) return { tok, order: 0, text: `Into ${tag.t}` };
      if (have(f.course).has(tok)) return { tok, order: 1, text: `Studying ${f.course}` };
      if (have(f.role).has(tok)) return { tok, order: 2, text: `Works as ${f.role}` };
      if (have(f.company).has(tok)) return { tok, order: 3, text: `Works at ${f.company}` };
      if (have(f.headline).has(tok) || have(f.intro).has(tok)) return { tok, order: 4, text: `Mentions ${shown}` };
      if (have(f.institution).has(tok)) return { tok, order: 5, text: `At ${f.institution}` };
      return null;
    }),
  ].filter(Boolean);
  return fields.sort((a, b) => a.order - b.order);
}

/**
 * Score and order candidates for one viewer. Pure: no database.
 *   me: visibleSide of the viewer; wish: the viewer's looking_for text; rows: presenceCandidates() rows.
 * Returns [{ row, score, reason }] best first, only those that score, and mode "matched";
 * or, when none does, "new" with up to NEW_COUNT of them at random.
 */
export function rank({ me, wish, rows, random = Math.random }) {
  const wanted = words(wish);
  const scored = rows.map((row) => {
    const f = visibleFields(row);
    const hits = wanted.size ? hitReasons(wanted, f) : [];
    const facts = inCommon(me, f.side); // no past events here: everyone is at this one
    const score = hits.length * WORD_SCORE + facts.length * FACT_SCORE;
    return { row, score, reason: hits[0]?.text || facts[0]?.text || "" };
  });
  const top = scored.filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.row.checked_in_at - a.row.checked_in_at)
    .slice(0, TOP);
  if (top.length) return { mode: "matched", ranked: top };
  const pool = [...rows];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return { mode: "new", ranked: pool.slice(0, NEW_COUNT).map((row) => ({ row, score: 0, reason: NEW_REASON })) };
}

export async function suggest(db, { eventId, viewerId, mine, clock = Date.now() }) {
  const [rows, profile, card] = await Promise.all([
    presenceCandidates(db, eventId, viewerId, clock),
    one(db, "SELECT * FROM profiles WHERE user_id = ?", viewerId),
    one(db, "SELECT * FROM cards WHERE user_id = ? ORDER BY is_default DESC, created_at LIMIT 1", viewerId),
  ]);
  const me = visibleSide(profile, card); // your side is your default card, what a scan would give
  const { mode, ranked } = rank({ me, wish: mine?.looking_for || "", rows });
  return { mode, people: ranked.map((r) => ({ ...r.row, reason: r.reason })) };
}
