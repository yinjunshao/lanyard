// Security test suite: each check states the secure behaviour.
// Run: node test/security.mjs
import { makeEnv, check, summary, PNG } from "./harness.mjs";

const T = await makeEnv();
const { client, q, q1 } = T;

async function signup(name = "Alice", opts = {}) {
  const c = client(opts);
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true });
  if (r.status !== 201) throw new Error("signup failed " + r.status + " " + r.text);
  const me = await c.get("/api/me");
  return { c, id: me.json.user.id, card: me.json.cards[0].cardId };
}

console.log("\n# Sessions and bots");
{
  const before = q1("SELECT COUNT(*) n FROM users").n;
  const anon = client();
  await anon.get("/");
  await anon.get("/c/abc");
  await anon.get("/api/me");
  await anon.get("/api/e/ZZZZZ");
  const after = q1("SELECT COUNT(*) n FROM users").n;
  check("page views and GETs without a cookie create no user rows", after === before, { before, after });
  const me = await anon.get("/api/me");
  check("/api/me works without a session", me.status === 200 && me.json && me.json.user === null, me.json);
}
{
  const a = await signup("Sess");
  const sid = a.c.jar.get("lanyard_session");
  const row = q1("SELECT id FROM sessions WHERE id = ?", sid);
  check("session tokens are stored hashed, not as the cookie value", !row);
  await a.c.post("/api/logout");
  const left = q1("SELECT COUNT(*) n FROM sessions s WHERE s.user_id = ?", a.id).n;
  check("logout deletes the session row", left === 0, left);
}
{
  let blocked = 0;
  for (let i = 0; i < 130; i++) {
    const c = client({ ip: "198.51.100.9" });
    const r = await c.post("/api/connect", { cardId: "nope" });
    if (r.status === 429) blocked++;
  }
  check("new guest accounts are rate-limited per IP", blocked > 0, { blocked });
}

console.log("\n# Headers and CSRF");
{
  const anon = client();
  const r = await anon.get("/");
  const h = r.headers;
  check("HTML has a Content-Security-Policy", !!h.get("content-security-policy"));
  check("HTML cannot be framed", /frame-ancestors 'none'/.test(h.get("content-security-policy") || "") || h.get("x-frame-options") === "DENY");
  check("nosniff on HTML", h.get("x-content-type-options") === "nosniff");
  check("Referrer-Policy set", !!h.get("referrer-policy"));
  check("HSTS set on https", /max-age=\d+/.test(h.get("strict-transport-security") || ""));
  check("Permissions-Policy set", !!h.get("permissions-policy"));
  const api = await anon.get("/api/health");
  check("API responses are not cacheable by shared caches", /no-store|private/.test(api.headers.get("cache-control") || ""), api.headers.get("cache-control"));
}
{
  const a = await signup("Csrf");
  const evil = await a.c.post("/api/cards", { name: "x" }, { origin: "https://evil.example" });
  check("cross-origin state-changing request is rejected", evil.status === 403, evil.status);
  const textPlain = await a.c.req("POST", "/api/cards", '{"name":"x"}', { "content-type": "text/plain", origin: "https://evil.example" });
  check("text/plain cross-origin POST is rejected", textPlain.status === 403, textPlain.status);
  const same = await a.c.post("/api/cards", { name: "ok" });
  check("same-origin POST still works", same.status === 201, same.status);
}

