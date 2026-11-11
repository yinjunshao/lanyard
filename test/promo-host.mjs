// F20: promo codes that give a host's organisation event credits.
// Offline: the real Worker on in-memory SQLite (test/harness.mjs).
import { readFileSync } from "node:fs";
import { makeDb, makeEnv, migrationFiles, readMigration, becomeHost, check, summary } from "./harness.mjs";

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
summary();
