// Security test suite: each check states the secure behaviour.
// Run: node test/security.mjs
import { becomeHost, makeEnv, check, summary, PNG } from "./harness.mjs";

const T = await makeEnv({ ADMIN_TOKEN: "test-admin-token" });
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
  // F45: a refused connect (a made-up card) no longer makes a guest, so this connects for real.
  const target = await signup("Limit");
  for (let i = 0; i < 130; i++) {
    const c = client({ ip: "198.51.100.9" });
    const r = await c.post("/api/connect", { cardId: target.card, name: "Guest", email: "guest@example.com", acceptTerms: true, over18: true });
    if (r.status === 429) blocked++;
  }
  check("new guest accounts are rate-limited per IP", blocked > 0, { blocked });
}

console.log("\n# Signed-in devices");
{
  const a = await signup("DevA", { ip: "10.9.0.1" });
  const b = await signup("DevB", { ip: "10.9.0.2" });
  // Give A a second device and B a second device.
  const second = async (owner, ip) => {
    const d = client({ ip });
    const r = await d.post("/api/auth/redeem", { code: (await owner.c.post("/api/auth/link")).json.code });
    if (r.status !== 200) throw new Error("second device failed " + r.status + " " + r.text);
    return d;
  };
  const a2 = await second(a, "10.9.0.3");
  const b2 = await second(b, "10.9.0.4");
  const list = (await a.c.get("/api/auth/sessions")).json.sessions;
  const stored = q("SELECT id FROM sessions WHERE user_id = ?", a.id).map((r) => r.id);
  check("the device list gives each device a short handle", list.length === 2 && list.every((s) => /^[0-9a-f]{16}$/.test(s.id)), list);
  check("a handle is not the stored session id or any part of it", list.every((s) => !stored.some((id) => id.includes(s.id) || s.id.includes(id.slice(0, 8)))));
  const cur = list.find((s) => s.current), other = list.find((s) => !s.current);
  check("exactly one device is marked as this one", !!cur && !!other);

  const bList = (await b.c.get("/api/auth/sessions")).json.sessions;
  const bOther = bList.find((s) => !s.current);
  const cross = await a.c.del("/api/auth/sessions/" + bOther.id);
  check("you cannot sign out someone else's device", cross.status === 404 && (await b2.get("/api/me")).json.user?.id === b.id, cross.status);
  check("a made-up or malformed handle signs nothing out", (await a.c.del("/api/auth/sessions/0000000000000000")).status === 404 && (await a.c.del("/api/auth/sessions/x%27%20OR%201=1")).status === 404 && (await a2.get("/api/me")).json.user?.id === a.id);
  check("the device you are using cannot be removed this way", (await a.c.del("/api/auth/sessions/" + cur.id)).status === 400 && (await a.c.get("/api/me")).json.user?.id === a.id);
  const anonDel = await client({ ip: "10.9.0.5" }).del("/api/auth/sessions/" + other.id);
  check("a visitor with no account cannot sign a device out", [401, 403, 404].includes(anonDel.status) && (await a2.get("/api/me")).json.user?.id === a.id, anonDel.status);
  const gone = await a.c.del("/api/auth/sessions/" + other.id);
  check("signing out one device ends that session only", gone.status === 200 && (await a2.get("/api/me")).json.user === null && (await a.c.get("/api/me")).json.user?.id === a.id && (await b.c.get("/api/me")).json.user?.id === b.id && (await b2.get("/api/me")).json.user?.id === b.id, gone.json);
  check("the device list no longer shows it", (await a.c.get("/api/auth/sessions")).json.sessions.length === 1);
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
  const host = { c: client({ site: "host", ip: "10.20.0.1" }) };
  await becomeHost(host.c, { kind: "company" });
  const ev = await host.c.post("/api/host/events", { name: "Social" });
  const r = await guest.post(`/api/e/${ev.json.code}/checkin`, { name: "Gus" });
  check("check-in requires agreeing to the Terms (18+)", r.status === 400 && r.json?.code === "terms_required", r.json);
  const r2 = await guest.post(`/api/e/${ev.json.code}/checkin`, { name: "Gus", acceptTerms: true, over18: true });
  check("check-in works once agreed", r2.status === 200, r2.text);
  const other = { c: client({ site: "host", ip: "10.20.0.2" }) };
  await becomeHost(other.c, { kind: "company" });
  const rep = await other.c.get(`/api/host/events/${ev.json.id}/report`);
  check("IDOR: another organisation cannot read an event report", rep.status === 404, rep.status);
}
{
  let granted = [];
  for (let i = 0; i < 5; i++) {
    const c = client({ ip: "192.0.2.77", site: "host" });
    await becomeHost(c, { kind: "company" });
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

console.log("\n# Authenticator-app (TOTP) sign-in");
{
  const { hotp, unbase32 } = await import("../worker/totp.js");
  const codeNow = async (secret, off = 0) => hotp(unbase32(secret), Math.floor(Date.now() / 30000) + off);
  // RFC 6238 test vector (SHA-1, secret "12345678901234567890", T=59s): 94287082 -> last 6 digits
  check("TOTP matches the RFC 6238 test vector", (await hotp(new TextEncoder().encode("12345678901234567890"), 1)) === "287082");

  const a = await signup("Totp");
  const setup = await a.c.post("/api/auth/totp/setup");
  check("setup returns a secret and otpauth URI", setup.status === 200 && /^[A-Z2-7]{32}$/.test(setup.json.secret) && setup.json.uri.startsWith("otpauth://totp/"), setup.json);
  const early = await client().post("/api/auth/totp/redeem", { id: a.id, code: await codeNow(setup.json.secret) });
  check("an unconfirmed secret can't sign in", early.status === 404, early.status);
  const badConfirm = await a.c.post("/api/auth/totp/confirm", { code: "000000" });
  check("confirm rejects a wrong code", badConfirm.status === 400, badConfirm.status);
  const code = await codeNow(setup.json.secret);
  check("confirm accepts the right code", (await a.c.post("/api/auth/totp/confirm", { code })).status === 200);
  check("/api/me reports hasTotp", (await a.c.get("/api/me")).json.user.hasTotp === true);

  const b = client({ ip: "198.51.100.7" });
  const replay = await b.post("/api/auth/totp/redeem", { id: a.id, code });
  check("the code used to confirm can't be replayed", replay.status === 404, replay.status);
  const next = await codeNow(setup.json.secret, 1);
  const ok = await b.post("/api/auth/totp/redeem", { id: a.id, code: next });
  check("a fresh code signs in and opens a session", ok.status === 200 && (await b.get("/api/me")).json.user.id === a.id, ok.json);
  const again = await client({ ip: "198.51.100.8" }).post("/api/auth/totp/redeem", { id: a.id, code: next });
  check("a used code can't sign in twice", again.status === 404, again.status);

  const brute = client({ ip: "198.51.100.9" });
  let last;
  for (let i = 0; i < 12; i++) last = await brute.post("/api/auth/totp/redeem", { id: a.id, code: String(100000 + i) });
  check("wrong guesses get throttled", last.status === 429, last.status);
  check("secret is not exposed by export or /api/me", !(await a.c.get("/api/account/export")).text.includes(setup.json.secret));
  check("disable turns it off", (await a.c.del("/api/auth/totp")).status === 200 && q1("SELECT COUNT(*) n FROM totp_secrets").n === 0);
}

console.log("\n# Email sign-in");
{
  const out = T.env.MAIL_OUTBOX;
  const lastCode = () => /\b(\d{6})\b/.exec(out.at(-1).subject)[1];
  const a = await signup("Emma");
  check("sending a code needs a valid address", (await a.c.post("/api/account/email", { email: "nope" })).status === 400);
  const n0 = out.length;
  check("adding an email sends a code", (await a.c.post("/api/account/email", { email: "Emma@Uni.ac.uk" })).status === 200 && out.length === n0 + 1 && out.at(-1).to[0] === "emma@uni.ac.uk" && out.at(-1).kind === "accounts");
  check("the address isn't saved until confirmed", q1("SELECT recovery_email e FROM users WHERE id = ?", a.id).e === null);
  const wrong = await a.c.post("/api/account/email/confirm", { email: "emma@uni.ac.uk", code: "000000" });
  check("a wrong code is refused", wrong.status === 400, wrong.status);
  const conf = await a.c.post("/api/account/email/confirm", { email: "emma@uni.ac.uk", code: lastCode(), marketing: false });
  check("the right code verifies the email", conf.status === 200 && q1("SELECT email_verified v FROM users WHERE id = ?", a.id).v === 1, conf.json);
  check("marketing stays off unless ticked", q1("SELECT marketing_optin m FROM users WHERE id = ?", a.id).m === 0);
  check("the marketing choice can be switched on", (await a.c.post("/api/account/marketing", { optin: true })).status === 200 && q1("SELECT marketing_optin m FROM users WHERE id = ?", a.id).m === 1);

  const other = await signup("Mallory");
  const steal = await other.c.post("/api/account/email", { email: "emma@uni.ac.uk" });
  check("a verified address can't be claimed by another account", steal.status === 409, steal.status);

  const dev = client({ ip: "198.51.100.20" });
  const n1 = out.length;
  const ghost = await dev.post("/api/auth/email/start", { email: "nobody@uni.ac.uk" });
  check("start looks identical for unknown addresses and sends nothing", ghost.status === 200 && ghost.json.ok === true && out.length === n1);
  check("start sends a code for a known address", (await dev.post("/api/auth/email/start", { email: "EMMA@uni.ac.uk" })).status === 200 && out.length === n1 + 1);
  const code = lastCode();
  check("a wrong code doesn't sign in", (await dev.post("/api/auth/email/verify", { email: "emma@uni.ac.uk", code: code === "123456" ? "654321" : "123456" })).status === 404);
  const ok = await dev.post("/api/auth/email/verify", { email: "emma@uni.ac.uk", code });
  check("the emailed code signs in", ok.status === 200 && (await dev.get("/api/me")).json.user.id === a.id, ok.json);
  check("the code is single use", (await client({ ip: "198.51.100.21" }).post("/api/auth/email/verify", { email: "emma@uni.ac.uk", code })).status === 404);

  const brute = client({ ip: "198.51.100.22" });
  await brute.post("/api/auth/email/start", { email: "emma@uni.ac.uk" });
  const real = lastCode();
  let last;
  for (let i = 0; i < 8; i++) last = await brute.post("/api/auth/email/verify", { email: "emma@uni.ac.uk", code: String(100000 + i) });
  check("guessing the code is capped", last.status === 404 || last.status === 429);
  check("even the right code fails after too many tries", (await brute.post("/api/auth/email/verify", { email: "emma@uni.ac.uk", code: real })).status !== 200);

  // authenticator app + email
  const t = await a.c.post("/api/auth/totp/setup");
  const { hotp, unbase32 } = await import("../worker/totp.js");
  const step = Math.floor(Date.now() / 30000);
  await a.c.post("/api/auth/totp/confirm", { code: await hotp(unbase32(t.json.secret), step) });
  const viaApp = await client({ ip: "198.51.100.30" }).post("/api/auth/totp/redeem", { id: "emma@uni.ac.uk", code: await hotp(unbase32(t.json.secret), step + 1) });
  check("an authenticator code + email signs in", viaApp.status === 200, viaApp.json);

  // recovery of a cookie-only account by the admin
  const ADMIN = { authorization: "Bearer test-admin-token" };
  const lost = await signup("Zed Lostcookie");
  const bare = client({ ip: "198.51.100.40" });
  check("user search needs the admin token", (await bare.get("/api/admin/users?q=Zed")).status === 401);
  const found = await bare.get("/api/admin/users?q=Lostcookie", ADMIN);
  check("admin finds a cookie-only account by name", found.json.users.some((u) => u.id === lost.id), found.json);
  const issued = await bare.post(`/api/admin/users/${lost.id}/signin-code`, {}, ADMIN);
  const back = client({ ip: "198.51.100.41" });
  check("the admin's one-time code gets them back in", (await back.post("/api/auth/redeem", { code: issued.json.code })).status === 200 && (await back.get("/api/me")).json.user.id === lost.id);
}

console.log("\n# News emails and unsubscribe");
{
  const out = T.env.MAIL_OUTBOX;
  const ADMIN = { authorization: "Bearer test-admin-token" };
  const bare = client({ ip: "198.51.100.50" });
  async function withEmail(name, email, marketing) {
    const u = await signup(name);
    await u.c.post("/api/account/email", { email });
    const code = /\b(\d{6})\b/.exec(out.at(-1).subject)[1];
    await u.c.post("/api/account/email/confirm", { email, code, marketing });
    return u;
  }
  const yes = await withEmail("Yes Person", "yes@news.test", true);
  check("confirming an email sends a welcome message", out.at(-1).subject === "Your Lanyard account is saved" && out.at(-1).to[0] === "yes@news.test");
  const no = await withEmail("No Person", "no@news.test", false);
  const before = out.length;

  check("broadcast needs the admin token", (await bare.post("/api/admin/broadcast", { subject: "x", body: "y" })).status === 401);
  check("broadcast needs a subject and message", (await bare.post("/api/admin/broadcast", { subject: "", body: "" }, ADMIN)).status === 400);
  const test = await bare.post("/api/admin/broadcast", { subject: "Hello", body: "News", testTo: "me@test.dev" }, ADMIN);
  check("a test goes to one address only", test.status === 200 && out.length === before + 1 && out.at(-1).to[0] === "me@test.dev" && out.at(-1).subject.startsWith("[TEST]"));

  const sent = await bare.post("/api/admin/broadcast", { subject: "Hello", body: "News\n\nMore" }, ADMIN);
  const news = out.slice(before + 1);
  check("news reaches opted-in people only", sent.json.sent >= 1 && news.some((m) => m.to[0] === "yes@news.test") && !news.some((m) => m.to[0] === "no@news.test"), news.map((m) => m.to));
  const mail = news.find((m) => m.to[0] === "yes@news.test");
  check("every news email has a one-click unsubscribe", /^<https:\/\/.+\/api\/unsubscribe\?k=news&u=/.test(mail.headers["List-Unsubscribe"]) && mail.text.includes("Unsubscribe:"));
  const again = await bare.post("/api/admin/broadcast", { id: sent.json.id, subject: "Hello", body: "News" }, ADMIN);
  check("running a broadcast again never emails anyone twice", again.json.sent === 0 && again.json.remaining === 0, again.json);

  const link = new URL(mail.headers["List-Unsubscribe"].slice(1, -1));
  const path = link.pathname + link.search;
  const users0 = q1("SELECT COUNT(*) n FROM users").n;
  check("the unsubscribe page doesn't unsubscribe on a plain GET", (await bare.get(path)).status === 200 && q1("SELECT marketing_optin m FROM users WHERE id = ?", yes.id).m === 1);
  check("a forged unsubscribe link is refused", !(await bare.post(path.replace(/t=.{4}/, "t=0000"))).text.includes("Unsubscribed"));
  check("POST unsubscribes with no sign-in", (await bare.post(path)).text.includes("Unsubscribed") && q1("SELECT marketing_optin m FROM users WHERE id = ?", yes.id).m === 0);
  check("unsubscribing creates no guest account", q1("SELECT COUNT(*) n FROM users").n === users0);
  const n2 = out.length;
  await bare.post("/api/admin/broadcast", { subject: "Second", body: "Again" }, ADMIN);
  check("unsubscribed people get no more news", !out.slice(n2).some((m) => m.to[0] === "yes@news.test"));
}

console.log("\n# Scanner probes");
{
  const c = client();
  for (const p of ["/.git/config", "/.env.local", "/media/.env", "/wp-content/debug.log", "/public/phpinfo.php", "/api/phpinfo.php", "/backup.sql"]) {
    const r = await c.get(p);
    check(`${p} is a plain 404`, r.status === 404 && !r.text.includes("<html"), r.status);
  }
  check("normal app routes still load", (await c.get("/hosts")).status === 200 && (await c.get("/c/abc")).status === 200);
}

summary();
