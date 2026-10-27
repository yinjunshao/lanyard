// People search: every keyword must start a word somewhere in the person's
// profile; when nothing matches, the closest words from the profiles you can
// see are offered as a correction (search-engine style).

const fold = (ch) => {
  const c = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()[0] || " ";
  return /[\p{L}\p{N}+#]/u.test(c) ? c : " ";
};
// Same length as Array.from(s), so match positions map straight back onto the original text.
const foldChars = (s) => Array.from(String(s || "")).map(fold);
export const normalize = (s) => foldChars(s).join("").replace(/\s+/g, " ").trim();
const words = (s) => normalize(s).split(" ").filter(Boolean);

export function terms(query) {
  return [...new Set(words(query))];
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// Ordered by how useful each is as a "matched in…" hint.
function fieldsOf(r) {
  const p = r.peer || {};
  return [
    ["Name", p.name],
    ["Course", p.course],
    ["University", p.uni],
    ["Come to me for", (p.tags || []).join(" · ")],
    ["What I do", p.headline],
    ["About", p.about],
    ["Projects", (p.projects || []).map((x) => [x.title, x.line].filter(Boolean).join(" — ")).join(" · ")],
    ["Links", Object.entries(p.links || {}).map(([label, url]) => `${label} (${hostOf(url)})`).join(" · ")],
    ["Year", p.year],
    ["Card", [p.cardName, p.cardNote].filter(Boolean).join(" — ")],
    ["Met at", r.eventName],
    ["Your note", r.note],
  ].filter(([, v]) => v && String(v).trim());
}

export function buildIndex(rows) {
  const vocab = new Map();
  const entries = rows.map((row) => {
    const fields = fieldsOf(row).map(([label, raw]) => {
      const toks = words(raw);
      for (const w of toks) if (w.length >= 2) vocab.set(w, (vocab.get(w) || 0) + 1);
      return { label, raw: String(raw), toks };
    });
    return { row, fields };
  });
  return { entries, vocab };
}

const hits = (toks, term) => toks.some((w) => w.startsWith(term));

export function search(index, ts) {
  if (!ts.length) return index.entries.map((e) => ({ row: e.row, hint: null }));
  const out = [];
  for (const e of index.entries) {
    if (!ts.every((t) => e.fields.some((f) => hits(f.toks, t)))) continue;
    out.push({ row: e.row, hint: hintFor(e, ts) });
  }
  return out;
}

// Fields already visible in the list row don't need a hint.
const SHOWN = new Set(["Name", "Course", "University"]);
function hintFor(e, ts) {
  const f = e.fields.find((x) => !SHOWN.has(x.label) && ts.some((t) => hits(x.toks, t)));
  if (!f) return null;
  return { label: f.label, parts: snippet(f.raw, ts) };
}

// Plain-text segments ({ text, hit }) around the first match, for safe rendering.
function snippet(raw, ts, radius = 36) {
  const chars = Array.from(raw);
  const folded = foldChars(raw).join("");
  const marks = new Array(chars.length).fill(false);
  for (const t of ts) {
    let i = folded.indexOf(t);
    while (i !== -1) {
      if (i === 0 || folded[i - 1] === " ") for (let k = i; k < i + t.length; k++) marks[k] = true;
      i = folded.indexOf(t, i + 1);
    }
  }
  const first = Math.max(0, marks.indexOf(true));
  const start = Math.max(0, first - radius);
  const end = Math.min(chars.length, first + radius * 2);
  const parts = [];
  for (let k = start; k < end; k++) {
    const last = parts[parts.length - 1];
    if (last && last.hit === marks[k]) last.text += chars[k];
    else parts.push({ text: chars[k], hit: marks[k] });
  }
  if (start > 0) parts.unshift({ text: "…", hit: false });
  if (end < chars.length) parts.push({ text: "…", hit: false });
  return parts;
}

// Optimal string alignment distance (Levenshtein + adjacent swaps), with an early exit.
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}

const allowed = (len) => (len <= 2 ? 0 : len <= 4 ? 1 : len <= 7 ? 2 : 3);

function correct(term, vocab) {
  const max = allowed(term.length);
  if (!max) return null;
  let best = null;
  for (const [w, count] of vocab) {
    // A typo in a word still being typed ("enginer" -> "engineering") is
    // measured against the start of the word, at a small penalty.
    const full = distance(term, w, max);
    const pre = w.length > term.length ? distance(term, w.slice(0, term.length), max) + 0.5 : Infinity;
    const d = Math.min(full, pre);
    if (d > max) continue;
    if (!best || d < best.d || (d === best.d && (count > best.count || (count === best.count && w.length < best.w.length)))) {
      best = { w, d, count };
    }
  }
  return best?.w || null;
}

// Returns the corrected terms when at least one keyword matches nothing and a
// close enough word exists for it; otherwise null.
export function suggest(index, ts) {
  let changed = false;
  const fixed = ts.map((t) => {
    for (const w of index.vocab.keys()) if (w.startsWith(t)) return t;
    const c = correct(t, index.vocab);
    if (c) { changed = true; return c; }
    return t;
  });
  return changed ? fixed : null;
}
