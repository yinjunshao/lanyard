// Offline integration harness: runs the real Worker (Hono app) against an
// in-memory SQLite database with every migration applied, a Map-backed R2
// bucket and a stub static-assets binding. Node 22+ (node:sqlite).
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function makeDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const wrap = (sql) => ({
    _p: [],
    bind(...p) { this._p = p.map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v)); return this; },
    async first() { return db.prepare(sql).get(...this._p) ?? null; },
    async all() { return { results: db.prepare(sql).all(...this._p) }; },
    async run() { const r = db.prepare(sql).run(...this._p); return { meta: { changes: Number(r.changes) } }; },
  });
  const api = {
    raw: db,
    prepare: wrap,
    async batch(stmts) {
      db.exec("BEGIN");
      try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec("COMMIT"); return out; }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
    exec: (sql) => db.exec(sql),
  };
  for (const f of readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    db.exec(readFileSync(join(root, "migrations", f), "utf8"));
  }
  return api;
}

export function makeBucket() {
  const store = new Map();
  return {
    store,
    async put(key, bytes, opts) { store.set(key, { bytes, httpMetadata: opts?.httpMetadata || {} }); },
    async get(key) {
      const o = store.get(key);
      return o ? { body: o.bytes, httpMetadata: o.httpMetadata } : null;
    },
    async delete(key) { store.delete(key); },
  };
}

export async function makeEnv(extra = {}) {
  const { default: worker } = await import(join(root, "worker/index.js"));
  const env = {
    DB: makeDb(),
    MEDIA: makeBucket(),
    ASSETS: { fetch: async (req) => new Response("<!doctype html><title>app</title>", { headers: { "content-type": "text/html" } }) },
    APP_ORIGIN: "https://lanyard.test",
    RP_ID: "lanyard.test",
    ...extra,
  };
  const waits = [];
  const ctx = { waitUntil: (p) => waits.push(p), passThroughOnException() {} };
  // One cookie jar per simulated browser.
  function client({ ip = "203.0.113.1", origin = "https://lanyard.test" } = {}) {
    const jar = new Map();
    async function req(method, path, body, headers = {}) {
      const h = new Headers({ "cf-connecting-ip": ip, ...headers });
      if (origin && method !== "GET" && method !== "HEAD" && !("origin" in headers)) h.set("origin", origin);
      if (jar.size) h.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
      let payload;
      if (body !== undefined) {
        if (typeof body === "string") payload = body;
        else { payload = JSON.stringify(body); if (!h.has("content-type")) h.set("content-type", "application/json"); }
      }
      const res = await worker.fetch(new Request("https://lanyard.test" + path, { method, headers: h, body: payload }), env, ctx);
      for (const sc of res.headers.getSetCookie?.() || []) {
        const [pair, ...attrs] = sc.split(";");
        const [k, v] = pair.split("=");
        if (attrs.some((a) => /max-age=0\b/i.test(a.trim())) || v === "") jar.delete(k.trim());
        else jar.set(k.trim(), v);
      }
      const text = await res.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      return { status: res.status, json, text, headers: res.headers };
    }
    return {
      jar, req,
      get: (p, h) => req("GET", p, undefined, h),
      post: (p, b, h) => req("POST", p, b ?? {}, h),
      put: (p, b, h) => req("PUT", p, b ?? {}, h),
      del: (p, h) => req("DELETE", p, undefined, h),
    };
  }
  const q = (sql, ...p) => env.DB.raw.prepare(sql).all(...p);
  const q1 = (sql, ...p) => env.DB.raw.prepare(sql).get(...p);
  return { env, client, q, q1, flush: () => Promise.all(waits.splice(0)) };
}

// Tiny assertion runner.
let passed = 0, failed = 0;
export function check(name, cond, info) {
  if (cond) { passed++; console.log("  ok  " + name); }
  else { failed++; console.log("  FAIL " + name + (info !== undefined ? "  → " + JSON.stringify(info).slice(0, 300) : "")); }
}
export function summary() {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
export const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
