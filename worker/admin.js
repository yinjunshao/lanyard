// Admin tool: approve society and institution applications, handle tickets.
// Guarded by a shared secret (ADMIN_TOKEN, set with `wrangler secret put`), not
// by a user account, so it cannot be reached from a host or personal session.
import { Hono } from "hono";
import { now, one, all, run } from "./db.js";
import { sha256Hex } from "./session.js";
import { sendMail, sendBatch, decisionEmail, ticketEmail, transferEmail, marketingEmail } from "./mail.js";
import { hostOrigin } from "./host-auth.js";
import { unsubUrl } from "./unsub.js";
import { newId } from "./db.js";
import { peek, bump, HOUR } from "./ratelimit.js";
import { emailProblem, emailKind, openTransfer, normEmail } from "./hostorg.js";
import { funnel } from "./onboarding.js";
import { stageFunnel } from "./stages.js";
import { ORG_KINDS } from "./plans.js";
import { settleStatements } from "./host-promo.js";
import { registerAiAdmin } from "./ai/admin.js";

export const adminApp = new Hono();

adminApp.use("/api/admin/*", async (c, next) => {
  const token = c.env.ADMIN_TOKEN;
  if (!token) return c.json({ error: "Admin isn't set up. Set the ADMIN_TOKEN secret." }, 503);
  const db = c.env.DB;
  const key = `adm:${c.req.header("cf-connecting-ip") || "local"}`;
  if ((await peek(db, key, HOUR)) >= 10) return c.json({ error: "Too many wrong tries. Wait an hour." }, 429);
  const given = (c.req.header("authorization") || "").replace(/^Bearer\s+/i, "");
  const [a, b] = await Promise.all([sha256Hex(given), sha256Hex(token)]);
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length && i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  if (diff !== 0) {
    await bump(db, key, HOUR);
    return c.json({ error: "That token isn't right. Check it and try again." }, 401);
  }
  // Every admin action is logged: what was done and from where (search words are
  // kept, since looking someone up is itself access to personal data).
  const url = new URL(c.req.url);
  await run(db, "INSERT INTO admin_audit (id, at, action, detail, ip) VALUES (?, ?, ?, ?, ?)",
    newId() + newId(), now(), `${c.req.method} ${url.pathname}`, url.search.slice(0, 200) || null, c.req.header("cf-connecting-ip") || "local");
  return next();
});

// F21: the AI section (spend, kill switch, allow-list). Registered here so the token check above covers it.
registerAiAdmin(adminApp);

adminApp.get("/api/admin/queue", async (c) => {
  const db = c.env.DB;
  const orgs = await all(
    db,
    `SELECT o.*, m.host_account_id AS owner_id, ha.full_name AS owner_name, ha.email AS owner_email,
            ha.use_case, ha.event_frequency, ha.typical_size
     FROM orgs o
     LEFT JOIN (SELECT org_id, host_account_id FROM host_org_members WHERE role = 'owner') m ON m.org_id = o.id
     LEFT JOIN host_accounts ha ON ha.id = m.host_account_id
     WHERE o.verification_status = 'pending' ORDER BY o.applied_at`
  );
  const tickets = await all(
    db,
    `SELECT t.*, o.name AS org_name, o.org_type, o.leader_name, o.leader_email
     FROM host_org_tickets t JOIN orgs o ON o.id = t.org_id
     WHERE t.status = 'open' ORDER BY t.created_at`
  );
  const withAccount = await Promise.all(tickets.map(async (t) => {
    const holder = t.new_email ? await one(db, "SELECT id FROM host_accounts WHERE email = ?", t.new_email) : null;
    return { ...t, accountExists: !!holder };
  }));
  return c.json({
    applications: orgs.map((o) => ({
      id: o.id, name: o.name, type: o.org_type, leaderName: o.leader_name, leaderEmail: o.leader_email,
      emailKind: emailKind(o.leader_email), orgLink: o.org_link, university: o.university, appliedAt: o.applied_at,
      useCase: o.use_case || null, frequency: o.event_frequency || null, size: o.typical_size || null,
    })),
    tickets: withAccount.map((t) => ({
      id: t.id, kind: t.kind, orgName: t.org_name, orgType: t.org_type, leaderName: t.leader_name, leaderEmail: t.leader_email,
      newEmail: t.new_email, newEmailKind: t.new_email ? emailKind(t.new_email) : null, accountExists: t.accountExists,
      message: t.message, at: t.created_at,
    })),
  });
});

