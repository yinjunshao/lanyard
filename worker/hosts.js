// Minimal host API for the pilot: one org per user, create/list events.
// Credits are enforced softly — pilots run free until billing lands (phase 7).
// The full dashboard, team roles, sponsors UI and reports build on these.
import { Hono } from "hono";
import { newId, now, one, all, run, uniqueCode, countJsonTerms, countAnswerTerms } from "./db.js";
import { hostTermsScope, hasConsent, recordConsent } from "./legal.js";
import { HOST_SKUS, FREE_EVENTS_FOR_NEW_ORG, FREE_EVENT_DAYS } from "./plans.js";
import { HttpError, sha256Hex } from "./session.js";
import { bump, DAY } from "./ratelimit.js";
import {
  sanitizeQuestions, eventInfo, questionsFor, summarize, closesAt, FEEDBACK_WINDOW_MS, MAX_HOST_QUESTIONS,
} from "./feedback.js";
import { validateWebhookUrl, newWebhookSecret, newApiKey, sendWebhook } from "./integrations.js";

export const hostApp = new Hono();

// Host accounts also accept the Host Terms (and the current Privacy Policy)
// before doing anything in the portal. Re-asked whenever the version changes.
hostApp.use("/api/host/*", async (c, next) => {
  if (new URL(c.req.url).pathname === "/api/host/terms") return next();
  const me = c.get("user");
  if ((me?.has_passkey || me?.has_recovery) && !(await hasConsent(c.env.DB, me.id, hostTermsScope()))) {
    return c.json({ error: "Please accept the Host Terms to continue.", code: "terms_required" }, 403);
  }
  return next();
});

hostApp.post("/api/host/terms", async (c) => {
  const me = c.get("user");
  if (!(me?.has_passkey || me?.has_recovery)) return c.json({ error: "Create your host account first.", code: "account_required" }, 403);
  const b = await c.req.json().catch(() => ({}));
  if (b.accept !== true) return c.json({ error: "Please agree to the Host Terms to continue.", code: "terms_required" }, 400);
  await recordConsent(c.env.DB, me.id, hostTermsScope());
  return c.json({ ok: true });
});

// Hosts need a real account (a saved passkey), not an anonymous guest cookie:
// an organisation, its events, its credits and its invoices must survive a
// cleared browser, and free credits must not be farmable with fresh cookies.
// Returns the user, or null if they still need to create their account.
function hostUser(c) {
  const me = c.get("user");
  return me?.has_passkey || me?.has_recovery ? me : null;
}
const needAccount = (c) =>
  c.json({ error: "Create your host account to continue.", code: "account_required" }, 403);

// Fair-use size of one event credit. Never blocks a check-in at the door; the
// host is nudged instead.
const EVENT_CHECKIN_CAP = 300;

const ORG_TYPES = ["society", "careers_service", "company", "other"];

async function creditSummary(db, orgId) {
  const row = await one(
    db,
    `SELECT COALESCE(SUM(events_granted),0) AS granted, COALESCE(SUM(events_used),0) AS used,
            MIN(CASE WHEN events_used < events_granted THEN expires_at END) AS next_expiry
     FROM credits WHERE org_id = ? AND (expires_at IS NULL OR expires_at > ?)`,
    orgId, now()
  );
  return {
    granted: row?.granted || 0,
    used: row?.used || 0,
    remaining: Math.max(0, (row?.granted || 0) - (row?.used || 0)),
    nextExpiry: row?.next_expiry || null,
  };
}

const ipOf = (c) => c.req.header("cf-connecting-ip") || "local";
// Free starter credits go to at most this many new organisations per IP per day,
// so they can't be farmed by making throwaway accounts.
const STARTER_ORGS_PER_IP_PER_DAY = 3;

// Ensure the current user has an org; returns it.
async function ensureOrg(db, userId, ip = "local") {
  let org = await one(
    db,
    `SELECT o.* FROM orgs o JOIN org_members m ON m.org_id = o.id
     WHERE m.user_id = ? ORDER BY (m.role = 'owner') DESC, o.created_at LIMIT 1`,
    userId
  );
  if (org) return org;
  const id = newId();
  const starter = (await bump(db, `day:org:ip:${ip}`, DAY)) <= STARTER_ORGS_PER_IP_PER_DAY;
  await db.batch([
    db.prepare("INSERT INTO orgs (id, name, plan, org_type, verification_status, created_at) VALUES (?, ?, 'starter', 'other', 'pending', ?)")
      .bind(id, "My organisation", now()),
    db.prepare("INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, 'owner')").bind(id, userId),
    // Starter grant for a new organisation.
    ...(starter ? [db.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, expires_at, reason, granted_by, created_at) VALUES (?, ?, ?, 0, ?, 'starter', 'self-serve', ?)")
      .bind(newId(), id, FREE_EVENTS_FOR_NEW_ORG, now() + FREE_EVENT_DAYS * 864e5, now())] : []),
  ]);
  return one(db, "SELECT * FROM orgs WHERE id = ?", id);
}

