// F31: named attendance with a check-in notice. Run: node test/named-attendance.mjs
// Each section says what it pins. The privacy bar (each line, with its negative cases) is
// listed in the F31 plan note's Log with the section of this file that tests it.
import { readFileSync } from "node:fs";
import { makeDb, migrationFiles, readMigration, makeEnv, becomeHost, check, summary } from "./harness.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

console.log("\n# Migration 0028 on a database that already has events, check-ins and consent records");
{
  const MIGRATION = migrationFiles().find((f) => f.startsWith("0028_"));
  const db = makeDb({ before: "0028" });
  const raw = db.raw;
  const n = (sql, ...p) => raw.prepare(sql).get(...p).n;
  const ts = Date.now();
  raw.prepare("INSERT INTO users (id, created_at, last_seen_at) VALUES ('u1', ?, ?)").run(ts, ts);
  raw.prepare("INSERT INTO events (id, code, name, created_at) VALUES ('e1', 'AB2CD', 'Old night', ?)").run(ts);
  raw.prepare("INSERT INTO checkins (event_id, user_id, created_at) VALUES ('e1', 'u1', ?)").run(ts);
  raw.prepare("INSERT INTO consent_log (id, user_id, scope, action, ref, at) VALUES ('c1', 'u1', 'terms:old', 'granted', NULL, ?)").run(ts);
  const counts = () => ["users", "events", "checkins", "consent_log"].map((t) => n(`SELECT COUNT(*) n FROM ${t}`));
  const before = counts();
  raw.exec(readMigration(MIGRATION));
  check("it applies on top of 0027", !!MIGRATION);
  check("no row in any existing table is lost or changed", JSON.stringify(counts()) === JSON.stringify(before) && n("SELECT COUNT(*) n FROM events WHERE name = 'Old night'") === 1);
  const ev = raw.prepare("SELECT collect_attendance, collect_items, collect_why FROM events WHERE id = 'e1'").get();
  check("an existing event has named attendance off, no items and no why line", ev.collect_attendance === 0 && ev.collect_items === "[]" && ev.collect_why === "", ev);
  const log = raw.prepare("SELECT wording, version FROM consent_log WHERE id = 'c1'").get();
  check("an existing consent record keeps NULL for the new wording and version columns", log.wording === null && log.version === null, log);
  check("the list table starts empty: nobody is on a list because a migration ran", n("SELECT COUNT(*) n FROM event_attendees") === 0);
  // The old code's statements still work on the new schema (the migration is safe to apply before the deploy).
  raw.prepare("INSERT INTO events (id, code, name, created_at) VALUES ('e2', 'ZZ9ZZ', 'Old code event', ?)").run(ts);
  raw.prepare("INSERT INTO consent_log (id, user_id, scope, action, ref, at) VALUES ('c2', 'u1', 'selfie', 'granted', NULL, ?)").run(ts);
  check("statements written for the old schema still run (an insert that names no new column)", n("SELECT COUNT(*) n FROM events WHERE collect_attendance = 0") === 2);
  raw.prepare("INSERT INTO event_attendees (event_id, user_id, items, notice_version, created_at, updated_at) VALUES ('e1', 'u1', '[]', 'v', ?, ?)").run(ts, ts);
  let dup = false;
  try { raw.prepare("INSERT INTO event_attendees (event_id, user_id, items, notice_version, created_at, updated_at) VALUES ('e1', 'u1', '[]', 'v', ?, ?)").run(ts, ts); } catch { dup = true; }
  check("one row per person per event", dup);
  raw.prepare("DELETE FROM events WHERE id = 'e1'").run();
  check("deleting the event deletes its list", n("SELECT COUNT(*) n FROM event_attendees") === 0);
  raw.prepare("INSERT INTO events (id, code, name, created_at) VALUES ('e3', 'YY8YY', 'Third', ?)").run(ts);
  raw.prepare("INSERT INTO event_attendees (event_id, user_id, items, notice_version, created_at, updated_at) VALUES ('e3', 'u1', '[]', 'v', ?, ?)").run(ts, ts);
  raw.prepare("DELETE FROM users WHERE id = 'u1'").run();
  check("deleting the account deletes the person's rows", n("SELECT COUNT(*) n FROM event_attendees") === 0);
  check("…and the consent record stays (it has no foreign key)", n("SELECT COUNT(*) n FROM consent_log WHERE user_id = 'u1'") === 2);
  const sql = readMigration(MIGRATION).replace(/--.*$/gm, "");
  const risky = [...sql.matchAll(/\b(DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+\w+|INSERT\s+INTO)\b/gi)].map((m) => m[0]);
  check("the migration only adds: no DROP, DELETE, UPDATE or INSERT", risky.length === 0, risky);
  check("a fresh database gets every migration", (() => { makeDb(); return true; })());
}

summary();
process.exit(process.exitCode || 0);