console.log("\n# Passkey challenge integrity");
const webauthn = await import("@simplewebauthn/server");
if (!webauthn.__isStub) console.log("  (skipped: needs the offline WebAuthn stub; see test/README.md)");
else {
  const anon = client();
  let seen = null;
  globalThis.__webauthn = { auth: (o) => { seen = o; return { verified: true, authenticationInfo: { newCounter: 1 } }; } };
  // Real user with a passkey
  const a = await signup("Pk");
  T.env.DB.raw.prepare("INSERT INTO webauthn_credentials (id,user_id,credential_id,public_key,counter,transports,created_at) VALUES ('w1',?,'cred1','pk',0,'[]',0)").run(a.id);
  const forged = Buffer.from(JSON.stringify({ ch: "attacker", origins: ["https://evil.example"], rpId: "evil.example" })).toString("base64");
  anon.jar.set("lanyard_ch", forged);
  const r = await anon.post("/api/passkey/login/verify", { id: "cred1", response: {} });
  check("a forged challenge cookie cannot choose the expected challenge/origin",
    r.status >= 400 && (!seen || (seen.expectedChallenge !== "attacker" && !String(seen.expectedOrigin).includes("evil"))),
    { status: r.status, seen: seen && { ch: seen.expectedChallenge, o: seen.expectedOrigin } });
  // Proper flow: options then verify works once, not twice (single-use challenge)
  const c2 = client();
  const opts = await c2.get("/api/passkey/login/options");
  seen = null;
  const ok = await c2.post("/api/passkey/login/verify", { id: "cred1", response: {} });
  check("genuine passkey login works", ok.status === 200 && seen && seen.expectedChallenge === opts.json.challenge, { s: ok.status, t: ok.text });
  const again = await c2.post("/api/passkey/login/verify", { id: "cred1", response: {} });
  check("a passkey challenge can only be used once", again.status >= 400, again.status);
  globalThis.__webauthn = null;
}

console.log("\n# Media access");
{
  const a = await signup("Ann");
  const b = await signup("Ben");
  const stranger = await signup("Eve");
  const r = await b.c.post("/api/connect", { cardId: a.card, selfieDataUrl: PNG, consent: true });
  check("connect with selfie works", r.status === 200, r.text);
  const key = q1("SELECT selfie_key FROM connections WHERE id = ?", r.json.connectionId).selfie_key;
  const own = await a.c.get("/media/" + key);
  check("people in the connection can load the selfie", own.status === 200, own.status);
  const leak = await stranger.c.get("/media/" + key);
  check("a stranger cannot load someone else's selfie", leak.status === 404 || leak.status === 403, leak.status);
  const anonLeak = await client().get("/media/" + key);
  check("a signed-out visitor cannot load a selfie", anonLeak.status === 404 || anonLeak.status === 403, anonLeak.status);
  check("media has nosniff", (own.headers.get("x-content-type-options") || "") === "nosniff");
  const trav = await a.c.get("/media/selfie/..%2f..%2fx.png");
  check("media path traversal is rejected", trav.status === 400 || trav.status === 404, trav.status);
}
{
  const a = await signup("Up");
  const html = "data:image/png;base64," + Buffer.from("<html><script>alert(1)</script></html>").toString("base64");
  const r = await a.c.put("/api/profile", { photoDataUrl: html });
  check("an upload whose bytes are not a real image is rejected", r.status === 400, r.status);
  const big = "data:image/png;base64," + Buffer.alloc(1300 * 1024, 1).toString("base64");
  const r2 = await a.c.put("/api/profile", { photoDataUrl: big });
  check("oversized upload returns 413 (not 500)", r2.status === 413, r2.status);
  await a.c.put("/api/profile", { photoDataUrl: PNG });
  const k1 = q1("SELECT photo_key FROM profiles WHERE user_id = ?", a.id).photo_key;
  await a.c.put("/api/profile", { photoDataUrl: PNG });
  const k2 = q1("SELECT photo_key FROM profiles WHERE user_id = ?", a.id).photo_key;
  check("replacing a profile photo deletes the old file", k1 !== k2 && !T.env.MEDIA.store.has(k1), { k1, k2, still: T.env.MEDIA.store.has(k1) });
}

