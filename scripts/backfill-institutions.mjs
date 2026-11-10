#!/usr/bin/env node
// F12.4: give existing profiles and organisations an institution_id by matching
// their university text against the institution list (exact, ignoring case, on
// the official name or an alias that belongs to one institution only).
//
// Only rows with no institution_id and some text are looked at. A match sets
// institution_id and, when the text was an alias ("UCL"), also replaces it with
// the official name, because a listed institution always shows its official
// name. Text that matches nothing is left exactly as it is and printed for
// review. Nothing is guessed: partial matches and ambiguous aliases are skipped.
//
// Needs migration 0020. Dry run by default: prints counts and the unmatched
// values and changes nothing.
//   node scripts/backfill-institutions.mjs --sqlite <copy.sqlite>           dry run on a SQLite file
//   node scripts/backfill-institutions.mjs --sqlite <copy.sqlite> --apply   update that file
//   node scripts/backfill-institutions.mjs --local [--apply]                local D1 (wrangler --local)
// There is no --remote. Production runs only with the owner's go-ahead: export
// D1, run this on the copy, read the output, then ask for a remote option.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { institutionForText } from "../src/lib/institutions.js";

const TARGETS = [
  { table: "profiles", key: "user_id", col: "uni" },
  { table: "orgs", key: "id", col: "university" },
];
const select = (t) => `SELECT ${t.key} AS k, ${t.col} AS text FROM ${t.table} WHERE institution_id IS NULL AND ${t.col} IS NOT NULL AND TRIM(${t.col}) != ''`;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * Pure: rows are { k, text } per target table. Returns, per table, the updates
 * ({ k, id, name, renamed }) and the unmatched texts with how many rows have each.
 */
export function plan(rowsByTable, list) {
  const out = {};
  for (const { table } of TARGETS) {
    const updates = [];
    const unmatched = new Map();
    for (const { k, text } of rowsByTable[table] || []) {
      const inst = institutionForText(list, text);
      if (inst) updates.push({ k, id: inst.id, name: inst.name, renamed: inst.name !== text.trim() });
      else unmatched.set(text, (unmatched.get(text) || 0) + 1);
    }
    out[table] = { total: (rowsByTable[table] || []).length, updates, unmatched: [...unmatched].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) };
  }
  return out;
}

/** The UPDATE statements for a plan. */
export function sqlFor(result) {
  const lines = [];
  for (const t of TARGETS) {
    for (const u of result[t.table].updates) {
      lines.push(`UPDATE ${t.table} SET institution_id = ${q(u.id)}, ${t.col} = ${q(u.name)} WHERE ${t.key} = ${q(u.k)} AND institution_id IS NULL;`);
    }
  }
  return lines.join("\n");
}

export function report(result) {
  const lines = [];
  for (const t of TARGETS) {
    const r = result[t.table];
    const renamed = r.updates.filter((u) => u.renamed).length;
    lines.push(`${t.table}.${t.col}: ${r.total} with text and no id; ${r.updates.length} matched (${renamed} will have their text replaced by the official name, for example an alias); ${r.total - r.updates.length} unmatched`);
    if (r.unmatched.length) {
      lines.push("  unmatched values, most common first (left as they are):");
      for (const [text, n] of r.unmatched) lines.push(`    ${n} x ${JSON.stringify(text)}`);
    }
  }
  return lines.join("\n");
}

async function run() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const si = args.indexOf("--sqlite");
  const local = args.includes("--local");
  if (args.includes("--remote")) { console.error("There is no --remote option. See the note at the top of this file."); process.exit(2); }
  if ((si < 0) === !local) { console.error("Use --sqlite <file> or --local, optionally with --apply."); process.exit(2); }
  const list = JSON.parse(readFileSync(fileURLToPath(new URL("../src/data/institutions-uk.json", import.meta.url)), "utf8")).institutions;

  let read, write;
  if (si >= 0) {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(args[si + 1]);
    read = (sql) => db.prepare(sql).all();
    write = (sql) => db.exec(sql);
  } else {
    const wrangler = (extra) => spawnSync("npx", ["wrangler", "d1", "execute", "lanyard_db", "--local", "--json", ...extra], { encoding: "utf8", shell: true, maxBuffer: 1 << 26 });
    const viaFile = (sql) => {
      const dir = mkdtempSync(join(tmpdir(), "lanyard-backfill-"));
      try {
        writeFileSync(join(dir, "b.sql"), sql);
        const r = wrangler(["--file", join(dir, "b.sql")]);
        if (r.status !== 0) throw new Error(r.stderr || r.stdout);
        return r.stdout;
      } finally { rmSync(dir, { recursive: true, force: true }); }
    };
    read = (sql) => { const out = JSON.parse(viaFile(sql)); return out[0].results; };
    write = (sql) => { viaFile(sql); };
  }

  const rows = Object.fromEntries(TARGETS.map((t) => [t.table, read(select(t))]));
  const result = plan(rows, list);
  console.log(report(result));
  const sql = sqlFor(result);
  if (!apply) { console.log("\nDry run: nothing changed. Add --apply to update."); return; }
  if (sql) write(sql);
  console.log(`\nApplied ${sql ? sql.split("\n").length : 0} updates.`);
}

if (process.argv[1]?.endsWith("backfill-institutions.mjs")) await run();
