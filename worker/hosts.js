// Host API: host accounts (F10: separate from attendee accounts, signed in by
// email code on the host site; see host-auth.js), organisations (with approval
// for societies and institutions), ownership transfers, tickets, events and
// billing. Hosts only ever see aggregates about attendees (D004), except an event's own list of who
// checked in, if the host switched it on, for people who left the tick on (D038, worker/attendance.js).
import { Hono } from "hono";
import { newId, now, one, all, run, uniqueCode, countJsonTerms, countAnswerTerms } from "./db.js";
import { TERMS_VERSION, hostTermsScope, logNoticeStmt } from "./legal.js";
import {
  HOST_SKUS, FREE_EVENTS_FOR_NEW_ORG, FREE_EVENT_DAYS, ORG_KINDS, NEEDS_APPROVAL, SOCIETY_FREE,
  checkinCapFor, skuAudience,
} from "./plans.js";
import { HttpError, sha256Hex } from "./session.js";
import { bump, DAY } from "./ratelimit.js";
import { sendMail, applicationEmail, teamInviteEmail, transferEmail } from "./mail.js";
import {
  sanitizeQuestions, eventInfo, questionsFor, summarize, closesAt, FEEDBACK_WINDOW_MS, MAX_HOST_QUESTIONS,
} from "./feedback.js";
import { validateWebhookUrl, newWebhookSecret, newApiKey, sendWebhook } from "./integrations.js";
import { readInstitution } from "./institutions.js";
import { normEmail, validEmail, emailProblem, moveOwnership, openTransfer } from "./hostorg.js";
import { exportAi } from "./ai/data.js";
import { summaryGet, summaryPost } from "./ai/feedbackSummary.js";
import { normPromo } from "./promo.js";
import { cleanTheme } from "../src/lib/eventthemes.js";
import { cleanInk, inkIn, inkReads, strapIn, INK_LOW } from "../src/lib/eventlook.js";
import { collectFields, collectOf, hostAttendees, attendeesCsv, attendeesFileName, exportAttendeeLists } from "./attendance.js";
// F60: the host sees two counts about suggestions, never a row (suggestCounts hides each under 3; D004, D054).
import { suggestCounts } from "./suggest.js";
import { registerHostPromo, releaseHeldClaims, heldClaims, exportHostClaims } from "./host-promo.js";
import { registerDropsHost } from "./dropsHost.js";
// F66 (D061): company branding (worker/branding.js): the owner's settings, and the brand on a paid event's pages.
import { registerBrandHost, brandSettings, eventBrand } from "./branding.js";
import { exportHostDrops } from "./dropsKeep.js";
import { billingOn, productFor, checkoutReady } from "./billing/provider.js";
import { offResponse, checkoutBody, startCheckout, billingInfo, exportBillingOrders } from "./billing/routes.js";
import { hostGuard, hostOrigin, requireHost, setupStep, startSignIn, verifySignIn, endHostSession, listHostSessions, signOutHostDevice, signOutOtherHosts } from "./host-auth.js";

export const hostApp = new Hono();

// Every /api/host/* call: host site only, from its own pages, host cookie only.
hostApp.use("/api/host/*", hostGuard);

// Signing in and out needs no account. Everything else needs a signed-in host
// account, and until setup is done (details, then the Host Terms) only the
// setup routes work.
const OPEN = new Set(["/api/host/auth/start", "/api/host/auth/verify", "/api/host/logout"]);
const SETUP = new Set(["/api/host/me", "/api/host/account/details", "/api/host/terms", "/api/host/sessions",
  "/api/host/sessions/signout-others", "/api/host/account/export"]);
hostApp.use("/api/host/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  // F40: the voucher scanner link needs no account: the token in the address is the key (worker/voucherScan.js).
  if (OPEN.has(path) || path.startsWith("/api/host/scan/")) return next();
  const me = requireHost(c);
  if (!SETUP.has(path) && !path.startsWith("/api/host/sessions/")) {
    const step = setupStep(me);
    if (step === "details") return c.json({ error: "Add your name and a few details to finish your host account.", code: "details_required" }, 403);
    if (step === "terms") return c.json({ error: "Please accept the Host Terms to continue.", code: "terms_required" }, 403);
  }
  return next();
});

hostApp.post("/api/host/auth/start", startSignIn);
hostApp.post("/api/host/auth/verify", verifySignIn);
hostApp.post("/api/host/logout", async (c) => {
  await endHostSession(c);
  return c.json({ ok: true });
});

const text = (v, n) => String(v || "").trim().slice(0, n);

// Setup step 1: who they are and a short survey. Saved on the account, so a
// refresh or another device carries on from the next step. Editable later.
hostApp.post("/api/host/account/details", async (c) => {
  const me = c.get("host");
  const b = await c.req.json().catch(() => ({}));
  const fullName = text(b.fullName, 80);
  const sv = b.survey && typeof b.survey === "object" ? b.survey : {};
  const useCase = text(sv.useCase, 600);
  const frequency = text(sv.frequency, 40);
  if (fullName.length < 2) return c.json({ error: "Add your full name." }, 400);
  if (!useCase) return c.json({ error: "Tell us what you plan to use Lanyard for." }, 400);
  if (!frequency) return c.json({ error: "Tell us how often you run events." }, 400);
  await run(c.env.DB,
    "UPDATE host_accounts SET full_name = ?, use_case = ?, event_frequency = ?, typical_size = ?, referral = ? WHERE id = ?",
    fullName, useCase, frequency, text(sv.size, 40), text(sv.referral, 200), me.id);
  return c.json({ ok: true });
});

// Setup step 2: the Host Terms (and the current Privacy Policy), recorded on the
// host account and in the consent history. Asked again when the version changes.
hostApp.post("/api/host/terms", async (c) => {
  const me = c.get("host");
  if (setupStep(me) === "details") return c.json({ error: "Add your name and a few details first.", code: "details_required" }, 403);
  const b = await c.req.json().catch(() => ({}));
  if (b.accept !== true) return c.json({ error: "Please agree to the Host Terms to continue.", code: "terms_required" }, 400);
  const db = c.env.DB;
  await db.batch([
    db.prepare("UPDATE host_accounts SET terms_version = ?, terms_at = ? WHERE id = ?").bind(TERMS_VERSION, now(), me.id),
    logNoticeStmt(db, me.id, hostTermsScope(), "host", "host_account"), // F51: by pressing Agree and continue under the line
  ]);
  return c.json({ ok: true });
});

hostApp.get("/api/host/sessions", listHostSessions);
hostApp.post("/api/host/sessions/signout-others", signOutOtherHosts);
hostApp.delete("/api/host/sessions/:id", signOutHostDevice);

