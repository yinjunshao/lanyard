// KV (v1) -> D1 + R2 (v2) import.
//
// Input : .migrations/prod-kv.json  (from scripts/export-kv.mjs)
//         an array of { key, value } entries
// Output: .migrations/import.sql     (idempotent INSERT OR REPLACE)
//         .migrations/media/**      (decoded avatars + selfies for R2 upload)
//
//   node scripts/import-v2.mjs --local            # dry run, writes SQL/files
//   node scripts/import-v2.mjs --local --apply    # apply to local D1 + R2
//   node scripts/import-v2.mjs --remote --apply   # apply to production
//
// ID preservation: the new default card for every profile reuses the OLD
// profile id and 4-char code, and user ids stay the same, so existing
// connections and printed codes/QRs continue to resolve.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const wrangler = join(root, "node_modules", "wrangler", "bin", "wrangler.js");

const args = new Set(process.argv.slice(2));
const remote = args.has("--remote");
const apply = args.has("--apply");
const inputArg = process.argv.find((a) => a.startsWith("--input="));
const inputFile = inputArg
  ? inputArg.split("=")[1]
  : join(root, ".migrations", remote ? "prod-kv.json" : "local-kv.json");
const fallback = join(root, ".migrations", "lanyard-kv.json");
const resolvedInput = existsSync(inputFile) ? inputFile : fallback;

const outDir = join(root, ".migrations");
const mediaDir = join(outDir, "media");
const sqlFile = join(outDir, "import.sql");

if (!existsSync(resolvedInput)) {
  console.error(`No KV dump at ${inputFile}. Run npm run export:${remote ? "prod" : "local"} first.`);
  process.exit(1);
}

const entries = JSON.parse(readFileSync(resolvedInput, "utf8"));
const kv = new Map(entries.map((e) => [e.key, e.value]));
const now = Date.now();
const TS = now + 365 * 864e5; // imported sessions valid 1 year

/* ------------------------------ helpers ---------------------------------- */
const q = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};
const j = (v) => q(JSON.stringify(v ?? null));
const readJson = (key) => {
  const raw = kv.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};
function ageFromBirthday(b) {
  if (!b || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
  const d = new Date(b + "T00:00:00");
  if (isNaN(d)) return null;
  const n = new Date();
  let age = n.getFullYear() - d.getFullYear();
  const m = n.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < d.getDate())) age--;
  return age >= 0 && age < 120 ? age : null;
}

