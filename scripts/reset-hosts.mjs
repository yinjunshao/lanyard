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
// F36 card orders (billing_orders, billing_subscriptions, billing_events, migration 0031) are kept too
// (6 years): none is in WIPED, and their organisation and host ids become NULL as the rows they named go.
//
// F20 host promo codes: the claims (host_promo_claims, migration 0025) are wiped with the organisations
// and host accounts they belong to, as the credits they led to are. The codes themselves
// (promo_codes) are kept, with their uses counter set back to 0 so it again equals the claims
// that exist; claims are not billing records (nothing was paid), and the numbers wiped are in
// the admin_audit row. Anyone who held a code gets a fresh start, as every other host does.
//
// F23 AI feedback summaries (feedback_summaries, migration 0027) quote the event's written feedback, so they are wiped with the events.
//
// F31 named attendance (event_attendees, migration 0028) is a host's list of the people who checked in,
// so it is wiped with the events it belongs to. The consent_log rows that record what each person was
// shown and chose (event_attendance:, event_share_email:, event_share_card:) are kept with the rest of
// consent_log, as proof; they hold no list, only a person's own choice and the words they saw.
//
// F32 drops (drops, drop_items, drop_gives, voucher_uses, drop_audit, migration 0029) hold the keys, codes and voucher
// uses an event's host gave out. They are wiped with the events they belong to (the encrypted items and who was given
// them included); nothing of a drop is kept. The staff PIN hashes go with the drops.
//
// F55 card colours (cards.strap_color and cards.text_color, migration 0039) belong to an attendee's own card, which this reset keeps,
// so nothing here reads or changes a colour column; 0039 adds a nullable column and is not needed by this script.
//
// F60 suggestions at events (event_suggest, migration 0040: each person's intention and Suggest me choice at an event)
// are wiped with the events they belong to. The consent_log rows recording each choice (event_suggest:) are kept, as for F31.
//
// F66 company branding (migration 0044): an organisation's display name and logo columns go with its row. Its logo in R2
// is queued in media_deletes by a database trigger as the organisation is deleted, and the Worker's daily clean-up deletes
// it from R2; with --local or --remote and --apply this script also deletes each one straight after the wipe (one that
// fails stays queued for the clean-up). media_deletes is not wiped: it is the list of objects still to delete. The
// branding switch on events goes with the events. A database without 0044 has no logos, and the script still runs.
//
// Needs migrations 0018, 0023, 0025, 0027, 0028, 0029 and 0040. Dry run by default: prints the counts and changes nothing.
//   node scripts/reset-hosts.mjs --sqlite <copy.sqlite>            dry run on a SQLite file
//   node scripts/reset-hosts.mjs --sqlite <copy.sqlite> --apply    wipe that file
//   node scripts/reset-hosts.mjs --local [--apply]                 local D1 (wrangler --local)
//   node scripts/reset-hosts.mjs --remote [--apply --confirm=RESET-ALL-HOSTS]
//                                  production D1. The owner runs this, after a
//                                  D1 export, never an agent.
// R2: sponsor logos in the bucket are listed, not deleted (see the plan note). Event-presence
// selfies (F17, face photos) are deleted from R2 first, with `wrangler r2 object delete`, and the
// wipe only runs if every one went; on a --sqlite copy they are listed instead.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Tables emptied by option B, in delete order (children first).
export const WIPED = [
  "event_mail_log", "host_mail_log", "feedback_summaries", "feedback_responses", "feedback_done", "event_presence", "event_attendees", "event_suggest", "voucher_uses", "drop_gives", "drop_items", "drop_audit", "drops", "checkins", "sponsors", "events",
  "host_promo_claims", "credits", "promo_redemptions", "org_integrations",
  "org_invites", "org_transfers", "host_tickets", "org_members", "host_profiles",
  "host_org_invites", "host_org_transfers", "host_org_tickets", "host_org_members",
  "orgs", "host_sessions", "host_login_codes", "host_accounts",
];
const HOST_CONSENTS = "(scope LIKE 'host_terms:%' OR scope LIKE 'event_directory:%' OR scope LIKE 'event_presence:%' OR scope LIKE 'event_sponsor:%' OR scope LIKE 'sponsor:%')";

// One row of counts: what goes, what changes and what must stay.
export const COUNT_SQL = `SELECT ${[
  ...WIPED.map((t) => `(SELECT COUNT(*) FROM ${t}) AS ${t}`),
  `(SELECT COUNT(*) FROM consents WHERE ${HOST_CONSENTS}) AS host_consents`,
  "(SELECT COUNT(*) FROM connections WHERE event_id IS NOT NULL) AS connections_with_event",
  "(SELECT COUNT(*) FROM cards WHERE event_id IS NOT NULL) AS cards_with_event",
  "(SELECT COUNT(*) FROM promo_codes WHERE audience = 'host' AND uses != 0) AS host_codes_with_uses",
  "(SELECT COUNT(*) FROM promo_codes WHERE audience = 'host') AS host_codes_kept",
  "(SELECT COUNT(*) FROM billing_requests) AS billing_requests_kept",
  "(SELECT COUNT(*) FROM billing_requests WHERE org_id IS NOT NULL AND org_name IS NULL) AS billing_without_name",
  "(SELECT COUNT(*) FROM users) AS users_kept",
  "(SELECT COUNT(*) FROM connections) AS connections_kept",
  "(SELECT COUNT(*) FROM consent_log) AS consent_log_kept",
].join(",\n  ")}`;
export const LOGO_SQL = "SELECT logo_key FROM sponsors WHERE logo_key IS NOT NULL";
export const PRESENCE_SQL = "SELECT selfie_key FROM event_presence WHERE selfie_key IS NOT NULL";
export const BRAND_COLUMN_SQL = "SELECT COUNT(*) AS n FROM pragma_table_info('orgs') WHERE name = 'brand_logo_key'";
export const BRAND_LOGO_SQL = "SELECT brand_logo_key FROM orgs WHERE brand_logo_key IS NOT NULL";
export const SCHEMA_SQL = "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('host_accounts', 'host_org_members', 'host_mail_log', 'event_presence', 'host_promo_claims', 'feedback_summaries', 'event_attendees', 'drops', 'event_suggest')";
export const R2_BUCKET = "lanyard-media";

