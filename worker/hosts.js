// Minimal host API for the pilot: one org per user, create/list events.
// Credits are enforced softly — pilots run free until billing lands (phase 7).
// The full dashboard, team roles, sponsors UI and reports build on these.
import { Hono } from "hono";
import { newId, now, one, all, run, uniqueCode, countJsonTerms, countAnswerTerms } from "./db.js";
import { hostTermsScope, hasConsent, recordConsent } from "./legal.js";
import { HOST_SKUS, FREE_EVENTS_FOR_NEW_ORG, FREE_EVENT_DAYS } from "./plans.js";

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

// Ensure the current user has an org; returns it.
async function ensureOrg(db, userId) {
  let org = await one(
    db,
    `SELECT o.* FROM orgs o JOIN org_members m ON m.org_id = o.id
     WHERE m.user_id = ? ORDER BY (m.role = 'owner') DESC, o.created_at LIMIT 1`,
    userId
  );
  if (org) return org;
  const id = newId();
  await db.batch([
    db.prepare("INSERT INTO orgs (id, name, plan, org_type, verification_status, created_at) VALUES (?, ?, 'starter', 'other', 'pending', ?)")
      .bind(id, "My organisation", now()),
    db.prepare("INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, 'owner')").bind(id, userId),
    // Starter grant for every new organisation.
    db.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, expires_at, reason, granted_by, created_at) VALUES (?, ?, ?, 0, ?, 'starter', 'self-serve', ?)")
      .bind(newId(), id, FREE_EVENTS_FOR_NEW_ORG, now() + FREE_EVENT_DAYS * 864e5, now()),
  ]);
  return one(db, "SELECT * FROM orgs WHERE id = ?", id);
}

hostApp.get("/api/host/me", async (c) => {
  const me = hostUser(c);
  if (!me) return needAccount(c);
  const db = c.env.DB;
  const org = await ensureOrg(db, me.id);
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
    })),
  });
});