// A copy of what we hold about this host account (UK GDPR right of access).
hostApp.get("/api/host/account/export", async (c) => {
  const me = c.get("host");
  const db = c.env.DB;
  const q = (sql, ...a) => all(db, sql, ...a);
  const [orgs, tickets, transfers, billing, consents, sessions, promoClaims, attendeeLists, drops, cardOrders] = await Promise.all([
    q(`SELECT o.id, o.name, o.org_type, o.university, o.institution_id, m.role, o.brand_name, (o.brand_logo_key IS NOT NULL) AS brand_logo FROM host_org_members m JOIN orgs o ON o.id = m.org_id WHERE m.host_account_id = ?`, me.id),
    q("SELECT kind, new_email, message, status, admin_note, created_at, resolved_at FROM host_org_tickets WHERE host_account_id = ?", me.id),
    q("SELECT org_id, to_email, status, created_at, resolved_at FROM host_org_transfers WHERE from_host_id = ? OR to_host_id = ?", me.id, me.id),
    q("SELECT org_name, sku, quantity, amount_pence, contact_email, po_number, note, status, created_at FROM billing_requests WHERE host_account_id = ?", me.id),
    q("SELECT scope, action, at FROM consent_log WHERE user_id = ? AND ref = 'host_account' ORDER BY at", me.id),
    q("SELECT created_at, expires_at, user_agent FROM host_sessions WHERE host_account_id = ?", me.id),
    exportHostClaims(db, me.id), // F20: promo codes claimed, and the credits they gave
    exportAttendeeLists(db, me.id), // F31: the lists of who checked in that this host's organisations keep (events with the list on only)
    exportHostDrops(db, me.id), // F32: their drops and counts, never an item
    exportBillingOrders(db, "host", me.id), // F36: card orders this host started
  ]);
  return c.json({
    exportedAt: now(),
    note: "Session tokens and sign-in codes are not included for security.",
    hostAccount: {
      email: me.email, fullName: me.full_name, useCase: me.use_case, frequency: me.event_frequency, size: me.typical_size,
      referral: me.referral, termsVersion: me.terms_version, termsAt: me.terms_at, createdAt: me.created_at, lastLoginAt: me.last_login_at,
    },
    organisations: orgs, tickets, transfers, billingRequests: billing, promoCodes: promoClaims, consentHistory: consents, devices: sessions,
    ...(attendeeLists.length ? { attendeeLists } : {}),
    ...(cardOrders.length ? { cardOrders } : {}), // F36: only for a host who started a card payment
    ...(drops ? { drops } : {}),
    ai: await exportAi(db, "host", me.id), // F21
  });
});

// Check-in caps are per organisation type (see checkinCapFor in plans.js):
// societies are held to a hard limit at the door, everyone else is nudged.

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

// The account's organisation, if it has one. One organisation per account.
function findOrg(db, userId) {
  return one(
    db,
    `SELECT o.* FROM orgs o JOIN host_org_members m ON m.org_id = o.id
     WHERE m.host_account_id = ? ORDER BY (m.role = 'owner') DESC, o.created_at LIMIT 1`,
    userId
  );
}
async function requireOrg(db, userId) {
  const org = await findOrg(db, userId);
  if (!org) throw new HttpError(409, "Create or join an organisation first.", "no_org");
  return org;
}

// F20: promo codes for event credits (host-promo.js): /api/host/redeem/:code.
registerHostPromo(hostApp, { findOrg, normCode: normPromo });
// F66: /api/host/orgs/:id/brand (name, logo upload and remove). The owner changes them; any member reads them.
registerBrandHost(hostApp, { findOrg });

// Societies and institutions can't run events until an admin approves them.
function assertApproved(org) {
  if (org.verification_status === "approved") return;
  if (org.verification_status === "rejected") {
    throw new HttpError(403, `Your application wasn't approved${org.review_note ? `: ${org.review_note}` : "."} Open a ticket if you think that's a mistake.`, "not_approved");
  }
  throw new HttpError(403, "Your application is being reviewed. You can create events as soon as it's approved.", "not_approved");
}

const orgJson = (org) => ({
  id: org.id, name: org.name, plan: org.plan, status: org.verification_status, type: org.org_type,
  billingEmail: org.billing_email || null, leaderName: org.leader_name || null, leaderEmail: org.leader_email || null,
  orgLink: org.org_link || null, university: org.university || null, institutionId: org.institution_id || null, reviewNote: org.review_note || null,
  appliedAt: org.applied_at || null,
});

// F64 (D056): what a new event's switches and "What this event collects" start as on the Create form: as on the
// organisation's most recently created event (events are only ever removed outright, so every row here is live),
// or the fixed defaults when it has none. Only these seven values; nothing about anyone who came.
// The fixed defaults are the same as blankForm() in src/lib/eventsteps.js.
export const EVENT_DEFAULTS = Object.freeze({ directoryOn: true, suggestOn: true, feedbackOn: true, collectOn: false, collectEmail: false, collectCard: false, collectWhy: "" });
async function eventDefaults(db, orgId) {
  const ev = await one(db,
    `SELECT directory_on, suggest_on, feedback_on, collect_attendance, collect_items, collect_why FROM events
     WHERE org_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`, orgId);
  if (!ev) return { ...EVENT_DEFAULTS };
  const c = collectOf(ev);
  return {
    directoryOn: !!ev.directory_on, suggestOn: ev.suggest_on !== 0, feedbackOn: !!ev.feedback_on,
    collectOn: !!c, collectEmail: !!c?.items.includes("email"), collectCard: !!c?.items.includes("card"), collectWhy: c?.why || "",
  };
}

const accountJson = (a) => ({
  email: a.email, fullName: a.full_name || "", useCase: a.use_case || "", frequency: a.event_frequency || "",
  size: a.typical_size || "", referral: a.referral || "", termsAccepted: a.terms_version === TERMS_VERSION,
});

// Who is signed in and where setup is: step is details, terms, org (no
// organisation yet) or ready. The page shows the step the server says, so a
// refresh or another device resumes at the right place.
hostApp.get("/api/host/me", async (c) => {
  const me = c.get("host");
  const db = c.env.DB;
  const account = accountJson(me);
  const setup = setupStep(me);
  if (setup) return c.json({ step: setup, account, org: null, role: null, pendingTransfers: [], events: [] });
  const org = await findOrg(db, me.id);
  const incoming = await all(
    db,
    `SELECT t.id, t.created_at, o.name AS org_name, o.org_type, a.full_name AS from_name
     FROM host_org_transfers t JOIN orgs o ON o.id = t.org_id
     LEFT JOIN host_accounts a ON a.id = t.from_host_id
     WHERE t.to_host_id = ? AND t.status = 'pending' ORDER BY t.created_at DESC`,
    me.id
  );
  const pendingTransfers = incoming.map((t) => ({ id: t.id, orgName: t.org_name, orgType: t.org_type, fromName: t.from_name || null, at: t.created_at }));
  if (!org) {
    return c.json({
      step: "org", role: null, account, org: null, pendingTransfers,
      credits: { granted: 0, used: 0, remaining: 0, nextExpiry: null }, events: [],
      limits: { freePerWeek: 0, checkinCap: checkinCapFor("individual") },
    });
  }
  const events = await all(
    db,
    "SELECT * FROM events WHERE org_id = ? ORDER BY starts_at DESC, created_at DESC",
    org.id
  );
  const membership = await one(db, "SELECT role FROM host_org_members WHERE org_id = ? AND host_account_id = ?", org.id, me.id);
  const society = org.org_type === "society";
  const usedThisWeek = society
    ? (await one(db, "SELECT COUNT(*) AS n FROM events WHERE org_id = ? AND created_at > ?", org.id, now() - 7 * DAY))?.n || 0
    : 0;
  return c.json({
    step: "ready",
    now: now(), // F68: the server's clock, so the list's In progress, Upcoming and Ended agree with the attendees' lists
    role: membership?.role || "owner",
    account, pendingTransfers,
    org: orgJson(org),
    credits: await creditSummary(db, org.id),
    limits: {
      freePerWeek: society ? SOCIETY_FREE.eventsPerWeek : 0,
      freeLeftThisWeek: society ? Math.max(0, SOCIETY_FREE.eventsPerWeek - usedThisWeek) : 0,
      checkinCap: checkinCapFor(org.org_type),
    },
    events: events.map((e) => ({
      id: e.id, code: e.code, name: e.name, startsAt: e.starts_at,
      venue: e.venue, theme: e.theme, strapColor: e.strap_color,
      perks: e.perks || [], directoryOn: !!e.directory_on, isPaid: !!e.is_paid,
      endsAt: e.ends_at || null, ended: !!e.ended_at, endedAt: e.ended_at || null, rsvpCount: e.rsvp_count ?? null,
      info: eventInfo(e.info), feedbackOn: !!e.feedback_on,
      useBranding: e.use_branding !== 0, // F66: the event's own switch; branding shows only when isPaid is true too
    })),
    // F64: where a fresh Create event form starts (the latest event's seven settings, or the fixed defaults).
    eventDefaults: await eventDefaults(db, org.id),
    // F66: the organisation's own branding settings, for the Branding section and the per-event switch.
    brand: brandSettings(org, membership?.role || "owner"),
  });
});

