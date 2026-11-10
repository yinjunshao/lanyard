// UK GDPR measures from the 2026-11-01 audit: selfie acceptance, consent history,
// retention, privacy requests, admin audit log, event choices, inactivity expiry.
// Run: node test/gdpr.mjs
import { makeEnv, check, summary, PNG, becomeHost } from "./harness.mjs";
import { purgeExpired, eraseUser } from "../worker/purge.js";

const T = await makeEnv({ ADMIN_TOKEN: "test-admin-token" });
const { client, q, q1, env } = T;
const DAY = 86400e3;
const out = env.MAIL_OUTBOX;
const sql = (s, ...p) => env.DB.raw.prepare(s).run(...p);

async function signup(name, ip) {
  const c = client({ ip });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true });
  if (r.status !== 201) throw new Error(r.text);
  const me = await c.get("/api/me");
  return { c, id: me.json.user.id, card: me.json.cards[0].cardId };
}

console.log("\n# Shared selfie needs the other person's OK");
const A = await signup("Alice", "10.0.0.1");
const B = await signup("Bob", "10.0.0.2");
const conn = await B.c.post("/api/connect", { cardId: A.card, selfieDataUrl: PNG, consent: true });
check("taking a selfie connects", conn.status === 200, conn.text);
const cid = conn.json.connectionId;
const row = () => q1("SELECT * FROM connections WHERE id = ?", cid);
check("it starts pending, taken by Bob, not accepted", row().selfie_by === B.id && row().consent_b === 0 && row().selfie_key);
const bView = (await B.c.get(`/api/connections/${cid}`)).json;
const aView = (await A.c.get(`/api/connections/${cid}`)).json;
check("Bob sees his own pending selfie", bView.selfieStatus === "pending" && bView.selfie);
check("Alice sees it only as a request, not as part of her connection", aView.selfieStatus === "request" && aView.selfie === null && !!aView.selfieRequest);
check("pending selfies stay out of the people list", (await A.c.get("/api/connections")).json.connections[0].selfie === null);
check("Bob can't accept his own selfie", (await B.c.post(`/api/connections/${cid}/selfie/accept`)).status === 400);
check("a stranger can't accept it", (await (await signup("Eve", "10.0.0.3")).c.post(`/api/connections/${cid}/selfie/accept`)).status === 404);
const acc = await A.c.post(`/api/connections/${cid}/selfie/accept`);
check("Alice can accept", acc.status === 200 && row().consent_b === 1 && row().consent_b_at > 0);
check("then both see it", (await A.c.get(`/api/connections/${cid}`)).json.selfie && (await B.c.get(`/api/connections/${cid}`)).json.selfieStatus === "accepted");
const hist = q("SELECT scope, action FROM consent_log WHERE ref = ?", cid).map((r) => `${r.scope}:${r.action}`);
check("both consents are written to the history", hist.includes("selfie:granted") && hist.includes("selfie_accept:granted"), hist);
const key1 = row().selfie_key;
const rem = await A.c.post(`/api/connections/${cid}/selfie/remove`);
check("either person can remove the photo and the connection stays", rem.status === 200 && row() && row().selfie_key === null && row().consent_b === 0);
check("removal is logged as a withdrawal", q1("SELECT 1 x FROM consent_log WHERE ref = ? AND action = 'withdrawn'", cid));
check("the image is gone from storage", (await env.MEDIA.get(key1)) == null);

// Unaccepted selfies expire.
const C = await signup("Cara", "10.0.1.1");
const D = await signup("Dan", "10.0.1.2");
const c2 = await D.c.post("/api/connect", { cardId: C.card, selfieDataUrl: PNG, consent: true });
const id2 = c2.json.connectionId;
const key2 = q1("SELECT selfie_key k FROM connections WHERE id = ?", id2).k;
sql("UPDATE connections SET selfie_at = ? WHERE id = ?", Date.now() - 8 * DAY, id2);
const run1 = await purgeExpired(env);
check("a selfie nobody accepted is deleted after 7 days", run1.pendingSelfies === 1 && q1("SELECT selfie_key k FROM connections WHERE id = ?", id2).k === null && (await env.MEDIA.get(key2)) == null);