console.log("\n# Blocking, consent and access control");
{
  const a = await signup("Blocker");
  const b = await signup("Pest");
  const cn = await b.c.post("/api/connect", { cardId: a.card });
  await a.c.post(`/api/connections/${cn.json.connectionId}/report`, { reason: "spam", block: true });
  const again = await b.c.post("/api/connect", { cardId: a.card });
  check("a blocked person cannot connect again", again.status === 403, again.status);
  const view = await b.c.get(`/api/c/${a.card}`);
  check("a blocked person cannot open the blocker's card", view.status === 404, view.status);
}
{
  const a = await signup("A1");
  const b = await signup("B1");
  const cn = await b.c.post("/api/connect", { cardId: a.card });
  const eve = await signup("Eve2");
  check("IDOR: stranger cannot read a connection", (await eve.c.get(`/api/connections/${cn.json.connectionId}`)).status === 404);
  check("IDOR: stranger cannot write a note on it", (await eve.c.put(`/api/connections/${cn.json.connectionId}/note`, { text: "x" })).status === 404);
  check("IDOR: stranger cannot delete it", (await eve.c.del(`/api/connections/${cn.json.connectionId}`)).status === 404);
  check("IDOR: stranger cannot edit someone's card", (await eve.c.put(`/api/cards/${a.card}`, { name: "pwn" })).status === 404);
  const r = await a.c.put(`/api/cards/${a.card}`, { visibleLinks: [{ evil: 1 }, "LinkedIn"], tags: [{ x: 1 }, "ok"] });
  const card = q1("SELECT visible_links, tags FROM cards WHERE id = ?", a.card);
  check("card fields only store strings", r.status === 200 && !card.visible_links.includes("{") && !card.tags.includes("{"), card);
  const e = await a.c.post("/api/account/email", { email: "a".repeat(400) + "@x.io" });
  check("recovery email length is capped", e.status === 400, e.status);
  const sqli = await a.c.get("/api/code/" + encodeURIComponent("' OR 1=1 --"));
  check("SQL injection in a code lookup is harmless", sqli.status === 404, sqli.status);
}
{
  const guest = client();
  // A guest checking in to an event must agree to the terms first.
  const host = await signup("Host");
  host.c.jar.size; // reuse session
  await host.c.post("/api/auth/recovery");
  await host.c.post("/api/host/terms", { accept: true });
  const ev = await host.c.post("/api/host/events", { name: "Social" });
  const r = await guest.post(`/api/e/${ev.json.code}/checkin`, { name: "Gus" });
  check("check-in requires agreeing to the Terms (18+)", r.status === 400 && r.json?.code === "terms_required", r.json);
  const r2 = await guest.post(`/api/e/${ev.json.code}/checkin`, { name: "Gus", acceptTerms: true, over18: true });
  check("check-in works once agreed", r2.status === 200, r2.text);
  const other = await signup("OtherHost");
  await other.c.post("/api/auth/recovery");
  await other.c.post("/api/host/terms", { accept: true });
  const rep = await other.c.get(`/api/host/events/${ev.json.id}/report`);
  check("IDOR: another organisation cannot read an event report", rep.status === 404, rep.status);
}
{
  let granted = [];
  for (let i = 0; i < 5; i++) {
    const c = client({ ip: "192.0.2.77" });
    await c.post("/api/auth/recovery");
    await c.post("/api/host/terms", { accept: true });
    const me = await c.get("/api/host/me");
    granted.push(me.json?.credits?.granted ?? -1);
  }
  check("free starter credits cannot be farmed from one IP", granted.filter((g) => g > 0).length <= 3, granted);
}
{
  const a = await signup("Exp");
  const ex = await a.c.get("/api/account/export");
  const s = ex.text;
  const sid = a.c.jar.get("lanyard_session");
  check("data export contains no session token or key hashes", !s.includes(sid) && !/key_hash|public_key/.test(s));
  const me = await a.c.get("/api/me");
  check("/api/me exposes no secrets", !/key_hash|public_key|lanyard_session/.test(me.text));
}

summary();