// Create the account's organisation, or run events under the host's own name
// ("individual"). Societies and institutions apply and wait for an admin.
hostApp.post("/api/host/orgs", async (c) => {
  const me = c.get("host");
  const db = c.env.DB;
  const profile = me; // full_name and email live on the host account
  if (await findOrg(db, me.id)) return c.json({ error: "Your account already has an organisation.", code: "has_org" }, 409);
  const b = await c.req.json().catch(() => ({}));
  const kind = b.kind;
  if (!ORG_KINDS.includes(kind)) return c.json({ error: "Choose what kind of organisation this is." }, 400);

  const name = kind === "individual" ? profile.full_name : text(b.name, 100);
  if (!name) return c.json({ error: kind === "society" ? "Add your society's name." : "Add your organisation's name." }, 400);
  const problem = emailProblem(kind, profile.email);
  if (problem) return c.json({ error: problem, code: "email_not_eligible" }, 400);

  const pick = readInstitution(b);
  if (pick.error) return c.json({ error: pick.error }, 400);
  let leaderName = null, orgLink = null, university = null, institutionId = null;
  if (NEEDS_APPROVAL.has(kind)) {
    leaderName = text(b.leaderName, 80);
    orgLink = text(b.orgLink, 300);
    university = text(b.university, 120);
    if (pick.inst) { university = pick.inst.name; institutionId = pick.inst.id; }
    if (leaderName.length < 2) return c.json({ error: "Add the leader's full name." }, 400);
    if (!/^https?:\/\/\S+\.\S+/.test(orgLink)) return c.json({ error: `Add a link to your ${kind === "society" ? "society's page (union listing, website or social page)" : "institution's website"}, starting with https://` }, 400);
    if (kind === "society" && !university) return c.json({ error: "Add your university." }, 400);
  }

  const id = newId();
  const ts = now();
  const approved = !NEEDS_APPROVAL.has(kind);
  // A starter allowance for companies and individuals. Societies have a free
  // weekly allowance instead; institutions buy discounted packs.
  const starter = (kind === "company" || kind === "individual")
    && (await bump(db, `day:org:ip:${ipOf(c)}`, DAY)) <= STARTER_ORGS_PER_IP_PER_DAY;
  await db.batch([
    db.prepare(
      `INSERT INTO orgs (id, name, plan, org_type, verification_status, billing_email, leader_name, leader_email, org_link, university, institution_id, applied_at, reviewed_at, created_at)
       VALUES (?, ?, 'starter', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, name, kind, approved ? "approved" : "pending", profile.email, leaderName || profile.full_name, profile.email,
      orgLink, university, institutionId, approved ? null : ts, approved ? ts : null, ts),
    db.prepare("INSERT INTO host_org_members (org_id, host_account_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(id, me.id, ts),
    ...(starter ? [db.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, expires_at, reason, granted_by, created_at) VALUES (?, ?, ?, 0, ?, 'starter', 'self-serve', ?)")
      .bind(newId(), id, FREE_EVENTS_FOR_NEW_ORG, ts + FREE_EVENT_DAYS * 864e5, ts)] : []),
  ]);
  if (!approved) {
    await sendMail(c.env, "decisions", { to: profile.email, ...applicationEmail({ orgName: name, origin: hostOrigin(c.env, c) }) })
      .catch((e) => console.error(e));
  }
  return c.json({ ok: true, id, status: approved ? "approved" : "pending" }, 201);
});

// Small edits to the organisation. Its type and a society's identity are fixed
// once created; changing them goes through a ticket.
hostApp.post("/api/host/org", async (c) => {
  const me = c.get("host");
  const org = await requireOrg(c.env.DB, me.id);
  const m = await one(c.env.DB, "SELECT role FROM host_org_members WHERE org_id = ? AND host_account_id = ?", org.id, me.id);
  if (m?.role !== "owner") return c.json({ error: "Only the owner can change this. Ask them to do it." }, 403);
  const b = await c.req.json().catch(() => ({}));
  const email = normEmail(b.billingEmail);
  if (email && !validEmail(email)) return c.json({ error: "That email doesn't look right. Check it and try again." }, 400);
  const open = org.org_type === "company";
  const name = open && String(b.name || "").trim() ? String(b.name).trim().slice(0, 100) : org.name;
  await run(c.env.DB, "UPDATE orgs SET name = ?, billing_email = COALESCE(NULLIF(?, ''), billing_email) WHERE id = ?", name, email, org.id);
  return c.json({ ok: true });
});

// Cleans the editable event fields. `partial` = only what was sent (for edits).
// F65: `base` is the saved event row on an edit, so a request that changes only the theme or the colour is still checked
// against the text colour the event already has.
function eventFields(b, { partial = false, base = null } = {}) {
  const f = {};
  const has = (k) => !partial || b[k] !== undefined;
  const time = (v) => (v === null || v === "" ? null : Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
  if (has("name")) f.name = String(b.name || "").trim().slice(0, 120);
  if (has("startsAt")) f.starts_at = time(b.startsAt);
  if (has("endsAt")) f.ends_at = time(b.endsAt);
  if (has("venue")) f.venue = String(b.venue || "").slice(0, 120);
  if (has("theme")) f.theme = cleanTheme(b.theme); // F65 (D060): the exact ids in src/lib/eventthemes.js, else default
  if (has("strapColor")) f.strap_color = /^#[0-9a-fA-F]{6}$/.test(b.strapColor || "") ? b.strapColor : null;
  // F65: the words on the strap: Automatic (null) or one of two exact colours, and the one chosen has to read (4.5:1) on the
  // strap in effect after this save. Automatic always reads, so a brand colour on its own is never refused.
  if (has("strapInk")) f.strap_ink = cleanInk(b.strapInk);
  if ("strap_ink" in f || "strap_color" in f || "theme" in f) {
    const ink = "strap_ink" in f ? f.strap_ink : base?.strap_ink;
    const strap = strapIn("theme" in f ? f.theme : base?.theme, "strap_color" in f ? f.strap_color : base?.strap_color);
    if (ink && !inkReads(ink, strap)) throw new HttpError(400, INK_LOW, "ink_low");
  }
  if (has("perks")) f.perks = JSON.stringify(Array.isArray(b.perks) ? b.perks.slice(0, 10).map((x) => String(x).slice(0, 300)) : []);
  if (has("directoryOn")) f.directory_on = b.directoryOn === false ? 0 : 1;
  // F60: "Suggest people to each other", on unless the host switches it off.
  if (has("suggestOn")) f.suggest_on = b.suggestOn === false ? 0 : 1;
  if (has("info")) f.info = JSON.stringify(eventInfo(b.info));
  if (has("rsvpCount")) {
    // Empty clears it; otherwise a whole number from 0 to 100,000, or 400 (F35.7).
    const n = b.rsvpCount;
    if (n === null || n === "" || n === undefined) f.rsvp_count = null;
    else if (Number.isInteger(n) && n >= 0 && n <= 100000) f.rsvp_count = n;
    else throw new HttpError(400, "Sign-ups so far must be a whole number, or empty.", "bad_rsvp");
  }
  if (has("feedbackOn")) f.feedback_on = b.feedbackOn === false ? 0 : 1;
  // F66: "Use our company branding", on unless switched off. It shows only on a paid event (is_paid, set by the credit).
  if (has("useBranding")) f.use_branding = b.useBranding === false ? 0 : 1;
  if (has("feedbackQuestions")) f.feedback_questions = JSON.stringify(sanitizeQuestions(b.feedbackQuestions));
  if (f.ends_at && f.starts_at && f.ends_at <= f.starts_at) throw new HttpError(400, "The end time must be after the start.");
  // F31: what the event collects. Only when the request says something about it; off otherwise.
  Object.assign(f, collectFields(b.collect));
  return f;
}

function checkinQuestions(list) {
  return (Array.isArray(list) ? list : []).slice(0, 3)
    .map((q) => ({ key: String(q.key || "").replace(/[^a-z0-9_]/gi, "").slice(0, 24), label: String(q.label || "").slice(0, 60) }))
    .filter((q) => q.key && q.label);
}

const noCredits = (society) => new HttpError(402, society
  ? `Your free event for this week is used (societies get ${SOCIETY_FREE.eventsPerWeek} a week). Buy an event pack from Billing for more.`
  : "No event credits left. Buy more from Billing.", "no_credits");

// One credit per event, spent from the credits that expire soonest.
async function insertEvent(db, org, fields, questions) {
  assertApproved(org);
  // A student society's first event in any 7 days is free. Beyond that it
  // spends a credit like everyone else.
  const society = org.org_type === "society";
  const freeWeek = society
    && !(await one(db, "SELECT 1 AS x FROM events WHERE org_id = ? AND created_at > ?", org.id, now() - 7 * DAY));
  if (!freeWeek && (await creditSummary(db, org.id)).remaining <= 0) throw noCredits(society);
  const id = newId();
  const code = await uniqueCode(db, "events", 5);
  const ts = now();
  const cols = { ...fields, id, org_id: org.id, code, checkin_questions: JSON.stringify(questions), is_paid: 0, created_at: ts };
  // The checks above are for a quick answer; the real rule is this one transaction (F35.2), so
  // Create pressed many times at once can never make more events than there are credits. The event
  // goes in only if, at that moment, the society's free week is still free or a credit has room;
  // the credit is spent only if the event went in and was not the free one.
  const freeWeekNow = society ? "NOT EXISTS (SELECT 1 FROM events WHERE org_id = ? AND created_at > ? AND id != ?)" : "0";
  const freeArgs = society ? [org.id, ts - 7 * DAY, id] : [];
  const creditLeft = "SELECT id FROM credits WHERE org_id = ? AND events_used < events_granted AND (expires_at IS NULL OR expires_at > ?)";
  // F66: an event is paid (events.is_paid) when it spends a credit, which is every event except a society's free one of the week,
  // worked out in the same statement by the same rule as the credit below. Only a paid event shows company branding (D061).
  const keys = Object.keys(cols);
  const picks = keys.map((k) => (k === "is_paid" ? `CASE WHEN ${freeWeekNow} THEN 0 ELSE 1 END` : "?"));
  const values = keys.flatMap((k) => (k === "is_paid" ? freeArgs : [cols[k]]));
  const out = await db.batch([
    db.prepare(`INSERT INTO events (${keys.join(", ")}) SELECT ${picks.join(", ")}
                WHERE ${freeWeekNow} OR EXISTS (${creditLeft})`).bind(...values, ...freeArgs, org.id, ts),
    db.prepare(
      `UPDATE credits SET events_used = events_used + 1 WHERE id = (
         ${creditLeft} ORDER BY COALESCE(expires_at, 9007199254740991) LIMIT 1)
       AND EXISTS (SELECT 1 FROM events WHERE id = ?) AND NOT (${freeWeekNow})`
    ).bind(org.id, ts, id, ...freeArgs),
  ]);
  if (!out[0]?.meta?.changes) throw noCredits(society);
  return { id, code };
}

hostApp.post("/api/host/events", async (c) => {
  const me = c.get("host");
  const db = c.env.DB;
  const org = await requireOrg(db, me.id);
  const b = await c.req.json().catch(() => ({}));
  const fields = eventFields(b);
  if (!fields.name) return c.json({ error: "Add a name for the event." }, 400);
  const { id, code } = await insertEvent(db, org, fields, checkinQuestions(b.questions));
  return c.json({ ok: true, id, code }, 201);
});

// An event in one of my organisations, or a 404.
async function hostEvent(c, me, id = c.req.param("id")) {
  const ev = await one(
    c.env.DB,
    `SELECT e.* FROM events e JOIN host_org_members m ON m.org_id = e.org_id WHERE e.id = ? AND m.host_account_id = ?`,
    id, me.id
  );
  if (!ev) throw new HttpError(404, "We couldn't find that event. Reload the page and try again.");
  return ev;
}

// F32: drops for codes, keys and vouchers (worker/dropsHost.js): the same guards, the same event rule.
registerDropsHost(hostApp, hostEvent);

// Edit an event's details (not its join code or credit).
hostApp.put("/api/host/events/:id", async (c) => {
  const me = c.get("host");
  const ev = await hostEvent(c, me);
  const b = await c.req.json().catch(() => ({}));
  delete b.feedbackQuestions; // edited through /feedback, which enforces the lock
  const f = eventFields(b, { partial: true, base: ev });
  if ("name" in f && !f.name) return c.json({ error: "Add a name for the event." }, 400);
  const start = "starts_at" in f ? f.starts_at : ev.starts_at;
  const end = "ends_at" in f ? f.ends_at : ev.ends_at;
  if (start && end && end <= start) return c.json({ error: "The end time must be after the start." }, 400);
  const keys = Object.keys(f);
  if (keys.length) {
    await run(c.env.DB, `UPDATE events SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, ...Object.values(f), ev.id);
    // F31: switching the list off deletes the list so far (D038).
    if (f.collect_attendance === 0) await run(c.env.DB, "DELETE FROM event_attendees WHERE event_id = ?", ev.id);
  }
  return c.json({ ok: true });
});

// Start from a past event: same details, questions, feedback form and sponsors; new code, uses a credit.
hostApp.post("/api/host/events/:id/duplicate", async (c) => {
  const me = c.get("host");
  const db = c.env.DB;
  const src = await hostEvent(c, me);
  const org = await one(db, "SELECT * FROM orgs WHERE id = ?", src.org_id);
  const b = await c.req.json().catch(() => ({}));
  const fields = {
    name: String(b.name || src.name).trim().slice(0, 120),
    starts_at: Number.isFinite(Number(b.startsAt)) && b.startsAt ? Math.round(Number(b.startsAt)) : null,
    ends_at: Number.isFinite(Number(b.endsAt)) && b.endsAt ? Math.round(Number(b.endsAt)) : null,
    venue: src.venue, theme: src.theme, strap_color: src.strap_color, strap_ink: src.strap_ink ?? null,
    perks: JSON.stringify(src.perks || []), directory_on: src.directory_on, suggest_on: src.suggest_on ?? 1,
    info: JSON.stringify(eventInfo(src.info)), feedback_on: src.feedback_on, use_branding: src.use_branding ?? 1, // F66
    feedback_questions: JSON.stringify(sanitizeQuestions(src.feedback_questions)),
    // F31: the earlier event's list settings are never copied; the host chooses again (D038).
    ...collectFields(b.collect),
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
  const me = c.get("host");
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
       (SELECT COUNT(*) FROM event_connections WHERE event_id = ?) connections,
       (SELECT COUNT(*) FROM event_connections ec JOIN connections cn ON cn.id = ec.connection_id WHERE ec.event_id = ? AND cn.selfie_key IS NOT NULL AND cn.consent_b = 1) selfies,
       (SELECT COUNT(*) FROM feedback_responses WHERE event_id = ?) feedback,
       (SELECT presence_used FROM events WHERE id = ?) presence`,
    eventId, eventId, eventId, eventId, eventId
  );
}

// Feedback form: read the host questions and results; edit until the first answer arrives.
hostApp.get("/api/host/events/:id/feedback", async (c) => {
  const me = c.get("host");
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
  const me = c.get("host");
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

// F23: the AI summary of the written feedback (worker/ai/feedbackSummary.js). Same event rule as every route here.
hostApp.get("/api/host/events/:id/feedback/summary", async (c) => {
  const me = c.get("host");
  return summaryGet(c, await hostEvent(c, me), me);
});
hostApp.post("/api/host/events/:id/feedback/summary", async (c) => {
  const me = c.get("host");
  return summaryPost(c, await hostEvent(c, me), me);
});

// Live screen: check-in count + connections so far (aggregate only).
hostApp.get("/api/host/events/:id/live", async (c) => {
  const me = c.get("host");
  const ev = await hostEvent(c, me);
  const t = await eventTotals(c.env.DB, ev.id);
  const orgRow = await one(c.env.DB, "SELECT name, org_type FROM orgs WHERE id = ?", ev.org_id);
  const EVENT_CHECKIN_CAP = checkinCapFor(orgRow?.org_type);
  // F18: what the host set up, so the Details tab can preview the attendee page. All of it is the host's
  // own entry; sponsors are names and perks they typed, with no attendee in it.
  const sponsors = await all(c.env.DB, "SELECT id, name, perk FROM sponsors WHERE event_id = ?", ev.id);
  const brand = await eventBrand(c.env.DB, ev);
  return c.json({
    event: {
      id: ev.id, code: ev.code, name: ev.name, startsAt: ev.starts_at, venue: ev.venue,
      endsAt: ev.ends_at || null, endedAt: ev.ended_at || null, rsvpCount: ev.rsvp_count ?? null,
      info: eventInfo(ev.info), feedbackOn: !!ev.feedback_on,
      theme: ev.theme, strapColor: ev.strap_color, strapInk: inkIn(ev), strapInkChoice: ev.strap_ink || null, perks: ev.perks || [], directoryOn: !!ev.directory_on,
      questions: ev.checkin_questions || [],
      // F31: what this event collects. Present only when the list is on, so an event without it
      // answers exactly as before.
      ...(collectOf(ev) ? { collect: { ...collectOf(ev), organiser: orgRow?.name || "" } } : {}),
      // F60: present only when the host switched suggestions off.
      ...(ev.suggest_on ? {} : { suggestOn: false }),
    },
    // F66 (D061): the organisation's name and logo for Present, the poster and the preview: a paid event with branding on only.
    ...(brand ? { brand } : {}),
    sponsors: sponsors.map((x) => ({ id: x.id, name: x.name, perk: x.perk })),
    checkins: t.checkins,
    connections: t.connections,
    selfies: t.selfies,
    feedback: t.feedback,
    // F17: how many people used "Be easy to find". A count only, hidden under 3 so it cannot point at anyone (D004).
    presenceUsed: t.presence >= 3 ? t.presence : null,
    // F60: how many wrote what they hope to get from the event, and how many unticked Suggest me. Counts only, each null under 3.
    suggestions: await suggestCounts(c.env.DB, ev.id),
    cap: EVENT_CHECKIN_CAP,
    overCap: t.checkins > EVENT_CHECKIN_CAP,
  });
});

// F31: the list of who checked in, for an event of this host's organisation that has it switched on
// (D038). 404 for anyone else's event and for one without the list: the host sees nothing there.
// It names only people who are on the list, with only what each of them left ticked.
hostApp.get("/api/host/events/:id/attendees", async (c) => {
  const ev = await hostEvent(c, c.get("host"));
  const list = await hostAttendees(c.env.DB, ev);
  if (!list) return c.json({ error: "This event does not keep a list of who checked in.", code: "list_off" }, 404);
  return c.json(list, 200, { "cache-control": "no-store" });
});

hostApp.get("/api/host/events/:id/attendees.csv", async (c) => {
  const ev = await hostEvent(c, c.get("host"));
  const list = await hostAttendees(c.env.DB, ev);
  if (!list) return c.json({ error: "This event does not keep a list of who checked in.", code: "list_off" }, 404);
  return new Response(attendeesCsv(list), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${attendeesFileName(ev.name)}"`,
      "cache-control": "no-store",
    },
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
    totals: { ...totals, presence: totals.presence >= minBucket ? totals.presence : null },
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
  const me = c.get("host");
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
  const me = c.get("host");
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
  if (r.totals.presence !== null) add("Totals", "People who used Be easy to find", r.totals.presence);
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
  const me = c.get("host");
  const db = c.env.DB;
  const ev = await one(
    db,
    `SELECT e.id FROM events e JOIN host_org_members m ON m.org_id = e.org_id
     WHERE e.id = ? AND m.host_account_id = ?`,
    c.req.param("id"), me.id
  );
  if (!ev) return c.json({ error: "We couldn't find that event. Reload the page and try again." }, 404);
  const code = await uniqueCode(db, "events", 5);
  await run(db, "UPDATE events SET code = ? WHERE id = ?", code, ev.id);
  return c.json({ ok: true, code });
});

/* -------------------------------- billing --------------------------------- */
// Invoice / purchase-order first: student societies pay through union finance,
// and card payments (Stripe Checkout) come later behind the same SKUs. A
// request is recorded here; once paid, credits are granted (see DEPLOY notes).

hostApp.get("/api/host/billing", async (c) => {
  const me = c.get("host");
  const db = c.env.DB;
  const org = await requireOrg(db, me.id);
  // A promo claim held for approval is issued as soon as the organisation is approved (the admin
  // approval does it; this is the safety net if that step was interrupted).
  if (org.verification_status === "approved") await releaseHeldClaims(db, org.id);
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
  const audience = skuAudience(org.org_type);
  return c.json({
    org: orgJson(org),
    freeTier: org.org_type === "society" ? SOCIETY_FREE : null,
    credits,
    heldPromos: await heldClaims(db, org.id),
    ledger: ledger.map((r) => ({
      id: r.id, granted: r.events_granted, used: r.events_used,
      expiresAt: r.expires_at, reason: r.reason, at: r.created_at,
    })),
    skus: Object.entries(HOST_SKUS)
      .filter(([, v]) => v.audience === audience)
      .map(([id, v]) => ({ id, label: v.label, credits: v.credits, days: v.days, pence: v.pence, card: !!productFor(id) && checkoutReady(c.env, id) })),
    quotes: Object.entries(HOST_SKUS)
      .filter(([, v]) => v.audience === "quote")
      .map(([id, v]) => ({ id, label: v.label })),
    audience,
    requests: requests.map((r) => ({
      id: r.id, sku: r.sku, quantity: r.quantity, amountPence: r.amount_pence,
      status: r.status, po: r.po_number, at: r.created_at,
    })),
    cap: checkinCapFor(org.org_type),
    ...billingInfo(c.env), // F36: whether Pay by card is offered, and who sells it
  });
});

// F36: pay for a pack by card through the provider (off unless BILLING_ENABLED = "1"). The browser
// sends our pack id and the express-start tick; the price and the provider's product come from
// our own table, and the credits are added only by the provider's verified webhook.
hostApp.post("/api/host/billing/checkout", async (c) => {
  if (!billingOn(c.env)) return offResponse(c);
  const me = requireHost(c);
  const db = c.env.DB;
  const org = await requireOrg(db, me.id);
  assertApproved(org);
  const b = await c.req.json().catch(() => ({}));
  const product = checkoutBody(b && typeof b === "object" ? b : {}, "credits");
  if (product.audience !== skuAudience(org.org_type)) return c.json({ error: "That isn't something you can buy here.", code: "unknown_product" }, 400);
  if (!checkoutReady(c.env, product.id)) return offResponse(c);
  if ((await bump(db, `bill:co:org:${org.id}`, 60 * 60 * 1000)) > 10) throw new HttpError(429, "That's a lot of tries. Wait a little and try again.", "throttled");
  return startCheckout(c, product, { orgId: org.id, orgName: org.name, hostAccountId: me.id, externalId: `o_${org.id}`, email: org.billing_email || me.email },
    `${new URL(c.req.url).origin}/billing?checkout=done`);
});

hostApp.post("/api/host/billing/request", async (c) => {
  const me = c.get("host");
  const db = c.env.DB;
  const org = await requireOrg(db, me.id);
  assertApproved(org);
  const b = await c.req.json().catch(() => ({}));
  const sku = HOST_SKUS[b.sku];
  const audience = skuAudience(org.org_type);
  if (!sku || (sku.audience !== audience && sku.audience !== "quote")) {
    return c.json({ error: "That option isn't available for your organisation. Choose another." }, 400);
  }
  if (sku.audience === "quote" && !String(b.note || "").trim()) {
    return c.json({ error: "Tell us a little about your organisation and events so we can send a quote." }, 400);
  }
  // A whole number from 1 to 20, or left out for 1. Anything else is refused, never bent into range (F35.7).
  const quantity = b.quantity === undefined ? 1 : b.quantity;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return c.json({ error: "Quantity must be a whole number from 1 to 20.", code: "bad_quantity" }, 400);
  const email = String(b.email || org.billing_email || "").trim().slice(0, 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: "Add a billing email so we can send the invoice." }, 400);
  const open = await one(db, "SELECT COUNT(*) AS n FROM billing_requests WHERE org_id = ? AND status = 'open'", org.id);
  if ((open?.n || 0) >= 5) return c.json({ error: "You already have open requests. We'll be in touch." }, 429);
  const id = newId();
  await run(
    db,
    `INSERT INTO billing_requests (id, org_id, org_name, host_account_id, sku, quantity, amount_pence, contact_email, po_number, note, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    id, org.id, org.name, me.id, b.sku, quantity, sku.pence * quantity, email,
    String(b.po || "").trim().slice(0, 60) || null,
    String(b.note || "").trim().slice(0, 300) || null,
    now()
  );
  if (!org.billing_email) await run(db, "UPDATE orgs SET billing_email = ? WHERE id = ?", email, org.id);
  return c.json({ ok: true, id, amountPence: sku.pence * quantity }, 201);
});


/* --------------------------------- team ---------------------------------- */

const INVITE_DAYS = 7;
// Emails a host can make Lanyard send to someone else (F35.6): an invite can be cancelled and sent
// again, so without these a host could fill anyone's inbox from hosts@. Counted per organisation
// and per address, per day; going over is a 429 and nothing is sent or saved.
const INVITE_EMAILS_PER_ORG_PER_DAY = 10;
const INVITE_EMAILS_PER_ADDRESS_PER_DAY = 3;
const TRANSFERS_PER_ORG_PER_DAY = 5;
const TRANSFERS_PER_ADDRESS_PER_DAY = 3;
const tooManyEmails = (c) => c.json({ error: "That's a lot of emails for one day. Try again tomorrow.", code: "throttled" }, 429);
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const inviteCode = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => ALPHABET[b & 31]).join("");
const normaliseInvite = (raw) => String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function ownerOrg(c) {
  const me = c.get("host");
  const org = await requireOrg(c.env.DB, me.id);
  const m = await one(c.env.DB, "SELECT role FROM host_org_members WHERE org_id = ? AND host_account_id = ?", org.id, me.id);
  return { me, org, role: m?.role || "owner" };
}

hostApp.get("/api/host/team", async (c) => {
  const { error, me, org, role } = await ownerOrg(c);
  if (error) return error;
  const db = c.env.DB;
  const members = await all(
    db,
    `SELECT m.host_account_id AS id, m.role, a.full_name, a.email
     FROM host_org_members m JOIN host_accounts a ON a.id = m.host_account_id WHERE m.org_id = ?
     ORDER BY (m.role = 'owner') DESC, m.created_at`,
    org.id
  );
  const invites = role === "owner"
    ? await all(db, "SELECT code, role, email, expires_at FROM host_org_invites WHERE org_id = ? AND expires_at > ? ORDER BY created_at DESC", org.id, now())
    : [];
  return c.json({
    role,
    members: members.map((m) => ({
      id: m.id, role: m.role, you: m.id === me.id,
      label: m.full_name || m.email, email: m.email,
    })),
    invites: invites.map((i) => ({ code: i.code, role: i.role, email: i.email || null, expiresAt: i.expires_at })),
  });
});

hostApp.post("/api/host/team/invite", async (c) => {
  const { error, me, org, role } = await ownerOrg(c);
  if (error) return error;
  if (role !== "owner") return c.json({ error: "Only the owner can invite people. Ask them to do it." }, 403);
  const db = c.env.DB;
  const open = await one(db, "SELECT COUNT(*) AS n FROM host_org_invites WHERE org_id = ? AND expires_at > ?", org.id, now());
  if ((open?.n || 0) >= 5) return c.json({ error: "You already have 5 open invites. Wait for one to expire or be used." }, 429);
  // With an email, the invite is for the host account with that email only,
  // and we send it to them. Without one, it's a code to pass on.
  const b = await c.req.json().catch(() => ({}));
  const email = b.email ? normEmail(b.email) : null;
  if (email && !validEmail(email)) return c.json({ error: "That email doesn't look right." }, 400);
  if (email && email === me.email) return c.json({ error: "That's your own email." }, 400);
  if (email && ((await bump(db, `day:hinvite:org:${org.id}`, DAY)) > INVITE_EMAILS_PER_ORG_PER_DAY
      || (await bump(db, `day:hinvite:to:${email}`, DAY)) > INVITE_EMAILS_PER_ADDRESS_PER_DAY)) return tooManyEmails(c);
  const code = inviteCode();
  const ts = now();
  const shown = code.slice(0, 4) + "-" + code.slice(4);
  await run(db, "INSERT INTO host_org_invites (code, org_id, role, email, created_by, created_at, expires_at) VALUES (?, ?, 'staff', ?, ?, ?, ?)",
    code, org.id, email, me.id, ts, ts + INVITE_DAYS * 864e5);
  let emailed = false;
  if (email) {
    emailed = await sendMail(c.env, "decisions", { to: email, ...teamInviteEmail({ orgName: org.name, fromName: me.full_name, code: shown, origin: hostOrigin(c.env, c) }) })
      .then(() => true, (e) => { console.error(e); return false; });
  }
  return c.json({ code: shown, email, emailed, expiresAt: ts + INVITE_DAYS * 864e5 }, 201);
});

hostApp.delete("/api/host/team/invite/:code", async (c) => {
  const { error, org, role } = await ownerOrg(c);
  if (error) return error;
  if (role !== "owner") return c.json({ error: "Only the owner can do that. Ask them to do it." }, 403);
  await run(c.env.DB, "DELETE FROM host_org_invites WHERE code = ? AND org_id = ?", normaliseInvite(c.req.param("code")), org.id);
  return c.json({ ok: true });
});

// A colleague with their own host account joins the owner's organisation.
hostApp.post("/api/host/team/join", async (c) => {
  const me = c.get("host");
  const db = c.env.DB;
  const b = await c.req.json().catch(() => ({}));
  const code = normaliseInvite(b.code);
  const inv = code.length === 8
    ? await one(db, "SELECT * FROM host_org_invites WHERE code = ? AND expires_at > ?", code, now())
    : null;
  // An invite made for someone else's email looks the same as a wrong code.
  if (!inv || (inv.email && inv.email !== me.email)) return c.json({ error: "That invite isn't valid or has expired. Ask for a new one." }, 404);

  const mine = await one(
    db,
    `SELECT o.id FROM orgs o JOIN host_org_members m ON m.org_id = o.id WHERE m.host_account_id = ? AND m.role = 'owner'`,
    me.id
  );
  if (mine?.id === inv.org_id) return c.json({ error: "You're already in this organisation." }, 400);
  if (mine) {
    const ev = await one(db, "SELECT COUNT(*) AS n FROM events WHERE org_id = ?", mine.id);
    if ((ev?.n || 0) > 0) {
      return c.json({ error: "You already run events under your own organisation, so you can't switch. Ask the owner to share their account instead." }, 409);
    }
  }
  // One conditional write (F35.5): the seat is taken only if the invite is still there at that
  // moment, and the invite and the host's empty organisation go only if the seat was taken, so two
  // people joining with one invite at the same moment can never both get in.
  const ts = now();
  const joined = "EXISTS (SELECT 1 FROM host_org_members WHERE org_id = ? AND host_account_id = ?)";
  const out = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO host_org_members (org_id, host_account_id, role, created_at)
                SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM host_org_invites WHERE code = ? AND expires_at > ?)`)
      .bind(inv.org_id, me.id, inv.role, ts, code, ts),
    db.prepare(`DELETE FROM host_org_invites WHERE code = ? AND ${joined}`).bind(code, inv.org_id, me.id),
    ...(mine ? [db.prepare(`DELETE FROM orgs WHERE id = ? AND ${joined}`).bind(mine.id, inv.org_id, me.id)] : []), // empty, unused org
  ]);
  if (!out[0]?.meta?.changes) return c.json({ error: "That invite isn't valid or has expired. Ask for a new one." }, 404);
  return c.json({ ok: true });
});

