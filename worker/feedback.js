// End-of-event feedback.
//
// Who: only people who checked in. When: from the end of the event (the host
// pressing End, the scheduled end, or 3 hours after the start) for 7 days; an
// event with no times opens 2 hours after your check-in.
//
// Privacy: answers are stored with no user id (feedback_responses) and a
// separate table only records that you have answered (feedback_done), so the
// two can't be joined. Hosts see nothing until 3 people have answered, and
// free-text answers only from 5, shuffled.
import { Hono } from "hono";
import { newId, now, one, all } from "./db.js";
import { requireUser, HttpError } from "./session.js";

export const feedbackApp = new Hono();

export const CORE_QUESTIONS = [
  { id: "overall", type: "rating", label: "Overall, how was it?", required: true },
  { id: "again", type: "single", label: "Would you come to another one?", options: ["Yes", "Maybe", "No"] },
  { id: "improve", type: "text", label: "One thing that would make it better" },
];
export const MAX_HOST_QUESTIONS = 5;
export const MIN_RESULTS = 3;
export const MIN_TEXT = 5;
const TYPES = ["rating", "single", "multi", "text"];
const HOUR = 60 * 60 * 1000;
export const FEEDBACK_WINDOW_MS = 7 * 24 * HOUR;
const DEFAULT_LENGTH_MS = 3 * HOUR;
const NO_TIME_DELAY_MS = 2 * HOUR;
const TEXT_MAX = 500;

/** Host questions, cleaned: up to 5, ids h1..h5 by position. */
export function sanitizeQuestions(input) {
  return (Array.isArray(input) ? input : [])
    .map((q) => {
      const type = TYPES.includes(q?.type) ? q.type : "rating";
      const label = String(q?.label || "").trim().slice(0, 120);
      if (!label) return null;
      const out = { type, label };
      if (type === "single" || type === "multi") {
        out.options = [...new Set((Array.isArray(q.options) ? q.options : [])
          .map((o) => String(o || "").trim().slice(0, 40)).filter(Boolean))].slice(0, 6);
        if (out.options.length < 2) return null;
      }
      return out;
    })
    .filter(Boolean)
    .slice(0, MAX_HOST_QUESTIONS)
    .map((q, i) => ({ id: `h${i + 1}`, ...q }));
}

/** Practical info shown to attendees: accessibility, dress code, food, other. */
export function eventInfo(raw) {
  let o = raw;
  if (typeof o === "string") { try { o = JSON.parse(o); } catch { o = {}; } }
  const out = {};
  for (const k of ["access", "dress", "food", "other"]) {
    const v = String(o?.[k] || "").trim().slice(0, 200);
    if (v) out[k] = v;
  }
  return out;
}

export function questionsFor(ev) {
  let host = ev.feedback_questions;
  if (typeof host === "string") { try { host = JSON.parse(host); } catch { host = []; } }
  return [...CORE_QUESTIONS, ...(Array.isArray(host) ? host : [])];
}

/** When an event is over, for feedback purposes (null if it has no times). */
export function closesAt(ev) {
  return ev.ended_at || ev.ends_at || (ev.starts_at ? ev.starts_at + DEFAULT_LENGTH_MS : null);
}

export function feedbackOpensAt(ev, checkinAt) {
  return closesAt(ev) ?? (checkinAt + NO_TIME_DELAY_MS);
}

function status(ev, checkin, done, t = now()) {
  if (!ev.feedback_on) return "off";
  if (!checkin) return "not_checked_in";
  if (done) return "done";
  const opens = feedbackOpensAt(ev, checkin.created_at);
  if (t < opens) return "not_open";
  if (t >= opens + FEEDBACK_WINDOW_MS) return "closed";
  return "open";
}

/** Events this person checked in to whose feedback is open and unanswered. */
export async function pendingFeedback(db, userId) {
  const rows = await all(
    db,
    `SELECT e.id, e.code, e.name, e.starts_at, e.ends_at, e.ended_at, e.feedback_on, ch.created_at AS checkin_at
     FROM checkins ch JOIN events e ON e.id = ch.event_id
     WHERE ch.user_id = ? AND e.feedback_on = 1 AND ch.created_at > ?
       AND NOT EXISTS (SELECT 1 FROM feedback_done d WHERE d.event_id = e.id AND d.user_id = ch.user_id)
     ORDER BY ch.created_at DESC LIMIT 10`,
    userId, now() - 30 * 24 * HOUR
  );
  return rows
    .filter((r) => status(r, { created_at: r.checkin_at }, false) === "open")
    .map((r) => ({
      eventId: r.id, code: r.code, name: r.name,
      closesAt: feedbackOpensAt(r, r.checkin_at) + FEEDBACK_WINDOW_MS,
    }));
}