adminApp.post("/api/admin/orgs/:id/review", async (c) => {
  const db = c.env.DB;
  const b = await c.req.json().catch(() => ({}));
  const decision = b.decision === "approve" ? "approved" : b.decision === "reject" ? "rejected" : null;
  if (!decision) return c.json({ error: "Choose approve or reject." }, 400);
  const note = String(b.note || "").trim().slice(0, 300);
  if (decision === "rejected" && !note) return c.json({ error: "Give a short reason so the applicant knows why." }, 400);
  // Approving also issues any promo-code credits held for this organisation (F20), in the same
  // transaction: an approved organisation never has a claim left waiting, and a failed step undoes both.
  const ts = now();
  const out = await db.batch([
    db.prepare("UPDATE orgs SET verification_status = ?, reviewed_at = ?, review_note = ? WHERE id = ? AND verification_status = 'pending'")
      .bind(decision, ts, note || null, c.req.param("id")),
    ...(decision === "approved" ? settleStatements(db, c.req.param("id"), ts) : []),
  ]);
  if (!out[0].meta?.changes) return c.json({ error: "That application isn't waiting for review." }, 404);
  const released = Number(out[2]?.meta?.changes || 0);
  // Tell the applicant. A mail failure must not undo the decision.
  const org = await one(db, "SELECT name, leader_email FROM orgs WHERE id = ?", c.req.param("id"));
  let emailed = false;
  if (org?.leader_email) {
    emailed = await sendMail(c.env, "decisions", {
      to: org.leader_email,
      ...decisionEmail({ orgName: org.name, approved: decision === "approved", note, origin: hostOrigin(c.env, c) }),
    }).then(() => true, (e) => { console.error(e); return false; });
  }
  return c.json({ ok: true, emailed, released });
});

adminApp.post("/api/admin/tickets/:id/resolve", async (c) => {
  const db = c.env.DB;
  const t = await one(db, "SELECT * FROM host_org_tickets WHERE id = ? AND status = 'open'", c.req.param("id"));
  if (!t) return c.json({ error: "That ticket isn't open." }, 404);
  const org = await one(db, "SELECT * FROM orgs WHERE id = ?", t.org_id);
  const b = await c.req.json().catch(() => ({}));
  const note = String(b.note || "").trim().slice(0, 300);
  // Tell the leader how it went; a mail failure must not undo the decision.
  const done = async (status) => {
    await run(db, "UPDATE host_org_tickets SET status = ?, admin_note = ?, resolved_at = ? WHERE id = ?", status, note || null, now(), t.id);
    if (status !== "resolved" && org?.leader_email) {
      await sendMail(c.env, "decisions", {
        to: org.leader_email,
        ...ticketEmail({ orgName: org.name, approved: status === "approved", note, origin: hostOrigin(c.env, c) }),
      }).catch((e) => console.error(e));
    }
  };

  if (b.decision === "reject") {
    if (!note) return c.json({ error: "Give a short reason." }, 400);
    await done("rejected");
    return c.json({ ok: true });
  }
  if (b.decision !== "approve") return c.json({ error: "Choose approve or reject." }, 400);

  if (t.kind === "leader_change") {
    const target = await one(db, "SELECT * FROM host_accounts WHERE email = ? AND status = 'active'", normEmail(t.new_email));
    if (!target) return c.json({ error: "No host account uses that email yet. Ask them to sign up first." }, 409);
    const elsewhere = await one(db, "SELECT 1 AS x FROM host_org_members WHERE host_account_id = ? AND org_id != ?", target.id, org.id);
    if (elsewhere) return c.json({ error: "That account already belongs to another organisation." }, 409);
    const bad = emailProblem(org.org_type, target.email);
    if (bad) return c.json({ error: bad }, 400);
    const owner = await one(db, "SELECT host_account_id FROM host_org_members WHERE org_id = ? AND role = 'owner'", org.id);
    // The new leader still has to press Accept.
    await openTransfer(db, org, owner?.host_account_id || null, target);
    await sendMail(c.env, "decisions", { to: target.email, ...transferEmail({ orgName: org.name, fromName: org.leader_name, origin: hostOrigin(c.env, c) }) })
      .catch((e) => console.error(e));
    await done("approved");
    return c.json({ ok: true, next: "transfer_sent" });
  }
  if (t.kind === "email_change") {
    const email = normEmail(t.new_email);
    const bad = emailProblem(org.org_type, email);
    if (bad) return c.json({ error: bad }, 400);
    // The host account's email is how it signs in, so this also moves the sign-in.
    const holder = await one(db, "SELECT id FROM host_accounts WHERE email = ?", email);
    if (holder && holder.id !== t.host_account_id) return c.json({ error: "A different host account already uses that email." }, 409);
    if (!t.host_account_id) return c.json({ error: "The account that asked for this no longer exists." }, 409);
    await db.batch([
      db.prepare("UPDATE host_accounts SET email = ? WHERE id = ?").bind(email, t.host_account_id),
      db.prepare("UPDATE orgs SET leader_email = ?, billing_email = ? WHERE id = ?").bind(email, email, org.id),
    ]);
    await done("approved");
    return c.json({ ok: true });
  }
  await done("resolved");
  return c.json({ ok: true });
});