hostApp.delete("/api/host/team/:memberId", async (c) => {
  const { error, me, org, role } = await ownerOrg(c);
  if (error) return error;
  const target = c.req.param("memberId");
  if (role !== "owner" && target !== me.id) return c.json({ error: "Only the owner can remove people. Ask them to do it." }, 403);
  const m = await one(c.env.DB, "SELECT role FROM host_org_members WHERE org_id = ? AND host_account_id = ?", org.id, target);
  if (!m) return c.json({ error: "We couldn't find that person. Reload the page and try again." }, 404);
  if (m.role === "owner") return c.json({ error: "The owner can't be removed." }, 400);
  await run(c.env.DB, "DELETE FROM host_org_members WHERE org_id = ? AND host_account_id = ?", org.id, target);
  return c.json({ ok: true });
});


/* ---------------------- transfers and tickets ---------------------- */
// An organisation can change hands. The new owner needs their own host account
// (found by email) and must accept. Societies and institutions were approved
// as a particular leader, so for them a change of leader or email is a ticket
// an admin checks first. Companies can hand over directly.

const TICKET_KINDS = ["leader_change", "email_change", "other"];

async function ownerOfOrg(c) {
  const { error, me, org, role } = await ownerOrg(c);
  if (error) return { error };
  if (role !== "owner") return { error: c.json({ error: "Only the owner can do that. Ask them to do it." }, 403) };
  return { me, org };
}

