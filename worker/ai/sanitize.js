// Cleaning text before it goes into a prompt (AI Safety and Cost Plan, section 5, rule 3). Everything
// written by another person (bios, tags, notes, feedback answers, event text) is untrusted, so it is
// cleaned here by the feature that builds the input, and cleaned again, idempotently, by callModel.
//
//   cleanText(value, max)  strips control and zero-width characters, collapses whitespace, removes
//                          URLs and email addresses, turns < and > into spaces (so nothing can look
//                          like <data>, </data> or <system>) and caps the length.
//   deepClean(value)       the same for every string in an object or array, with a length cap.
//
// This module has no imports, so it can be tested on its own.

// Characters that are invisible or reorder text: soft hyphen, combining grapheme joiner, Arabic letter
// mark, Hangul fillers, Mongolian selectors, zero-width and bidi marks and isolates, invisible operators,
// variation selectors, the BOM, interlinear annotation, and the tag characters (U+E0000 block) used to
// hide instructions in plain sight.
const INVISIBLE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF9-\uFFFB]|[\u{1D173}-\u{1D17A}]|[\u{E0000}-\u{E0FFF}]/gu;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

const TLDS = "com|net|org|io|co|uk|ac|edu|gov|me|app|dev|ai|fyi|ly|to|xyz|info|biz|eu|us|ca|de|fr|in|cn|tv|gg|sh|cc|link|site|online|page|tech|store|shop|cloud";
/** Web addresses: with a scheme, starting www., or a bare domain such as github.com/name. */
export const URL_RE = new RegExp(
  String.raw`(?:\b(?:https?|ftp|file|mailto|tel|javascript|vbscript):\/*[^\s<>"']*|\bdata:[^\s<>"']+|\bwww\.[^\s<>"']+|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:${TLDS})\b(?:[/?#][^\s<>"']*)?)`, "gi");
export const EMAIL_RE = /[^\s@<>()[\]"',;:]+@[^\s@<>()[\]"',;:]+\.[^\s@<>()[\]"',;:]+/g;
/** A run of digits with the usual separators, at least 9 digits long. */
export const PHONE_RE = /(?<![\w.])\+?\(?\d[\d\s().-]{7,}\d(?![\w])/g;

/** Field lengths from the plan, for features to share. */
export const CAPS = { note: 600, extra: 300, bio: 280, headline: 140, tag: 40, name: 80, line: 140, query: 200, answer: 600 };

const capChars = (s, max) => {
  if (s.length <= max) return s;
  const chars = Array.from(s);
  return chars.length <= max ? s : chars.slice(0, max).join("").trimEnd();
};

/** The invisible, control and unpaired-surrogate characters removed; nothing else changed. */
export const stripInvisible = (s) => String(s).replace(INVISIBLE, "").replace(CONTROL, " ").replace(LONE_SURROGATE, "");

/**
 * Text from another person (or from the asker) made safe to put in a prompt.
 * Pass { urls: false } for the asker's own words when links in them are theirs to keep.
 */
export function cleanText(value, max = 300, { urls = true } = {}) {
  if (value === null || value === undefined) return "";
  // Cap first so the patterns below never run over megabytes.
  let s = String(value).slice(0, Math.max(max * 3, 600));
  s = stripInvisible(s.normalize("NFKC")); // NFKC turns full-width and look-alike letters into plain ones
  if (urls) s = s.replace(EMAIL_RE, " ").replace(URL_RE, " ");
  s = s.replace(/[<>]/g, " ").replace(/\s+/g, " ").trim();
  return capChars(s, max);
}

/** The same cleaning for every string in a value. Keys must be plain words or they are dropped. */
export function deepClean(value, { maxString = 2000, urls = true, depth = 0 } = {}) {
  if (typeof value === "string") return cleanText(value, maxString, { urls });
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value === null) return value;
  if (depth > 6) return null;
  if (Array.isArray(value)) return value.slice(0, 500).map((v) => deepClean(v, { maxString, urls, depth: depth + 1 }));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(k) || k === "__proto__" || k === "constructor" || k === "prototype") continue;
      if (v === undefined || typeof v === "function" || typeof v === "symbol" || typeof v === "bigint") continue;
      out[k] = deepClean(v, { maxString, urls, depth: depth + 1 });
    }
    return out;
  }
  return null;
}

/**
 * JSON for the <data> block. < > & and the two line separators are written as \uXXXX, so the data
 * can never contain the text </data>, whatever a person typed.
 */
export const safeJson = (value) => JSON.stringify(value)
  .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
  .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/**
 * Only the fields a feature has decided the asker may see, each cleaned and capped. `spec` maps a field name
 * to a character cap (text) or to [cap, maxItems] (a list of short texts, such as tags). Anything else on the
 * source object (an email, a private note, a link, a field hidden on the card) is left behind, so a
 * record can never carry more than the spec names.
 *   pickFields(profile, { headline: 140, about: 280, tags: [40, 8] })
 */
export function pickFields(source, spec) {
  const out = {};
  if (!source || typeof source !== "object") return out;
  for (const [key, rule] of Object.entries(spec)) {
    const v = Object.prototype.hasOwnProperty.call(source, key) ? source[key] : undefined;
    if (Array.isArray(rule)) {
      const [cap, max] = rule;
      const list = (Array.isArray(v) ? v : []).map((x) => cleanText(x, cap)).filter(Boolean).slice(0, max);
      if (list.length) out[key] = list;
    } else {
      const t = cleanText(v, rule);
      if (t) out[key] = t;
    }
  }
  return out;
}
