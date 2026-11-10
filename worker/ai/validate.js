// Checking what the model sent back (AI Safety and Cost Plan, section 5, rule 4). The model's reply is
// untrusted text: nothing in it is believed until this file has parsed it, rebuilt it from the schema
// and cut it down. A reply that does not fit is rejected whole, and the feature falls back to its non-AI
// result. The output is always plain text for a person to read (Vue {{ }}, never v-html).
//
//   parseModelJson(text)             strict JSON (one wrapping code fence is tolerated), or not ok
//   validate(schema, value, opts)    schema-lite check that rebuilds the value from the schema
//   filterIds(list, allowed, opts)   keeps only ids the Worker sent, once each
//   exactQuotes(quotes, answers)     keeps a quote only if it is an exact substring of a real answer
//   stripContacts(text, allowed)     removes URLs, emails and phone numbers that were not in the input
//
// Schema nodes (build them with S): { type: "string", max, min, multiline, oneOf }, { type: "number",
// min, max, int }, { type: "boolean" }, { type: "array", items, max, min }, { type: "object", props,
// required }, { type: "enum", values }.
import { URL_RE, EMAIL_RE, PHONE_RE, stripInvisible } from "./sanitize.js";

const MAX_REPLY_CHARS = 60_000;

export function parseModelJson(text) {
  if (typeof text !== "string") return { ok: false, error: "no text" };
  let s = text.trim();
  if (s.length === 0 || s.length > MAX_REPLY_CHARS) return { ok: false, error: "empty or too long" };
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/i.exec(s);
  if (fenced) s = fenced[1].trim();
  if (s[0] !== "{" && s[0] !== "[") return { ok: false, error: "not JSON" };
  try { return { ok: true, value: JSON.parse(s) }; } catch { return { ok: false, error: "not JSON" }; }
}

export const S = {
  str: (o = {}) => ({ type: "string", max: 400, ...o }),
  num: (o = {}) => ({ type: "number", ...o }),
  int: (o = {}) => ({ type: "number", int: true, ...o }),
  bool: () => ({ type: "boolean" }),
  arr: (items, o = {}) => ({ type: "array", items, max: 20, ...o }),
  obj: (props, required = Object.keys(props)) => ({ type: "object", props, required }),
  oneOf: (...values) => ({ type: "enum", values }),
};

/**
 * A contact detail the model made up must not reach a person. `allowed` is the text that was sent to the
 * model (a list of strings): a URL, email or phone number is kept only if exactly the same one is in it.
 */
export function stripContacts(text, allowed = []) {
  const norm = (m) => m.trim().toLowerCase().replace(/[.,;:)]+$/, "");
  const digitsOf = (x) => x.replace(/\D/g, "");
  const found = (re, fn) => new Set(allowed.flatMap((a) => [...String(a).matchAll(re)].map((m) => fn(m[0]))));
  const emails = found(EMAIL_RE, norm);
  const urls = found(URL_RE, norm);
  const phones = found(PHONE_RE, digitsOf);
  // Emails first, so the domain part is not read as a web address; phone numbers last. A short run of digits (a
  // date, a year range) is not a phone number and is left alone.
  return String(text)
    .replace(EMAIL_RE, (m) => (emails.has(norm(m)) ? m : " "))
    .replace(URL_RE, (m) => (urls.has(norm(m)) ? m : " "))
    .replace(PHONE_RE, (m) => (digitsOf(m).length < 9 || phones.has(digitsOf(m)) ? m : " "));
}

// Plain text out of a string the model wrote: no tags, no markdown links, no invisible characters, no
// contact details that were not in the input, whitespace tidied, then cut to length.
export function cleanOutput(text, { max = 400, multiline = false, allowFrom = [] } = {}) {
  let s = stripInvisible(String(text).normalize("NFC"));
  s = s.replace(/\[([^\]]{0,200})\]\((?:[^)]{0,500})\)/g, "$1"); // [text](link) -> text
  s = s.replace(/<[^>]*>/g, " ").replace(/[<>]/g, " ");
  s = stripContacts(s, allowFrom);
  if (multiline) {
    s = s.replace(/[ \t ]+/g, " ").replace(/ ?\r?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  } else {
    s = s.replace(/\s+/g, " ").trim();
  }
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max).join("").trimEnd() : s;
}