// Why this host account can't take over `org`, or "" if it can.
async function transferProblem(db, org, account) {
  const elsewhere = await one(db, "SELECT 1 AS x FROM host_org_members WHERE host_account_id = ? AND org_id != ?", account.id, org.id);
  if (elsewhere) return { status: 409, error: "That account already belongs to another organisation. Each account can have only one.", code: "has_org" };
  const bad = emailProblem(org.org_type, account.email);
  if (bad) return { status: 400, error: bad, code: "email_not_eligible" };
  return null;
}

hostApp.post("/api/host/transfer", async (c) => {
  const { error, me, org } = await ownerOfOrg(c);
  if (error) return error;
  const db = c.env.DB;
  if (org.org_type === "society" || org.org_type === "institution") {
    return c.json({ error: "Changing the leader of a society or institution goes through a ticket, so an admin can check it.", code: "ticket_required" }, 400);
  }
  if (org.org_type === "individual") return c.json({ error: "Events under your own name stay with you. Create an organisation to hand events over.", code: "not_transferable" }, 400);
  const b = await c.req.json().catch(() => ({}));
  const email = normEmail(b.email);
  if (!validEmail(email)) return c.json({ error: "Enter the email they signed up to the host portal with." }, 400);
  const target = await one(db, "SELECT * FROM host_accounts WHERE email = ? AND status = 'active'", email);
  if (!target) return c.json({ error: "No host account uses that email yet. Ask them to sign up to the host portal first, then try again.", code: "no_account" }, 404);
  if (target.id === me.id) return c.json({ error: "That's your own account." }, 400);
  const problem = await transferProblem(db, org, target);
  if (problem) return c.json({ error: problem.error, code: problem.code }, problem.status);
  if ((await bump(db, `day:htransfer:org:${org.id}`, DAY)) > TRANSFERS_PER_ORG_PER_DAY
      || (await bump(db, `day:htransfer:to:${target.id}`, DAY)) > TRANSFERS_PER_ADDRESS_PER_DAY) return tooManyEmails(c);
  const id = await openTransfer(db, org, me.id, target);
  await sendMail(c.env, "decisions", { to: target.email, ...transferEmail({ orgName: org.name, fromName: me.full_name, origin: hostOrigin(c.env, c) }) })
    .catch((e) => console.error(e));
  return c.json({ ok: true, id }, 201);
});

