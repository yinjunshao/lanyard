// Offline integration harness: runs the real Worker (Hono app) against an
// in-memory SQLite database with every migration applied, a Map-backed R2
// bucket and a stub static-assets binding. Node 22+ (node:sqlite).
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const migrationFiles = () => readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();
export const readMigration = (f) => readFileSync(join(root, "migrations", f), "utf8");

// `before`: apply only the migrations whose file name sorts before it (for
// testing a migration against data in the older shape).
export function makeDb({ before } = {}) {
  const db = new DatabaseSync(":memory:");
  let queue = Promise.resolve();
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
    // One batch at a time, like D1: a second batch waits for the first to commit or roll back,
    // so two requests that race (Promise.all) hit the database rules rather than a nested BEGIN.
    batch(stmts) {
      const run = async () => {
        db.exec("BEGIN");
        try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec("COMMIT"); return out; }
        catch (e) { db.exec("ROLLBACK"); throw e; }
      };
      const result = queue.then(run, run);
      queue = result.then(() => {}, () => {});
      return result;
    },
    exec: (sql) => db.exec(sql),
  };
  for (const f of migrationFiles()) {
    if (before && f >= before) break;
    db.exec(readMigration(f));
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
  const { default: worker } = await import(pathToFileURL(join(root, "worker/index.js")).href);
  const env = {
    DB: makeDb(),
    MEDIA: makeBucket(),
    ASSETS: { fetch: async (req) => new Response("<!doctype html><title>app</title>", { headers: { "content-type": "text/html" } }) },
    APP_ORIGIN: "https://lanyard.test,https://host.lanyard.test",
    HOST_ORIGIN: "https://host.lanyard.test",
    RP_ID: "lanyard.test",
    MAIL_OUTBOX: [], // sendMail() pushes here instead of calling Resend
    ...extra,
  };
  const waits = [];
  const ctx = { waitUntil: (p) => waits.push(p), passThroughOnException() {} };
  // One cookie jar per simulated browser. site: "host" talks to the host portal
  // (host.lanyard.test). The jar is not split by site: a test can send a cookie
  // where a real browser never would, to check the server ignores it.
  function client({ ip = "203.0.113.1", site = "main", origin } = {}) {
    const base = site === "host" ? "https://host.lanyard.test" : "https://lanyard.test";
    if (origin === undefined) origin = base;
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
      const url = /^https?:\/\//.test(path) ? path : base + path;
      const res = await worker.fetch(new Request(url, { method, headers: h, body: payload, redirect: "manual" }), env, ctx);
      for (const sc of res.headers.getSetCookie?.() || []) {
        const [pair, ...attrs] = sc.split(";");
        const [k, v] = pair.split("=");
        if (attrs.some((a) => /max-age=0\b/i.test(a.trim())) || v === "") jar.delete(k.trim());
        else jar.set(k.trim(), v);
      }
      const text = await res.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      return { status: res.status, json, text, headers: res.headers, setCookies: res.headers.getSetCookie?.() || [] };
    }
    return {
      jar, req, site, outbox: env.MAIL_OUTBOX,
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

// Host portal sign-in (F10): ask for a code, read it from the test outbox, enter it.
export const lastCode = (c, email) => [...c.outbox].reverse().find((m) => m.to[0] === email)?.text.match(/code is (\d{6})/)?.[1];
export async function hostSignIn(c, email) {
  if (c.site !== "host") throw new Error("hostSignIn needs a client on the host site");
  const start = await c.post("/api/host/auth/start", { email });
  const code = lastCode(c, String(email).trim().toLowerCase());
  const verify = await c.post("/api/host/auth/verify", { email, code });
  return { start, verify, code };
}

// Turns a host-site client into a host: email code, details, Host Terms, then
// an organisation of `kind` (default: events under their own name).
let hostCounter = 0;
export async function becomeHost(c, { email, kind = "individual", name = "Test Org", extra = {}, fullName = "Test Host" } = {}) {
  hostCounter += 1;
  const em = email || `host${hostCounter}@work${hostCounter}.example.com`;
  const signin = await hostSignIn(c, em);
  const details = await c.post("/api/host/account/details", {
    fullName, survey: { useCase: "Weekly socials", frequency: "Weekly or more" },
  });
  const terms = await c.post("/api/host/terms", { accept: true });
  const org = kind ? await c.post("/api/host/orgs", { kind, name, ...extra }) : null;
  return { email: em, signin, details, terms, org };
}