// Host accounts (F10): separate from attendee accounts. List and search them,
// switch one off (which signs it out everywhere), and give an organisation
// with no members to a host account by its email.
adminApp.get("/api/admin/hosts", async (c) => {
  const q = String(c.req.query("q") || "").trim().toLowerCase().slice(0, 80);
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const rows = await all(c.env.DB,
    `SELECT a.id, a.email, a.full_name, a.status, a.terms_version, a.created_at, a.last_login_at,
            o.id AS org_id, o.name AS org_name, o.org_type, m.role
       FROM host_accounts a
       LEFT JOIN host_org_members m ON m.host_account_id = a.id
       LEFT JOIN orgs o ON o.id = m.org_id
      WHERE ? = '' OR a.email LIKE ? OR lower(COALESCE(a.full_name, '')) LIKE ? OR lower(COALESCE(o.name, '')) LIKE ?
      ORDER BY a.created_at DESC LIMIT 50`, q, like, like, like);
  const unclaimed = await all(c.env.DB,
    `SELECT o.id, o.name, o.org_type, o.verification_status, o.created_at FROM orgs o
      WHERE NOT EXISTS (SELECT 1 FROM host_org_members m WHERE m.org_id = o.id)
      ORDER BY o.created_at DESC LIMIT 50`);
  return c.json({
    hosts: rows.map((r) => ({
      id: r.id, email: r.email, fullName: r.full_name || null, status: r.status, createdAt: r.created_at,
      lastLoginAt: r.last_login_at || null, setUp: !!(r.full_name && r.terms_version),
      org: r.org_id ? { id: r.org_id, name: r.org_name, type: r.org_type, role: r.role } : null,
    })),
    unclaimed: unclaimed.map((o) => ({ id: o.id, name: o.name, type: o.org_type, status: o.verification_status, createdAt: o.created_at })),
  });
});

adminApp.post("/api/admin/hosts/:id/status", async (c) => {
  const db = c.env.DB;
  const b = await c.req.json().catch(() => ({}));
  if (!["active", "disabled"].includes(b.status)) return c.json({ error: "Choose active or disabled." }, 400);
  const r = await run(db, "UPDATE host_accounts SET status = ? WHERE id = ?", b.status, c.req.param("id"));
  if (!r.meta?.changes) return c.json({ error: "No such host account." }, 404);
  if (b.status === "disabled") await run(db, "DELETE FROM host_sessions WHERE host_account_id = ?", c.req.param("id"));
  return c.json({ ok: true });
});

