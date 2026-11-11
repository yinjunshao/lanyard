// F20: promo codes that give a host's organisation event credits.
// Offline: the real Worker on in-memory SQLite (test/harness.mjs).
import { readFileSync, readdirSync } from "node:fs";
import { makeDb, makeEnv, migrationFiles, readMigration, becomeHost, hostSignIn, check, summary } from "./harness.mjs";

const MIGRATION = migrationFiles().find((f) => f.startsWith("0025_"));

console.log("\n# Migration 0025 adds only");
{
  const db = makeDb({ before: "0025" });
  const raw = db.raw;
  raw.exec("INSERT INTO promo_codes (code, reward, days, max_uses, uses, attempts, created_at) VALUES ('OLDONE', 'plus', 30, 5, 2, 3, 1)");
  const before = raw.prepare("SELECT * FROM promo_codes ORDER BY code").all();
  raw.exec(readMigration(MIGRATION));
  const after = raw.prepare("SELECT * FROM promo_codes ORDER BY code").all();
  check("it applies on top of 0024 with codes in place", !!MIGRATION && after.length === before.length && after.length === 2);
  check("every existing row keeps every value and is an attendee code",
    before.every((b, i) => Object.keys(b).every((k) => after[i][k] === b[k]) && after[i].audience === "user" && after[i].credits === null && after[i].org_kinds === null), after);
  const sql = readMigration(MIGRATION).replace(/--.*$/gm, "");
  const risky = [...sql.matchAll(/\b(DROP\s+\w+|DELETE\s+FROM|UPDATE\s+\w+|INSERT\s+INTO\s+\w+)/gi)].map((m) => m[1]);
  check("it drops, deletes, updates and inserts nothing (safe before the new code is deployed)", risky.length === 0, risky);
  check("…and each ALTER only adds a column", [...sql.matchAll(/ALTER TABLE \w+ (\w+) COLUMN/gi)].every((m) => m[1].toUpperCase() === "ADD"));
  // The claims table: one claim per organisation and one per host account for a code.
  const cols = raw.prepare("PRAGMA table_info(host_promo_claims)").all().map((c) => c.name);
  check("the claims table records code, organisation, host account, credits, days, the credit row and when",
    ["code", "org_id", "host_account_id", "credits", "credit_days", "credit_id", "created_at", "granted_at"].every((k) => cols.includes(k)), cols);
  const idx = raw.prepare("PRAGMA index_list(host_promo_claims)").all().filter((i) => i.unique).map((i) => raw.prepare(`PRAGMA index_info(${i.name})`).all().map((c) => c.name).join("+"));
  check("a database rule allows one claim per code and organisation, and one per code and host account", idx.includes("code+org_id") && idx.includes("code+host_account_id"), idx);
}

const T = await makeEnv({ ADMIN_TOKEN: "adm" });
const { client, q1, q, env } = T;
const A = { authorization: "Bearer adm" };
const admin = client({ ip: "10.9.0.1" });
const DAY = 864e5;

console.log("\n# Admin: making host codes");
check("admin needs the token to list", (await admin.get("/api/admin/promos")).status === 401);
check("…and to make a host code", (await admin.post("/api/admin/promos", { audience: "host", code: "HOSTAAA", credits: 3, maxUses: 5 })).status === 401);
const wrongToken = await admin.post("/api/admin/promos", { audience: "host", code: "HOSTAAA", credits: 3, maxUses: 5 }, { authorization: "Bearer nope" });
check("…a wrong token is refused", wrongToken.status === 401);
const mk = (o) => admin.post("/api/admin/promos", { audience: "host", ...o }, A);
const made = await mk({ code: "host-three", credits: 3, creditDays: 200, maxUses: 2, note: "Welcome pack" });
check("an admin can make a 3-credit host code with a limit", made.status === 200 && made.json.code === "HOSTTHREE", made.json);
const row = q1("SELECT * FROM promo_codes WHERE code = 'HOSTTHREE'");
check("it is stored as a host code that gives credits, with its days and limit",
  row.audience === "host" && row.reward === "credits" && row.credits === 3 && row.credit_days === 200 && row.days === 200 && row.max_uses === 2 && row.active === 1, row);
check("credit days default to 365", (await mk({ code: "HOSTYEAR", credits: 1, maxUses: 1 })).status === 200 && q1("SELECT credit_days FROM promo_codes WHERE code='HOSTYEAR'").credit_days === 365);
check("a host code can be limited to some kinds of organisation", (await mk({ code: "HOSTSOC", credits: 2, maxUses: 10, orgKinds: ["society"] })).status === 200
  && q1("SELECT org_kinds FROM promo_codes WHERE code='HOSTSOC'").org_kinds === '["society"]');
for (const [why, body] of [
  ["no limit (credits are spent on events, so a host code always has one)", { code: "NOLIMIT1", credits: 3 }],
  ["a blank limit", { code: "NOLIMIT2", credits: 3, maxUses: "" }],
  ["no credits", { code: "NOCRED01", maxUses: 3 }],
  ["zero credits", { code: "NOCRED02", credits: 0, maxUses: 3 }],
  ["more than 50 credits", { code: "BIGCRED1", credits: 51, maxUses: 3 }],
  ["a negative limit", { code: "NEGLIM01", credits: 1, maxUses: -4 }],
  ["a limit over 10,000", { code: "HUGELIM1", credits: 1, maxUses: 10001 }],
  ["credit days over 730", { code: "LONGDAY1", credits: 1, maxUses: 1, creditDays: 731 }],
  ["zero credit days", { code: "ZERODAY1", credits: 1, maxUses: 1, creditDays: 0 }],
  ["a code that is too short", { code: "AB", credits: 1, maxUses: 1 }],
  ["an end date in the past", { code: "PASTEND1", credits: 1, maxUses: 1, expiresAt: Date.now() - 1000 }],
  ["a start after the end", { code: "BACKWRD1", credits: 1, maxUses: 1, startsAt: Date.now() + 3 * DAY, expiresAt: Date.now() + DAY }],
  ["an organisation kind that does not exist", { code: "BADKIND1", credits: 1, maxUses: 1, orgKinds: ["wizard"] }],
  ["an empty list of kinds", { code: "BADKIND2", credits: 1, maxUses: 1, orgKinds: [] }],
]) {
  const r = await mk(body);
  check("refused: " + why, r.status === 400 && !q1("SELECT 1 AS x FROM promo_codes WHERE code = ?", body.code), r.json);
}
check("a code that already exists (even an attendee code) is refused", (await mk({ code: "FIRST50", credits: 1, maxUses: 1 })).status === 409);
check("an unknown audience is refused", (await admin.post("/api/admin/promos", { audience: "everyone", code: "WHOEVER1", days: 1 }, A)).status === 400);
check("an attendee code is still made the old way (no audience)", (await admin.post("/api/admin/promos", { code: "USERONE1", days: 30, maxUses: "" }, A)).status === 200
  && q1("SELECT audience, reward, credits FROM promo_codes WHERE code='USERONE1'").audience === "user");