console.log("\n# Consent history survives deleting the account");
const E = await signup("Erin", "10.0.2.1");
check("agreeing to the terms is in the history", q1("SELECT COUNT(*) n FROM consent_log WHERE user_id = ? AND scope LIKE 'terms:%'", E.id).n === 1);
await eraseUser(env, E.id);
check("the account is gone", !q1("SELECT 1 x FROM users WHERE id = ?", E.id));
check("the history is kept, with the deletion recorded", q1("SELECT COUNT(*) n FROM consent_log WHERE user_id = ?", E.id).n === 2 && q1("SELECT 1 x FROM consent_log WHERE user_id = ? AND scope = 'account'", E.id));
sql("UPDATE consent_log SET at = ? WHERE user_id = ?", Date.now() - 7 * 365 * DAY, E.id);
await purgeExpired(env);
check("after 6 years it is deleted", q1("SELECT COUNT(*) n FROM consent_log WHERE user_id = ?", E.id).n === 0);
const my = await A.c.get("/api/account/consents");
check("people can see their own consent history", my.status === 200 && my.json.history.length >= 1);

console.log("\n# Retention");
sql("INSERT INTO reports (id, reporter_id, target_id, reason, created_at) VALUES ('r1', ?, ?, 'old', ?)", A.id, B.id, Date.now() - 400 * DAY);
sql("INSERT INTO reports (id, reporter_id, target_id, reason, created_at) VALUES ('r2', ?, ?, 'new', ?)", A.id, B.id, Date.now());
await purgeExpired(env);
check("old reports are deleted, recent ones kept", !q1("SELECT 1 x FROM reports WHERE id = 'r1'") && q1("SELECT 1 x FROM reports WHERE id = 'r2'"));

console.log("\n# Inactive accounts");
const F = await signup("Fay", "10.0.3.1");
const G = await signup("Gus", "10.0.3.2");
sql("UPDATE users SET recovery_email = 'fay@x.test', email_verified = 1 WHERE id = ?", F.id);
sql("UPDATE users SET last_seen_at = ? WHERE id IN (?, ?)", Date.now() - 705 * DAY, F.id, G.id);
const n0 = out.length;
const r1 = await purgeExpired(env);
check("an account unused for ~23 months is warned by email", r1.inactiveWarned === 1 && out.slice(n0).some((m) => m.to[0] === "fay@x.test" && /deleted soon/.test(m.subject)), r1);
check("nothing is deleted yet", q1("SELECT 1 x FROM users WHERE id = ?", F.id) && q1("SELECT 1 x FROM users WHERE id = ?", G.id));
const n1 = out.length;
await purgeExpired(env);
check("the warning is sent once", out.length === n1);
sql("UPDATE users SET last_seen_at = ?, inactive_warned_at = ? WHERE id = ?", Date.now() - 740 * DAY, Date.now() - 31 * DAY, F.id);
sql("UPDATE users SET last_seen_at = ? WHERE id = ?", Date.now() - 740 * DAY, G.id);
const r2 = await purgeExpired(env);
check("after the warning period, unused accounts are deleted", r2.inactiveDeleted === 2 && !q1("SELECT 1 x FROM users WHERE id = ?", F.id) && !q1("SELECT 1 x FROM users WHERE id = ?", G.id), r2);
const H = await signup("Hal", "10.0.3.3");
sql("UPDATE users SET last_seen_at = ?, inactive_warned_at = ? WHERE id = ?", Date.now() - 705 * DAY, Date.now() - 1 * DAY, H.id);
await H.c.get("/api/me");
check("using the account resets the warning", q1("SELECT inactive_warned_at w FROM users WHERE id = ?", H.id).w === null);

