// F23: taking people out of written feedback before a model reads it, and checking the model's own words for people.
// Feedback is anonymous, but attendees sometimes name someone ("Priya was rude", "thanks to Dr Hollis") or leave a
// number to be called on. None of that may reach the model, and nothing the model writes may name a person.
//
//   redactAnswer(text, { names, keep })  contact details become [contact], names become [name]
//   nameMatcher(names)                   a function that says whether a text holds one of those names
//   NAME_TOKEN, CONTACT_TOKEN            the markers (a quote or a sentence holding one is never shown)
//
// `names` are the real names of the people at the event (attendees and the organisers), read from the database by
// the caller and never sent anywhere: they are only used here to find and remove those words. `keep` is words that
// are not names for this event (its title, its venue), so "Spring Networking Night" is not taken for a person.
// What the patterns cannot know (a nickname, a name in lower case that is nobody's here) is left to the prompt and
// to the output checks; the host reads the summary before using it and the answers are not shown beside it.
import { PHONE_RE } from "./sanitize.js";

export const NAME_TOKEN = "[name]";
export const CONTACT_TOKEN = "[contact]";

// Capitalised words that are not a person's name when they appear next to each other ("Student Union", "Great Hall",
// "Thanks Everyone"). Lower case here. Deliberately plain; the list errs towards removing a name too many.
const COMMON = new Set(`a an and are as at be but by can did do for from had has have he her his how i if in is it its me my
no not of on or our she so that the their them then there these they this to up us was we were what when where which who why will with you your
monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december
thanks thank please hello hi hey dear cheers well great good lovely nice really very more less some many much most all any
event events night day evening morning afternoon week weekend session sessions talk talks speaker speakers panel workshop workshops
networking social meetup meet mixer fair careers career student students union society societies club team staff host hosts organiser organisers
hall room rooms bar cafe venue building campus floor stage table tables main front back new old big small first last next
food drinks drink pizza coffee tea snacks lunch dinner breakfast music sound mic microphone wifi queue queues registration check checkin
lanyard linkedin whatsapp instagram twitter google zoom teams uk english british london`.split(/\s+/));

// A name that is also an everyday word. It is not removed by name, in case the word is just a word.
const AMBIGUOUS = new Set(`will mark grace hope joy rose may april june august art pat bill sue sun summer autumn winter spring
ruby pearl amber faith chase dawn eve gem iris ivy jade lily mercy page rob sage sky stone`.split(/\s+/));

const WORD = String.raw`\p{Lu}\p{Ll}+(?:['’-]\p{L}+)*`;
const RUN_RE = new RegExp(String.raw`(?<![\p{L}\p{N}])${WORD}(?:\s+${WORD})+(?![\p{L}\p{N}])`, "gu");
const HONORIFIC_RE = new RegExp(String.raw`(?<![\p{L}\p{N}])(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Professor|Sir|Dame|Lord|Lady)\.?\s+${WORD}(?:\s+${WORD})?`, "gu");
const THANKS_RE = new RegExp(String.raw`(?<![\p{L}\p{N}])((?:[Tt]hanks|[Tt]hank you|[Ss]hout[- ]?out|[Ww]ell done|[Kk]udos|[Cc]redit|[Cc]heers|[Hh]at tip)(?:\s+(?:to|goes to|go to|for|from))?\s+)(${WORD})`, "gu");
const HANDLE_RE = /(?<![\w@])@[A-Za-z0-9_.]{2,30}/g;

const isCommon = (w) => COMMON.has(w.toLowerCase().replace(/['’-].*$/, ""));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Name words (3 letters or more, not an everyday word) from a list of full names, in lower case, once each. */
export function nameWords(names) {
  const out = new Set();
  for (const full of Array.isArray(names) ? names : []) {
    for (const part of String(full || "").normalize("NFKC").split(/[\s,]+/)) {
      const w = part.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "").toLowerCase();
      if (w.length >= 3 && !AMBIGUOUS.has(w) && !COMMON.has(w)) out.add(w);
    }
  }
  return [...out].sort((a, b) => b.length - a.length).slice(0, 4000);
}

/** One regular expression for every name word, whole words only, any case; null when there are none. */
function namesRegex(names) {
  const words = nameWords(names);
  if (!words.length) return null;
  // Whole names first ("Will Smith", even where one part is an everyday word), then single name words.
  const phrases = [...new Set((Array.isArray(names) ? names : []).map((n) => String(n || "").normalize("NFKC").trim().split(/\s+/).map((p) => p.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "")).filter(Boolean))
    .filter((p) => p.length >= 2 && p.every((x) => x.length >= 2)).map((p) => p.map(escapeRe).join(String.raw`\s+`)))]
    .sort((a, b) => b.length - a.length).slice(0, 2000);
  return new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${[...phrases, ...words.map(escapeRe)].join("|")})(?![\p{L}\p{N}])`, "giu");
}

/** A function: does this text contain one of those names (as a whole word, in any case)? */
export function nameMatcher(names) {
  const re = namesRegex(names);
  return (text) => {
    if (!re) return false;
    re.lastIndex = 0;
    return re.test(String(text));
  };
}

/** Two or more capitalised words in a row that look like a person's name, outside `keep`. */
function redactRuns(text, keepLower) {
  return text.replace(RUN_RE, (run) => {
    const words = run.split(/\s+/);
    let start = 0;
    while (start < words.length && isCommon(words[start])) start += 1; // "Thanks Priya Natarajan": keep "Thanks"
    const rest = words.slice(start);
    if (rest.length < 2 || rest.some((w) => isCommon(w) || keepLower.has(w.toLowerCase()))) return run;
    return [...words.slice(0, start), NAME_TOKEN].join(" ");
  });
}

/**
 * The text with contact details and names taken out. Run it on text that has already been through cleanText
 * (no links or email addresses, no hidden characters). Idempotent: running it twice changes nothing more.
 */
export function redactAnswer(text, { names = [], keep = [] } = {}) {
  const keepLower = new Set(keep.flatMap((k) => String(k).toLowerCase().split(/[^\p{L}\p{N}]+/u)).filter((w) => w.length >= 3));
  let s = String(text);
  s = s.replace(PHONE_RE, (m) => (m.replace(/\D/g, "").length >= 9 ? CONTACT_TOKEN : m));
  s = s.replace(HANDLE_RE, CONTACT_TOKEN);
  s = s.replace(HONORIFIC_RE, NAME_TOKEN);
  const re = namesRegex(names);
  if (re) s = s.replace(re, (m) => (keepLower.has(m.toLowerCase()) ? m : NAME_TOKEN));
  s = redactRuns(s, keepLower);
  s = s.replace(THANKS_RE, (m, lead, w) => (isCommon(w) || keepLower.has(w.toLowerCase()) ? m : lead + NAME_TOKEN));
  return s.replace(/(?:\[name\]\s*){2,}/g, `${NAME_TOKEN} `).replace(/\s+/g, " ").trim();
}

export const hasToken = (text) => text.includes(NAME_TOKEN) || text.includes(CONTACT_TOKEN);