console.log("\n# Admin: list, edit, switch off");
const list = (await admin.get("/api/admin/promos", A)).json.promos;
const lh = list.find((p) => p.code === "HOSTTHREE");
check("the list shows the audience and the totals for a host code", lh.audience === "host" && lh.credits === 3 && lh.claims === 0 && lh.held === 0 && lh.credits_issued === 0, lh);
check("an attendee code shows as one", list.find((p) => p.code === "FIRST50").audience === "user");
const ed = (code, body) => admin.post(`/api/admin/promos/${code}/edit`, body, A);
check("editing needs the token", (await admin.post("/api/admin/promos/HOSTTHREE/edit", { note: "x" })).status === 401);
check("the limit can be raised", (await ed("HOSTTHREE", { maxUses: 4 })).status === 200 && q1("SELECT max_uses FROM promo_codes WHERE code='HOSTTHREE'").max_uses === 4);
check("a host code's limit cannot be cleared", (await ed("HOSTTHREE", { maxUses: "" })).status === 400);
check("…or set to nonsense", (await ed("HOSTTHREE", { maxUses: 0 })).status === 400 && (await ed("HOSTTHREE", { maxUses: "lots" })).status === 400);
const soon = Date.now() + 10 * DAY;
check("dates and the note can be changed", (await ed("HOSTTHREE", { startsAt: Date.now() - DAY, expiresAt: soon, note: "Changed" })).status === 200
  && q1("SELECT expires_at, note FROM promo_codes WHERE code='HOSTTHREE'").expires_at === Number(new Date(soon)) );
check("an end in the past is refused (switch the code off instead)", (await ed("HOSTTHREE", { expiresAt: Date.now() - DAY })).status === 400);
check("a start after the end is refused", (await ed("HOSTTHREE", { startsAt: soon + DAY })).status === 400);
check("credits, days, audience and the code itself cannot be edited (they are ignored)", (await ed("HOSTTHREE", { credits: 99, audience: "user", note: "n" })).status === 200
  && q1("SELECT credits, audience FROM promo_codes WHERE code='HOSTTHREE'").credits === 3 && q1("SELECT audience FROM promo_codes WHERE code='HOSTTHREE'").audience === "host");
check("an empty edit is refused", (await ed("HOSTTHREE", {})).status === 400);
check("an unknown code is a 404", (await ed("NOSUCH99", { note: "x" })).status === 404);
check("a limit cannot go below the number already used", (() => {
  env.DB.raw.prepare("UPDATE promo_codes SET uses = 3 WHERE code = 'HOSTTHREE'").run(); return true; })()
  && (await ed("HOSTTHREE", { maxUses: 2 })).status === 400 && (await ed("HOSTTHREE", { maxUses: 3 })).status === 200);
env.DB.raw.prepare("UPDATE promo_codes SET uses = 0 WHERE code = 'HOSTTHREE'").run();
check("switching off needs the token", (await admin.post("/api/admin/promos/HOSTYEAR/active", { active: false })).status === 401);
check("a host code can be switched off and on", (await admin.post("/api/admin/promos/HOSTYEAR/active", { active: false }, A)).status === 200
  && q1("SELECT active FROM promo_codes WHERE code='HOSTYEAR'").active === 0
  && (await admin.post("/api/admin/promos/HOSTYEAR/active", { active: true }, A)).status === 200 && q1("SELECT active FROM promo_codes WHERE code='HOSTYEAR'").active === 1);
check("switching off a code that does not exist is a 404", (await admin.post("/api/admin/promos/NOSUCH99/active", { active: false }, A)).status === 404);

console.log("\n# Attendees cannot use a host code");
{
  const web = client({ ip: "10.9.1.1" });
  await web.post("/api/profile", { name: "Attendee", acceptTerms: true, over18: true });
  const id = (await web.get("/api/me")).json.user.id;
  env.DB.raw.prepare("UPDATE users SET email_verified = 1, recovery_email = 'a@uni.test' WHERE id = ?").run(id);
  const unknown = await web.get("/api/redeem/ZZZNOSUCH");
  const host = await web.get("/api/redeem/HOSTYEAR");
  check("looking a host code up on the main site looks exactly like an unknown code", host.status === 404 && host.json.code === "bad_code"
    && host.status === unknown.status && JSON.stringify(host.json) === JSON.stringify(unknown.json), host.json);
  const post = await web.post("/api/redeem/HOSTYEAR");
  check("redeeming it there is refused the same way", post.status === 404 && post.json.code === "bad_code", post.json);
  check("…no Plus, no claim, no place in a queue, no count changed",
    (await web.get("/api/me")).json.plan.tier === "free"
    && q1("SELECT COUNT(*) n FROM promo_claims WHERE code = 'HOSTYEAR'").n === 0
    && q1("SELECT uses, attempts FROM promo_codes WHERE code = 'HOSTYEAR'").uses === 0
    && q1("SELECT attempts FROM promo_codes WHERE code = 'HOSTYEAR'").attempts === 0
    && q1("SELECT COUNT(*) n FROM host_promo_claims").n === 0
    && q1("SELECT COUNT(*) n FROM credits").n === 0);
  check("an attendee code still works there", (await web.post("/api/redeem/USERONE1")).status === 200);
}

