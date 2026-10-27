// Tiny data helpers over D1. JSON columns are parsed/stringified centrally so
// route code never deals with raw TEXT.
export const now = () => Date.now();

export const newId = () =>
  [...crypto.getRandomValues(new Uint8Array(5))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

export const newToken = () =>
  [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const JSON_FIELDS = new Set([
  "links", "tags", "projects", "visible_links", "perks",
  "checkin_questions", "answers", "sponsor", "transports",
]);

export function hydrate(row) {
  if (!row) return null;
  for (const k of Object.keys(row)) {
    if (JSON_FIELDS.has(k) && typeof row[k] === "string") {
      try { row[k] = JSON.parse(row[k]); } catch { row[k] = k === "links" || k === "answers" ? {} : []; }
    }
  }
  return row;
}

export async function one(db, sql, ...params) {
  return hydrate(await db.prepare(sql).bind(...params).first());
}

export async function all(db, sql, ...params) {
  const res = await db.prepare(sql).bind(...params).all();
  return (res.results || []).map(hydrate);
}

export async function run(db, sql, ...params) {
  return db.prepare(sql).bind(...params).run();
}

// Runs inside db.batch([...]); raw statement builder.
export function stmt(db, sql, ...params) {
  return db.prepare(sql).bind(...params);
}

// Short event/card code alphabet — no 0/O/1/I.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_DIGITS = "23456789";

// Every code contains at least one digit. That costs about a third of the
// keyspace but means a code can never spell a word (these end up printed on
// badges and read aloud), and it makes a code look like a code.
export function randomCode(len = 4) {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
    if ([...code].some((ch) => CODE_DIGITS.includes(ch))) return code;
  }
}

// Collision-free code for a table column (used for event codes; card codes
// have their own allocator in codes.js because they rotate).
export async function uniqueCode(db, table, len = 4) {
  for (let i = 0; i < 12; i++) {
    const code = randomCode(len);
    const hit = await one(db, `SELECT code FROM ${table} WHERE code = ?`, code);
    if (!hit) return code;
  }
  throw new Error("could not allocate unique code");
}

// Count terms in a JSON-array column across rows, sorted desc.
export function countJsonTerms(rows, key, { min = 1, limit = 12 } = {}) {
  const tally = new Map();
  for (const row of rows) {
    const arr = Array.isArray(row[key]) ? row[key] : [];
    for (const raw of arr) {
      const term = String(raw || "").trim();
      if (!term) continue;
      tally.set(term, (tally.get(term) || 0) + 1);
    }
  }
  return [...tally.entries()]
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

// Distribution of answers to a check-in question key.
export function countAnswerTerms(rows, answerKey, { min = 1, limit = 12 } = {}) {
  const tally = new Map();
  for (const row of rows) {
    const v = row.answers?.[answerKey];
    const term = String(v || "").trim();
    if (!term) continue;
    tally.set(term, (tally.get(term) || 0) + 1);
  }
  return [...tally.entries()]
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}
