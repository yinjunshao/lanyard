// Search matching for UiCombobox. Plain JS so test/pickers.mjs can run it in Node.
// Ignores case and accents ("Zürich" is found by "zurich"), matches the start of
// words first ("coll" finds "University College"), and also looks at aliases
// ("ucl" finds the long official name).

/**
 * Lower-case and strip accents, one output character per input character, so an
 * index in the folded text is the same index in the original (for highlighting).
 */
export function fold(s) {
  return Array.from(String(s ?? ""))
    .map((c) => {
      const base = c.normalize("NFD")[0] || c;
      return base.toLowerCase().length === 1 ? base.toLowerCase() : c.toLowerCase()[0];
    })
    .join("");
}

const isWordStart = (text, i) => i === 0 || !/[a-z0-9]/.test(text[i - 1]);

/** Index of `term` in `text`, preferring one that starts a word. -1 when absent. */
function find(text, term) {
  let from = 0;
  let fallback = -1;
  for (;;) {
    const i = text.indexOf(term, from);
    if (i < 0) return fallback;
    if (isWordStart(text, i)) return i;
    if (fallback < 0) fallback = i;
    from = i + 1;
  }
}

/** Merge [start, end) ranges that touch or overlap. */
function merge(ranges) {
  const out = [];
  for (const r of [...ranges].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([...r]);
  }
  return out;
}

/**
 * How well an option matches a query. Returns null for no match, or
 * { score, ranges, via } where a lower score is a better match, `ranges` are the
 * parts of the label to highlight, and `via` is the alias that matched (if the
 * label itself did not).
 */
export function matchOption(option, query) {
  const q = fold(query).trim();
  if (!q) return { score: 5, ranges: [], via: "" };
  const terms = q.split(/\s+/);
  const label = fold(option.label);

  let ranges = [];
  let allWordStarts = true;
  let ok = true;
  for (const t of terms) {
    const i = find(label, t);
    if (i < 0) { ok = false; break; }
    if (!isWordStart(label, i)) allWordStarts = false;
    ranges.push([i, i + t.length]);
  }
  let best = null;
  if (ok) {
    const score = label.startsWith(q) ? 1 : allWordStarts ? 2 : 3;
    best = { score, ranges: merge(ranges), via: "" };
  }

  for (const alias of option.aliases || []) {
    const a = fold(alias);
    const score = a === q ? 0 : a.startsWith(q) ? 1.5 : terms.every((t) => find(a, t) >= 0) ? 2.5 : -1;
    if (score >= 0 && (!best || score < best.score)) best = { score, ranges: [], via: alias };
  }
  return best;
}

/** Options that match, best first; ties keep the original order. */
export function rankOptions(options, query) {
  return options
    .map((option, i) => ({ option, i, m: matchOption(option, query) }))
    .filter((x) => x.m)
    .sort((a, b) => a.m.score - b.m.score || a.i - b.i)
    .map((x) => ({ option: x.option, ranges: x.m.ranges, via: x.m.via }));
}

/** Split a label into [{ text, hit }] pieces for highlighting. */
export function highlight(label, ranges) {
  if (!ranges.length) return [{ text: label, hit: false }];
  const out = [];
  let at = 0;
  for (const [s, e] of ranges) {
    if (s > at) out.push({ text: label.slice(at, s), hit: false });
    out.push({ text: label.slice(s, e), hit: true });
    at = e;
  }
  if (at < label.length) out.push({ text: label.slice(at), hit: false });
  return out;
}