/** Checks answers against the questions; returns { closed, text }. */
export function validateAnswers(questions, input) {
  const closed = {};
  const text = {};
  for (const q of questions) {
    const v = input?.[q.id];
    if (v === undefined || v === null || v === "") continue;
    if (q.type === "rating") {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 1 && n <= 5) closed[q.id] = n;
    } else if (q.type === "single") {
      if (q.options.includes(v)) closed[q.id] = v;
    } else if (q.type === "multi") {
      const picked = [...new Set((Array.isArray(v) ? v : []).filter((x) => q.options.includes(x)))];
      if (picked.length) closed[q.id] = picked;
    } else if (q.type === "text") {
      const t = String(v).trim().slice(0, TEXT_MAX);
      if (t) text[q.id] = t;
    }
  }
  for (const q of questions) {
    if (q.required && closed[q.id] === undefined) {
      throw new HttpError(400, `Please answer: ${q.label}`, "answer_required");
    }
  }
  return { closed, text };
}

function shuffle(arr) {
  const a = [...arr];
  const r = crypto.getRandomValues(new Uint32Array(a.length));
  for (let i = a.length - 1; i > 0; i--) {
    const j = r[i] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Aggregate results for hosts, applying the minimum group sizes. */
export function summarize(questions, responses) {
  const n = responses.length;
  const parsed = responses.map((r) => {
    let a = r.answers;
    if (typeof a === "string") { try { a = JSON.parse(a); } catch { a = {}; } }
    return { closed: a?.closed || {}, text: a?.text || {} };
  });
  const enough = n >= MIN_RESULTS;
  const textOk = n >= MIN_TEXT;
  return {
    responses: n,
    minResults: MIN_RESULTS,
    minText: MIN_TEXT,
    questions: questions.map((q) => {
      const base = { id: q.id, type: q.type, label: q.label };
      if (q.type === "text") {
        const all = parsed.map((p) => p.text[q.id]).filter(Boolean);
        return { ...base, answered: all.length, comments: textOk ? shuffle(all) : null };
      }
      if (!enough) return { ...base, hidden: true };
      if (q.type === "rating") {
        const vals = parsed.map((p) => p.closed[q.id]).filter((v) => Number.isInteger(v));
        const counts = [1, 2, 3, 4, 5].map((s) => vals.filter((v) => v === s).length);
        const avg = vals.length ? Math.round((vals.reduce((x, y) => x + y, 0) / vals.length) * 10) / 10 : null;
        return { ...base, answered: vals.length, average: avg, counts };
      }
      const counts = Object.fromEntries((q.options || []).map((o) => [o, 0]));
      let answered = 0;
      for (const p of parsed) {
        const v = p.closed[q.id];
        if (v === undefined) continue;
        answered++;
        for (const o of Array.isArray(v) ? v : [v]) if (o in counts) counts[o]++;
      }
      return { ...base, answered, counts: Object.entries(counts).map(([option, count]) => ({ option, count })) };
    }),
  };
}

/* --------------------------------- routes --------------------------------- */

async function loadForUser(db, eventId, userId) {
  const ev = await one(db, "SELECT * FROM events WHERE id = ?", eventId);
  if (!ev) throw new HttpError(404, "event not found");
  const [checkin, done] = await Promise.all([
    one(db, "SELECT created_at FROM checkins WHERE event_id = ? AND user_id = ?", ev.id, userId),
    one(db, "SELECT 1 AS x FROM feedback_done WHERE event_id = ? AND user_id = ?", ev.id, userId),
  ]);
  return { ev, checkin, done: !!done };
}

feedbackApp.get("/api/e/:id/feedback", async (c) => {
  const me = requireUser(c);
  const { ev, checkin, done } = await loadForUser(c.env.DB, c.req.param("id"), me.id);
  const opens = checkin ? feedbackOpensAt(ev, checkin.created_at) : null;
  return c.json({
    event: { id: ev.id, code: ev.code, name: ev.name, startsAt: ev.starts_at },
    status: status(ev, checkin, done),
    opensAt: opens,
    closesAt: opens ? opens + FEEDBACK_WINDOW_MS : null,
    questions: questionsFor(ev),
  });
});

feedbackApp.post("/api/e/:id/feedback", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const { ev, checkin, done } = await loadForUser(db, c.req.param("id"), me.id);
  const st = status(ev, checkin, done);
  if (st === "done") return c.json({ error: "You've already given feedback for this event. Thank you!", code: "done" }, 409);
  if (st !== "open") {
    const msg = { off: "This event isn't collecting feedback.", not_checked_in: "Only people who checked in can give feedback.",
      not_open: "Feedback opens when the event ends.", closed: "Feedback for this event has closed." }[st];
    return c.json({ error: msg, code: st }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const answers = validateAnswers(questionsFor(ev), body.answers || {});
  const day = Math.floor(now() / (24 * HOUR)) * 24 * HOUR; // date only, no time of day
  try {
    await db.batch([
      db.prepare("INSERT INTO feedback_done (event_id, user_id) VALUES (?, ?)").bind(ev.id, me.id),
      db.prepare("INSERT INTO feedback_responses (id, event_id, answers, day) VALUES (?, ?, ?, ?)")
        .bind(newId() + newId(), ev.id, JSON.stringify(answers), day),
    ]);
  } catch {
    return c.json({ error: "You've already given feedback for this event. Thank you!", code: "done" }, 409);
  }
  return c.json({ ok: true });
});