console.log("\n# The host reset (scripts/reset-hosts.mjs, option B) and host promo claims");
{
  const { COUNT_SQL, WIPED, wipeSql, verify, SCHEMA_SQL } = await import("../scripts/reset-hosts.mjs");
  const r = makeDb().raw;
  r.exec(`INSERT INTO host_accounts (id, email, full_name, status, created_at) VALUES ('hpa0000001', 'a@work.example.com', 'A', 'active', 1);
    INSERT INTO orgs (id, name, plan, org_type, verification_status, created_at) VALUES ('hpo0000001', 'Org One', 'starter', 'company', 'approved', 1);
    INSERT INTO host_org_members (org_id, host_account_id, role, created_at) VALUES ('hpo0000001', 'hpa0000001', 'owner', 1);
    INSERT INTO promo_codes (code, reward, days, max_uses, uses, created_at, audience, credits, credit_days) VALUES ('RESETME1', 'credits', 365, 5, 1, 1, 'host', 3, 365);
    INSERT INTO promo_codes (code, reward, days, max_uses, uses, created_at) VALUES ('USERKEEP', 'plus', 30, 5, 2, 1);
    INSERT INTO credits (id, org_id, events_granted, events_used, expires_at, reason, granted_by, created_at) VALUES ('promo_RESETME1_hpo0000001', 'hpo0000001', 3, 0, 9e12, 'promo:RESETME1', 'promo', 1);
    INSERT INTO host_promo_claims (claim_id, code, org_id, host_account_id, position, credits, credit_days, credit_id, created_at, granted_at)
      VALUES ('hpc0000001', 'RESETME1', 'hpo0000001', 'hpa0000001', 1, 3, 365, 'promo_RESETME1_hpo0000001', 1, 1);
    INSERT INTO rate_limits (key, window_start, count) VALUES ('hpromo:look:ip:1.2.3.4', 1, 3), ('promo:look:1.2.3.4', 1, 3);`);
  const pre = r.prepare(COUNT_SQL).get();
  check("the reset's dry run counts the claims and the host code with uses", pre.host_promo_claims === 1 && pre.host_codes_with_uses === 1 && pre.host_codes_kept === 1, pre);
  check("the claims table is in the list the full wipe empties", WIPED.includes("host_promo_claims")
    && WIPED.indexOf("host_promo_claims") < WIPED.indexOf("orgs") && WIPED.indexOf("host_promo_claims") < WIPED.indexOf("host_accounts"));
  r.exec("BEGIN"); r.exec(wipeSql(pre, 1794300000000)); r.exec("COMMIT");
  const post = r.prepare(COUNT_SQL).get();
  check("after the reset there are no claims and no credits", post.host_promo_claims === 0 && post.credits === 0, post);
  check("…the codes are kept, with their uses set back to 0 so the count matches the claims left",
    q1Raw(r, "SELECT uses FROM promo_codes WHERE code = 'RESETME1'") === 0 && post.host_codes_kept === 1 && post.host_codes_with_uses === 0);
  check("…an attendee code is not touched", q1Raw(r, "SELECT uses FROM promo_codes WHERE code = 'USERKEEP'") === 2);
  check("…the host promo throttle counters go and others stay", r.prepare("SELECT key FROM rate_limits").all().map((x) => x.key).join() === "promo:look:1.2.3.4");
  check("the script's own check passes", verify(pre, post).length === 0, verify(pre, post));
  check("…and fails if a host code still counts claims that are gone", verify(pre, { ...post, host_codes_with_uses: 1 }).length > 0);
  check("a database without migration 0025 is refused by the script", (() => { const o = makeDb({ before: "0025" }).raw; return o.prepare(SCHEMA_SQL).get().n < 5; })());
}
function q1Raw(raw, sql) { return Object.values(raw.prepare(sql).get())[0]; }

// ---------------------------------------------------------------------------------------------
// Redeeming (F20.2)
// ---------------------------------------------------------------------------------------------
let hostN = 0;
const hostIp = () => `10.9.${10 + Math.floor(++hostN / 200)}.${(hostN % 200) + 1}`;
const col = (sql, ...p) => Object.values(q1(sql, ...p) || {})[0];
async function newHost(opts = {}) {
  const c = client({ site: "host", ip: opts.ip || hostIp() });
  const h = await becomeHost(c, opts);
  const id = col("SELECT id FROM host_accounts WHERE email = ?", h.email);
  const orgId = col("SELECT org_id FROM host_org_members WHERE host_account_id = ?", id);
  if (!opts.keepStarter && orgId) env.DB.raw.prepare("DELETE FROM credits WHERE org_id = ?").run(orgId); // start from nothing
  return { c, ...h, id, orgId };
}
const left = async (h) => (await h.c.get("/api/host/billing")).json.credits.remaining;
const newCode = async (code, o = {}) => {
  const r = await admin.post("/api/admin/promos", { audience: "host", code, credits: 3, maxUses: 10, ...o }, A);
  if (r.status !== 200) throw new Error("could not make " + code + ": " + JSON.stringify(r.json));
  return code;
};
// Makes a race certain: the first `n` transactions wait at the door until all n have arrived, so every
// request has passed its own checks before any of them writes. (A real Worker gets this by chance; a
// test must not leave it to chance.) A request that was refused before writing does not hold the rest up.
async function racing(n, fn) {
  const orig = env.DB.batch;
  let held = [];
  const release = () => { const go = held; held = []; go.forEach((f) => f()); };
  env.DB.batch = (stmts) => new Promise((res, rej) => {
    held.push(() => orig.call(env.DB, stmts).then(res, rej));
    if (held.length >= n) release(); else setTimeout(release, 200);
  });
  try { return await fn(); } finally { env.DB.batch = orig; }
}
const claims = (code) => q("SELECT * FROM host_promo_claims WHERE code = ?", code);
const creditRows = (orgId) => q("SELECT * FROM credits WHERE org_id = ?", orgId);
const uses = (code) => col("SELECT uses FROM promo_codes WHERE code = ?", code);

console.log("\n# Redeeming: who can");
{
  const code = await newCode("WHOCAN01");
  const anon = client({ site: "host", ip: hostIp() });
  check("signed out: looking a code up is 401", (await anon.get("/api/host/redeem/WHOCAN01")).status === 401);
  check("signed out: redeeming is 401", (await anon.post("/api/host/redeem/WHOCAN01")).status === 401);
  const web = client({ ip: hostIp() });
  await web.post("/api/profile", { name: "Attendee Two", acceptTerms: true, over18: true });
  const onMain = await web.post("/api/host/redeem/WHOCAN01");
  check("the main site refuses the host API (403)", onMain.status === 403 && onMain.json.code === "wrong_site", onMain.json);
  const asHost = client({ site: "host", ip: hostIp() });
  for (const [k, v] of web.jar) asHost.jar.set(k, v); // the attendee cookie sent to the host site
  check("an attendee cookie on the host site is not a host sign-in (401)", (await asHost.post("/api/host/redeem/WHOCAN01")).status === 401 && (await asHost.get("/api/host/redeem/WHOCAN01")).status === 401);
  check("the admin token is not a host sign-in either", (await anon.post("/api/host/redeem/WHOCAN01", {}, A)).status === 401);
  check("the host site serves no attendee redeem route (the other flow)", (await anon.get("/api/redeem/WHOCAN01")).status === 401);
  const bare = await newHost({ kind: null });
  const noOrg = await bare.c.post("/api/host/redeem/WHOCAN01");
  check("a host with no organisation yet is told to make one first (409)", noOrg.status === 409 && noOrg.json.code === "no_org", noOrg.json);
  const half = client({ site: "host", ip: hostIp() });
  await hostSignIn(half, "halfway@work.example.com");
  const unsetup = await half.post("/api/host/redeem/WHOCAN01");
  check("a host who has not finished setup (details, Host Terms) cannot redeem (403)", unsetup.status === 403 && unsetup.json.code === "details_required", unsetup.json);
  const h = await newHost();
  env.DB.raw.prepare("UPDATE host_accounts SET email_verified_at = NULL WHERE id = ?").run(h.id);
  const nv = await h.c.post("/api/host/redeem/WHOCAN01");
  check("an account without a verified email cannot redeem", nv.status === 403 && nv.json.code === "needs_email" && claims(code).length === 0, nv.json);
  env.DB.raw.prepare("UPDATE host_accounts SET email_verified_at = 1 WHERE id = ?").run(h.id);
  env.DB.raw.prepare("UPDATE host_org_members SET role = 'sponsor_viewer' WHERE host_account_id = ?").run(h.id);
  const sv = await h.c.post("/api/host/redeem/WHOCAN01");
  check("a sponsor viewer cannot redeem for the organisation (403)", sv.status === 403 && sv.json.code === "not_allowed" && claims(code).length === 0, sv.json);
  env.DB.raw.prepare("UPDATE host_org_members SET role = 'staff' WHERE host_account_id = ?").run(h.id);
  const st = await h.c.post("/api/host/redeem/WHOCAN01");
  check("a staff member can", st.status === 200 && claims(code).length === 1, st.json);
}

