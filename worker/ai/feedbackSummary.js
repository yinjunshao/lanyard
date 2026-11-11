// F23: the AI summary of an event's written feedback, for the hosts of that event.
//   GET  /api/host/events/:id/feedback/summary   what the page shows: the stored summary (if any), the figures worked out by
//                                                the Worker, how many written answers there are, what is left of today's allowance
//   POST /api/host/events/:id/feedback/summary   write it now (or again): { summary, ... } or { fallback: { reason, message } }
//   writeDueSummaries(env)                       the hourly job: once, when an event's feedback window has closed
// Both routes are mounted in worker/hosts.js, behind its guards (host site only, host cookie only, setup finished), and
// only for an event of an organisation the host belongs to (404 otherwise).
//
// What the model is given (AI Safety and Cost Plan, rule 1). All of it is read from the database for THIS event:
//   questions  the written-answer questions of this event (their wording, cleaned), each with its written answers as
//              { id: "a12", text }. Only a question that at least 5 people answered is sent at all.
//   Every answer is cleaned (no links, emails, hidden characters, angle brackets, 600 characters at most), then
//   redacted (phone numbers, @handles, the names of the people at the event and its organisers, titles and
//   "thanks to" names become markers) and sorted by text, so the order says nothing about who answered first.
// Never: any name, email, user id, card, check-in, time or date of an answer (there is none stored: answers carry only a
// day), the ratings and choices (the Worker works those out), any other event's answers, or the event's name and venue.
//
// What the host gets back: the model's words (a paragraph, points, quotes), after the checks in
// prompts/feedbackSummary.js, plus figures that come only from code: how many people answered, the average rating, the share
// who would come again, and for each point how many different people stand behind it. Nothing is shown below the small-group
// threshold (5 written answers to one question), checked here before any model is called.
//
// Stored: one row per event in feedback_summaries (migration 0027), removed with the event and with the free-text
// answers after 12 months. Not kept in ai_cache (cacheTtlMs 0), so this table is the only copy.
import { one, all, run } from "../db.js";
import { questionsFor, summarize, MIN_TEXT, FEEDBACK_WINDOW_MS } from "../feedback.js";
import { sendMail } from "../mail.js";
import { feedbackSummaryEmail } from "../mail-templates.js";
import { hostOrigin } from "../host-auth.js";
import { callModel, allowanceFor } from "./client.js";
import { cleanText, CAPS } from "./sanitize.js";
import { assignIds } from "./prompt.js";
import { redactAnswer, nameMatcher } from "./redact.js";
import { aiConfig } from "./config.js";
import { getSettings } from "./store.js";
import { PROMPT_VERSION, MAX_TOKENS, SUMMARY_SCHEMA, summarySystem, refineSummary } from "./prompts/feedbackSummary.js";

const HOUR = 3600e3;
const DEFAULT_LENGTH_MS = 3 * HOUR; // same as worker/feedback.js: an event with a start and no end
const RETRY_MS = 6 * HOUR;          // between automatic attempts
const MAX_AUTO_TRIES = 3;
const PER_RUN = 10;

const parseAnswers = (r) => {
  let a = r.answers;
  if (typeof a === "string") { try { a = JSON.parse(a); } catch { a = {}; } }
  return a?.text && typeof a.text === "object" ? a.text : {};
};

/** Real names of the people at the event (who checked in) and its organisers: only ever used to take those words out. */
async function rosterNames(db, ev) {
  const [att, hosts] = await Promise.all([
    all(db, "SELECT p.name FROM checkins ch JOIN profiles p ON p.user_id = ch.user_id WHERE ch.event_id = ? LIMIT 3000", ev.id),
    all(db, "SELECT a.full_name FROM host_org_members m JOIN host_accounts a ON a.id = m.host_account_id WHERE m.org_id = ?", ev.org_id),
  ]);
  return [...att.map((r) => r.name), ...hosts.map((r) => r.full_name)].filter((n) => typeof n === "string" && n.trim());
}

/**
 * The input for one event, and whether it is big enough to summarise. `eligible` is false below the small-group
 * threshold, and then nothing is sent anywhere. Exported so tests can inspect it.
 */
