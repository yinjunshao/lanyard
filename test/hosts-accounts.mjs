// F10: host accounts separate from attendee accounts.
// Migration 0018 against data in the pre-F10 shape (test/fixtures/old-hosts.sql).
import { readFileSync } from "node:fs";
import { makeDb, migrationFiles, readMigration, check, summary } from "./harness.mjs";

const MIGRATION = migrationFiles().find((f) => f.startsWith("0018_"));
const fixture = readFileSync(new URL("./fixtures/old-hosts.sql", import.meta.url), "utf8");

console.log("\n# Migration 0018 on a database that already has host data");
const db = makeDb({ before: "0018" });
const raw = db.raw;
const n = (sql, ...p) => raw.prepare(sql).get(...p).n;
raw.exec(fixture);
const OLD = ["users", "sessions", "profiles", "host_profiles", "orgs", "org_members", "org_invites", "org_transfers",
  "host_tickets", "org_integrations", "credits", "promo_redemptions", "events", "checkins", "sponsors", "consents",
  "consent_log", "feedback_responses", "feedback_done", "event_mail_log", "connections", "cards", "billing_requests"];
const before = Object.fromEntries(OLD.map((t) => [t, n(`SELECT COUNT(*) n FROM ${t}`)]));
const billsBefore = raw.prepare("SELECT * FROM billing_requests ORDER BY id").all();
raw.exec(readMigration(MIGRATION));
const after = Object.fromEntries(OLD.map((t) => [t, n(`SELECT COUNT(*) n FROM ${t}`)]));
check("it applies on top of 0017 with host data in place", !!MIGRATION);
check("no row in any existing table is lost", OLD.every((t) => before[t] === after[t] && before[t] > 0),
  OLD.filter((t) => before[t] !== after[t] || !before[t]));

const billsAfter = raw.prepare("SELECT * FROM billing_requests ORDER BY id").all();
check("every invoice record is copied with all its fields",
  billsAfter.length === billsBefore.length && billsBefore.every((b, i) =>
    ["id", "org_id", "user_id", "sku", "quantity", "amount_pence", "contact_email", "po_number", "note", "status", "created_at"]
      .every((k) => billsAfter[i][k] === b[k])), billsAfter);
check("…and keeps the organisation's name on the row", billsAfter.every((b) => b.org_name === "Example Events Ltd"), billsAfter.map((b) => b.org_name));

const NEW = ["host_accounts", "host_sessions", "host_login_codes", "host_org_members", "host_org_transfers",
  "host_org_invites", "host_org_tickets", "host_mail_log"];
check("the new host tables exist and start empty", NEW.every((t) => n(`SELECT COUNT(*) n FROM ${t}`) === 0));
const cols = (t) => raw.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
check("host_accounts has the planned columns", ["id", "email", "email_verified_at", "full_name", "use_case", "event_frequency",
  "typical_size", "referral", "status", "created_at", "last_login_at", "deleted_at", "terms_version", "terms_at"]
  .every((c) => cols("host_accounts").includes(c)), cols("host_accounts"));
const fks = (t) => raw.prepare(`PRAGMA foreign_key_list(${t})`).all().map((f) => `${f.from}->${f.table}`);
check("no new host table points at users", NEW.every((t) => !fks(t).some((f) => f.endsWith("->users"))), NEW.map((t) => [t, fks(t)]));
check("organisation tables point at host accounts",
  fks("host_org_members").includes("host_account_id->host_accounts") && fks("host_org_transfers").includes("to_host_id->host_accounts")
  && fks("host_org_invites").includes("created_by->host_accounts") && fks("host_org_tickets").includes("host_account_id->host_accounts"));

