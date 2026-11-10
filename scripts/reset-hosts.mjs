#!/usr/bin/env node
// F10.10: reset every host account, option B (full wipe), chosen by the owner
// on 2026-11-10. See "Reset of existing host accounts" in the F10 plan note.
//
// Deletes: host accounts and sessions (old and new tables), organisations,
// memberships, invites, transfers, tickets, integrations, credits, events,
// check-ins, sponsors, feedback, event mail logs, and the consents that belong
// to them (Host Terms, event directory and sponsor choices). Attendees keep
// their accounts, cards and connections; a connection or card made for an event
// loses its event label (event_id is set to NULL first; it has no foreign key).
// Keeps: billing_requests (6 years, 0006/0018: the organisation's name stays on
// the row) and consent_log (proof of what was agreed). Writes an admin_audit row.
//
// Needs migration 0018. Dry run by default: prints the counts and changes nothing.
//   node scripts/reset-hosts.mjs --sqlite <copy.sqlite>            dry run on a SQLite file
//   node scripts/reset-hosts.mjs --sqlite <copy.sqlite> --apply    wipe that file
//   node scripts/reset-hosts.mjs --local [--apply]                 local D1 (wrangler --local)
//   node scripts/reset-hosts.mjs --remote [--apply --confirm=RESET-ALL-HOSTS]
//                                  production D1. The owner runs this, after a
//                                  D1 export, never an agent.
// R2: sponsor logos in the bucket are listed, not deleted (see the plan note).
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Tables emptied by option B, in delete order (children first).
export const WIPED = [
  "event_mail_log", "host_mail_log", "feedback_responses", "feedback_done", "checkins", "sponsors", "events",
  "credits", "promo_redemptions", "org_integrations",
  "org_invites", "org_transfers", "host_tickets", "org_members", "host_profiles",
  "host_org_invites", "host_org_transfers", "host_org_tickets", "host_org_members",
  "orgs", "host_sessions", "host_login_codes", "host_accounts",
];
const HOST_CONSENTS = "(scope LIKE 'host_terms:%' OR scope LIKE 'event_directory:%' OR scope LIKE 'event_sponsor:%' OR scope LIKE 'sponsor:%')";

// One row of counts: what goes, what changes and what must stay.
export const COUNT_SQL = `SELECT ${[
  ...WIPED.map((t) => `(SELECT COUNT(*) FROM ${t}) AS ${t}`),
  `(SELECT COUNT(*) FROM consents WHERE ${HOST_CONSENTS}) AS host_consents`,
  "(SELECT COUNT(*) FROM connections WHERE event_id IS NOT NULL) AS connections_with_event",
  "(SELECT COUNT(*) FROM cards WHERE event_id IS NOT NULL) AS cards_with_event",
  "(SELECT COUNT(*) FROM billing_requests) AS billing_requests_kept",
  "(SELECT COUNT(*) FROM billing_requests WHERE org_id IS NOT NULL AND org_name IS NULL) AS billing_without_name",
  "(SELECT COUNT(*) FROM users) AS users_kept",
  "(SELECT COUNT(*) FROM connections) AS connections_kept",
  "(SELECT COUNT(*) FROM consent_log) AS consent_log_kept",
].join(",\n  ")}`;
export const LOGO_SQL = "SELECT logo_key FROM sponsors WHERE logo_key IS NOT NULL";
export const SCHEMA_SQL = "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('host_accounts', 'host_org_members', 'host_mail_log')";

