// F28: first-load JavaScript budget for the public pages.
//
// The measure, for each public page: the gzip size of the entry chunk named in
// dist/index.html, everything the entry statically imports (transitively), the
// page's own chunk, and everything that chunk statically imports. Each file is
// counted once. Dynamic import() is not followed: those chunks load later, on
// a tap or after first paint (they are listed separately as "loads lazily").
// Anything index.html preloads with modulepreload is reported too, since the
// browser fetches it on first load; it is added to the figure when present.
//
// Usage:
//   node test/budget.mjs              builds first (vite build), then measures dist/
//   node test/budget.mjs --no-build   measures dist/ as it is; fails if dist/ is older than src/
//   node test/budget.mjs --json       also print the numbers as JSON (for the plan note)
//
// Fails (exit 1) when Landing or PublicCard is over 50 KB (51,200 B). The other
// public pages are reported against the same budget; they only fail the run
// when listed in ENFORCED below.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const BUDGET = 50 * 1024;
const PAGES = ["Landing", "PublicCard", "Hosts", "Privacy", "Terms", "Redeem", "SignIn", "PrivacyRequest"];
const ENFORCED = ["Landing", "PublicCard"];
const args = process.argv.slice(2);

function newestMtime(path) {
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  let newest = 0;
  for (const name of readdirSync(path)) newest = Math.max(newest, newestMtime(join(path, name)));
  return newest;
}

if (!args.includes("--no-build")) {
  const vite = join(root, "node_modules", "vite", "bin", "vite.js");
  const r = spawnSync(process.execPath, [vite, "build"], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
  if (r.status !== 0) { console.error("budget: vite build failed"); process.exit(1); }
} else {
  // A stale dist/ must never give a pass: it has to be newer than every source file.
  const html = join(dist, "index.html");
  if (!existsSync(html)) { console.error("budget: dist/ is missing; run npm run build first"); process.exit(1); }
  const built = statSync(html).mtimeMs;
  const sources = [join(root, "src"), join(root, "public"), join(root, "index.html"), join(root, "vite.config.js"), join(root, "package.json")];
  const newest = Math.max(...sources.filter(existsSync).map(newestMtime));
  if (newest > built) { console.error("budget: dist/ is older than src/ (or public/, index.html, vite config); run npm run build first"); process.exit(1); }
}

const indexHtml = readFileSync(join(dist, "index.html"), "utf8");
const entryMatch = indexHtml.match(/<script[^>]*type="module"[^>]*src="\/(assets\/[^"]+\.js)"/);
if (!entryMatch) { console.error("budget: no module entry script in dist/index.html"); process.exit(1); }
const entry = entryMatch[1];
const preloads = [...indexHtml.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);

const cache = new Map();
function read(file) {
  if (!cache.has(file)) {
    const code = readFileSync(join(dist, file), "utf8");
    // Static imports and re-exports: `from"./x.js"` and a bare `import"./x.js"`. A dynamic
    // import( is never followed. The preload list (__vite__mapDeps) is a plain string array,
    // so it is not matched either.
    const statics = [...code.matchAll(/(?:\bfrom\s*|\bimport\s*)["'`]\.\/([^"'`]+\.js)["'`]/g)].map((m) => "assets/" + m[1]);
    const dynamics = [...code.matchAll(/\bimport\(\s*["'`]\.\/([^"'`]+\.js)["'`]\s*\)/g)].map((m) => "assets/" + m[1]);
    cache.set(file, { gz: gzipSync(Buffer.from(code)).length, raw: Buffer.byteLength(code), statics, dynamics });
  }
  return cache.get(file);
}
function closure(files, seen = new Set()) {
  for (const f of files) {
    if (seen.has(f)) continue;
    seen.add(f);
    closure(read(f).statics, seen);
  }
  return seen;
}
function pageChunk(name) {
  const hits = readdirSync(join(dist, "assets")).filter((f) => new RegExp(`^${name}-[A-Za-z0-9_-]{8}\\.js$`).test(f));
  if (hits.length !== 1) { console.error(`budget: expected one dist/assets/${name}-<hash>.js, found ${hits.length}`); process.exit(1); }
  return "assets/" + hits[0];
}
const sum = (set) => [...set].reduce((n, f) => n + read(f).gz, 0);
const kb = (n) => (n / 1024).toFixed(1) + " KB";

const entrySet = closure([entry]);
const preloadSet = closure(preloads);
const preloadExtra = new Set([...preloadSet].filter((f) => !entrySet.has(f)));
const rows = [];
for (const name of PAGES) {
  const page = pageChunk(name);
  const all = closure([page], new Set(entrySet));
  const own = new Set([...all].filter((f) => !entrySet.has(f)));
  const total = sum(all);
  const withPreload = sum(new Set([...all, ...preloadExtra]));
  // Dynamic imports the page chunk and the entry make (the page may start them on first paint).
  const lazy = [...new Set(read(page).dynamics)].filter((f) => !all.has(f));
  rows.push({ name, total, withPreload, entry: sum(entrySet), page: sum(own), files: [...own].map((f) => f.replace("assets/", "")), lazy: lazy.map((f) => f.replace("assets/", "")) });
}

console.log(`Entry ${entry.replace("assets/", "")} + its static imports: ${sum(entrySet)} B gzip (${entrySet.size} files)`);
console.log(`index.html modulepreload: ${preloads.length ? preloads.join(", ") + ` (adds ${sum(preloadExtra)} B not already counted)` : "none"}`);
console.log(`Budget: ${BUDGET} B (50 KB) gzip, entry + static imports + the page's chunk`);
for (const r of rows) {
  const over = r.total > BUDGET;
  console.log(`${over ? "OVER " : "ok   "} ${r.name.padEnd(15)} ${String(r.total).padStart(6)} B  ${kb(r.total).padStart(8)}  page-only ${String(r.page).padStart(6)} B  [${r.files.join(", ")}]${r.lazy.length ? `  loads lazily: ${r.lazy.join(", ")}` : ""}${preloadExtra.size ? `  with preloads ${r.withPreload} B` : ""}`);
}
if (args.includes("--json")) console.log(JSON.stringify(rows.map(({ name, total, withPreload, page }) => ({ name, total, withPreload, page })), null, 1));

const failed = rows.filter((r) => ENFORCED.includes(r.name) && Math.max(r.total, r.withPreload) > BUDGET);
if (failed.length) {
  console.error(`budget: FAIL, over 50 KB: ${failed.map((r) => `${r.name} ${r.total} B`).join(", ")}`);
  process.exit(1);
}
console.log(`budget: ok (${ENFORCED.join(" and ")} are under 50 KB)`);
