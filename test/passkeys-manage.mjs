// F43: list, rename and remove passkeys. Run: node test/passkeys-manage.mjs
// Runs the real Worker on in-memory SQLite. Passkeys are seeded as rows (a real authenticator cannot be
// run offline); the registration options and the login lookup are the real routes.
import { makeEnv, makeDb, readMigration, check, summary, withLatency } from "./harness.mjs";

const T = await makeEnv();
const { client, q1, env } = T;
env.DB = withLatency(env.DB); // every query takes a turn, as on D1, so races are real

let ip = 0;
async function signup(name) {
  const c = client({ ip: `10.43.0.${++ip}` });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true });
  if (r.status !== 201) throw new Error("signup failed " + r.status + " " + r.text);
  const me = await c.get("/api/me");
  return { c, id: me.json.user.id };
}
const PK = "SECRET-PUBLIC-KEY-BYTES-do-not-leak";
let n = 0;
function seed(userId, { name = null, createdAt = Date.UTC(2026, 10, 19), lastUsed = null } = {}) {
  const id = "pk" + String(++n).padStart(8, "0");
  env.DB.raw.prepare(
    "INSERT INTO webauthn_credentials (id,user_id,credential_id,public_key,counter,transports,created_at,name,last_used_at) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(id, userId, "cred-" + id, PK + id, 4242, '["internal"]', createdAt, name, lastUsed);
  env.DB.raw.prepare("UPDATE users SET has_passkey = 1 WHERE id = ?").run(userId);
  return id;
}
const row = (id) => q1("SELECT * FROM webauthn_credentials WHERE id = ?", id);
const hasFlag = (id) => q1("SELECT has_passkey h FROM users WHERE id = ?", id).h;
const countOf = (id) => q1("SELECT COUNT(*) n FROM webauthn_credentials WHERE user_id = ?", id).n;
const methods = (id, o) => env.DB.raw.prepare("UPDATE users SET email_verified=?, recovery_email=?, has_recovery=?, has_totp=? WHERE id=?")
  .run(o.email ? 1 : 0, o.email ? `u${id}@example.com` : null, o.recovery ? 1 : 0, o.totp ? 1 : 0, id);

console.log("\n# Signed out");
{
  const anon = client({ ip: "10.43.1.1" });
  const before = q1("SELECT COUNT(*) n FROM users").n;
  const g = await anon.get("/api/passkeys");
  const p = await anon.req("PATCH", "/api/passkeys/abc", { name: "x" });
  const d = await anon.del("/api/passkeys/abc");
  check("signed out: GET list is 401", g.status === 401, g.status);
  check("signed out: PATCH rename is 401", p.status === 401, p.status);
  check("signed out: DELETE is 401", d.status === 401, d.status);
  check("signed-out calls make no guest account", q1("SELECT COUNT(*) n FROM users").n === before);
}

console.log("\n# Cross-site requests");
{
  const a = await signup("Cross");
  const id1 = seed(a.id, { name: "Laptop" }), id2 = seed(a.id, { name: "Phone" });
  for (const [label, headers] of [["wrong Origin", { origin: "https://evil.example" }], ["Sec-Fetch-Site cross-site", { "sec-fetch-site": "cross-site" }]]) {
    // The harness adds the page's own Origin to writes unless one is given; the second case sends none.
    const c2 = client({ ip: "10.43.1.5", origin: headers.origin ? undefined : null });
    c2.jar.set("lanyard_session", a.c.jar.get("lanyard_session"));
    const p = await c2.req("PATCH", `/api/passkeys/${id1}`, { name: "Hacked" }, headers);
    const d = await c2.req("DELETE", `/api/passkeys/${id2}`, undefined, headers);
    check(`${label}: PATCH is refused (403 bad_origin)`, p.status === 403 && p.json?.code === "bad_origin", p.status);
    check(`${label}: DELETE is refused (403 bad_origin)`, d.status === 403 && d.json?.code === "bad_origin", d.status);
  }
  check("refused cross-site calls changed nothing", row(id1).name === "Laptop" && !!row(id2));
  const ok = await a.c.req("PATCH", `/api/passkeys/${id1}`, { name: "Work laptop" });
  check("the same call from Lanyard's own page works", ok.status === 200 && row(id1).name === "Work laptop", ok.status);
}

console.log("\n# List");
{
  const a = await signup("Lister");
  const t0 = Date.UTC(2026, 10, 19), t1 = Date.UTC(2026, 10, 20);
  const id1 = seed(a.id, { name: "Laptop", createdAt: t0, lastUsed: t1 });
  const id2 = seed(a.id, { createdAt: t1 });
  const r = await a.c.get("/api/passkeys");
  check("list returns the user's passkeys, oldest first", r.status === 200 && r.json.passkeys.length === 2 && r.json.passkeys[0].id === id1, r.json);
  const [p1, p2] = r.json.passkeys;
  check("an entry has a name, an added date and a last-used date", p1.name === "Laptop" && p1.addedAt === t0 && p1.lastUsedAt === t1);
  check("a passkey with no name or use is null, not made up", p2.name === null && p2.lastUsedAt === null && p2.id === id2);
  check("an entry holds only id, name, addedAt and lastUsedAt", Object.keys(p1).sort().join() === "addedAt,id,lastUsedAt,name", Object.keys(p1));
  check("the raw response holds no public key, counter or credential id",
    !r.text.includes(PK) && !r.text.includes("4242") && !r.text.includes("cred-pk") && !/public|counter|credential|transports/i.test(r.text), r.text);
}

console.log("\n# Another person's passkey");
{
  const a = await signup("Alice"), b = await signup("Bob");
  const bid = seed(b.id, { name: "Bob phone" });
  seed(b.id, { name: "Bob laptop" });
  methods(a.id, { email: true });
  const snap = JSON.stringify(row(bid));
  const l = await a.c.get("/api/passkeys");
  check("A's list never shows B's passkey", l.json.passkeys.length === 0 && !l.text.includes(bid), l.json);
  const p = await a.c.req("PATCH", `/api/passkeys/${bid}`, { name: "Mine now" });
  const d = await a.c.del(`/api/passkeys/${bid}`);
  check("A renaming B's passkey gets 404 (not 403)", p.status === 404, p.status);
  check("A removing B's passkey gets 404 (not 403)", d.status === 404, d.status);
  check("B's row is unchanged afterwards", JSON.stringify(row(bid)) === snap);
  const miss = await a.c.del("/api/passkeys/ffffffffff");
  check("an id that exists nowhere gives the same 404 and message", miss.status === 404 && miss.json.error === d.json.error, miss.json);
  check("B's has_passkey flag is untouched", hasFlag(b.id) === 1 && countOf(b.id) === 2);
}

console.log("\n# Rename");
{
  const a = await signup("Renamer");
  const id = seed(a.id);
  const put = (name) => a.c.req("PATCH", `/api/passkeys/${id}`, { name });
  let r = await put("  Work laptop  ");
  check("rename trims and saves", r.status === 200 && row(id).name === "Work laptop" && r.json.name === "Work laptop", r.json);
  r = await put("Ph​one\u0007‮!");
  check("control, zero-width and direction characters are stripped", r.status === 200 && row(id).name === "Phone!", row(id).name);
  r = await put("<b>Bold</b> <img src=x onerror=alert(1)>");
  check("angle brackets are stripped, so the name is plain text", r.status === 200 && !/[<>]/.test(row(id).name), row(id).name);
  r = await put("a".repeat(40));
  check("40 characters is accepted", r.status === 200 && row(id).name.length === 40);
  const keep = row(id).name;
  r = await put("a".repeat(41));
  check("41 characters is a 400 and the name stays", r.status === 400 && row(id).name === keep, r.status);
  r = await put("x".repeat(5000));
  check("a huge name is a 400", r.status === 400);
  for (const [label, v] of [["empty", ""], ["spaces only", "   "], ["zero-width only", "​​"], ["a number", 5], ["null", null], ["an object", { a: 1 }]]) {
    r = await put(v);
    check(`${label} is a 400 and the name stays`, r.status === 400 && row(id).name === keep, r.status);
  }
  r = await a.c.req("PATCH", `/api/passkeys/${id}`, "not json", { "content-type": "application/json" });
  check("a body that is not JSON is a 400", r.status === 400, r.status);
}

console.log("\n# Remove: last sign-in method");
{
  const a = await signup("Only");
  const id = seed(a.id);
  let r = await a.c.del(`/api/passkeys/${id}`);
  check("only passkey and no other method: 409 with a plain message", r.status === 409 && /only way to sign in/.test(r.json.error) && r.json.code === "last_method", r.json);
  check("the row stays and has_passkey stays on", !!row(id) && hasFlag(a.id) === 1);
  for (const [label, m] of [["a verified email", { email: true }], ["a recovery key", { recovery: true }], ["an authenticator app", { totp: true }]]) {
    const u = await signup("With " + label);
    const pid = seed(u.id);
    methods(u.id, m);
    const d = await u.c.del(`/api/passkeys/${pid}`);
    check(`with ${label}, the only passkey can be removed`, d.status === 200 && !row(pid) && hasFlag(u.id) === 0, d.status);
  }
  // An email that was typed but never confirmed is not a way back in.
  const u = await signup("Unverified");
  const pid = seed(u.id);
  env.DB.raw.prepare("UPDATE users SET recovery_email='x@example.com', email_verified=0 WHERE id=?").run(u.id);
  r = await u.c.del(`/api/passkeys/${pid}`);
  check("an unverified email does not count: 409", r.status === 409 && !!row(pid), r.status);
  // Two passkeys: one can go; the other is then the last.
  const t = await signup("Two");
  const p1 = seed(t.id), p2 = seed(t.id);
  r = await t.c.del(`/api/passkeys/${p1}`);
  check("with another passkey, one can be removed", r.status === 200 && !row(p1) && !!row(p2) && hasFlag(t.id) === 1);
  r = await t.c.del(`/api/passkeys/${p2}`);
  check("then the remaining one is the last: 409", r.status === 409 && !!row(p2));
  r = await t.c.del(`/api/passkeys/${p1}`);
  check("removing one twice is a 404 the second time", r.status === 404);
}

console.log("\n# Remove: two at once");
{
  let ok = true;
  for (let round = 0; round < 8 && ok; round++) {
    const a = await signup("Race" + round);
    const p1 = seed(a.id), p2 = seed(a.id);
    const rs = await Promise.all([a.c.del(`/api/passkeys/${p1}`), a.c.del(`/api/passkeys/${p2}`)]);
    const left = countOf(a.id);
    const st = rs.map((r) => r.status).sort().join();
    ok = left === 1 && st === "200,409" && hasFlag(a.id) === 1;
    if (!ok) check(`race ${round}: exactly one passkey is left`, false, { left, st });
  }
  if (ok) check("8 races deleting the last two passkeys at once: one 200, one 409, one passkey left every time", true);
  const a = await signup("RaceEmail");
  const p1 = seed(a.id), p2 = seed(a.id);
  methods(a.id, { email: true });
  const rs = await Promise.all([a.c.del(`/api/passkeys/${p1}`), a.c.del(`/api/passkeys/${p2}`)]);
  check("with a verified email, both can go at once", rs.every((r) => r.status === 200) && countOf(a.id) === 0 && hasFlag(a.id) === 0);
}

console.log("\n# Session, login and adding another");
{
  const a = await signup("Flow");
  const p1 = seed(a.id), p2 = seed(a.id);
  const other = client({ ip: "10.43.2.2" });
  const code = (await a.c.post("/api/auth/link")).json.code;
  await other.post("/api/auth/redeem", { code });
  const before = q1("SELECT COUNT(*) n FROM sessions WHERE user_id = ?", a.id).n;
  const d = await a.c.del(`/api/passkeys/${p1}`);
  const me = await a.c.get("/api/me");
  check("removing a passkey keeps the current session", d.status === 200 && me.json.user?.id === a.id);
  check("and every other session of the account", before >= 2 && q1("SELECT COUNT(*) n FROM sessions WHERE user_id = ?", a.id).n === before && (await other.get("/api/me")).json.user?.id === a.id);

  // A removed passkey cannot sign in: the login lookup no longer knows its credential id.
  const attempt = async (credId) => {
    const c = client({ ip: "10.43.2.3" });
    await c.get("/api/passkey/login/options");
    const r = await c.post("/api/passkey/login/verify", { id: credId, rawId: credId, type: "public-key", response: {} });
    r.who = (await c.get("/api/me")).json.user?.id; // the POST may give a throwaway guest, never this account
    return r;
  };
  const gone = await attempt("cred-" + p1);
  check("a removed passkey can no longer sign in (404, not signed in as that account)", gone.status === 404 && gone.who !== a.id, [gone.status, gone.who]);
  const kept = await attempt("cred-" + p2);
  check("the passkey that stayed is still looked up (not a 404)", kept.status !== 404, kept.status);

  // Adding a second passkey: the options still ask the browser to skip the ones it has.
  const opts = await a.c.get("/api/passkey/register/options");
  check("register options for a user who already has a passkey still work", opts.status === 200 && !!opts.json.challenge, opts.status);
  check("excludeCredentials lists the passkeys still saved and not the removed one",
    opts.json.excludeCredentials?.some((x) => x.id === "cred-" + p2) && !opts.json.excludeCredentials?.some((x) => x.id === "cred-" + p1), opts.json.excludeCredentials);
  check("the register options hold no key material", !opts.text.includes(PK));
}

console.log("\n# Last used");
{
  const webauthn = await import("@simplewebauthn/server");
  if (!webauthn.__isStub) console.log("  (skipped: needs the offline WebAuthn stub; see test/README.md)");
  else {
    globalThis.__webauthn = { auth: () => ({ verified: true, authenticationInfo: { newCounter: 9 } }) };
    const a = await signup("Used");
    const id = seed(a.id);
    const c = client({ ip: "10.43.3.3" });
    await c.get("/api/passkey/login/options");
    const r = await c.post("/api/passkey/login/verify", { id: "cred-" + id, response: {} });
    check("signing in with a passkey records when it was last used", r.status === 200 && row(id).last_used_at > 0, r.status);
    globalThis.__webauthn = null;
  }
}

console.log("\n# Data export");
{
  const a = await signup("Exporter");
  seed(a.id, { name: "Laptop", createdAt: 1000, lastUsed: 2000 });
  const r = await a.c.get("/api/account/export");
  check("the export lists passkeys by name and dates", r.status === 200 && r.json.passkeys?.length === 1 && r.json.passkeys[0].name === "Laptop" && r.json.passkeys[0].created_at === 1000 && r.json.passkeys[0].last_used_at === 2000, r.json.passkeys);
  check("the export holds no public key, counter or credential id", !r.text.includes(PK) && !r.text.includes("4242") && !r.text.includes("cred-pk"));
}

console.log("\n# Migration");
{
  const old = makeDb({ before: "0035" });
  old.raw.prepare("INSERT INTO users (id, created_at) VALUES ('u1', 1)").run();
  old.raw.prepare("INSERT INTO webauthn_credentials (id,user_id,credential_id,public_key,counter,transports,created_at) VALUES ('w1','u1','c1','pk',0,'[]',5)").run();
  old.exec(readMigration("0035_passkey_names.sql"));
  const r = old.raw.prepare("SELECT name, last_used_at, created_at FROM webauthn_credentials").get();
  check("0035 keeps existing passkeys, with a null name and last use", r.name === null && r.last_used_at === null && r.created_at === 5, r);
}

summary();