console.log("\n# Privacy requests and complaints");
{
  const anon = client({ ip: "198.51.100.80" });
  const users0 = q1("SELECT COUNT(*) n FROM users").n;
  const n = out.length;
  const bad = await anon.post("/api/privacy-request", { kind: "complaint", email: "x", message: "hello there" });
  check("an email is required", bad.status === 400);
  const ok = await anon.post("/api/privacy-request", { kind: "complaint", email: "Person@Mail.test", message: "You kept my photo." });
  check("a request needs no account and creates none", ok.status === 200 && q1("SELECT COUNT(*) n FROM users").n === users0, ok.json);
  const pr = q1("SELECT * FROM privacy_requests WHERE id = ?", ok.json.id);
  check("it is logged with a 30-day deadline", pr.kind === "complaint" && pr.email === "person@mail.test" && Math.abs(pr.respond_by - pr.created_at - 30 * DAY) < 1000);
  check("an acknowledgement is emailed straight away", out.length === n + 1 && out.at(-1).to[0] === "person@mail.test" && out.at(-1).text.includes(ok.json.id) && pr.acknowledged_at);
  for (let i = 0; i < 5; i++) await anon.post("/api/privacy-request", { kind: "other", email: "a@b.test", message: "spam spam" });
  check("it is rate-limited", (await anon.post("/api/privacy-request", { kind: "other", email: "a@b.test", message: "spam spam" })).status === 429);

  const ADMIN = { authorization: "Bearer test-admin-token" };
  const bare = client({ ip: "198.51.100.81" });
  check("the admin list needs the token", (await bare.get("/api/admin/privacy-requests")).status === 401);
  const list = await bare.get("/api/admin/privacy-requests", ADMIN);
  check("the admin sees open requests", list.json.requests.some((r) => r.id === ok.json.id && r.acknowledged));
  check("closing needs an outcome", (await bare.post(`/api/admin/privacy-requests/${ok.json.id}/close`, {}, ADMIN)).status === 400);
  check("closing records it", (await bare.post(`/api/admin/privacy-requests/${ok.json.id}/close`, { outcome: "Deleted the photo" }, ADMIN)).status === 200 && q1("SELECT status s FROM privacy_requests WHERE id = ?", ok.json.id).s === "closed");

  await bare.get("/api/admin/users?q=Alice", ADMIN);
  const log = q("SELECT action, detail FROM admin_audit");
  check("admin actions are written to an audit log, with the search words", log.some((l) => l.action === "GET /api/admin/users" && l.detail.includes("Alice")), log.slice(-3));
}

console.log("\n# Export and event choices");
{
  const ex = (await A.c.get("/api/account/export")).json;
  check("the export includes consent history, email settings and request logs", Array.isArray(ex.consentHistory) && ex.consentHistory.length && "newsEmails" in ex.user && "emailVerified" in ex.user && Array.isArray(ex.privacyRequests), Object.keys(ex));
  // Host accounts are separate (F10): their data is exported on the host portal, not with a card.
  const hostU = { c: client({ ip: "10.0.4.1", site: "host" }) };
  await becomeHost(hostU.c, { kind: "company", name: "HostCo", email: "h@hostco.test" });
  const hx = (await hostU.c.get("/api/host/account/export")).json;
  check("the host portal export includes the host account, organisation, tickets and invoices",
    hx.hostAccount?.email === "h@hostco.test" && hx.organisations?.[0]?.name === "HostCo" && Array.isArray(hx.tickets) && Array.isArray(hx.billingRequests)
    && hx.consentHistory?.some((x) => x.scope.startsWith("host_terms:")), hx);
  check("…and no session token or code hash", !/code_hash|"id":"[0-9a-f]{64}"/.test(JSON.stringify(hx)));
  check("an attendee export carries no host account data", !("hostProfile" in ex) && !("organisations" in ex) && !JSON.stringify(ex).includes("h@hostco.test"));

  const ev = (await hostU.c.post("/api/host/events", { name: "Choice Night", startsAt: Date.now() - 3600e3, endsAt: Date.now() + 3600e3 })).json;
  await hostU.c.put(`/api/host/events/${ev.id}`, { sponsors: [{ name: "Acme", perk: "Pens" }] }).catch(() => {});
  const J = await signup("Jo", "10.0.4.2");
  await J.c.post(`/api/e/${ev.code}/checkin`, { directoryConsent: true });
  const ch = await J.c.get(`/api/e/${ev.id}/choices`);
  check("a checked-in person sees their choices", ch.status === 200 && ch.json.directory === true, ch.json);
  const off = await J.c.put(`/api/e/${ev.id}/choices`, { directory: false, sponsors: [] });
  check("they can withdraw the directory choice", off.status === 200 && (await J.c.get(`/api/e/${ev.id}/choices`)).json.directory === false);
  check("the withdrawal is in the history", q1("SELECT 1 x FROM consent_log WHERE user_id = ? AND scope = ? AND action = 'withdrawn'", J.id, `event_directory:${ev.id}`));
  check("someone who didn't check in has no choices", (await A.c.get(`/api/e/${ev.id}/choices`)).status === 404);
}

console.log("\n# Privacy by default");
{
  const r = await client().get("/");
  check("pages ask search engines not to index", /noindex/.test(r.headers.get("x-robots-tag") || ""));
}

summary();