const BAD = (path, why) => ({ ok: false, error: `${path || "reply"}: ${why}` });

function check(node, v, path, opts) {
  switch (node.type) {
    case "string": {
      if (typeof v !== "string") return BAD(path, "expected text");
      const out = cleanOutput(v, { max: node.max ?? 400, multiline: !!node.multiline, allowFrom: opts.allowFrom || [] });
      if (node.min && out.length < node.min) return BAD(path, "too short");
      if (node.oneOf && !node.oneOf.includes(out)) return BAD(path, "not an allowed value");
      return { ok: true, value: out };
    }
    case "number": {
      if (typeof v !== "number" || !Number.isFinite(v)) return BAD(path, "expected a number");
      if (node.int && !Number.isInteger(v)) return BAD(path, "expected a whole number");
      if ((node.min !== undefined && v < node.min) || (node.max !== undefined && v > node.max)) return BAD(path, "out of range");
      return { ok: true, value: v };
    }
    case "boolean": return typeof v === "boolean" ? { ok: true, value: v } : BAD(path, "expected true or false");
    case "enum": return node.values.includes(v) ? { ok: true, value: v } : BAD(path, "not an allowed value");
    case "array": {
      if (!Array.isArray(v)) return BAD(path, "expected a list");
      const out = [];
      for (let i = 0; i < Math.min(v.length, node.max ?? 20); i++) {
        const r = check(node.items, v[i], `${path}[${i}]`, opts);
        if (!r.ok) return r;
        out.push(r.value);
      }
      if (node.min && out.length < node.min) return BAD(path, "too few");
      return { ok: true, value: out };
    }
    case "object": {
      if (!v || typeof v !== "object" || Array.isArray(v)) return BAD(path, "expected an object");
      const out = {}; // rebuilt from the schema: keys the schema does not name are dropped
      for (const [k, sub] of Object.entries(node.props)) {
        if (!Object.prototype.hasOwnProperty.call(v, k) || v[k] === undefined || v[k] === null) {
          if ((node.required || []).includes(k)) return BAD(`${path}.${k}`, "missing");
          continue;
        }
        const r = check(sub, v[k], `${path}.${k}`, opts);
        if (!r.ok) return r;
        out[k] = r.value;
      }
      return { ok: true, value: out };
    }
    default: return BAD(path, "unknown schema");
  }
}

/** { ok: true, value } with the value rebuilt from the schema, or { ok: false, error }. */
export function validate(schema, value, opts = {}) {
  try { return check(schema, value, "", opts); } catch { return BAD("", "could not be checked"); }
}

/**
 * The ids in `list` (ids, or objects with the id under `key`) that are in `allowed` (a Set or array),
 * each once, in order, at most `max`. Anything the model invented or repeated is dropped.
 */
export function filterIds(list, allowed, { key = "id", max = 20 } = {}) {
  const ok = allowed instanceof Set ? allowed : new Set(allowed);
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const id = item && typeof item === "object" ? item[key] : item;
    if (typeof id !== "string" || !ok.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Quotes for a summary: kept only when the quote is, character for character, part of a real answer
 * (after trimming the quote). A paraphrase, a splice of two answers or an invented line is dropped.
 */
export function exactQuotes(quotes, answers, { min = 4, max = 4 } = {}) {
  const texts = (Array.isArray(answers) ? answers : []).filter((a) => typeof a === "string");
  const seen = new Set();
  const out = [];
  for (const q of Array.isArray(quotes) ? quotes : []) {
    if (typeof q !== "string") continue;
    const t = q.trim();
    if (t.length < min || seen.has(t) || !texts.some((a) => a.includes(t))) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}