export async function buildInput(db, ev, rows) {
  const names = await rosterNames(db, ev);
  const keep = [ev.name, ev.venue].filter(Boolean);
  const parsed = rows.map(parseAnswers);
  const questions = questionsFor(ev).filter((q) => q.type === "text");
  const flat = [];
  const labels = new Map();
  let mostAnswered = 0;
  for (const q of questions) {
    const list = [];
    parsed.forEach((text, person) => {
      const raw = text[q.id];
      if (typeof raw !== "string") return;
      const clean = cleanText(raw, CAPS.answer);
      const red = clean ? redactAnswer(clean, { names, keep }) : "";
      // An answer with nothing left to read (only a link, a name or a number) does not count.
      if (!/\p{L}{3}/u.test(red.replace(/\[(?:name|contact)\]/g, ""))) return;
      list.push({ person, text: red });
    });
    mostAnswered = Math.max(mostAnswered, list.length);
    if (list.length < MIN_TEXT) continue;
    const qid = `q${labels.size + 1}`;
    labels.set(qid, cleanText(q.label, 120));
    list.sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0)); // no order that follows who answered first
    flat.push(...list.map((x) => ({ ...x, qid })));
  }
  const { records, idMap } = assignIds(flat, (x) => x.person, (x, id) => ({ id, qid: x.qid, text: x.text }), "a");
  return {
    eligible: records.length > 0,
    written: records.length,
    mostAnswered,
    responses: rows.length,
    data: { questions: [...labels].map(([id, question]) => ({ id, question, answers: records.filter((r) => r.qid === id).map((r) => ({ id: r.id, text: r.text })) })) },
    answers: records,
    idMap,
    labels,
    isName: nameMatcher(names),
  };
}

/** The figures: all worked out by code from the same results the host already sees (summarize in worker/feedback.js). */
export function figuresOf(ev, rows) {
  const r = summarize(questionsFor(ev), rows);
  const q = (id) => r.questions.find((x) => x.id === id && !x.hidden);
  const overall = q("overall");
  const again = q("again");
  const yes = again?.counts?.find((x) => x.option === "Yes")?.count ?? 0;
  return {
    responses: r.responses,
    rating: overall ? { label: overall.label, average: overall.average, answered: overall.answered } : null,
    again: again?.answered ? { label: again.label, yes, answered: again.answered, percent: Math.round((yes / again.answered) * 100) } : null,
  };
}

// Local stub mode only (AI_STUB): a plausible reply built from the ids, so the screen can be tried without a key.
function stubSummary(input) {
  const ids = input.answers.map((a) => a.id);
  const first = input.answers[0]?.text || "";
  return {
    paragraph: "People enjoyed the evening and the mix of people. Some asked for more time at the start and a few found the room loud.",
    worked: [{ text: "The mix of people and the welcome were liked", answers: ids.slice(0, 4) }],
    change: [{ text: "More time at the start to talk and a quieter room", answers: ids.slice(2, 6) }],
    quotes: first.length >= 12 ? [first.slice(0, Math.min(first.length, 90))] : [],
  };
}

const parseResult = (s) => { try { return JSON.parse(s); } catch { return null; } };

async function storedSummary(db, eventId) {
  return one(db, "SELECT result, source, answers, created_at FROM feedback_summaries WHERE event_id = ?", eventId);
}

async function saveSummary(db, eventId, value, source, answers, ts, { keepExisting = false } = {}) {
  const res = await run(db,
    `INSERT INTO feedback_summaries (event_id, result, source, answers, created_at, auto_tries, auto_at) VALUES (?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(event_id) DO UPDATE SET result = excluded.result, source = excluded.source, answers = excluded.answers, created_at = excluded.created_at${keepExisting ? " WHERE feedback_summaries.result IS NULL" : ""}`,
    eventId, JSON.stringify(value), source, answers, ts, source === "auto" ? ts : null);
  return res.meta?.changes || 0;
}