hostApp.get("/api/host/me", async (c) => {
  const me = hostUser(c);
  if (!me) return needAccount(c);
  const db = c.env.DB;
  const org = await ensureOrg(db, me.id, ipOf(c));
  const events = await all(
    db,
    "SELECT * FROM events WHERE org_id = ? ORDER BY starts_at DESC, created_at DESC",
    org.id
  );
  const membership = await one(db, "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?", org.id, me.id);
  return c.json({
    role: membership?.role || "owner",
    account: { hasPasskey: !!me.has_passkey, hasRecovery: !!me.has_recovery, email: me.recovery_email || null },
    org: {
      id: org.id, name: org.name, plan: org.plan, status: org.verification_status,
      type: org.org_type, billingEmail: org.billing_email || null,
    },
    credits: await creditSummary(db, org.id),
    events: events.map((e) => ({
      id: e.id, code: e.code, name: e.name, startsAt: e.starts_at,
      venue: e.venue, theme: e.theme, strapColor: e.strap_color,
      perks: e.perks || [], directoryOn: !!e.directory_on, isPaid: !!e.is_paid,
      endsAt: e.ends_at || null, ended: !!e.ended_at, rsvpCount: e.rsvp_count ?? null,
      info: eventInfo(e.info), feedbackOn: !!e.feedback_on,
    })),
  });
});

hostApp.post("/api/host/org", async (c) => {
  const me = hostUser(c);
  if (!me) return needAccount(c);
  const b = await c.req.json().catch(() => ({}));
  if (!String(b.name || "").trim()) return c.json({ error: "organisation name required" }, 400);
  const org = await ensureOrg(c.env.DB, me.id, ipOf(c));
  const type = ORG_TYPES.includes(b.type) ? b.type : org.org_type;
  const email = String(b.billingEmail || "").trim().slice(0, 120);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: "that email doesn't look right" }, 400);
  await run(
    c.env.DB,
    "UPDATE orgs SET name = ?, org_type = ?, billing_email = COALESCE(NULLIF(?, ''), billing_email) WHERE id = ?",
    String(b.name).trim().slice(0, 100), type, email, org.id
  );
  return c.json({ ok: true });
});