console.log("\n# Redeeming: a new individual host takes a 3-credit code");
{
  const code = await newCode("THREEFREE", { credits: 3, creditDays: 100, maxUses: 5 });
  const h = await newHost();
  check("they start with no credits and cannot make an event", (await left(h)) === 0 && (await h.c.post("/api/host/events", { name: "One" })).status === 402);
  const look = await h.c.get("/api/host/redeem/threefree");
  check("looking the code up shows what it gives, how many are left and their organisation, and nothing is taken",
    look.status === 200 && look.json.promo.credits === 3 && look.json.promo.days === 100 && look.json.promo.left === 5 && look.json.mine === null && typeof look.json.org.name === "string", look.json);
  check("a lookup writes nothing", claims(code).length === 0 && uses(code) === 0);
  const t0 = Date.now();
  const r = await h.c.post("/api/host/redeem/THREEFREE");
  check("redeeming gives the credits straight away", r.status === 200 && !r.json.already && r.json.mine.held === false && r.json.mine.credits === 3 && r.json.credits.remaining === 3, r.json);
  const cr = creditRows(h.orgId);
  check("one credits row: 3 granted, none used, for 100 days, reason promo:CODE, granted by promo",
    cr.length === 1 && cr[0].events_granted === 3 && cr[0].events_used === 0 && cr[0].reason === "promo:THREEFREE" && cr[0].granted_by === "promo"
    && Math.abs(cr[0].expires_at - (t0 + 100 * DAY)) < 60e3, cr);
  const cl = claims(code)[0];
  check("the claim records who, which organisation, how many credits, which credits row and when (for an audit)",
    claims(code).length === 1 && cl.org_id === h.orgId && cl.host_account_id === h.id && cl.credits === 3 && cl.credit_days === 100 && cl.credit_id === cr[0].id && cl.granted_at > 0 && cl.position === 1, cl);
  check("the code counts one use", uses(code) === 1);
  check("their Billing page lists the credits with the promo reason", (await h.c.get("/api/host/billing")).json.ledger.some((l) => l.reason === "promo:THREEFREE" && l.granted === 3));
  const made = [];
  for (let i = 0; i < 3; i++) made.push((await h.c.post("/api/host/events", { name: "Event " + i })).status);
  check("they can create 3 events", made.join() === "201,201,201", made);
  check("…and the fourth needs more credits (402)", (await h.c.post("/api/host/events", { name: "Four" })).status === 402);
  const again = await h.c.post("/api/host/redeem/THREEFREE");
  check("pressing again changes nothing: same claim, no second credit, no second use",
    again.status === 200 && again.json.already === true && claims(code).length === 1 && creditRows(h.orgId).length === 1 && uses(code) === 1, again.json);
  const lookAgain = await h.c.get("/api/host/redeem/THREEFREE");
  check("looking again shows their own claim", lookAgain.json.mine?.credits === 3 && lookAgain.json.mine.held === false, lookAgain.json);
  const ex = (await h.c.get("/api/host/account/export")).json;
  check("the credits appear in their data export", ex.promoCodes?.length === 1 && ex.promoCodes[0].code === "THREEFREE" && ex.promoCodes[0].credits === 3 && ex.promoCodes[0].heldUntilApproved === false && ex.promoCodes[0].creditsIssuedAt > 0, ex.promoCodes);
  const other = await newHost();
  const cross = await other.c.post("/api/host/redeem/THREEFREE", { orgId: h.orgId });
  check("an organisation id in the request is ignored: credits go to the signed-in host's own organisation only",
    cross.status === 200 && creditRows(other.orgId).length === 1 && creditRows(h.orgId).length === 1, cross.json);
  const peek = await newHost();
  const pj = JSON.stringify((await peek.c.get("/api/host/redeem/THREEFREE")).json);
  check("another organisation's lookup shows nothing about who else claimed it", !pj.includes(h.email) && !pj.includes(h.orgId) && !pj.includes(h.id) && !pj.includes(other.orgId));
}

console.log("\n# Once per organisation and once per host account");
{
  const code = await newCode("ONCEONLY1", { credits: 2, maxUses: 10 });
  const a = await newHost();
  await a.c.post("/api/host/redeem/ONCEONLY1");
  // The same host account with a second organisation (made behind the scenes: an account has one).
  env.DB.raw.prepare("INSERT INTO orgs (id, name, plan, org_type, verification_status, created_at) VALUES ('secondorg1', 'Second', 'starter', 'company', 'approved', 2)").run();
  env.DB.raw.prepare("DELETE FROM host_org_members WHERE host_account_id = ?").run(a.id);
  env.DB.raw.prepare("INSERT INTO host_org_members (org_id, host_account_id, role, created_at) VALUES ('secondorg1', ?, 'owner', 1)").run(a.id);
  const second = await a.c.post("/api/host/redeem/ONCEONLY1");
  check("the same host cannot claim the same code again with a second organisation", second.status === 200 && second.json.already === true
    && claims(code).length === 1 && creditRows("secondorg1").length === 0, second.json);
  const direct = (() => { try { env.DB.raw.prepare("INSERT INTO host_promo_claims (claim_id, code, org_id, host_account_id, position, credits, credit_days, created_at) VALUES ('forced0001', ?, 'secondorg1', ?, 2, 2, 365, 1)").run(code, a.id); return "inserted"; } catch (e) { return String(e.message); } })();
  check("…and the database itself refuses a second claim by the same host account", /UNIQUE/i.test(direct), direct);
  const owner = await newHost();
  await owner.c.post("/api/host/redeem/ONCEONLY1");
  const inv = (await owner.c.post("/api/host/team/invite", {})).json;
  const mate = await newHost({ kind: null });
  const joined = await mate.c.post("/api/host/team/join", { code: inv.code });
  const mateTry = await mate.c.post("/api/host/redeem/ONCEONLY1");
  check("a colleague in the same organisation cannot claim it again for that organisation", joined.status === 200 && mateTry.status === 200 && mateTry.json.already === true
    && claims(code).filter((x) => x.org_id === owner.orgId).length === 1 && creditRows(owner.orgId).length === 1, [joined.json, mateTry.json]);
  const direct2 = (() => { try { env.DB.raw.prepare("INSERT INTO host_promo_claims (claim_id, code, org_id, host_account_id, position, credits, credit_days, created_at) VALUES ('forced0002', ?, ?, ?, 9, 2, 365, 1)").run(code, owner.orgId, mate.id); return "inserted"; } catch (e) { return String(e.message); } })();
  check("…and the database refuses a second claim for the same organisation", /UNIQUE/i.test(direct2), direct2);
  // Deleting the organisation does not free the code for the same host account.
  env.DB.raw.prepare("DELETE FROM orgs WHERE id = ?").run(a.orgId);
  const orphan = q1("SELECT org_id FROM host_promo_claims WHERE host_account_id = ?", a.id);
  check("if an organisation is deleted its claim stays (without the organisation) so the host account still cannot claim again", orphan && orphan.org_id === null);
}