hostApp.post("/api/host/transfers/:id/accept", async (c) => {
  const me = c.get("host");
  const db = c.env.DB;
  const t = await one(db, "SELECT * FROM host_org_transfers WHERE id = ? AND to_host_id = ? AND status = 'pending'", c.req.param("id"), me.id);
  if (!t) return c.json({ error: "That transfer is no longer waiting for you." }, 404);
  const org = await one(db, "SELECT * FROM orgs WHERE id = ?", t.org_id);
  const problem = await transferProblem(db, org, me);
  if (problem) return c.json({ error: problem.error, code: problem.code }, problem.status);
  await moveOwnership(db, org, me, t.id);
  return c.json({ ok: true });
});

hostApp.post("/api/host/transfers/:id/decline", async (c) => {
  const me = c.get("host");
  const r = await run(c.env.DB, "UPDATE host_org_transfers SET status = 'declined', resolved_at = ? WHERE id = ? AND to_host_id = ? AND status = 'pending'", now(), c.req.param("id"), me.id);
  if (!r.meta?.changes) return c.json({ error: "That transfer is no longer waiting for you." }, 404);
  return c.json({ ok: true });
});

hostApp.delete("/api/host/transfers/:id", async (c) => {
  const { error, org } = await ownerOfOrg(c);
  if (error) return error;
  await run(c.env.DB, "UPDATE host_org_transfers SET status = 'cancelled', resolved_at = ? WHERE id = ? AND org_id = ? AND status = 'pending'", now(), c.req.param("id"), org.id);
  return c.json({ ok: true });
});

