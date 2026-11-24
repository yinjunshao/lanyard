// F60: Who to meet without AI. Nothing stored: each request scores the people suggestCandidates() returns against
// what the viewer hopes to get from the event and what each side shows (D054). It is the order shown whenever the AI
// is off, used up, failing or not allowed, and the filler after the AI's picks.
//
//   +3 for each word of the viewer's intention found in what the other person shows (visibleFields) or in their
//      own intention ("You both mention investing")
//   +2 for each word of the other person's intention found in what the viewer's own card shows
//   +1 for each shared-ground fact from F16 (same tags, course, company, institution)
//   ties: the one who checked in more recently comes first
// The top five that score, each with one reason. With nothing in common with anyone, three people in a steady
// order (by an opaque hash, so the list does not jump on every refresh) as "Say hi to someone new".
//
// F16's rule holds: a word or fact may only come from what that person has chosen to show (visibleFields: the mode's
// fields, the default card's tags and headline), plus the intention they wrote for this event. A hidden field never
// makes a hit, so it never shows in a reason.
//
// F69 (D057): both sides, both intentions and the shared-ground facts go through the sensitive-words screen first
// (suggestScreen.js), so a tag such as a faith, health, LGBTQ+, political, union or heritage society never scores and
// never becomes a reason. The entry shown is not screened: it still shows what the card shows.
import { inCommon } from "./inCommon.js";
import { screenFields, screenLine, safeReason } from "./suggestScreen.js";
import { words, visibleFields, NEW_COUNT, NEW_REASON, TOP, WORD_SCORE, FACT_SCORE } from "./presenceMatch.js";

export const BACK_SCORE = 2;
// Words an intention uses that say nothing about a person ("I'm hoping to learn more").
const SOFT = new Set("hoping hope hopefully learn learning more new other event events here talk talking chat chatting get getting help some".split(" "));

/** The distinct useful words of what someone hopes for (token -> the word as typed). */
export function intentionWords(...texts) {
  const out = new Map();
  for (const t of texts) for (const [tok, shown] of words(t)) if (!SOFT.has(tok) && !out.has(tok)) out.set(tok, shown);
  return out;
}

// The fields of one side that can be matched, each with how a reason would say it.
function shownFields(f) {
  return [
    ...f.tags.map((t) => ({ w: words(t), order: 0, say: () => `Into ${t}` })),
    { w: words(f.course), order: 1, say: () => `Studying ${f.course}` },
    { w: words(f.role), order: 2, say: () => `Works as ${f.role}` },
    { w: words(f.company), order: 3, say: () => `Works at ${f.company}` },
    { w: words(f.headline), order: 5, say: (shown) => `Mentions ${shown}` },
    { w: words(f.institution), order: 6, say: () => `At ${f.institution}` },
  ];
}

/**
 * Score and order candidates for one viewer. Pure: no database.
 *   me: the viewer's own row in the shape visibleFields() reads (profile and default card); intention: theirs;
 *   rows: suggestCandidates() rows (with `intention` and `id`).
 * Returns { mode: "matched" | "new", ranked: [{ row, score, reason }] }.
 */
export function rankSuggest({ me, intention, rows }) {
  const mine = screenFields(visibleFields(me));
  const myFields = shownFields(mine);
  const wanted = intentionWords(screenLine(intention));
  const scored = rows.map((row) => {
    const f = screenFields(visibleFields(row));
    const theirWords = intentionWords(screenLine(row.intention));
    const theirFields = shownFields(f);
    const hits = [];
    for (const [tok, shown] of wanted) {
      const field = theirFields.filter((x) => x.w.has(tok)).sort((a, b) => a.order - b.order)[0];
      if (field) hits.push({ order: field.order, text: field.say(shown) });
      else if (theirWords.has(tok)) hits.push({ order: 4, text: `You both mention ${shown}` });
    }
    const back = [];
    for (const [tok, shown] of theirWords) {
      if (wanted.has(tok)) continue; // already counted as "You both mention"
      if (myFields.some((x) => x.w.has(tok))) back.push({ text: `Looking for ${shown}, which is on your card` });
    }
    const facts = inCommon(mine.side, f.side);
    const score = hits.length * WORD_SCORE + back.length * BACK_SCORE + facts.length * FACT_SCORE;
    const reason = safeReason(hits.sort((a, b) => a.order - b.order)[0]?.text || back[0]?.text || facts[0]?.text || "");
    return { row, score, reason };
  });
  const top = scored.filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.row.checked_in_at - a.row.checked_in_at)
    .slice(0, TOP);
  if (top.length) return { mode: "matched", ranked: top };
  const steady = [...rows].sort((a, b) => hashOf(a.id) - hashOf(b.id)).slice(0, NEW_COUNT);
  return { mode: "new", ranked: steady.map((row) => ({ row, score: 0, reason: NEW_REASON })) };
}

// A small steady hash of an opaque id (FNV-1a), only to order people with nothing in common.
function hashOf(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

/** The viewer's own side in the shape visibleFields() reads: their profile and the card a scan would give. */
export const meRow = (profile, card) => ({
  ...(profile || {}), card_tags: card?.tags ?? null, card_headline: card?.headline || "", intro: "",
});