// An organisation with no members gets an owner. The host account must exist
// (they sign in to the host portal once first) and have no organisation yet.
adminApp.post("/api/admin/orgs/:id/attach", async (c) => {
  const db = c.env.DB;
  const org = await one(db, "SELECT * FROM orgs WHERE id = ?", c.req.param("id"));
  if (!org) return c.json({ error: "No such organisation." }, 404);
  if (await one(db, "SELECT 1 AS x FROM host_org_members WHERE org_id = ?", org.id)) {
    return c.json({ error: "This organisation already has members. Use a transfer instead." }, 409);
  }
  const b = await c.req.json().catch(() => ({}));
  const email = normEmail(b.email);
  const acct = email ? await one(db, "SELECT * FROM host_accounts WHERE email = ? AND status = 'active'", email) : null;
  if (!acct) return c.json({ error: "No host account uses that email. Ask them to sign in to the host portal once, then try again." }, 404);
  if (await one(db, "SELECT 1 AS x FROM host_org_members WHERE host_account_id = ?", acct.id)) {
    return c.json({ error: "That host account already belongs to an organisation." }, 409);
  }
  const bad = emailProblem(org.org_type, acct.email);
  if (bad) return c.json({ error: bad }, 400);
  await db.batch([
    db.prepare("INSERT INTO host_org_members (org_id, host_account_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(org.id, acct.id, now()),
    db.prepare("UPDATE orgs SET leader_name = COALESCE(?, leader_name), leader_email = ?, billing_email = ? WHERE id = ?")
      .bind(acct.full_name, acct.email, acct.email, org.id),
  ]);
  return c.json({ ok: true });
});

// Account recovery for people who signed up with nothing but a cookie. Find them
// by name / university / card code, check it's really them, then give them a
// one-time sign-in code (30 minutes) to type on /signin.
adminApp.get("/api/admin/users", async (c) => {
  const q = String(c.req.query("q") || "").trim().slice(0, 60);
  if (q.length < 2) return c.json({ users: [] });
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const users = await all(c.env.DB,
    `SELECT u.id, u.created_at, u.recovery_email, u.email_verified, u.has_passkey, u.has_totp, p.name, p.uni, p.course,
            (SELECT MAX(created_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id
     WHERE p.name LIKE ? OR p.uni LIKE ? OR u.recovery_email LIKE ? OR u.id = ?
        OR EXISTS (SELECT 1 FROM cards k WHERE k.user_id = u.id AND k.code = ?)
     ORDER BY u.created_at DESC LIMIT 20`, like, like, like, q.toLowerCase(), q.toUpperCase());
  return c.json({ users });
});

adminApp.post("/api/admin/users/:id/signin-code", async (c) => {
  const db = c.env.DB;
  const user = await one(db, "SELECT id FROM users WHERE id = ?", c.req.param("id"));
  if (!user) return c.json({ error: "No such user." }, 404);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => alphabet[b & 31]).join("");
  const ts = now();
  await run(db, "DELETE FROM login_codes WHERE user_id = ? OR expires_at < ?", user.id, ts);
  await run(db, "INSERT INTO login_codes (code, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", code, user.id, ts, ts + 30 * 60 * 1000);
  return c.json({ code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresInMinutes: 30 });
});

// Promo codes (/redeem). Codes are upper-case letters and numbers.
// The welcome-steps funnel (F14): counts per step for the last 30 days. Nothing about who.
adminApp.get("/api/admin/onboarding", async (c) => c.json(await funnel(c.env.DB, 30)));
// The tips funnel (F59): per tutorial, how many were shown, finished and skipped in the last 30 days. Nothing about who.
adminApp.get("/api/admin/stages", async (c) => c.json(await stageFunnel(c.env.DB, 30)));

