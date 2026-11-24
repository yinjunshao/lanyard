// F69: the sensitive-words screen for Who to meet (D057). Applied to what is MATCHED and what is SENT TO THE AI, never
// to what is SHOWN: an entry (suggestApp.js and presenceApp.js entryOf) still reads visibleFields() as it was, so a
// person's tags, headline and intention show exactly as their card shows them.
//
// The list and the matching rule are in src/lib/sensitiveTerms.js. Here:
//   - a tag that contains a listed term is dropped (from scoring, shared ground and the AI);
//   - a course, role, company or institution that contains one is left out the same way;
//   - a headline is cut into phrases (at , ; | / · • and spaced dashes) and each phrase with a term is dropped;
//   - an intention (and F17's line and wish) loses the listed words; when what is left is mostly those words, or has
//     nothing useful left, the whole intention is dropped, for scoring and for the AI;
//   - a reason with a listed term is never shown (safeReason).
// Only Who to meet uses this. The person page's shared ground (F16, people who already connected) is not screened.
import { isSensitive, stripSensitive } from "../src/lib/sensitiveTerms.js";

// Words that carry no meaning on their own, for the "mostly" rule only (the scoring has its own stop words). The group
// words are here too, so "islamic society" or "bame network" is dropped whole rather than leaving "society" to match on.
const FILLER = new Set(("a an the and or of to in on at for with who from about into by as is are be me my our your their " +
  "meet meeting other others people person someone some want looking find hoping hope like more here this that event " +
  "society societies soc network networks association community group groups club clubs student students member members").split(" "));
const usefulWords = (text) => (String(text || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length >= 2 && !FILLER.has(w)).length;

/**
 * An intention (or any line a person wrote) for matching and the AI: the listed words taken out, or "" when what is
 * left is mostly them. "meet other Muslim founders" becomes "meet other founders"; "Christian Union socials" is "".
 */
export function screenLine(text) {
  const s = String(text ?? "");
  const { text: rest, words } = stripSensitive(s);
  if (!words) return s;
  const left = usefulWords(rest);
  return !left || words > left ? "" : rest;
}

const PHRASE_CUT = /\s*(?:[,;|/·•]|\s[-–—]\s|[–—])\s*/u;

/** A headline for matching and the AI: every phrase that contains a listed term dropped, the rest kept as written. */
export function screenHeadline(text) {
  const s = String(text ?? "").trim();
  if (!isSensitive(s)) return s;
  return s.split(PHRASE_CUT).filter((p) => p && !isSensitive(p)).join(", ");
}

const keep = (v) => (isSensitive(v) ? "" : v);
export const screenTags = (tags) => (Array.isArray(tags) ? tags.filter((t) => !isSensitive(t)) : []);

/** A visibleSide() for shared ground in Who to meet: no listed tag, course, company or institution makes a fact. */
export function screenSide(side) {
  if (!side) return side;
  return {
    ...side,
    tags: screenTags(side.tags),
    course: keep(side.course || ""),
    company: keep(side.company || ""),
    institution: side.institution && isSensitive(side.institution.name) ? null : side.institution,
  };
}

/** visibleFields() output for matching and the AI. Its `side` is screened too, so shared ground follows the same rule. */
export function screenFields(f) {
  const side = screenSide(f.side);
  return {
    ...f,
    side,
    tags: screenTags(f.tags),
    course: keep(f.course || ""),
    company: keep(f.company || ""),
    role: keep(f.role || ""),
    headline: screenHeadline(f.headline),
    institution: keep(f.institution || ""),
    intro: screenLine(f.intro),
  };
}

/** A reason that may be shown: the given one, or `instead` when it names a listed term (and "" if that does too). */
export const safeReason = (reason, instead = "") => (!isSensitive(reason) ? reason : !isSensitive(instead) ? instead : "");