hostApp.post("/api/host/org", async (c) => {
  const me = hostUser(c);
  if (!me) return needAccount(c);
  const b = await c.req.json().catch(() => ({}));
  if (!String(b.name || "").trim()) return c.json({ error: "organisation name required" }, 400);
  const org = await ensureOrg(c.env.DB, me.id);
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

hostApp.post("/api/host/events", async (c) => {
  const me = hostUser(c);
  if (!me) return needAccount(c);
  const db = c.env.DB;
  const org = await ensureOrg(db, me.id);
  const b = await c.req.json().catch(() => ({}));
  if (!String(b.name || "").trim()) return c.json({ error: "event name required" }, 400);

  // Credit gate: one credit per event.
  if ((await creditSummary(db, org.id)).remaining <= 0) {
    return c.json({ error: "No event credits left. Buy more from Billing.", code: "no_credits" }, 402);
  }

  const id = newId();
  const code = await uniqueCode(db, "events", 5);
  const ts = now();
  const questions = (Array.isArray(b.questions) ? b.questions : []).slice(0, 3)
    .map((q) => ({ key: String(q.key || "").replace(/[^a-z0-9_]/gi, "").slice(0, 24), label: String(q.label || "").slice(0, 60) }))
    .filter((q) => q.key && q.label);

  await db.batch([
    db.prepare(
      `INSERT INTO events (id, org_id, code, name, starts_at, venue, theme, strap_color, perks, directory_on, checkin_questions, is_paid, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    ).bind(
      id, org.id, code, String(b.name).trim().slice(0, 120),
      b.startsAt ? Number(b.startsAt) : null,
      String(b.venue || "").slice(0, 120),
      ["default", "formal", "night"].includes(b.theme) ? b.theme : "default",
      /^#[0-9a-fA-F]{6}$/.test(b.strapColor || "") ? b.strapColor : null,
      JSON.stringify(Array.isArray(b.perks) ? b.perks.slice(0, 10).map((x) => String(x).slice(0, 80)) : []),
      b.directoryOn === false ? 0 : 1,
      JSON.stringify(questions), ts
    ),
    // Spend from the credits that expire soonest.
    db.prepare(
      `UPDATE credits SET events_used = events_used + 1 WHERE id = (
         SELECT id FROM credits
         WHERE org_id = ? AND events_used < events_granted AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY COALESCE(expires_at, 9007199254740991) LIMIT 1)`
    ).bind(org.id, now()),
  ]);

  return c.json({ ok: true, id, code }, 201);
});

// Live screen: check-in count + connections so far (aggregate only).
hostApp.get("/api/host/events/:id/live", async (c) => {
  const me = hostUser(c);
  if (!me) return needAccount(c);
  const db = c.env.DB;
  const ev = await one(
    db,
    `SELECT e.* FROM events e JOIN org_members m ON m.org_id = e.org_id
     WHERE e.id = ? AND m.user_id = ?`,
    c.req.param("id"), me.id
  );
  if (!ev) return c.json({ error: "not found" }, 404);
  const checkins = await one(db, "SELECT COUNT(*) n FROM checkins WHERE event_id = ?", ev.id);
  const allConns = await one(db, "SELECT COUNT(*) n FROM connections WHERE event_id = ?", ev.id);
  const selfieConns = await one(db, "SELECT COUNT(*) n FROM connections WHERE event_id = ? AND selfie_key IS NOT NULL", ev.id);
  return c.json({
    event: { id: ev.id, code: ev.code, name: ev.name, startsAt: ev.starts_at, venue: ev.venue },
    checkins: checkins.n,
    connections: allConns.n,
    selfies: selfieConns.n,
    cap: EVENT_CHECKIN_CAP,
    overCap: checkins.n > EVENT_CHECKIN_CAP,
  });
});

// Post-event aggregate report. No pair-level detail: hosts see cohort shapes.
// Small cohorts suppress low-count buckets to reduce re-identification.
hostApp.get("/api/host/events/:id/report", async (c) => {
  const me = hostUser(c);
  if (!me) return needAccount(c);
  const db = c.env.DB;
  const ev = await one(
    db,
    `SELECT e.* FROM events e JOIN org_members m ON m.org_id = e.org_id
     WHERE e.id = ? AND m.user_id = ?`,
    c.req.param("id"), me.id
  );
  if (!ev) return c.json({ error: "not found" }, 404);

  const checkinRows = await all(
    db,
    `SELECT ch.answers, ch.sponsor, p.course, p.uni, p.year, p.tags
     FROM checkins ch LEFT JOIN profiles p ON p.user_id = ch.user_id
     WHERE ch.event_id = ?`,
    ev.id
  );
  const totals = await one(
    db,
    `SELECT
       (SELECT COUNT(*) FROM checkins WHERE event_id = ?) checkins,
       (SELECT COUNT(*) FROM connections WHERE event_id = ?) connections,
       (SELECT COUNT(*) FROM connections WHERE event_id = ? AND selfie_key IS NOT NULL) selfies`,
    ev.id, ev.id, ev.id
  );
  const smallCohort = totals.checkins < 10;
  const minBucket = smallCohort ? 2 : 3;

  const questions = (ev.checkin_questions || []).map((q) => ({
    key: q.key,
    label: q.label,
    buckets: countAnswerTerms(checkinRows, q.key, { min: minBucket, limit: 20 }),
  })).filter((q) => q.buckets.length);

  const sponsorOpts = await all(db, "SELECT id, name FROM sponsors WHERE event_id = ?", ev.id);
  const sponsorCounts = sponsorOpts.map((s) => ({
    name: s.name,
    count: checkinRows.filter((r) => (r.sponsor || []).includes(s.id)).length,
  })).filter((s) => s.count >= minBucket);

  return c.json({
    generatedAt: now(),
    event: {
      id: ev.id, code: ev.code, name: ev.name, startsAt: ev.starts_at, venue: ev.venue,
    },
    privacy: {
      smallCohort,
      note: smallCohort
        ? "Cohort under 10: only repeated answers are shown to limit singling people out."
        : "Buckets with fewer than 3 responses are hidden.",
    },
    totals,
    courses: countAnswerTerms(
      checkinRows.map((r) => ({ answers: { course: r.course } })),
      "course",
      { min: minBucket, limit: 20 }
    ),
    tags: countJsonTerms(checkinRows, "tags", { min: minBucket, limit: 20 }),
    questions,
    sponsors: sponsorCounts,
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
  const org = await ensureOrg(db, me.id);
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
  const org = await ensureOrg(db, me.id);
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
  const org = await ensureOrg(c.env.DB, me.id);
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