// One list for both audiences. Host codes (F20) also carry totals: how many
// organisations took the code, how many are held until approval, and how many
// credits were issued. Totals only; the list never names an organisation.
adminApp.get("/api/admin/promos", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.*,
       (SELECT COUNT(*) FROM host_promo_claims h WHERE h.code = p.code) AS claims,
       (SELECT COUNT(*) FROM host_promo_claims h WHERE h.code = p.code AND h.credit_id IS NULL) AS held,
       (SELECT COALESCE(SUM(h.credits), 0) FROM host_promo_claims h WHERE h.code = p.code AND h.credit_id IS NOT NULL) AS credits_issued
     FROM promo_codes p ORDER BY p.created_at DESC`).all();
  return c.json({ promos: results || [] });
});

// The most credits one host code can give, and the most claims it can take. Credits are
// spent on events, so a host code always has a limit.
const HOST_CODE_MAX_CREDITS = 50;
const HOST_CODE_MAX_USES = 10000;
const dateOrNull = (v) => (v ? Number(new Date(v)) : null);

adminApp.post("/api/admin/promos", async (c) => {
  const db = c.env.DB;
  const b = await c.req.json().catch(() => ({}));
  const host = b.audience === "host";
  if (b.audience !== undefined && b.audience !== "user" && !host) return c.json({ error: "Audience: user or host." }, 400);
  const code = String(b.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const days = Math.round(Number(host ? b.creditDays ?? 365 : b.days));
  const maxUses = b.maxUses === "" || b.maxUses == null ? null : Math.round(Number(b.maxUses));
  const expiresAt = dateOrNull(b.expiresAt);
  const startsAt = dateOrNull(b.startsAt);
  if (code.length < 4 || code.length > 24) return c.json({ error: "Code: 4 to 24 letters or numbers." }, 400);
  if (!(days >= 1 && days <= (host ? 730 : 3650))) return c.json({ error: host ? "Credit days: 1 to 730." : "Days: 1 to 3650." }, 400);
  if (maxUses != null && !(maxUses >= 1 && maxUses <= (host ? HOST_CODE_MAX_USES : 1e6))) return c.json({ error: host ? `Limit: 1 to ${HOST_CODE_MAX_USES}.` : "Limit: a positive number, or blank for no limit." }, 400);
  if (host && maxUses == null) return c.json({ error: "A host code needs a limit: credits are spent on events." }, 400);
  if (expiresAt != null && !(expiresAt > now())) return c.json({ error: "The end date must be in the future." }, 400);
  if (startsAt != null && !Number.isFinite(startsAt)) return c.json({ error: "The start date doesn't look right." }, 400);
  if (startsAt != null && expiresAt != null && startsAt >= expiresAt) return c.json({ error: "The start must be before the end." }, 400);
  let credits = null, kinds = null;
  if (host) {
    credits = Math.round(Number(b.credits));
    if (!(credits >= 1 && credits <= HOST_CODE_MAX_CREDITS)) return c.json({ error: `Credits: 1 to ${HOST_CODE_MAX_CREDITS}.` }, 400);
    if (b.orgKinds != null && b.orgKinds !== "") {
      const list = [...new Set(Array.isArray(b.orgKinds) ? b.orgKinds : [])];
      if (!list.length || !list.every((k) => ORG_KINDS.includes(k))) return c.json({ error: "Organisation kinds: society, institution, company or individual." }, 400);
      kinds = JSON.stringify(list);
    }
  }
  if (await one(db, "SELECT code FROM promo_codes WHERE code = ?", code)) return c.json({ error: "That code already exists." }, 409);
  await run(db,
    `INSERT INTO promo_codes (code, reward, days, max_uses, starts_at, expires_at, note, created_at, audience, credits, credit_days, org_kinds)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    code, host ? "credits" : "plus", days, maxUses, startsAt, expiresAt, String(b.note || "").slice(0, 200) || null, now(),
    host ? "host" : "user", credits, host ? days : null, kinds);
  return c.json({ ok: true, code });
});

// Change when a code runs, how many may use it, or its note. Not its code,
// audience or reward: a mistake there is fixed by switching the code off and making a new
// one, so a claim always matches the code it was made on.
adminApp.post("/api/admin/promos/:code/edit", async (c) => {
  const db = c.env.DB;
  const row = await one(db, "SELECT * FROM promo_codes WHERE code = ?", c.req.param("code"));
  if (!row) return c.json({ error: "No such code." }, 404);
  const b = await c.req.json().catch(() => ({}));
  const host = row.audience === "host";
  const has = (k) => b[k] !== undefined;
  const f = {};
  if (has("note")) f.note = String(b.note || "").slice(0, 200) || null;
  if (has("maxUses")) {
    const m = b.maxUses === "" || b.maxUses == null ? null : Math.round(Number(b.maxUses));
    if (m == null ? host : !(m >= 1 && m <= (host ? HOST_CODE_MAX_USES : 1e6))) return c.json({ error: host ? `Limit: 1 to ${HOST_CODE_MAX_USES}. A host code always has one.` : "Limit: a positive number, or blank for no limit." }, 400);
    if (m != null && m < row.uses) return c.json({ error: `${row.uses} have already claimed it, so the limit can't go below that.` }, 400);
    f.max_uses = m;
  }
  if (has("startsAt")) {
    f.starts_at = dateOrNull(b.startsAt);
    if (f.starts_at != null && !Number.isFinite(f.starts_at)) return c.json({ error: "The start date doesn't look right." }, 400);
  }
  if (has("expiresAt")) {
    f.expires_at = dateOrNull(b.expiresAt);
    if (f.expires_at != null && !(f.expires_at > now())) return c.json({ error: "The end date must be in the future. To stop a code now, switch it off." }, 400);
  }
  const start = "starts_at" in f ? f.starts_at : row.starts_at;
  const end = "expires_at" in f ? f.expires_at : row.expires_at;
  if (start != null && end != null && start >= end) return c.json({ error: "The start must be before the end." }, 400);
  const keys = Object.keys(f);
  if (!keys.length) return c.json({ error: "Nothing to change." }, 400);
  await run(db, `UPDATE promo_codes SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE code = ?`, ...Object.values(f), row.code);
  return c.json({ ok: true });
});

