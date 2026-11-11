// F24: "Do I know someone who...". The plain-words part that needs no AI, shared by the Worker (to cut a long list of
// people down before anything is sent to a model) and by the page (the ranking it shows when AI is off, used up or
// failed). F25 can reuse it. It imports only the word-splitting of src/lib/search.js, which has no imports itself.
//
//   askTerms(query)           the words that matter in a sentence like "someone who works in climate policy"
//   hitCount(terms, tokens)   how many of those words start a word in a list of words
//   rankRows(rows, query)     People rows ranked by how many of the words they match, with where the first one matched
import { buildIndex, terms } from "./search.js";

// Words that say "a person" or join a sentence together. They would match half the world and tell us nothing.
const STOP = new Set(("a an and are as at be been by can do does for from has have help helps i in into is it knows know me my of on or "
  + "someone somebody anyone who whom whose that this the to with works work working worked about around into looking looks need needs want wants "
  + "person people anybody something good great really very").split(" "));

// "policies" and "policy", "working" and "work": compare on a short stem.
const stem = (w) => (w.length > 5 ? w.replace(/(?:ing|ies|ed|es|s)$/, "") : w.length > 4 ? w.replace(/s$/, "") : w);

/** The distinct words of a question that are worth matching on, folded the way People search folds them. */
export const askTerms = (query) => terms(query).filter((w) => w.length >= 2 && !STOP.has(w)).map(stem);

/** How many of `ts` (from askTerms) start a word in `tokens` (already folded words). */
export const hitCount = (ts, tokens) => ts.reduce((n, t) => n + (tokens.some((w) => stem(w).startsWith(t) || w.startsWith(t)) ? 1 : 0), 0);

/** At least half the words, and never fewer than one. */
export const needed = (ts) => Math.max(1, Math.ceil(ts.length / 2));

// Where a match is worth saying out loud: not the name or the line under it, which the row already shows.
const SHOWN = new Set(["Name", "Company", "Role", "Course", "University", "Studied at"]);

/**
 * The best `max` rows for a question, each with the label of the first field (other than the ones the row already
 * shows) that matched. [] when no row matches enough of the words. Order: more words first, then the most recent.
 */
export function rankRows(rows, query, max = 5) {
  const ts = askTerms(query);
  if (!ts.length) return [];
  const min = needed(ts);
  const out = [];
  for (const e of buildIndex(rows).entries) {
    const n = hitCount(ts, e.fields.flatMap((f) => f.toks));
    if (n < min) continue;
    const f = e.fields.find((x) => !SHOWN.has(x.label) && hitCount(ts, x.toks) > 0);
    out.push({ row: e.row, score: n, label: f ? f.label : "" });
  }
  return out.sort((a, b) => b.score - a.score || (b.row.metAt || 0) - (a.row.metAt || 0)).slice(0, max);
}