console.log("\n# Two presses at the same moment");
{
  const code = await newCode("RACE00001", { credits: 3, maxUses: 10 });
  const h = await newHost();
  const [r1, r2] = await racing(2, () => Promise.all([h.c.post("/api/host/redeem/RACE00001"), h.c.post("/api/host/redeem/RACE00001")]));
  check("two simultaneous presses by one host: both answer 200, one says it was already claimed", r1.status === 200 && r2.status === 200
    && [r1, r2].filter((r) => r.json.already).length === 1, [r1.json, r2.json]);
  check("…exactly one claim, one credits row, one use", claims(code).length === 1 && creditRows(h.orgId).length === 1 && uses(code) === 1);
  check("…and 3 credits, not 6", (await left(h)) === 3);
  const o = await newHost();
  const inv = (await o.c.post("/api/host/team/invite", {})).json;
  const m = await newHost({ kind: null });
  await m.c.post("/api/host/team/join", { code: inv.code });
  const code2 = await newCode("RACE00002", { credits: 4, maxUses: 10 });
  const [a, b] = await racing(2, () => Promise.all([o.c.post("/api/host/redeem/RACE00002"), m.c.post("/api/host/redeem/RACE00002")]));
  check("two colleagues pressing together: one claim, one credits row, 4 credits", a.status === 200 && b.status === 200 && claims(code2).length === 1 && creditRows(o.orgId).length === 1 && (await left(o)) === 4, [a.json, b.json]);
  const code3 = await newCode("RACE00003", { credits: 2, maxUses: 2 });
  const hs = [await newHost(), await newHost(), await newHost(), await newHost()];
  const rs = await racing(4, () => Promise.all(hs.map((x) => x.c.post("/api/host/redeem/RACE00003"))));
  const won = rs.filter((r) => r.status === 200), lost = rs.filter((r) => r.status === 404);
  check("four organisations racing for 2 slots: exactly 2 win and 2 are refused", won.length === 2 && lost.length === 2, rs.map((r) => r.status));
  check("…2 claims, 2 credits rows, the code says 2 used, never 3", claims(code3).length === 2 && uses(code3) === 2
    && q("SELECT * FROM credits WHERE reason = 'promo:RACE00003'").length === 2);
  check("…the losers get the same generic refusal as an unknown code and nothing is recorded for them",
    lost.every((r) => JSON.stringify(r.json) === JSON.stringify(lost[0].json)) && lost[0].json.code === "bad_code"
    && hs.filter((x, i) => rs[i].status === 404).every((x) => creditRows(x.orgId).length === 0 && !q1("SELECT 1 AS y FROM host_promo_claims WHERE host_account_id = ?", x.id)));
  // One slot, five organisations: the cap is checked again when the claim is written.
  const code4 = await newCode("RACE00004", { credits: 2, maxUses: 1 });
  const five = [await newHost(), await newHost(), await newHost(), await newHost(), await newHost()];
  const rs4 = await racing(5, () => Promise.all(five.map((x) => x.c.post("/api/host/redeem/RACE00004"))));
  check("five organisations racing for the last slot: exactly one wins, four are refused", rs4.filter((r) => r.status === 200).length === 1 && rs4.filter((r) => r.status === 404).length === 4, rs4.map((r) => r.status));
  check("…one claim, one credits row, one use, 2 credits issued in all", claims(code4).length === 1 && uses(code4) === 1 && q("SELECT * FROM credits WHERE reason = 'promo:RACE00004'").length === 1);
}