console.log("\n# The new tables behave");
const ts = Date.now();
raw.prepare("INSERT INTO host_accounts (id, email, created_at) VALUES ('ha00000001', 'a@example.com', ?)").run(ts);
let dup = false;
try { raw.prepare("INSERT INTO host_accounts (id, email, created_at) VALUES ('ha00000002', 'a@example.com', ?)").run(ts); } catch { dup = true; }
check("one host account per email", dup);
let orphan = false;
try { raw.prepare("INSERT INTO host_org_members (org_id, host_account_id, created_at) VALUES ('fxorg00001', 'fxhost0001', ?)").run(ts); } catch { orphan = true; }
check("an attendee user id can't be made an organisation member", orphan);
raw.prepare("INSERT INTO host_sessions (id, host_account_id, created_at, expires_at) VALUES ('s1', 'ha00000001', ?, ?)").run(ts, ts + 1e6);
raw.prepare("INSERT INTO host_org_members (org_id, host_account_id, created_at) VALUES ('fxorg00001', 'ha00000001', ?)").run(ts);
raw.prepare("DELETE FROM host_accounts WHERE id = 'ha00000001'").run();
check("deleting a host account ends its sessions and memberships",
  n("SELECT COUNT(*) n FROM host_sessions") === 0 && n("SELECT COUNT(*) n FROM host_org_members") === 0);
raw.prepare("DELETE FROM orgs WHERE id = 'fxorg00001'").run();
const kept = raw.prepare("SELECT org_id, org_name FROM billing_requests").all();
check("deleting an organisation keeps its invoice records (org_id becomes empty, the name stays)",
  kept.length === 2 && kept.every((b) => b.org_id === null && b.org_name === "Example Events Ltd"), kept);

console.log("\n# The migration itself deletes nothing (the reset script does that)");
const sql = readMigration(MIGRATION).replace(/--.*$/gm, "");
const drops = [...sql.matchAll(/\b(DROP\s+TABLE|DELETE\s+FROM|UPDATE)\s+(\w+)/gi)].map((m) => `${m[1]} ${m[2]}`.toUpperCase().replace(/\s+/g, " "));
check("the only DROP is the old billing_requests after its rows are copied, and nothing is deleted or updated",
  drops.length === 1 && drops[0] === "DROP TABLE BILLING_REQUESTS" && sql.indexOf("INSERT INTO billing_requests_new") < sql.indexOf("DROP TABLE billing_requests"), drops);
check("a fresh database gets every migration", (() => { makeDb(); return true; })());

console.log("\n# Reset, option B (full wipe): scripts/reset-hosts.mjs");
const { COUNT_SQL, LOGO_SQL, SCHEMA_SQL, WIPED, wipeSql, verify } = await import("../scripts/reset-hosts.mjs");
const rdb = makeDb({ before: "0018" });
const r = rdb.raw;
r.exec(fixture);
const hasSchema = () => r.prepare(SCHEMA_SQL).get().n === 4; // the host tables of 0018 and F17's event_presence (0023)
check("the script refuses a database without migration 0018", !hasSchema());
r.exec(readMigration(MIGRATION));
check("…and still refuses one that has 0018 but not 0023 (F17: it has to see presence rows to remove their selfies)", !hasSchema());
r.exec(readMigration("0023_event_presence.sql"));
check("…and accepts one with both", hasSchema());
// Some data on the new model too, as production will have between the deploy and the reset.
r.exec(`INSERT INTO host_accounts (id, email, full_name, status, created_at) VALUES ('hanew00001', 'new@company.example.com', 'New Host', 'active', 1);
  INSERT INTO host_sessions (id, host_account_id, created_at, expires_at) VALUES ('hs1', 'hanew00001', 1, 4100000000000);
  INSERT INTO host_login_codes (email, code_hash, created_at, expires_at) VALUES ('new@company.example.com', 'x', 1, 2);
  INSERT INTO orgs (id, name, plan, org_type, verification_status, created_at) VALUES ('fxorg00003', 'New Model Ltd', 'starter', 'company', 'approved', 1);
  INSERT INTO host_org_members (org_id, host_account_id, role, created_at) VALUES ('fxorg00003', 'hanew00001', 'owner', 1);
  INSERT INTO billing_requests (id, org_id, org_name, host_account_id, sku, quantity, amount_pence, contact_email, status, created_at)
    VALUES ('fxbill0003', 'fxorg00003', 'New Model Ltd', 'hanew00001', 'standard_1', 1, 1250, 'new@company.example.com', 'open', 1);
  INSERT INTO rate_limits (key, window_start, count) VALUES ('hmail:e:new@company.example.com', 1, 2), ('guest:ip:x', 1, 3);`);
