// Read-only export of the REMOTE production LANYARD_KV namespace -> JSON dump.
// Requires `npx wrangler login` once. Nothing here mutates production.
//
//   node scripts/export-kv.mjs                 # -> .migrations/prod-kv.json
//   node scripts/export-kv.mjs --local         # dump local Miniflare KV instead
//
// The dump feeds scripts/import-v2.mjs, which transforms old KV shapes into
// the new D1 schema + R2 objects.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const wrangler = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const isLocal = process.argv.includes("--local");
const NAMESPACE_ID = "6fa2750047f94df78dc7814bd56b17b7";

const allowed = new Set(["profile", "code", "cred", "list", "conn", "thread", "photo"]);

function wr(args, parseJson = true) {
  const out = execFileSync(process.execPath, [wrangler, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  return parseJson ? JSON.parse(out) : out;
}

async function dumpLocal() {
  const { readdirSync, readFileSync, existsSync } = await import("node:fs");
  const stateDir = join(root, ".wrangler", "state", "v3", "kv");
  const dbDir = join(stateDir, "miniflare-KVNamespaceObject");
  if (!existsSync(dbDir)) throw new Error("No local Miniflare KV state found.");
  const dbFile = readdirSync(dbDir).find((f) => f.endsWith(".sqlite"));
  const { DatabaseSync } = await import("node:sqlite");
  const sqlite = new DatabaseSync(join(dbDir, dbFile), { readOnly: true });
  const rows = sqlite.prepare("select key, blob_id, expiration from _mf_entries order by key").all();
  sqlite.close();
  const blobRoot = join(stateDir, "miniflare-KVNamespaceObject", "blobs");
  const nowSec = Math.floor(Date.now() / 1000);
  return rows
    .filter((r) => {
      const pfx = r.key.split(":", 1)[0];
      const exp = r.expiration ? Math.floor(Number(r.expiration) / 1000) : 0;
      return allowed.has(pfx) && (!exp || exp > nowSec);
    })
    .map((r) => ({ key: r.key, value: readFileSync(join(blobRoot, r.blob_id), "utf8") }));
}

async function dumpRemote() {
  const listArgs = [
    "kv", "key", "list",
    "--namespace-id", NAMESPACE_ID,
    "--remote", "--json",
  ];
  const keys = wr(listArgs);
  console.log(`Remote namespace has ${keys.length} keys; fetching values...`);

  const entries = [];
  for (let i = 0; i < keys.length; i++) {
    const { name: key, expiration } = keys[i];
    const pfx = key.split(":", 1)[0];
    if (!allowed.has(pfx)) continue;
    if (expiration && expiration <= Math.floor(Date.now() / 1000)) continue;
    const value = execFileSync(
      process.execPath,
      [wrangler, "kv", "key", "get", key, "--namespace-id", NAMESPACE_ID, "--remote", "--text"],
      { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
    );
    entries.push({ key, value: value.replace(/\n$/, "") });
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${keys.length}`);
  }
  return entries;
}

const entries = isLocal ? await dumpLocal() : await dumpRemote();
mkdirSync(join(root, ".migrations"), { recursive: true });
const outFile = join(root, ".migrations", isLocal ? "local-kv.json" : "prod-kv.json");
writeFileSync(outFile, JSON.stringify(entries), "utf8");

const byPrefix = {};
for (const e of entries) byPrefix[e.key.split(":", 1)[0]] = (byPrefix[e.key.split(":", 1)[0]] || 0) + 1;
console.log("Exported", entries.length, "entries ->", outFile, byPrefix);