console.log("\n# Cap, dates, switched off, unknown and the other audience: one generic answer");
{
  const first = await newHost();
  await newCode("CAPPED001", { maxUses: 1 });
  await first.c.post("/api/host/redeem/CAPPED001");
  const cases = {
    "unknown code": "NOSUCHCODE",
    "an attendee code (the other audience)": "FIRST50",
    "total cap reached": "CAPPED001",
    "switched off": await newCode("OFFCODE01"),
    "not started yet": await newCode("FUTURE001"),
    "ended": await newCode("ENDED0001"),
    "for another kind of organisation": await newCode("SOCONLY01", { orgKinds: ["society"] }),
  };
  await admin.post("/api/admin/promos/OFFCODE01/active", { active: false }, A);
  env.DB.raw.prepare("UPDATE promo_codes SET starts_at = ? WHERE code = 'FUTURE001'").run(Date.now() + 5 * DAY);
  env.DB.raw.prepare("UPDATE promo_codes SET expires_at = ? WHERE code = 'ENDED0001'").run(Date.now() - 1000);
  const h = await newHost();
  const out = {};
  for (const [why, code] of Object.entries(cases)) {
    const g = await h.c.get(`/api/host/redeem/${code}`);
    const p = await h.c.post(`/api/host/redeem/${code}`);
    out[why] = [g.status, JSON.stringify(g.json), p.status, JSON.stringify(p.json)];
  }
  const ref = out["unknown code"];
  check("every one of them is a 404 with the same words and code (nothing says whether the code exists)",
    Object.values(out).every((o) => o[0] === 404 && o[2] === 404 && o[1] === ref[1] && o[3] === ref[3]) && JSON.parse(ref[1]).code === "bad_code", out);
  check("…the answer does not mention the code, the cap, the dates or the switch", !/FIRST50|CAPPED|OFFCODE|switched|expired|not started|doesn't exist/i.test(ref[1]), ref[1]);
  check("…nothing was claimed, credited or counted by those attempts", creditRows(h.orgId).length === 0 && !q1("SELECT 1 AS y FROM host_promo_claims WHERE host_account_id = ?", h.id)
    && uses("CAPPED001") === 1 && uses("FIRST50") === 0 && col("SELECT attempts FROM promo_codes WHERE code = 'FIRST50'") === 0);
  await admin.post("/api/admin/promos/CAPPED001/active", { active: false }, A);
  check("a host who already has the claim still sees it after the code is full or switched off", (await first.c.get("/api/host/redeem/CAPPED001")).json.mine?.credits === 3);
  await newCode("EDGETIME1", { credits: 1, maxUses: 5 });
  env.DB.raw.prepare("UPDATE promo_codes SET starts_at = ? WHERE code = 'EDGETIME1'").run(Date.now() - 1000);
  check("a code whose start has passed works", (await (await newHost()).c.post("/api/host/redeem/EDGETIME1")).status === 200);
  await newCode("EDGETIME2", { credits: 1, maxUses: 5 });
  env.DB.raw.prepare("UPDATE promo_codes SET expires_at = ? WHERE code = 'EDGETIME2'").run(Date.now() + 60e3);
  check("a code that has not yet ended works", (await (await newHost()).c.post("/api/host/redeem/EDGETIME2")).status === 200);
}

console.log("\n# Organisation kinds and approval");
{
  const code = await newCode("SOCIETYONLY", { credits: 2, maxUses: 5, orgKinds: ["society"] });
  const ind = await newHost();
  const refused = await ind.c.post("/api/host/redeem/SOCIETYONLY");
  const unknown = await ind.c.post("/api/host/redeem/NOTACODE12");
  check("an individual cannot use a society-only code (same refusal as an unknown code)", refused.status === 404 && JSON.stringify(refused.json) === JSON.stringify(unknown.json) && creditRows(ind.orgId).length === 0);
  const soc = await newHost({ email: "lead@campus.ac.uk", kind: "society", name: "Example Soc", extra: { leaderName: "Lead Person", orgLink: "https://example.org/soc", university: "Example Campus" }, keepStarter: true });
  check("a pending society was created", col("SELECT verification_status FROM orgs WHERE id = ?", soc.orgId) === "pending");
  const held = await soc.c.post("/api/host/redeem/SOCIETYONLY");
  check("a pending society's claim is held until approved: the host is told so, no credits yet", held.status === 200 && held.json.mine.held === true && held.json.org.status === "pending"
    && creditRows(soc.orgId).length === 0 && (await left(soc)) === 0, held.json);
  check("…but it takes a slot and is recorded", uses(code) === 1 && claims(code).length === 1 && claims(code)[0].credit_id === null && claims(code)[0].granted_at === null);
  const bill = (await soc.c.get("/api/host/billing")).json;
  check("Billing lists it as held until approved", bill.heldPromos.length === 1 && bill.heldPromos[0].code === "SOCIETYONLY" && bill.heldPromos[0].credits === 2, bill.heldPromos);
  check("pressing again while held changes nothing", (await soc.c.post("/api/host/redeem/SOCIETYONLY")).json.already === true && claims(code).length === 1 && creditRows(soc.orgId).length === 0);
  check("the admin list counts it as held", (await admin.get("/api/admin/promos", A)).json.promos.find((p) => p.code === "SOCIETYONLY").held === 1);
  const rej = await newHost({ email: "lead2@campus.ac.uk", kind: "society", name: "Rejected Soc", extra: { leaderName: "Lead Person", orgLink: "https://example.org/soc2", university: "Example Campus" } });
  env.DB.raw.prepare("UPDATE orgs SET verification_status = 'rejected' WHERE id = ?").run(rej.orgId);
  const rr = await rej.c.post("/api/host/redeem/SOCIETYONLY");
  check("a rejected organisation gets the generic refusal", rr.status === 404 && JSON.stringify(rr.json) === JSON.stringify(unknown.json) && claims(code).length === 1);
}

console.log("\n# Rate limits");
{
  await newCode("LIMITS001", { credits: 1, maxUses: 1000 });
  const a = await newHost({ ip: "10.9.90.1" });
  const b = await newHost({ ip: "10.9.90.1" });
  let okA = 0, blockedA = null;
  for (let i = 1; i <= 31; i++) { const r = await a.c.get("/api/host/redeem/LIMITS001"); if (r.status === 200) okA = i; else if (!blockedA) blockedA = [i, r]; }
  check("the first 30 lookups from one IP work and the 31st is a 429 with a friendly message", okA === 30 && blockedA[0] === 31 && blockedA[1].status === 429 && blockedA[1].json.code === "throttled" && /wait/i.test(blockedA[1].json.error), blockedA && [blockedA[0], blockedA[1].json]);
  check("…a different host account on the same IP is also stopped (the limit is per IP)", (await b.c.get("/api/host/redeem/LIMITS001")).status === 429);
  check("…another IP is fine", (await (await newHost({ ip: "10.9.90.2" })).c.get("/api/host/redeem/LIMITS001")).status === 200);
  const hop = await newHost({ ip: "10.9.91.1" });
  let blockedAt = 0;
  for (let i = 1; i <= 31; i++) {
    const c2 = client({ site: "host", ip: "10.9.92." + i });
    for (const [k, v] of hop.c.jar) c2.jar.set(k, v);
    if ((await c2.get("/api/host/redeem/LIMITS001")).status === 429) { blockedAt = i; break; }
  }
  check("one host account hopping between IPs is stopped on lookup 31 (the limit is per host account)", blockedAt === 31, blockedAt);
  const g = await newHost({ ip: "10.9.93.1" });
  let wrong = 0;
  for (let i = 0; i < 40; i++) { const r = await g.c.get("/api/host/redeem/GUESS" + i + "XX"); if (r.status === 404) wrong++; else break; }
  check("wrong guesses are stopped (a 429 after 30)", wrong === 30, wrong);
  const rd = await newHost({ ip: "10.9.94.1" });
  const codes = [];
  for (let i = 0; i < 22; i++) codes.push(await newCode("MANY" + String(i).padStart(4, "0"), { credits: 1, maxUses: 1000 }));
  let firstBlock = 0;
  for (let i = 0; i < 22; i++) {
    const c2 = client({ site: "host", ip: "10.9.95." + (i + 1) });
    for (const [k, v] of rd.c.jar) c2.jar.set(k, v);
    const r = await c2.post("/api/host/redeem/" + codes[i]);
    if (r.status === 429) { firstBlock = i + 1; break; }
  }
  check("one host account can press Redeem 20 times an hour; the 21st is a 429", firstBlock === 21, firstBlock);
  const ipHosts = [await newHost({ ip: "10.9.96.1" }), await newHost({ ip: "10.9.96.1" }), await newHost({ ip: "10.9.96.1" })];
  let tries = 0, ipBlocked = false;
  for (let round = 0; round < 12 && !ipBlocked; round++) for (const x of ipHosts) {
    tries++;
    if ((await x.c.post("/api/host/redeem/OKCODE" + round, {})).status === 429) { ipBlocked = true; break; }
  }
  check("redeem tries are limited per IP across accounts too (blocked by the 31st try from one IP)", ipBlocked && tries <= 31, tries);
}

console.log("\n# The 51st claimant");
{
  const code = await newCode("FIRSTFIFTY", { credits: 3, maxUses: 50 });
  let granted = 0, last = null;
  for (let i = 0; i < 50; i++) { const x = await newHost(); const r = await x.c.post("/api/host/redeem/FIRSTFIFTY"); if (r.status === 200 && r.json.mine.credits === 3 && r.json.mine.position === i + 1) granted++; }
  check("fifty hosts each get 3 credits, in order (claim numbers 1 to 50)", granted === 50 && uses(code) === 50 && q("SELECT * FROM credits WHERE reason = 'promo:FIRSTFIFTY'").length === 50);
  const late = await newHost();
  const lookLate = await late.c.get("/api/host/redeem/FIRSTFIFTY");
  const r51 = await late.c.post("/api/host/redeem/FIRSTFIFTY");
  check("the 51st is refused with the generic answer (a full code looks like an unknown one)", r51.status === 404 && r51.json.code === "bad_code" && lookLate.status === 404, r51.json);
  check("…no claim, no credits, no place in a queue, and the code still says 50", creditRows(late.orgId).length === 0 && claims(code).length === 50 && uses(code) === 50);
  const twice = await late.c.post("/api/host/redeem/FIRSTFIFTY");
  check("…pressing again stays refused", twice.status === 404 && claims(code).length === 50);
}


console.log("\n# The pages (source guards, F20.3)");
{
  const read = (f) => readFileSync(f, "utf8");
  const routes = read("src/router/routes.host.js");
  check("the host routes serve /redeem and /redeem/:code on the host site", routes.includes('path: "/redeem/:code?"'));
  check("…with the Billing page's own chunk, so the entry's chunk list (which every public page loads) gains no name (D024)",
    (routes.match(/import\("\.\.\/views\/HostBilling\.vue"\)/g) || []).length === 1
    && [...routes.matchAll(/import\("\.\.\/views\/(\w+)\.vue"\)/g)].map((m) => m[1]).sort().join() === "HostAccount,HostBilling,HostDashboard,HostEvent,HostSignOut");
  const redeem = read("src/components/HostRedeem.vue");
  check("the host page talks to the host API only (hostapi.js), never the attendee Api", /from "\.\.\/lib\/hostapi"/.test(redeem) && !/from "\.\.\/lib\/api"/.test(redeem) && !/Api\.(promo|redeem)\b/.test(redeem));
  check("its code box shows a format hint, not a real code", redeem.includes('placeholder="e.g. ABCD1234"'));
  const seeded = /VALUES \('([A-Z0-9]+)'/.exec(read("migrations/0017_promo_codes.sql"))?.[1];
  const srcFiles = ["src/views", "src/components", "src/lib", "src/router"].flatMap((d) => readdirSync(d).map((f) => d + "/" + f)).concat(["index.html"]);
  const leaks = srcFiles.filter((f) => { try { return /\.(vue|js|html)$/.test(f) && read(f).toUpperCase().includes(seeded); } catch { return false; } });
  check("no page, component, lib or route file names the poster code or any code from a migration", leaks.length === 0, leaks);
  check("no migration seeds a host code (host codes are made by an admin, never shipped)", !/audience.*'host'|INSERT[^;]*promo_codes[^;]*'host'/i.test(migrationFiles().filter((f) => f >= "0025").map(readMigration).join("\n").replace(/--.*$/gm, "")));
  check("the typed page and the failure page point to the main site for Plus codes, without saying whether any code exists", /redeemed on/.test(redeem) && !/exists/i.test(redeem));
  const shared = ["src/lib/api.js", "src/lib/store.js", "src/lib/profile.js", "src/components/Icon.vue", "src/components/Badge.vue", "src/components/CardView.vue", "src/main.js", "src/router/routes.attendee.js", "src/lib/redeem.js", "src/views/Redeem.vue"];
  check("nothing about host codes is in shared or attendee code (api.js, store.js, redeem.js, Redeem.vue, the entry, the attendee routes)",
    shared.every((f) => !/host\/redeem|hostredeem|HostRedeem/.test(read(f))), shared.filter((f) => /host\/redeem|hostredeem|HostRedeem/.test(read(f))));
  check("the host page's waiting-code store is its own (a different storage key from the attendee one)", /"lanyard-host-redeem"/.test(read("src/lib/hostredeem.js")) && /"lanyard-redeem"/.test(read("src/lib/redeem.js")));
  const billing = read("src/views/HostBilling.vue");
  check("Billing says 'Have a promo code?' and links to /redeem", /Have a promo code\?/.test(billing) && billing.includes('to="/redeem"'));
  check("Billing shows a claim held for approval, and names a promo credit in the history", /heldPromos/.test(billing) && /Promo code/.test(billing));
  check("the dashboard takes someone back to the code they came with, once, after setup", /pendingHostCode\(\)/.test(read("src/views/HostDashboard.vue")) && /clearPendingHostCode\(\)/.test(read("src/views/HostDashboard.vue")));
  const admin = read("src/views/Admin.vue");
  check("the admin form chooses who a code is for, and host codes have credits, days, a required limit and organisation kinds",
    /A host \(event credits\)/.test(admin) && /Event credits/.test(admin) && /Days they last/.test(admin) && /Limit \(required\)/.test(admin) && /Societies/.test(admin));
  check("the admin list gives a host code's totals and links to the host portal", /credits_issued/.test(admin) && /HOST_ORIGIN/.test(admin) && /held until approval/.test(admin));
  check("the admin page shows no organisation or host account for a code (totals only)", !/host_account|org_id|\.email/.test(admin.slice(admin.indexOf("<span class=\"label\">Promo codes"), admin.indexOf("Welcome steps, last"))));
}


console.log("\n# Held claims are issued when an admin approves the organisation (F20.4)");
{
  const { releaseHeldClaims } = await import("../worker/host-promo.js");
  const society = (n) => newHost({ email: `lead${n}@campus.ac.uk`, kind: "society", name: `Example Soc ${n}`, extra: { leaderName: "Lead Person", orgLink: `https://example.org/s${n}`, university: "Example Campus" }, keepStarter: true });
  const review = (orgId, body, headers = A) => admin.post(`/api/admin/orgs/${orgId}/review`, body, headers);

  const codeA = await newCode("HELDCODE1", { credits: 3, creditDays: 120, maxUses: 10 });
  const codeB = await newCode("HELDCODE2", { credits: 2, maxUses: 10 });
  const s1 = await society(11);
  const other = await society(12);
  await s1.c.post("/api/host/redeem/HELDCODE1");
  await s1.c.post("/api/host/redeem/HELDCODE2");
  await other.c.post("/api/host/redeem/HELDCODE1");
  check("two claims by one pending society, and one by another, are all held", claims(codeA).every((x) => x.credit_id === null) && claims(codeB).length === 1 && creditRows(s1.orgId).length === 0 && creditRows(other.orgId).length === 0);
  check("a host cannot approve (the admin route needs the admin token, not a host sign-in)", (await s1.c.post(`/api/admin/orgs/${s1.orgId}/review`, { decision: "approve" })).status === 401
    && (await review(s1.orgId, { decision: "approve" }, {})).status === 401);
  const t0 = Date.now();
  const ok = await review(s1.orgId, { decision: "approve" });
  check("approving the society says how many held claims it issued", ok.status === 200 && ok.json.released === 2, ok.json);
  const cr = creditRows(s1.orgId);
  const byReason = Object.fromEntries(cr.map((x) => [x.reason, x]));
  check("it now has the credits: 3 for 120 days from the approval, and 2 for 365 days, granted by promo",
    cr.length === 2 && byReason["promo:HELDCODE1"].events_granted === 3 && Math.abs(byReason["promo:HELDCODE1"].expires_at - (t0 + 120 * DAY)) < 60e3
    && byReason["promo:HELDCODE2"].events_granted === 2 && cr.every((x) => x.granted_by === "promo" && x.events_used === 0), cr);
  check("the claims are marked with their credits rows and the time", claims(codeA).filter((x) => x.org_id === s1.orgId).every((x) => x.credit_id === byReason["promo:HELDCODE1"].id && x.granted_at >= t0));
  check("the host sees 5 credits and no longer a held claim", (await left(s1)) === 5 && (await s1.c.get("/api/host/billing")).json.heldPromos.length === 0);
  check("another society's held claim is untouched by this approval", creditRows(other.orgId).length === 0 && claims(codeA).find((x) => x.org_id === other.orgId).credit_id === null);
  check("they can use the credits to create events beyond the weekly free one", (await s1.c.post("/api/host/events", { name: "First" })).status === 201 && (await s1.c.post("/api/host/events", { name: "Second" })).status === 201 && (await s1.c.post("/api/host/events", { name: "Third" })).status === 201);
  const again = await review(s1.orgId, { decision: "approve" });
  check("approving again is refused (it is no longer waiting) and issues nothing more", again.status === 404 && creditRows(s1.orgId).length === 2);
  check("running the release again, by hand, changes nothing (it can only ever issue a claim once)", (await releaseHeldClaims(env.DB, s1.orgId)) === 0 && creditRows(s1.orgId).length === 2 && uses(codeA) === 2);
  check("the audit totals: the code shows 2 claimed, 1 held, 3 credits issued", (() => { const p = q("SELECT (SELECT COUNT(*) FROM host_promo_claims h WHERE h.code = 'HELDCODE1' AND h.credit_id IS NULL) AS held, (SELECT COALESCE(SUM(credits),0) FROM host_promo_claims h WHERE h.code='HELDCODE1' AND h.credit_id IS NOT NULL) AS issued")[0]; return p.held === 1 && p.issued === 3; })());

  // A rejected organisation never gets them.
  const rej = await review(other.orgId, { decision: "reject", note: "Not a society" });
  check("rejecting issues nothing and the claim stays held", rej.status === 200 && rej.json.released === 0 && creditRows(other.orgId).length === 0 && claims(codeA).find((x) => x.org_id === other.orgId).credit_id === null);

  // A code switched off while held is not issued until it is on again.
  const codeC = await newCode("HELDCODE3", { credits: 4, maxUses: 10 });
  const s3 = await society(13);
  await s3.c.post("/api/host/redeem/HELDCODE3");
  await admin.post("/api/admin/promos/HELDCODE3/active", { active: false }, A);
  const off = await review(s3.orgId, { decision: "approve" });
  check("a code that was switched off while the claim was held is not issued on approval", off.status === 200 && off.json.released === 0 && creditRows(s3.orgId).length === 0);
  await admin.post("/api/admin/promos/HELDCODE3/active", { active: true }, A);
  const bill = await s3.c.get("/api/host/billing");
  check("…once it is on again, the next look at Billing issues it, once", bill.json.credits.remaining === 4 && bill.json.heldPromos.length === 0 && creditRows(s3.orgId).length === 1
    && (await s3.c.get("/api/host/billing")).json.credits.remaining === 4 && creditRows(s3.orgId).length === 1);

  // Safety net: an organisation approved some other way (or an interrupted approval) with a claim waiting.
  const codeD = await newCode("HELDCODE4", { credits: 2, maxUses: 10 });
  const s4 = await society(14);
  await s4.c.post("/api/host/redeem/HELDCODE4");
  env.DB.raw.prepare("UPDATE orgs SET verification_status = 'approved' WHERE id = ?").run(s4.orgId);
  check("an approved organisation with a claim still waiting gets it the next time it looks at Billing", (await left(s4)) === 2 && claims(codeD)[0].credit_id !== null);
  // The same press by an approved organisation whose claim is waiting.
  const codeE = await newCode("HELDCODE5", { credits: 2, maxUses: 10 });
  const s5 = await society(15);
  await s5.c.post("/api/host/redeem/HELDCODE5");
  env.DB.raw.prepare("UPDATE orgs SET verification_status = 'approved' WHERE id = ?").run(s5.orgId);
  const press = await s5.c.post("/api/host/redeem/HELDCODE5");
  check("…or when the host presses the code's button again", press.json.already === true && press.json.mine.held === false && creditRows(s5.orgId).length === 1 && uses(codeE) === 1);

  // Approving races with a press.
  const codeF = await newCode("HELDCODE6", { credits: 2, maxUses: 10 });
  const s6 = await society(16);
  await s6.c.post("/api/host/redeem/HELDCODE6");
  const [a1, a2] = await Promise.all([review(s6.orgId, { decision: "approve" }), s6.c.get("/api/host/billing")]);
  await Promise.all([releaseHeldClaims(env.DB, s6.orgId), releaseHeldClaims(env.DB, s6.orgId), s6.c.post("/api/host/redeem/HELDCODE6")]);
  check("an approval, Billing and two releases at once still issue the credits exactly once", a1.status === 200 && creditRows(s6.orgId).length === 1 && creditRows(s6.orgId)[0].events_granted === 2 && (await left(s6)) === 2 && uses(codeF) === 1);
  check("credits are issued for an organisation only, never to someone else's (every promo credit row belongs to the claim's own organisation)",
    q("SELECT COUNT(*) n FROM host_promo_claims c JOIN credits k ON k.id = c.credit_id WHERE k.org_id != c.org_id").every((r) => r.n === 0)
    && q("SELECT COUNT(*) n FROM credits WHERE reason LIKE 'promo:%' AND id NOT IN (SELECT credit_id FROM host_promo_claims WHERE credit_id IS NOT NULL)").every((r) => r.n === 0));
  check("across the whole run no code was issued more credits than its limit allows", q("SELECT p.code FROM promo_codes p WHERE p.audience = 'host' AND p.max_uses IS NOT NULL AND (SELECT COUNT(*) FROM host_promo_claims h WHERE h.code = p.code) > p.max_uses").length === 0
    && q("SELECT p.code FROM promo_codes p WHERE p.audience = 'host' AND p.uses != (SELECT COUNT(*) FROM host_promo_claims h WHERE h.code = p.code)").length === 0);
}

summary();