// Decode a photo:<key> data URL into a file for R2. Returns r2 key.
const images = new Map(); // photoId -> r2Key
function stagePhoto(photoId) {
  if (!photoId || images.has(photoId)) return images.get(photoId) || null;
  const dataUrl = kv.get(`photo:${photoId}`);
  if (!dataUrl) { images.set(photoId, null); return null; }
  const m = /^data:image\/(webp|jpeg|jpg|png);base64,([A-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) { images.set(photoId, null); return null; }
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const r2Key = `selfie/${photoId}.${ext}`;
  mkdirSync(mediaDir, { recursive: true });
  writeFileSync(join(mediaDir, `${photoId}.${ext}`), Buffer.from(m[2], "base64"));
  images.set(photoId, r2Key);
  return r2Key;
}

// Profile avatars in v1 were stored inline as a data URL in `photo` (or a key).
function stageAvatar(userId, photo) {
  if (!photo) return null;
  const dataUrl = photo.startsWith("data:") ? photo : kv.get(`photo:${photo}`);
  if (dataUrl) {
    const m = /^data:image\/(webp|jpeg|jpg|png);base64,([A-z0-9+/=]+)$/.exec(dataUrl);
    if (m) {
      const ext = m[1] === "jpeg" ? "jpg" : m[1];
      const r2Key = `avatar/${userId}.${ext}`;
      mkdirSync(mediaDir, { recursive: true });
      writeFileSync(join(mediaDir, `avatar-${userId}.${ext}`), Buffer.from(m[2], "base64"));
      return r2Key;
    }
  }
  if (photo) return stagePhoto(photo);
  return null;
}

/* ------------------------------ transform -------------------------------- */
const sql = [];
sql.push("PRAGMA foreign_keys=OFF;");

// Gather profiles
const profiles = [];
for (const [key, raw] of kv) {
  if (!key.startsWith("profile:")) continue;
  try { profiles.push(JSON.parse(raw)); } catch { /* skip malformed */ }
}

const sessions = new Set(); // token -> userId
for (const [key, value] of kv) {
  if (key.startsWith("cred:")) sessions.add([key.slice(5), value]);
}

for (const p of profiles) {
  const id = p.id;
  const email = (p.email || "").trim().toLowerCase() || null;
  const age = ageFromBirthday(p.birthday);
  const avatarKey = stageAvatar(id, p.photo);

  sql.push(
    `INSERT OR REPLACE INTO users (id, created_at, is_guest, recovery_email, email_domain, verified_student, has_passkey, over_18, age_confirmed_at)
     VALUES (${q(id)}, ${q(p.createdAt || now)}, 0, ${q(email)}, ${q(email ? email.split("@")[1] : null)}, 0, 0, ${age !== null && age >= 18 ? 1 : 0}, ${q(p.birthday ? p.createdAt || now : null)});`
  );

  const links = p.links && typeof p.links === "object" ? p.links : {};
  const tags = Array.isArray(p.specialties) ? p.specialties : [];
  sql.push(
    `INSERT OR REPLACE INTO profiles
      (user_id, name, photo_key, uni, course, year, headline, about, links, tags, projects, is_public, show_age, updated_at)
     VALUES (${q(id)}, ${q(p.name || "Unknown")}, ${q(avatarKey)}, ${q(p.uni || "")}, ${q(p.course || "")},
       ${q(p.year || "")}, ${q(p.tagline || "")}, ${q(p.about || "")}, ${j(links)}, ${j(tags)}, ${j([])}, 1, 0, ${q(p.updatedAt || now)});`
  );

  // Default card reuses the profile id and the legacy 4-char code.
  sql.push(
    `INSERT OR REPLACE INTO cards
      (id, user_id, code, name, note, visible_links, tags, theme, is_default, created_at)
     VALUES (${q(id)}, ${q(id)}, ${q(p.code || null)}, 'General', ${q(p.helloNote || "")}, ${j([])}, ${j([])}, 'default', 1, ${q(p.createdAt || now)});`
  );

  // Device grants -> sessions (keeps existing devices recognised).
  const tokens = new Set([p.deviceToken, ...(Array.isArray(p.tokens) ? p.tokens : [])].filter(Boolean));
  for (const [token, target] of sessions) if (target === id) tokens.add(token);
  for (const token of tokens) {
    sql.push(
      `INSERT OR REPLACE INTO sessions (id, user_id, created_at, expires_at, user_agent)
       VALUES (${q(token)}, ${q(id)}, ${q(p.createdAt || now)}, ${TS}, 'imported');`
    );
  }
}

// Connections: collect canonical pairs from conn:* and thread:* keys.
const pairs = new Map(); // "a<b" -> {a,b}
const connRecs = []; // every conn record
for (const [key, value] of kv) {
  let m = key.match(/^conn:([a-z0-9]+):([a-z0-9]+)$/);
  if (m) {
    const rec = readJson(key);
    if (rec) connRecs.push({ owner: m[1], peer: m[2], rec });
    const a = m[1] < m[2] ? m[1] : m[2];
    const b = m[1] < m[2] ? m[2] : m[1];
    pairs.set(`${a}:${b}`, { a, b });
  }
  m = key.match(/^thread:([a-z0-9]+):([a-z0-9]+)$/);
  if (m) {
    const a = m[1] < m[2] ? m[1] : m[2];
    const b = m[1] < m[2] ? m[2] : m[1];
    if (!pairs.has(`${a}:${b}`)) pairs.set(`${a}:${b}`, { a, b });
  }
}

const pairConnId = new Map();
for (const { a, b } of pairs.values()) {
  if (!profiles.some((p) => p.id === a) || !profiles.some((p) => p.id === b)) continue; // both sides must exist
  const connId = createHash("sha256").update(`${a}:${b}`).digest("hex").slice(0, 10);
  pairConnId.set(`${a}:${b}`, connId);

  const recs = connRecs.filter(
    (c) => (c.owner === a && c.peer === b) || (c.owner === b && c.peer === a)
  );
  const metAt = recs.map((c) => c.rec.metAt).find(Boolean) || now;
  const photoId = recs.map((c) => c.rec.photoId).find(Boolean) || null;
  const selfieKey = photoId ? stagePhoto(photoId) : null;

  sql.push(
    `INSERT OR REPLACE INTO connections
      (id, user_a, user_b, event_id, selfie_key, consent_a, consent_b, created_at)
     VALUES (${q(connId)}, ${q(a)}, ${q(b)}, NULL, ${q(selfieKey)}, 1, 1, ${q(metAt)});`
  );

  // Private notes from each side.
  for (const c of recs) {
    if (c.rec.myNote) {
      sql.push(
        `INSERT OR REPLACE INTO notes (user_id, connection_id, text, updated_at)
         VALUES (${q(c.owner)}, ${q(connId)}, ${q(c.rec.myNote)}, ${q(metAt)});`
      );
    }
  }
}

// Messages from threads.
let msgCount = 0;
for (const [key] of kv) {
  const m = key.match(/^thread:([a-z0-9]+):([a-z0-9]+)$/);
  if (!m) continue;
  const a = m[1] < m[2] ? m[1] : m[2];
  const b = m[1] < m[2] ? m[2] : m[1];
  const connId = pairConnId.get(`${a}:${b}`);
  if (!connId) continue;
  const thread = readJson(key);
  for (const msg of thread?.messages || []) {
    const photoKey = msg.photoId ? stagePhoto(msg.photoId) : null;
    sql.push(
      `INSERT OR REPLACE INTO messages (id, connection_id, from_id, text, photo_key, created_at)
       VALUES (${q(msg.id)}, ${q(connId)}, ${q(msg.from)}, ${q(msg.text || "")}, ${q(photoKey)}, ${q(msg.at || now)});`
    );
    msgCount++;
  }
}

sql.push("PRAGMA foreign_keys=ON;");

/* ------------------------------- output ---------------------------------- */
rmSync(sqlFile, { force: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(sqlFile, sql.join("\n"), "utf8");

const summary = {
  profiles: profiles.length,
  sessions: sql.filter((s) => s.startsWith("INSERT OR REPLACE INTO sessions")).length,
  connections: pairConnId.size,
  messages: msgCount,
  images: [...images.values()].filter(Boolean).length,
};
console.log("Transform complete:", summary);
console.log("SQL ->", sqlFile, `(${sql.length} statements)`);
console.log("Media ->", mediaDir);

if (!apply) {
  console.log("\nDry run. Re-run with --apply to load into", remote ? "REMOTE" : "local", "D1 + R2.");
  process.exit(0);
}

/* -------------------------------- apply ---------------------------------- */
const flag = remote ? "--remote" : "--local";
console.log(`\nApplying D1 (${flag})…`);
execFileSync(
  process.execPath,
  [wrangler, "d1", "execute", "lanyard_db", flag, "--file", sqlFile],
  { cwd: root, stdio: "inherit" }
);

// Upload every staged image to R2.
const { readdirSync } = await import("node:fs");
if (existsSync(mediaDir)) {
  for (const file of readdirSync(mediaDir)) {
    const m = file.match(/^(?:avatar-)?([a-z0-9]{12,32})\.(webp|jpg|png)$/);
    if (!m) continue;
    const [, id, ext] = m;
    const prefix = file.startsWith("avatar-") ? "avatar" : "selfie";
    const key = `${prefix}/${id}.${ext}`;
    console.log("R2 put", key);
    const ct = ext === "png" ? "image/png" : ext === "jpg" ? "image/jpeg" : "image/webp";
    execFileSync(
      process.execPath,
      [wrangler, "r2", "object", "put", `lanyard-media/${key}`, "--file", join(mediaDir, file),
        "--content-type", ct, flag],
      { cwd: root, stdio: "inherit" }
    );
  }
}
console.log("\nImport finished.");