/** The page's view: summary, figures, counts and what is left today. */
async function view(env, ev, host, rows, input, extra = {}) {
  const [stored, allowance] = await Promise.all([storedSummary(env.DB, ev.id), allowanceFor(env, { kind: "host", id: host.id }, "feedback_summary", ev.id)]);
  const result = stored?.result && input.eligible ? parseResult(stored.result) : null;
  return {
    eligible: input.eligible,
    needed: MIN_TEXT,
    mostAnswered: input.mostAnswered,
    written: input.written,
    summary: result ? { ...result, basedOn: stored.answers, createdAt: stored.created_at, source: stored.source, newer: input.written > stored.answers } : null,
    figures: input.eligible ? figuresOf(ev, rows) : null,
    allowance: allowance ? { left: allowance.remaining.day, of: allowance.limit.day } : null,
    ...extra,
  };
}

const loadRows = (db, ev) => all(db, "SELECT answers FROM feedback_responses WHERE event_id = ?", ev.id);

export async function summaryGet(c, ev, host) {
  const rows = await loadRows(c.env.DB, ev);
  const input = await buildInput(c.env.DB, ev, rows);
  return c.json(await view(c.env, ev, host, rows, input));
}

// What the host is told when AI is not available: the foundation's message, and that nothing else is affected.
const hostMessage = (r) => (r.reason === "ineligible" ? "AI summaries aren't available for this account right now." : r.message);

async function generate(env, ev, host, input, { automatic, ip }) {
  return callModel(env, {
    feature: automatic ? "feedback_summary_auto" : "feedback_summary",
    actor: { kind: "host", id: host.id },
    promptVersion: PROMPT_VERSION,
    system: summarySystem(),
    data: input.data,
    schema: SUMMARY_SCHEMA,
    maxTokens: MAX_TOKENS,
    scope: ev.id,
    regenerate: true, // a tap always asks again; the result is stored here, not in the cache
    cacheTtlMs: 0,
    automatic,
    ip,
    refine: refineSummary({ answers: input.answers, people: input.idMap, labels: input.labels, isName: input.isName, minAnswers: MIN_TEXT }),
    stub: stubSummary(input),
  });
}

export async function summaryPost(c, ev, host) {
  const db = c.env.DB;
  const rows = await loadRows(db, ev);
  const input = await buildInput(db, ev, rows);
  // The threshold is enforced here, in code, before any model is called.
  if (!input.eligible) return c.json(await view(c.env, ev, host, rows, input));
  const r = await generate(c.env, ev, host, input, { automatic: false, ip: c.req.header("cf-connecting-ip") });
  if (r.fallback) return c.json(await view(c.env, ev, host, rows, input, { fallback: { reason: r.reason, message: hostMessage(r) } }));
  await saveSummary(db, ev.id, r.result, "manual", input.written, Date.now());
  return c.json(await view(c.env, ev, host, rows, input));
}

/* ------------------------------ the hourly job ----------------------------- */
// Once per event, after its feedback window has closed (7 days after it ended), for up to 7 days after that. Uses the
// organisation owner's host account as the caller, `automatic: true` and the `feedback_summary_auto` allowance, so it
// never uses up the host's own 3 regenerations a day.
const endOf = `COALESCE(e.ended_at, e.ends_at, e.starts_at + ${DEFAULT_LENGTH_MS})`;
// Reasons that mean "not now, and not the event's fault": try again later without counting a failure.
const NOT_NOW = new Set(["off", "misconfigured", "not_allowed", "ineligible", "opted_out", "blocked"]);

async function noteAttempt(db, eventId, ts, failed) {
  await run(db,
    `INSERT INTO feedback_summaries (event_id, result, source, answers, created_at, auto_tries, auto_at) VALUES (?, NULL, NULL, 0, NULL, ?, ?)
     ON CONFLICT(event_id) DO UPDATE SET auto_tries = feedback_summaries.auto_tries + excluded.auto_tries, auto_at = excluded.auto_at WHERE feedback_summaries.result IS NULL`,
    eventId, failed ? 1 : 0, ts);
}