hostApp.get("/api/host/tickets", async (c) => {
  const { error, org } = await ownerOfOrg(c);
  if (error) return error;
  const db = c.env.DB;
  const tickets = await all(db, "SELECT * FROM host_org_tickets WHERE org_id = ? ORDER BY created_at DESC LIMIT 20", org.id);
  const outgoing = await all(db, "SELECT id, to_email, created_at FROM host_org_transfers WHERE org_id = ? AND status = 'pending' ORDER BY created_at DESC", org.id);
  return c.json({
    tickets: tickets.map((t) => ({
      id: t.id, kind: t.kind, newEmail: t.new_email, message: t.message, status: t.status,
      adminNote: t.admin_note || null, at: t.created_at, resolvedAt: t.resolved_at || null,
    })),
    outgoing: outgoing.map((t) => ({ id: t.id, toEmail: t.to_email, at: t.created_at })),
  });
});

hostApp.post("/api/host/tickets", async (c) => {
  const { error, me, org } = await ownerOfOrg(c);
  if (error) return error;
  const db = c.env.DB;
  const b = await c.req.json().catch(() => ({}));
  const kind = b.kind;
  if (!TICKET_KINDS.includes(kind)) return c.json({ error: "Choose what you need help with." }, 400);
  const message = String(b.message || "").trim().slice(0, 1000);
  if (message.length < 10) return c.json({ error: "Tell us a little more about why, so an admin can check it." }, 400);
  let newEmail = null;
  if (kind !== "other") {
    newEmail = normEmail(b.newEmail);
    if (!validEmail(newEmail)) return c.json({ error: kind === "leader_change" ? "Enter the new leader's email." : "Enter the new email address." }, 400);
    const bad = emailProblem(org.org_type, newEmail);
    if (bad) return c.json({ error: bad, code: "email_not_eligible" }, 400);
    const holder = await one(db, "SELECT * FROM host_accounts WHERE email = ?", newEmail);
    if (kind === "leader_change") {
      // The new leader must already have signed up, and be free to take over.
      if (!holder) return c.json({ error: "No host account uses that email yet. Ask the new leader to sign up to the host portal first, then open the ticket.", code: "no_account" }, 404);
      if (holder.id === me.id) return c.json({ error: "That's your own account." }, 400);
      const problem = await transferProblem(db, org, holder);
      if (problem) return c.json({ error: problem.error, code: problem.code }, problem.status);
    } else if (holder && holder.id !== me.id) {
      return c.json({ error: "A different host account already uses that email.", code: "email_taken" }, 409);
    }
  }
  const open = await one(db, "SELECT COUNT(*) AS n FROM host_org_tickets WHERE org_id = ? AND status = 'open'", org.id);
  if ((open?.n || 0) >= 5) return c.json({ error: "You already have open tickets. We'll be in touch." }, 429);
  const id = newId();
  await run(db, "INSERT INTO host_org_tickets (id, org_id, host_account_id, kind, new_email, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)",
    id, org.id, me.id, kind, newEmail, message, now());
  return c.json({ ok: true, id }, 201);
});

/* ------------------------------ integrations ------------------------------ */
// Owner-only: one outbound webhook (signed) and one inbound API key per organisation.

async function ownerOnly(c) {
  const { error, org, role } = await ownerOrg(c);
  if (error) return { error };
  if (role !== "owner") return { error: c.json({ error: "Only the organisation owner can manage integrations. Ask them to do it." }, 403) };
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