/** The wrangler arguments that delete one object from the media bucket. */
export const r2DeleteArgs = (where, key) => ["wrangler", "r2", "object", "delete", `${R2_BUCKET}/${key}`,
  ...(where === "remote" ? ["--remote", "--config", "wrangler.production.toml"] : ["--local"])];

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
    // The host codes stay; their claims are gone, so their counters start again.
    "UPDATE promo_codes SET uses = 0 WHERE audience = 'host';",
    "DELETE FROM rate_limits WHERE key LIKE 'hmail:%' OR key LIKE 'hauth:%' OR key LIKE 'day:org:ip:%' OR key LIKE 'int:test:%' OR key LIKE 'hpromo:%' OR key LIKE 'drop:%';",
  ].join("\n");
}

/** After an apply: anything still wrong, as a list of messages (empty = fine). */
export function verify(before, after) {
  const bad = [];
  for (const t of WIPED) if (after[t] !== 0) bad.push(`${t} still has ${after[t]} rows`);
  if (after.host_consents !== 0) bad.push("host consents are left");
  if (after.host_codes_with_uses !== 0) bad.push("host promo codes still count claims that are gone");
  if (after.host_codes_kept !== before.host_codes_kept) bad.push(`host promo codes changed: ${before.host_codes_kept} -> ${after.host_codes_kept}`);
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
    if (Number(db.rows(SCHEMA_SQL)[0]?.n) !== 9) { console.error("Migrations 0018, 0023, 0025, 0027, 0028, 0029 and 0040 are not all applied to this database. Apply them first."); return 2; }
    const before = db.rows(COUNT_SQL)[0];
    const logos = db.rows(LOGO_SQL).map((r) => r.logo_key);
    const selfies = db.rows(PRESENCE_SQL).map((r) => r.selfie_key);
    const brandLogos = Number(db.rows(BRAND_COLUMN_SQL)[0]?.n) ? db.rows(BRAND_LOGO_SQL).map((r) => r.brand_logo_key) : [];
    console.log(`Host reset, option B (full wipe): ${where}${where === "sqlite" ? ` ${sqlite}` : ""}${apply ? "" : " (dry run, nothing changed)"}`);
    console.table(Object.entries(before).map(([k, v]) => ({ count: k, now: Number(v), after: WIPED.includes(k) || ["host_consents", "connections_with_event", "cards_with_event", "billing_without_name", "host_codes_with_uses"].includes(k) ? 0 : Number(v) })));
    if (logos.length) console.log(`R2 sponsor logos to delete by hand (${logos.length}):\n${logos.join("\n")}`);
    if (selfies.length) {
      const direct = apply && where !== "sqlite";
      console.log(`Event-presence selfies in R2 (${selfies.length}): ${direct ? "deleted before the wipe" : "to delete by hand"}`);
      if (!direct) console.log(selfies.join(String.fromCharCode(10)));
    }
    if (brandLogos.length) {
      console.log(`Organisation logos in R2 (${brandLogos.length}): queued for deletion by the wipe${apply && where !== "sqlite" ? " and deleted after it" : ", deleted by the daily clean-up"}`);
      console.log(brandLogos.join(String.fromCharCode(10)));
    }
    if (!apply) { console.log("Dry run. Add --apply to wipe."); return 0; }
    if (where !== "sqlite") {
      // Face photos first: if one cannot be deleted, stop before the rows that point at them go.
      for (const key of selfies) {
        const r = spawnSync("npx", r2DeleteArgs(where, key), { encoding: "utf8", shell: process.platform === "win32" });
        if (r.status !== 0) { console.error(`Could not delete ${key} from R2; nothing was wiped. ${r.stderr || r.stdout}`); return 1; }
      }
    }
    db.exec(wipeSql(before));
    if (where !== "sqlite") {
      // F66: the organisations are gone, so nothing points at their logos; each stays queued if it cannot be deleted now.
      for (const key of brandLogos) {
        const r = spawnSync("npx", r2DeleteArgs(where, key), { encoding: "utf8", shell: process.platform === "win32" });
        if (r.status !== 0) console.error(`Could not delete ${key} from R2 now; the daily clean-up will.`);
      }
    }
    const after = db.rows(COUNT_SQL)[0];
    const bad = verify(before, after);
    console.table(Object.entries(after).map(([k, v]) => ({ count: k, now: Number(v) })));
    if (bad.length) { console.error("Check failed:\n" + bad.join("\n")); return 1; }
    console.log(`Done. ${before.billing_requests_kept} billing requests kept.`);
    return 0;
  } finally { db.close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