export async function writeDueSummaries(env, ts = Date.now()) {
  const db = env.DB;
  const out = { written: 0, failed: 0, skipped: 0, emailed: 0 };
  // Off, killed or not set up: do nothing at all (so a quiet hour adds nothing to the fallback counts).
  const cfg = aiConfig(env);
  if (!cfg.enabled || (!cfg.stub.allowed && (!cfg.gatewayUrl || !cfg.hasKey)) || (await getSettings(db)).killed) return out;

  const events = await all(db,
    `SELECT e.* FROM events e
      WHERE e.org_id IS NOT NULL AND e.feedback_on = 1 AND e.starts_at IS NOT NULL
        AND ${endOf} + ${FEEDBACK_WINDOW_MS} <= ? AND ${endOf} + ${FEEDBACK_WINDOW_MS} >= ?
        AND NOT EXISTS (SELECT 1 FROM feedback_summaries s WHERE s.event_id = e.id AND (s.result IS NOT NULL OR s.auto_tries >= ${MAX_AUTO_TRIES} OR s.auto_at > ?))
      ORDER BY e.starts_at LIMIT ${PER_RUN}`,
    ts, ts - FEEDBACK_WINDOW_MS, ts - RETRY_MS);

  for (const ev of events) {
    const owner = await one(db,
      `SELECT a.id, a.email FROM host_org_members m JOIN host_accounts a ON a.id = m.host_account_id
        WHERE m.org_id = ? AND m.role = 'owner' AND a.status = 'active' AND a.deleted_at IS NULL LIMIT 1`, ev.org_id);
    if (!owner) { out.skipped += 1; continue; }
    const rows = await loadRows(db, ev);
    const input = await buildInput(db, ev, rows);
    if (!input.eligible) { // final: the window is closed, so no more answers are coming
      await run(db, "INSERT OR IGNORE INTO feedback_summaries (event_id, result, source, answers, created_at, auto_tries, auto_at) VALUES (?, NULL, NULL, 0, NULL, ?, ?)", ev.id, MAX_AUTO_TRIES, ts);
      out.skipped += 1;
      continue;
    }
    const r = await generate(env, ev, owner, input, { automatic: true, ip: null });
    if (r.fallback) {
      await noteAttempt(db, ev.id, ts, !NOT_NOW.has(r.reason));
      out.failed += 1;
      continue;
    }
    const saved = await saveSummary(db, ev.id, r.result, "auto", input.written, ts, { keepExisting: true });
    if (!saved) continue; // a host wrote one by hand in the meantime
    out.written += 1;
    if (owner.email && r.result.paragraph && !(await one(db, "SELECT 1 AS x FROM host_mail_log WHERE event_id = ? AND kind = 'feedback_summary'", ev.id))) {
      try {
        await sendMail(env, "decisions", { to: owner.email, ...feedbackSummaryEmail({ eventName: ev.name, paragraph: r.result.paragraph, answers: input.written, url: `${hostOrigin(env)}/events/${ev.id}` }) });
        await run(db, "INSERT OR IGNORE INTO host_mail_log (event_id, kind, host_account_id, sent_at) VALUES (?, 'feedback_summary', ?, ?)", ev.id, owner.id, ts);
        out.emailed += 1;
      } catch (e) { console.error("feedback summary email failed"); }
    }
  }
  return out;
}

/** The recap email's paragraph, if a summary has already been written for the event (else ""). */
export async function recapParagraph(db, eventId) {
  const s = await storedSummary(db, eventId);
  const r = s?.result ? parseResult(s.result) : null;
  return r?.paragraph ? { paragraph: r.paragraph, answers: s.answers } : null;
}

/** The daily purge: a summary quotes written answers, so it goes when those do. `eventIds` are events whose text was just removed. */
export async function purgeSummaries(db, eventIds, ts, maxAgeMs) {
  let n = 0;
  for (const id of new Set(eventIds)) n += (await run(db, "DELETE FROM feedback_summaries WHERE event_id = ?", id)).meta?.changes || 0;
  n += (await run(db, "DELETE FROM feedback_summaries WHERE created_at IS NOT NULL AND created_at < ?", ts - maxAgeMs)).meta?.changes || 0;
  return n;
}