/** The wipe, as SQL. `counts` (from COUNT_SQL) goes into the audit row. */
export function wipeSql(counts, at = Date.now()) {
  const detail = JSON.stringify({ option: "B", counts }).replace(/'/g, "''");
  return [
    "-- F10 host reset, option B (full wipe). billing_requests and consent_log are kept.",
    `INSERT INTO admin_audit (id, at, action, detail, ip) VALUES (lower(hex(randomblob(10))), ${Number(at)}, 'host_reset', '${detail}', 'reset-hosts.mjs');`,
    "UPDATE billing_requests SET org_name = (SELECT name FROM orgs WHERE orgs.id = billing_requests.org_id) WHERE org_name IS NULL AND org_id IS NOT NULL;",
    "UPDATE connections SET event_id = NULL WHERE event_id IS NOT NULL;",
    "UPDATE cards SET event_id = NULL WHERE event_id IS NOT NULL;",
    `DELETE FROM consents WHERE ${HOST_CONSENTS};`,
    ...WIPED.map((t) => `DELETE FROM ${t};`),
    "DELETE FROM rate_limits WHERE key LIKE 'hmail:%' OR key LIKE 'hauth:%' OR key LIKE 'day:org:ip:%' OR key LIKE 'int:test:%';",
  ].join("\n");
}

/** After an apply: anything still wrong, as a list of messages (empty = fine). */
export function verify(before, after) {
  const bad = [];
  for (const t of WIPED) if (after[t] !== 0) bad.push(`${t} still has ${after[t]} rows`);
  if (after.host_consents !== 0) bad.push("host consents are left");
  if (after.connections_with_event !== 0 || after.cards_with_event !== 0) bad.push("event labels are left");
  for (const k of ["billing_requests_kept", "users_kept", "connections_kept"]) if (after[k] !== before[k]) bad.push(`${k} changed: ${before[k]} -> ${after[k]}`);
  if (after.consent_log_kept < before.consent_log_kept) bad.push("consent_log lost rows");
  return bad;
}

/* ------------------------------- running it ------------------------------- */

function sqliteDb(file) {
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON;");
  return {
    rows: (sql) => db.prepare(sql).all(),
    exec: (sql) => { db.exec("BEGIN"); try { db.exec(sql); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } },
    close: () => db.close(),
  };
}

function wranglerDb(where) {
  const base = ["wrangler", "d1", "execute", "lanyard_db", where === "remote" ? "--remote" : "--local",
    ...(where === "remote" ? ["--config", "wrangler.production.toml"] : [])];
  const run = (args) => {
    const r = spawnSync("npx", [...base, ...args], { encoding: "utf8", shell: process.platform === "win32" });
    if (r.status !== 0) throw new Error(`wrangler failed:\n${r.stderr || r.stdout}`);
    return r.stdout;
  };
  return {
    rows: (sql) => {
      const out = run(["--json", "--command", JSON.stringify(sql.replace(/\s+/g, " "))]);
      const parsed = JSON.parse(out.slice(out.indexOf("[")));
      return parsed[0]?.results || [];
    },
    exec: (sql) => {
      const dir = mkdtempSync(join(tmpdir(), "lanyard-reset-"));
      const file = join(dir, "reset.sql");
      writeFileSync(file, sql);
      try { run(["--file", file, "--yes"]); } finally { rmSync(dir, { recursive: true, force: true }); }
    },
    close: () => {},
  };
}

function main(argv) {
  const arg = (k) => argv.find((a) => a === k || a.startsWith(k + "="));
  const sqlite = argv[argv.indexOf("--sqlite") + 1];
  const where = arg("--remote") ? "remote" : arg("--local") ? "local" : arg("--sqlite") ? "sqlite" : null;
  const apply = !!arg("--apply");
  if (!where) { console.error("Say where: --sqlite <file>, --local or --remote. Dry run unless --apply."); return 2; }
  if (where === "sqlite" && (!sqlite || !existsSync(sqlite))) { console.error("No such SQLite file."); return 2; }
  if (where === "remote" && apply && arg("--confirm")?.split("=")[1] !== "RESET-ALL-HOSTS") {
    console.error("Production wipe: take a D1 export first, then add --confirm=RESET-ALL-HOSTS."); return 2;
  }
  const db = where === "sqlite" ? sqliteDb(sqlite) : wranglerDb(where);
  try {
    if (Number(db.rows(SCHEMA_SQL)[0]?.n) !== 3) { console.error("Migration 0018 is not applied to this database. Apply it first."); return 2; }
    const before = db.rows(COUNT_SQL)[0];
    const logos = db.rows(LOGO_SQL).map((r) => r.logo_key);
    console.log(`Host reset, option B (full wipe): ${where}${where === "sqlite" ? ` ${sqlite}` : ""}${apply ? "" : " (dry run, nothing changed)"}`);
    console.table(Object.entries(before).map(([k, v]) => ({ count: k, now: Number(v), after: WIPED.includes(k) || ["host_consents", "connections_with_event", "cards_with_event", "billing_without_name"].includes(k) ? 0 : Number(v) })));
    if (logos.length) console.log(`R2 sponsor logos to delete by hand (${logos.length}):\n${logos.join("\n")}`);
    if (!apply) { console.log("Dry run. Add --apply to wipe."); return 0; }
    db.exec(wipeSql(before));
    const after = db.rows(COUNT_SQL)[0];
    const bad = verify(before, after);
    console.table(Object.entries(after).map(([k, v]) => ({ count: k, now: Number(v) })));
    if (bad.length) { console.error("Check failed:\n" + bad.join("\n")); return 1; }
    console.log(`Done. ${before.billing_requests_kept} billing requests kept.`);
    return 0;
  } finally { db.close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