adminApp.post("/api/admin/promos/:code/active", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const r = await run(c.env.DB, "UPDATE promo_codes SET active = ? WHERE code = ?", b.active ? 1 : 0, c.req.param("code"));
  if (!r.meta?.changes) return c.json({ error: "No such code." }, 404);
  return c.json({ ok: true });
});

// News and offers: only to people who ticked the box and have a verified email.
// With `testTo` it sends one copy to that address and nothing else. A real send
// handles up to 800 people per call; call again with the returned id to continue.
adminApp.post("/api/admin/broadcast", async (c) => {
  const db = c.env.DB;
  const b = await c.req.json().catch(() => ({}));
  const subject = String(b.subject || "").trim().slice(0, 150);
  const body = String(b.body || "").trim().slice(0, 8000);
  if (!subject || !body) return c.json({ error: "Add a subject and a message." }, 400);
  const mk = async (userId) => ({ ...marketingEmail({ subject, body, unsubUrl: await unsubUrl(c, userId) }) });

  if (b.testTo) {
    const to = String(b.testTo).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return c.json({ error: "That test address doesn't look right." }, 400);
    await sendBatch(c.env, "accounts", [{ to, ...(await mk("0000000000")), subject: `[TEST] ${subject}` }]);
    return c.json({ ok: true, test: true });
  }

  let id = String(b.id || "");
  if (id) {
    const known = await one(db, "SELECT id FROM broadcasts WHERE id = ?", id);
    if (!known) return c.json({ error: "Unknown broadcast." }, 404);
  } else {
    id = newId();
    await run(db, "INSERT INTO broadcasts (id, subject, body, created_at) VALUES (?, ?, ?, ?)", id, subject, body, now());
  }
  const people = await all(db,
    `SELECT u.id, u.recovery_email AS email FROM users u
     WHERE u.marketing_optin = 1 AND u.email_verified = 1
       AND NOT EXISTS (SELECT 1 FROM broadcast_sends s WHERE s.broadcast_id = ? AND s.user_id = u.id)
     ORDER BY u.id LIMIT 800`, id);
  const stored = await one(db, "SELECT subject, body FROM broadcasts WHERE id = ?", id);
  const msgs = [];
  for (const p of people) msgs.push({ to: p.email, ...marketingEmail({ subject: stored.subject, body: stored.body, unsubUrl: await unsubUrl(c, p.id) }) });
  try { await sendBatch(c.env, "accounts", msgs); }
  catch (e) { console.error(e); return c.json({ error: "Sending failed part-way. Run it again to continue; nobody is sent twice." }, 502); }
  const ts = now();
  for (let i = 0; i < people.length; i += 50) {
    await db.batch(people.slice(i, i + 50).map((p) => db.prepare("INSERT OR IGNORE INTO broadcast_sends (broadcast_id, user_id, sent_at) VALUES (?, ?, ?)").bind(id, p.id, ts)));
  }
  const left = await one(db,
    `SELECT COUNT(*) AS n FROM users u WHERE u.marketing_optin = 1 AND u.email_verified = 1
       AND NOT EXISTS (SELECT 1 FROM broadcast_sends s WHERE s.broadcast_id = ? AND s.user_id = u.id)`, id);
  return c.json({ ok: true, id, sent: people.length, remaining: left?.n || 0 });
});

// Privacy requests and complaints: oldest deadline first.
adminApp.get("/api/admin/privacy-requests", async (c) => {
  const rows = await all(c.env.DB,
    "SELECT * FROM privacy_requests WHERE status = 'open' ORDER BY respond_by LIMIT 100");
  return c.json({ requests: rows.map((r) => ({
    id: r.id, kind: r.kind, email: r.email, message: r.message, createdAt: r.created_at, respondBy: r.respond_by,
    acknowledged: !!r.acknowledged_at, overdue: r.respond_by < now(), userId: r.user_id,
  })) });
});

adminApp.post("/api/admin/privacy-requests/:id/close", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const outcome = String(b.outcome || "").trim().slice(0, 500);
  if (!outcome) return c.json({ error: "Write down the outcome." }, 400);
  const r = await run(c.env.DB, "UPDATE privacy_requests SET status = 'closed', closed_at = ?, outcome = ? WHERE id = ? AND status = 'open'",
    now(), outcome, c.req.param("id"));
  if (!r.meta?.changes) return c.json({ error: "That request isn't open." }, 404);
  return c.json({ ok: true });
});
