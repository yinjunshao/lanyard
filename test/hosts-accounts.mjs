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

summary();