const pre = r.prepare(COUNT_SQL).get();
const billsBeforeReset = r.prepare("SELECT * FROM billing_requests ORDER BY id").all();
check("the dry-run counts see the host data", pre.orgs === 3 && pre.events === 2 && pre.host_accounts === 1 && pre.host_profiles === 2
  && pre.billing_requests_kept === 3 && pre.connections_with_event === 1 && pre.cards_with_event === 1 && pre.host_consents === 3, pre);
check("…and counting changes nothing", JSON.stringify(r.prepare(COUNT_SQL).get()) === JSON.stringify(pre));
check("sponsor logos in R2 are listed for deleting by hand", r.prepare(LOGO_SQL).all().map((x) => x.logo_key).join() === "event/fxlogo0001.webp");
r.exec("BEGIN"); r.exec(wipeSql(pre, 1794300000000)); r.exec("COMMIT");
const post = r.prepare(COUNT_SQL).get();
check("after the reset every host table is empty", WIPED.every((t) => post[t] === 0), WIPED.filter((t) => post[t] !== 0));
check("the script's own check passes", verify(pre, post).length === 0, verify(pre, post));
const billsAfterReset = r.prepare("SELECT * FROM billing_requests ORDER BY id").all();
check("billing requests are untouched: same rows, amounts, emails and status, with the organisation's name kept",
  billsAfterReset.length === 3 && billsAfterReset.every((b, i) => ["id", "sku", "quantity", "amount_pence", "contact_email", "status", "created_at", "org_name"].every((k) => b[k] === billsBeforeReset[i][k]))
  && billsAfterReset.every((b) => b.org_id === null && b.org_name), billsAfterReset);
check("attendees keep their accounts, cards and connections", post.users_kept === pre.users_kept && post.connections_kept === 1
  && r.prepare("SELECT COUNT(*) n FROM cards").get().n === 1 && r.prepare("SELECT COUNT(*) n FROM profiles").get().n === 3);
check("…a connection made at an event loses only the event label", r.prepare("SELECT event_id FROM connections").get().event_id === null && post.cards_with_event === 0);
check("Host Terms and event consents go; the attendee's own Terms consent stays",
  post.host_consents === 0 && r.prepare("SELECT scope FROM consents").all().map((x) => x.scope).join() === "terms:2026-10-26");
check("the consent history (consent_log) is kept", post.consent_log_kept === pre.consent_log_kept && post.consent_log_kept > 0);
const audit = r.prepare("SELECT * FROM admin_audit WHERE action = 'host_reset'").all();
check("the reset writes one admin log entry with the counts", audit.length === 1 && JSON.parse(audit[0].detail).counts.orgs === 3 && audit[0].at === 1794300000000, audit);
check("host rate limits are cleared, others kept", r.prepare("SELECT group_concat(key) k FROM rate_limits").get().k === "guest:ip:x");
r.exec("PRAGMA foreign_keys = ON;");
check("no foreign key is left dangling", r.prepare("PRAGMA foreign_key_check").all().length === 0, r.prepare("PRAGMA foreign_key_check").all());
r.exec("BEGIN"); r.exec(wipeSql(post)); r.exec("COMMIT");
check("running it twice is safe", verify(post, r.prepare(COUNT_SQL).get()).length === 0 && r.prepare("SELECT COUNT(*) n FROM billing_requests").get().n === 3);

summary();