// Cleans the editable event fields. `partial` = only what was sent (for edits).
function eventFields(b, { partial = false } = {}) {
  const f = {};
  const has = (k) => !partial || b[k] !== undefined;
  const time = (v) => (v === null || v === "" ? null : Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
  if (has("name")) f.name = String(b.name || "").trim().slice(0, 120);
  if (has("startsAt")) f.starts_at = time(b.startsAt);
  if (has("endsAt")) f.ends_at = time(b.endsAt);
  if (has("venue")) f.venue = String(b.venue || "").slice(0, 120);
  if (has("theme")) f.theme = ["default", "formal", "night"].includes(b.theme) ? b.theme : "default";
  if (has("strapColor")) f.strap_color = /^#[0-9a-fA-F]{6}$/.test(b.strapColor || "") ? b.strapColor : null;
  if (has("perks")) f.perks = JSON.stringify(Array.isArray(b.perks) ? b.perks.slice(0, 10).map((x) => String(x).slice(0, 80)) : []);
  if (has("directoryOn")) f.directory_on = b.directoryOn === false ? 0 : 1;
  if (has("info")) f.info = JSON.stringify(eventInfo(b.info));
  if (has("rsvpCount")) {
    const n = Number(b.rsvpCount);
    f.rsvp_count = b.rsvpCount === null || b.rsvpCount === "" || !Number.isInteger(n) || n < 0 ? null : Math.min(n, 100000);
  }
  if (has("feedbackOn")) f.feedback_on = b.feedbackOn === false ? 0 : 1;
  if (has("feedbackQuestions")) f.feedback_questions = JSON.stringify(sanitizeQuestions(b.feedbackQuestions));
  if (f.ends_at && f.starts_at && f.ends_at <= f.starts_at) throw new HttpError(400, "The end time must be after the start.");
  return f;
}

function checkinQuestions(list) {
  return (Array.isArray(list) ? list : []).slice(0, 3)
    .map((q) => ({ key: String(q.key || "").replace(/[^a-z0-9_]/gi, "").slice(0, 24), label: String(q.label || "").slice(0, 60) }))
    .filter((q) => q.key && q.label);
}

// One credit per event, spent from the credits that expire soonest.
async function insertEvent(db, org, fields, questions) {
  if ((await creditSummary(db, org.id)).remaining <= 0) {
    throw new HttpError(402, "No event credits left. Buy more from Billing.", "no_credits");
  }
  const id = newId();
  const code = await uniqueCode(db, "events", 5);
  const cols = { ...fields, id, org_id: org.id, code, checkin_questions: JSON.stringify(questions), is_paid: 0, created_at: now() };
  const keys = Object.keys(cols);
  await db.batch([
    db.prepare(`INSERT INTO events (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).bind(...Object.values(cols)),
    db.prepare(
      `UPDATE credits SET events_used = events_used + 1 WHERE id = (
         SELECT id FROM credits
         WHERE org_id = ? AND events_used < events_granted AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY COALESCE(expires_at, 9007199254740991) LIMIT 1)`
    ).bind(org.id, now()),
  ]);
  return { id, code };
}

hostApp.post("/api/host/events", async (c) => {
  const me = hostUser(c);
  if (!me) return needAccount(c);
  const db = c.env.DB;
  const org = await ensureOrg(db, me.id, ipOf(c));
  const b = await c.req.json().catch(() => ({}));
  const fields = eventFields(b);
  if (!fields.name) return c.json({ error: "event name required" }, 400);
  const { id, code } = await insertEvent(db, org, fields, checkinQuestions(b.questions));
  return c.json({ ok: true, id, code }, 201);
});

// An event in one of my organisations, or a 404.
async function hostEvent(c, me, id = c.req.param("id")) {
  const ev = await one(
    c.env.DB,
    `SELECT e.* FROM events e JOIN org_members m ON m.org_id = e.org_id WHERE e.id = ? AND m.user_id = ?`,
    id, me.id
  );
  if (!ev) throw new HttpError(404, "not found");
  return ev;
}

// Edit an event's details (not its join code or credit).
hostApp.put("/api/host/events/:id", async (c) => {
  const me = hostUser(c);
  if (!me) return needAccount(c);
  const ev = await hostEvent(c, me);
  const b = await c.req.json().catch(() => ({}));
  delete b.feedbackQuestions; // edited through /feedback, which enforces the lock
  const f = eventFields(b, { partial: true });
  if ("name" in f && !f.name) return c.json({ error: "event name required" }, 400);
  const start = "starts_at" in f ? f.starts_at : ev.starts_at;
  const end = "ends_at" in f ? f.ends_at : ev.ends_at;
  if (start && end && end <= start) return c.json({ error: "The end time must be after the start." }, 400);
  const keys = Object.keys(f);
  if (keys.length) {
    await run(c.env.DB, `UPDATE events SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, ...Object.values(f), ev.id);
  }
  return c.json({ ok: true });
});

// Start from a past event: same details, questions, feedback form and sponsors; new code, uses a credit.
hostApp.post("/api/host/events/:id/duplicate", async (c) => {
  const me = hostUser(c);
  if (!me) return needAccount(c);
  const db = c.env.DB;
  const src = await hostEvent(c, me);
  const org = await one(db, "SELECT * FROM orgs WHERE id = ?", src.org_id);
  const b = await c.req.json().catch(() => ({}));
  const fields = {
    name: String(b.name || src.name).trim().slice(0, 120),
    starts_at: Number.isFinite(Number(b.startsAt)) && b.startsAt ? Math.round(Number(b.startsAt)) : null,
    ends_at: Number.isFinite(Number(b.endsAt)) && b.endsAt ? Math.round(Number(b.endsAt)) : null,
    venue: src.venue, theme: src.theme, strap_color: src.strap_color,
    perks: JSON.stringify(src.perks || []), directory_on: src.directory_on,
    info: JSON.stringify(eventInfo(src.info)), feedback_on: src.feedback_on,
    feedback_questions: JSON.stringify(sanitizeQuestions(src.feedback_questions)),
  };
  if (fields.ends_at && fields.starts_at && fields.ends_at <= fields.starts_at) return c.json({ error: "The end time must be after the start." }, 400);
  const { id, code } = await insertEvent(db, org, fields, src.checkin_questions || []);
  const sponsors = await all(db, "SELECT name, perk FROM sponsors WHERE event_id = ?", src.id);
  if (sponsors.length) {
    await db.batch(sponsors.map((sp) =>
      db.prepare("INSERT INTO sponsors (id, event_id, name, perk) VALUES (?, ?, ?, ?)").bind(newId(), id, sp.name, sp.perk)));
  }
  return c.json({ ok: true, id, code }, 201);
});

// End the event now: opens feedback and tells the organisation's webhook.
hostApp.post("/api/host/events/:id/end", async (c) => {
  const me = hostUser(c);
  if (!me) return needAccount(c);
  const db = c.env.DB;
  const ev = await hostEvent(c, me);
  const endedAt = ev.ended_at || now();
  if (!ev.ended_at) await run(db, "UPDATE events SET ended_at = ? WHERE id = ?", endedAt, ev.id);
  const totals = await eventTotals(db, ev.id);
  const send = sendWebhook(db, ev.org_id, "event.ended", {
    event: { id: ev.id, code: ev.code, name: ev.name, startsAt: ev.starts_at, endedAt },
    totals: { ...totals, rsvps: ev.rsvp_count ?? null },
  });
  if (c.executionCtx?.waitUntil) c.executionCtx.waitUntil(send); else await send;
  return c.json({ ok: true, endedAt });
});

async function eventTotals(db, eventId) {
  return one(
    db,
    `SELECT
       (SELECT COUNT(*) FROM checkins WHERE event_id = ?) checkins,
       (SELECT COUNT(*) FROM connections WHERE event_id = ?) connections,
       (SELECT COUNT(*) FROM connections WHERE event_id = ? AND selfie_key IS NOT NULL) selfies,
       (SELECT COUNT(*) FROM feedback_responses WHERE event_id = ?) feedback`,
    eventId, eventId, eventId, eventId
  );
}

// Feedback form: read the host questions and results; edit until the first answer arrives.
hostApp.get("/api/host/events/:id/feedback", async (c) => {
  const me = hostUser(c);
  if (!me) return needAccount(c);
  const db = c.env.DB;
  const ev = await hostEvent(c, me);
  const [responses, checkins] = await Promise.all([
    all(db, "SELECT answers FROM feedback_responses WHERE event_id = ?", ev.id),
    one(db, "SELECT COUNT(*) AS n FROM checkins WHERE event_id = ?", ev.id),
  ]);
  const closes = closesAt(ev);
  return c.json({
    on: !!ev.feedback_on,
    questions: sanitizeQuestions(ev.feedback_questions),
    maxQuestions: MAX_HOST_QUESTIONS,
    locked: responses.length > 0,
    checkins: checkins?.n || 0,
    opensAt: closes,
    closesAt: closes ? closes + FEEDBACK_WINDOW_MS : null,
    results: summarize(questionsFor(ev), responses),
  });
});

hostApp.put("/api/host/events/:id/feedback", async (c) => {
  const me = hostUser(c);
  if (!me) return needAccount(c);
  const db = c.env.DB;
  const ev = await hostEvent(c, me);
  const b = await c.req.json().catch(() => ({}));
  const sets = {};
  if (b.on !== undefined) sets.feedback_on = b.on === false ? 0 : 1;
  if (b.questions !== undefined) {
    const started = await one(db, "SELECT 1 AS x FROM feedback_responses WHERE event_id = ? LIMIT 1", ev.id);
    if (started) return c.json({ error: "Questions are locked once people start answering, so results stay comparable.", code: "locked" }, 409);
    sets.feedback_questions = JSON.stringify(sanitizeQuestions(b.questions));
  }
  const keys = Object.keys(sets);
  if (keys.length) await run(db, `UPDATE events SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, ...Object.values(sets), ev.id);
  return c.json({ ok: true, questions: sets.feedback_questions ? JSON.parse(sets.feedback_questions) : undefined });
});

// Live screen: check-in count + connections so far (aggregate only).
hostApp.get("/api/host/events/:id/live", async (c) => {
  const me = hostUser(c);
  if (!me) return needAccount(c);
  const ev = await hostEvent(c, me);
  const t = await eventTotals(c.env.DB, ev.id);
  return c.json({
    event: {
      id: ev.id, code: ev.code, name: ev.name, startsAt: ev.starts_at, venue: ev.venue,
      endsAt: ev.ends_at || null, endedAt: ev.ended_at || null, rsvpCount: ev.rsvp_count ?? null,
      info: eventInfo(ev.info), feedbackOn: !!ev.feedback_on,
    },
    checkins: t.checkins,
    connections: t.connections,
    selfies: t.selfies,
    feedback: t.feedback,
    cap: EVENT_CHECKIN_CAP,
    overCap: t.checkins > EVENT_CHECKIN_CAP,
  });
});

// Post-event aggregate report. No pair-level detail: hosts see cohort shapes.
// Small cohorts suppress low-count buckets to reduce re-identification.
async function buildReport(db, ev) {
  const [checkinRows, totals, sponsorOpts, responses] = await Promise.all([
    all(db,
      `SELECT ch.answers, ch.sponsor, ch.created_at, p.course, p.tags
       FROM checkins ch LEFT JOIN profiles p ON p.user_id = ch.user_id
       WHERE ch.event_id = ?`, ev.id),
    eventTotals(db, ev.id),
    all(db, "SELECT id, name FROM sponsors WHERE event_id = ?", ev.id),
    all(db, "SELECT answers FROM feedback_responses WHERE event_id = ?", ev.id),
  ]);
  const smallCohort = totals.checkins < 10;
  const minBucket = smallCohort ? 2 : 3;

  const questions = (ev.checkin_questions || []).map((q) => ({
    key: q.key,
    label: q.label,
    buckets: countAnswerTerms(checkinRows, q.key, { min: minBucket, limit: 20 }),
  })).filter((q) => q.buckets.length);

  const sponsorCounts = sponsorOpts.map((s) => ({
    name: s.name,
    count: checkinRows.filter((r) => (r.sponsor || []).includes(s.id)).length,
  })).filter((s) => s.count >= minBucket);

  // Arrivals by hour (London time), only for events big enough not to single anyone out.
  let arrivals = null;
  if (!smallCohort) {
    const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/London" });
    const byHour = new Map();
    for (const r of checkinRows) {
      const h = fmt.format(new Date(r.created_at));
      byHour.set(h, (byHour.get(h) || 0) + 1);
    }
    arrivals = [...byHour.entries()].filter(([, n]) => n >= minBucket)
      .sort((a, b) => a[0].localeCompare(b[0])).map(([hour, count]) => ({ hour: `${hour}:00`, count }));
  }

  const rsvp = ev.rsvp_count ?? null;
  return {
    generatedAt: now(),
    event: {
      id: ev.id, code: ev.code, name: ev.name, startsAt: ev.starts_at, venue: ev.venue,
      endsAt: ev.ends_at || null, endedAt: ev.ended_at || null,
    },
    privacy: {
      smallCohort,
      note: smallCohort
        ? "Cohort under 10: only repeated answers are shown to limit singling people out."
        : "Buckets with fewer than 3 responses are hidden.",
    },
    totals,
    rsvp: rsvp === null ? null : {
      count: rsvp,
      turnout: rsvp > 0 ? Math.round((totals.checkins / rsvp) * 100) : null,
    },
    connectionsPerAttendee: totals.checkins ? Math.round(((totals.connections * 2) / totals.checkins) * 10) / 10 : 0,
    arrivals,
    courses: countAnswerTerms(
      checkinRows.map((r) => ({ answers: { course: r.course } })),
      "course",
      { min: minBucket, limit: 20 }
    ),
    tags: countJsonTerms(checkinRows, "tags", { min: minBucket, limit: 20 }),
    questions,
    sponsors: sponsorCounts,
    feedback: summarize(questionsFor(ev), responses),
  };
}

hostApp.get("/api/host/events/:id/report", async (c) => {
  const me = hostUser(c);
  if (!me) return needAccount(c);
  const ev = await hostEvent(c, me);
  return c.json(await buildReport(c.env.DB, ev));
});

// The same report as a spreadsheet. Cells are escaped so a value can never run
// as a formula when the file is opened (CSV injection).
const cell = (v) => {
  let t = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

hostApp.get("/api/host/events/:id/report.csv", async (c) => {
  const me = hostUser(c);
  if (!me) return needAccount(c);
  const ev = await hostEvent(c, me);
  const r = await buildReport(c.env.DB, ev);
  const rows = [["Section", "Item", "Value"]];
  const add = (a, b, v) => rows.push([a, b, v]);
  add("Event", "Name", r.event.name);
  add("Event", "Code", r.event.code);
  if (r.event.startsAt) add("Event", "Starts", new Date(r.event.startsAt).toISOString());
  add("Totals", "Check-ins", r.totals.checkins);
  add("Totals", "Connections", r.totals.connections);
  add("Totals", "Shared selfies", r.totals.selfies);
  add("Totals", "Connections per attendee", r.connectionsPerAttendee);
  if (r.rsvp) { add("Totals", "RSVPs", r.rsvp.count); add("Totals", "Turnout %", r.rsvp.turnout ?? ""); }
  add("Totals", "Feedback responses", r.feedback.responses);
  for (const a of r.arrivals || []) add("Arrivals by hour", a.hour, a.count);
  for (const x of r.courses) add("Courses", x.term, x.count);
  for (const x of r.tags) add("Come to me for", x.term, x.count);
  for (const q of r.questions) for (const bk of q.buckets) add(`Check-in: ${q.label}`, bk.term, bk.count);
  for (const s of r.sponsors) add("Sponsor opt-ins", s.name, s.count);
  for (const q of r.feedback.questions) {
    if (q.hidden) continue;
    if (q.type === "rating") { add(`Feedback: ${q.label}`, "Average (1-5)", q.average ?? ""); q.counts.forEach((n, i) => add(`Feedback: ${q.label}`, `${i + 1} stars`, n)); }
    else if (q.type === "text") (q.comments || []).forEach((t, i) => add(`Feedback: ${q.label}`, `Comment ${i + 1}`, t));
    else for (const o of q.counts) add(`Feedback: ${q.label}`, o.option, o.count);
  }
  add("Privacy", "Note", r.privacy.note);
  const csv = "\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
  const safeName = r.event.name.replace(/[^A-Za-z0-9 _-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "event";
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="lanyard-report-${safeName}.csv"`,
      "cache-control": "no-store",
    },
  });
});

