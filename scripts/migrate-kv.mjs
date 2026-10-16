import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const stateDir = join(root, ".wrangler", "state", "v3", "kv");
const dbDir = join(stateDir, "miniflare-KVNamespaceObject");
const dbFile = readdirSync(dbDir).find((f) => f.endsWith(".sqlite"));
if (!dbFile) throw new Error("No local Miniflare KV SQLite database found.");
const db = join(dbDir, dbFile);

const blobRoot = join(stateDir, "LOCAL_PLACEHOLDER", "blobs");
const { DatabaseSync } = await import("node:sqlite");
const sqlite = new DatabaseSync(db, { readOnly: true });
const rows = sqlite.prepare("select key, blob_id, expiration from _mf_entries order by key").all();
sqlite.close();

const allowed = new Set(["profile", "code", "cred", "list", "conn", "thread", "photo"]);
const nowSeconds = Math.floor(Date.now() / 1000);
const entries = [];
const skipped = [];
const byPrefix = {};

for (const row of rows) {
  const key = row.key;
  const prefix = key.split(":", 1)[0];
  const expiration = row.expiration ? Math.floor(Number(row.expiration) / 1000) : undefined;
  if (!allowed.has(prefix) || (expiration && expiration <= nowSeconds)) {
    skipped.push(key);
    continue;
  }

  const blobPath = join(blobRoot, row.blob_id);
  const value = readFileSync(blobPath, "utf8");
  const entry = { key, value };
  if (expiration) entry.expiration = expiration;
  entries.push(entry);
  byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;
}

mkdirSync(join(root, ".migrations"), { recursive: true });
const outFile = join(root, ".migrations", "lanyard-kv.json");
writeFileSync(outFile, JSON.stringify(entries), "utf8");

console.log("Local KV export:", outFile);
console.log("Entries to migrate:", entries.length, byPrefix);
console.log("Skipped:", skipped.length, skipped.slice(0, 10));

if (process.argv.includes("--run")) {
  console.log("Uploading to remote Cloudflare KV binding LANYARD_KV...");
  execFileSync(
    process.execPath,
    [join(root, "node_modules", "wrangler", "bin", "wrangler.js"), "kv", "bulk", "put", outFile, "--binding", "LANYARD_KV", "--remote"],
    { cwd: root, stdio: "inherit" }
  );
} else {
  console.log("Dry run only. Re-run `npm run migrate:kv -- --run` to upload.");
}