// New join code: the old poster/QR stops working at once. For a code that
// leaked, or an event series reusing a venue.
hostApp.post("/api/host/events/:id/rotate-code", async (c) => {
  const me = hostUser(c);
  if (!me) return needAccount(c);
  const db = c.env.DB;
  const ev = await one(
    db,
    `SELECT e.id FROM events e JOIN org_members m ON m.org_id = e.org_id
     WHERE e.id = ? AND m.user_id = ?`,
    c.req.param("id"), me.id
  );
  if (!ev) return c.json({ error: "not found" }, 404);
  const code = await uniqueCode(db, "events", 5);
  await run(db, "UPDATE events SET code = ? WHERE id = ?", code, ev.id);
  return c.json({ ok: true, code });
});

/* -------------------------------- billing --------------------------------- */
// Invoice / purchase-order first: student societies pay through union finance,
// and card payments (Stripe Checkout) come later behind the same SKUs. A
// request is recorded here; once paid, credits are granted (see DEPLOY notes).

hostApp.get("/api/host/billing", async (c) => {
  const me = hostUser(c);
  if (!me) return needAccount(c);
  const db = c.env.DB;
  const org = await ensureOrg(db, me.id, ipOf(c));
  const credits = await creditSummary(db, org.id);
  const ledger = await all(
    db,
    "SELECT id, events_granted, events_used, expires_at, reason, created_at FROM credits WHERE org_id = ? ORDER BY created_at DESC LIMIT 30",
    org.id
  );
  const requests = await all(
    db,
    "SELECT id, sku, quantity, amount_pence, status, po_number, created_at FROM billing_requests WHERE org_id = ? ORDER BY created_at DESC LIMIT 20",
    org.id
  );
  const audience = org.org_type === "society" ? "society" : "standard";
  return c.json({
    org: { id: org.id, name: org.name, type: org.org_type, plan: org.plan, status: org.verification_status, billingEmail: org.billing_email || null },
    credits,
    ledger: ledger.map((r) => ({
      id: r.id, granted: r.events_granted, used: r.events_used,
      expiresAt: r.expires_at, reason: r.reason, at: r.created_at,
    })),
    skus: Object.entries(HOST_SKUS)
      .filter(([, v]) => v.audience === audience)
      .map(([id, v]) => ({ id, label: v.label, credits: v.credits, days: v.days, pence: v.pence })),
    quotes: Object.entries(HOST_SKUS)
      .filter(([, v]) => v.audience === "quote")
      .map(([id, v]) => ({ id, label: v.label })),
    audience,
    requests: requests.map((r) => ({
      id: r.id, sku: r.sku, quantity: r.quantity, amountPence: r.amount_pence,
      status: r.status, po: r.po_number, at: r.created_at,
    })),
    cap: EVENT_CHECKIN_CAP,
  });
});

hostApp.post("/api/host/billing/request", async (c) => {
  const me = hostUser(c);
  if (!me) return needAccount(c);
  const db = c.env.DB;
  const org = await ensureOrg(db, me.id, ipOf(c));
  const b = await c.req.json().catch(() => ({}));
  const sku = HOST_SKUS[b.sku];
  const audience = org.org_type === "society" ? "society" : "standard";
  if (!sku || (sku.audience !== audience && sku.audience !== "quote")) {
    return c.json({ error: "that option isn't available for your organisation" }, 400);
  }
  if (sku.audience === "quote" && !String(b.note || "").trim()) {
    return c.json({ error: "tell us a little about your organisation and events so we can quote" }, 400);
  }
  const quantity = Math.min(20, Math.max(1, parseInt(b.quantity, 10) || 1));
  const email = String(b.email || org.billing_email || "").trim().slice(0, 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: "add a billing email so we can send the invoice" }, 400);
  const open = await one(db, "SELECT COUNT(*) AS n FROM billing_requests WHERE org_id = ? AND status = 'open'", org.id);
  if ((open?.n || 0) >= 5) return c.json({ error: "You already have open requests. We'll be in touch." }, 429);
  const id = newId();
  await run(
    db,
    `INSERT INTO billing_requests (id, org_id, user_id, sku, quantity, amount_pence, contact_email, po_number, note, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    id, org.id, me.id, b.sku, quantity, sku.pence * quantity, email,
    String(b.po || "").trim().slice(0, 60) || null,
    String(b.note || "").trim().slice(0, 300) || null,
    now()
  );
  if (!org.billing_email) await run(db, "UPDATE orgs SET billing_email = ? WHERE id = ?", email, org.id);
  return c.json({ ok: true, id, amountPence: sku.pence * quantity }, 201);
});


/* --------------------------------- team ---------------------------------- */

const INVITE_DAYS = 7;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const inviteCode = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => ALPHABET[b & 31]).join("");
const normaliseInvite = (raw) => String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function ownerOrg(c) {
  const me = hostUser(c);
  if (!me) return { error: needAccount(c) };
  const org = await ensureOrg(c.env.DB, me.id, ipOf(c));
  const m = await one(c.env.DB, "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?", org.id, me.id);
  return { me, org, role: m?.role || "owner" };
}

hostApp.get("/api/host/team", async (c) => {
  const { error, me, org, role } = await ownerOrg(c);
  if (error) return error;
  const db = c.env.DB;
  const members = await all(
    db,
    `SELECT m.user_id, m.role, u.recovery_email, u.created_at
     FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = ?
     ORDER BY (m.role = 'owner') DESC, u.created_at`,
    org.id
  );
  const invites = role === "owner"
    ? await all(db, "SELECT code, role, expires_at FROM org_invites WHERE org_id = ? AND expires_at > ? ORDER BY created_at DESC", org.id, now())
    : [];
  return c.json({
    role,
    members: members.map((m, i) => ({
      userId: m.user_id, role: m.role, you: m.user_id === me.id,
      label: m.recovery_email || `Member ${i + 1}`,
    })),
    invites: invites.map((i) => ({ code: i.code, role: i.role, expiresAt: i.expires_at })),
  });
});

hostApp.post("/api/host/team/invite", async (c) => {
  const { error, me, org, role } = await ownerOrg(c);
  if (error) return error;
  if (role !== "owner") return c.json({ error: "Only the owner can invite people." }, 403);
  const db = c.env.DB;
  const open = await one(db, "SELECT COUNT(*) AS n FROM org_invites WHERE org_id = ? AND expires_at > ?", org.id, now());
  if ((open?.n || 0) >= 5) return c.json({ error: "You already have 5 open invites. Wait for one to expire or be used." }, 429);
  const code = inviteCode();
  const ts = now();
  await run(db, "INSERT INTO org_invites (code, org_id, role, created_by, created_at, expires_at) VALUES (?, ?, 'staff', ?, ?, ?)",
    code, org.id, me.id, ts, ts + INVITE_DAYS * 864e5);
  return c.json({ code: code.slice(0, 4) + "-" + code.slice(4), expiresAt: ts + INVITE_DAYS * 864e5 }, 201);
});

hostApp.delete("/api/host/team/invite/:code", async (c) => {
  const { error, org, role } = await ownerOrg(c);
  if (error) return error;
  if (role !== "owner") return c.json({ error: "Only the owner can do that." }, 403);
  await run(c.env.DB, "DELETE FROM org_invites WHERE code = ? AND org_id = ?", normaliseInvite(c.req.param("code")), org.id);
  return c.json({ ok: true });
});

// A colleague with their own host account joins the owner's organisation.
hostApp.post("/api/host/team/join", async (c) => {
  const me = hostUser(c);
  if (!me) return needAccount(c);
  const db = c.env.DB;
  const b = await c.req.json().catch(() => ({}));
  const code = normaliseInvite(b.code);
  const inv = code.length === 8
    ? await one(db, "SELECT * FROM org_invites WHERE code = ? AND expires_at > ?", code, now())
    : null;
  if (!inv) return c.json({ error: "That invite isn't valid or has expired. Ask for a new one." }, 404);

  const mine = await one(
    db,
    `SELECT o.id FROM orgs o JOIN org_members m ON m.org_id = o.id WHERE m.user_id = ? AND m.role = 'owner'`,
    me.id
  );
  if (mine?.id === inv.org_id) return c.json({ error: "You're already in this organisation." }, 400);
  if (mine) {
    const ev = await one(db, "SELECT COUNT(*) AS n FROM events WHERE org_id = ?", mine.id);
    if ((ev?.n || 0) > 0) {
      return c.json({ error: "You already run events under your own organisation, so you can't switch. Ask the owner to share their account instead." }, 409);
    }
  }
  await db.batch([
    ...(mine ? [db.prepare("DELETE FROM orgs WHERE id = ?").bind(mine.id)] : []), // empty, unused org
    db.prepare("INSERT OR IGNORE INTO org_members (org_id, user_id, role) VALUES (?, ?, ?)").bind(inv.org_id, me.id, inv.role),
    db.prepare("DELETE FROM org_invites WHERE code = ?").bind(code),
  ]);
  return c.json({ ok: true });
});

hostApp.delete("/api/host/team/:userId", async (c) => {
  const { error, me, org, role } = await ownerOrg(c);
  if (error) return error;
  const target = c.req.param("userId");
  if (role !== "owner" && target !== me.id) return c.json({ error: "Only the owner can remove people." }, 403);
  const m = await one(c.env.DB, "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?", org.id, target);
  if (!m) return c.json({ error: "not found" }, 404);
  if (m.role === "owner") return c.json({ error: "The owner can't be removed." }, 400);
  await run(c.env.DB, "DELETE FROM org_members WHERE org_id = ? AND user_id = ?", org.id, target);
  return c.json({ ok: true });
});


/* ------------------------------ integrations ------------------------------ */
// Owner-only: one outbound webhook (signed) and one inbound API key per organisation.

async function ownerOnly(c) {
  const { error, org, role } = await ownerOrg(c);
  if (error) return { error };
  if (role !== "owner") return { error: c.json({ error: "Only the organisation owner can manage integrations." }, 403) };
  return { org };
}

hostApp.get("/api/host/integrations", async (c) => {
  const { error, org } = await ownerOnly(c);
  if (error) return error;
  const row = await one(c.env.DB, "SELECT webhook_url, webhook_secret, api_key_hash FROM org_integrations WHERE org_id = ?", org.id);
  return c.json({
    webhookUrl: row?.webhook_url || null,
    hasWebhook: !!row?.webhook_url,
    hasApiKey: !!row?.api_key_hash,
    rsvpEndpoint: new URL("/api/integrations/rsvp", c.req.url).toString(),
  });
});

hostApp.put("/api/host/integrations/webhook", async (c) => {
  const { error, org } = await ownerOnly(c);
  if (error) return error;
  const b = await c.req.json().catch(() => ({}));
  const url = validateWebhookUrl(b.url);
  if (!url) return c.json({ error: "Use a public https:// address (no IP addresses or local names)." }, 400);
  const secret = newWebhookSecret();
  await run(c.env.DB,
    `INSERT INTO org_integrations (org_id, webhook_url, webhook_secret, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(org_id) DO UPDATE SET webhook_url = excluded.webhook_url, webhook_secret = excluded.webhook_secret`,
    org.id, url, secret, now());
  return c.json({ ok: true, webhookUrl: url, secret }); // the secret is shown once
});

hostApp.delete("/api/host/integrations/webhook", async (c) => {
  const { error, org } = await ownerOnly(c);
  if (error) return error;
  await run(c.env.DB, "UPDATE org_integrations SET webhook_url = NULL, webhook_secret = NULL WHERE org_id = ?", org.id);
  return c.json({ ok: true });
});

hostApp.post("/api/host/integrations/webhook/test", async (c) => {
  const { error, org } = await ownerOnly(c);
  if (error) return error;
  if ((await bump(c.env.DB, `int:test:${org.id}`, 60 * 1000)) > 5) return c.json({ error: "Wait a minute before testing again." }, 429);
  const r = await sendWebhook(c.env.DB, org.id, "test", { message: "Hello from Lanyard", org: { id: org.id, name: org.name } });
  if (r.skipped) return c.json({ error: "Add a webhook address first." }, 400);
  return c.json({ ok: r.ok, status: r.status });
});

hostApp.post("/api/host/integrations/key", async (c) => {
  const { error, org } = await ownerOnly(c);
  if (error) return error;
  const key = newApiKey();
  await run(c.env.DB,
    `INSERT INTO org_integrations (org_id, api_key_hash, created_at) VALUES (?, ?, ?)
     ON CONFLICT(org_id) DO UPDATE SET api_key_hash = excluded.api_key_hash`,
    org.id, await sha256Hex(key), now());
  return c.json({ ok: true, key }); // shown once; only the hash is kept
});

hostApp.delete("/api/host/integrations/key", async (c) => {
  const { error, org } = await ownerOnly(c);
  if (error) return error;
  await run(c.env.DB, "UPDATE org_integrations SET api_key_hash = NULL WHERE org_id = ?", org.id);
  return c.json({ ok: true });
});
