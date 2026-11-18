// F10: host accounts on their own site. Sessions and cookies kept apart from
// attendee accounts, the host API only from the host site, and email-code
// sign-in with rate limits and replies that never reveal whether an account exists.
import { readFileSync } from "node:fs";
import { makeEnv, check, summary, becomeHost, hostSignIn, lastCode } from "./harness.mjs";
import { hostApp } from "../worker/hosts.js";

const T = await makeEnv();
const { client, q1, env } = T;
const HOST_COOKIE = "__Host-lanyard_host";
const MAIN = "https://lanyard.test", HOST = "https://host.lanyard.test";

async function attendee(name, ip) {
  const c = client({ ip });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true });
  if (r.status !== 201) throw new Error(r.text);
  return c;
}

// Every host route, with made-up ids in place of parameters.
const ROUTES = [...new Map(hostApp.routes.filter((r) => r.method !== "ALL")
  .map((r) => [`${r.method} ${r.path}`, { method: r.method, path: r.path.replace(/:[a-zA-Z]+/g, "abc0000001") }])).values()];
const OPEN = new Set(["/api/host/auth/start", "/api/host/auth/verify", "/api/host/logout"]);
const send = (c, r, h) => c.req(r.method, r.path, r.method === "GET" ? undefined : {}, h);

console.log("\n# The host cookie");
const H = client({ ip: "10.50.0.1", site: "host" });
await becomeHost(H, { kind: "company", name: "Sec Co", email: "sec@company.example.com" });
const ev = (await H.post("/api/host/events", { name: "Sec Night" })).json;
const again = await hostSignIn(client({ ip: "10.50.0.2", site: "host" }), "sec@company.example.com");
const set = again.verify.setCookies.find((x) => x.startsWith(HOST_COOKIE + "="));
check("sign-in sets the host cookie", !!set, again.verify.setCookies);
check("…HttpOnly, Secure, SameSite=Strict, Path=/", /HttpOnly/i.test(set) && /Secure/i.test(set) && /SameSite=Strict/i.test(set) && /Path=\//.test(set), set);
check("…with no Domain, so the browser keeps it to the host site (the __Host- prefix enforces that)", !/domain=/i.test(set) && set.startsWith("__Host-"), set);
check("…and no attendee cookie is set by the host site", !again.verify.setCookies.some((x) => x.startsWith("lanyard_session=")));
const hostToken = H.jar.get(HOST_COOKIE);
check("host session tokens are stored hashed", !q1("SELECT 1 x FROM host_sessions WHERE id = ?", hostToken) && q1("SELECT COUNT(*) n FROM host_sessions").n >= 2);

console.log(`\n# An attendee cookie gets 401 on every host route (${ROUTES.length} routes)`);
const A = await attendee("Ann", "10.50.1.1");
const leak = client({ ip: "10.50.1.2", site: "host" });
leak.jar.set("lanyard_session", A.jar.get("lanyard_session")); // a browser would never send it here; the server must ignore it anyway
const not401 = [];
for (const r of ROUTES) {
  if (OPEN.has(r.path) || r.path.startsWith("/api/host/scan/")) continue; // F40: the scanner link's token is its key (test/voucher-scan.mjs)
  const res = await send(leak, r);
  if (res.status !== 401) not401.push(`${r.method} ${r.path} ${res.status}`);
}
check("every host route that needs an account answers 401 to an attendee cookie", not401.length === 0, not401);
check("…and the attendee session is untouched", (await A.get("/api/me")).json.user?.id);

console.log("\n# A host cookie gets nothing from the attendee API");
const hostOnlyMain = client({ ip: "10.50.2.1" });
hostOnlyMain.jar.set(HOST_COOKIE, hostToken);
for (const p of ["/api/connections", "/api/account/export", "/api/auth/sessions", "/api/account/consents", "/api/my/events"]) {
  const res = await hostOnlyMain.get(p);
  check(`main site ${p}: 401`, res.status === 401, res.status);
}
const meMain = await hostOnlyMain.get("/api/me");
check("main site /api/me sees nobody signed in, and makes no guest", meMain.json.user === null && !hostOnlyMain.jar.has("lanyard_session"));
const hostSiteAttendee = [["GET", "/api/me"], ["GET", "/api/connections"], ["POST", "/api/profile"], ["POST", "/api/auth/email/start"],
  ["POST", "/api/logout"], ["GET", "/api/admin/queue"], ["POST", "/api/connect"], ["GET", "/api/e/ABCDE"]];
const bad = [];
for (const [m, p] of hostSiteAttendee) {
  const res = await H.req(m, p, m === "GET" ? undefined : {});
  if (res.status !== 401 || res.json?.code !== "wrong_site") bad.push(`${m} ${p} ${res.status}`);
}
check("on the host site, every attendee API route answers 401 (with the host cookie sent)", bad.length === 0, bad);
check("…and no attendee session or guest is created there", !H.jar.has("lanyard_session"));

console.log("\n# The host API is refused from the main site");
const mainWithHost = client({ ip: "10.50.3.1" });
mainWithHost.jar.set(HOST_COOKIE, hostToken);
const notRefused = [];
for (const r of ROUTES) {
  const res = await send(mainWithHost, r);
  if (res.status !== 403 || res.json?.code !== "wrong_site") notRefused.push(`${r.method} ${r.path} ${res.status}`);
}
check("every host route, sign-in included, is refused on the main site even with a host cookie", notRefused.length === 0, notRefused);

console.log("\n# Only the host site's own pages can call the host API (CSRF)");
const me = (h) => H.get("/api/host/me", h);
check("same-origin reads work", (await me({ "sec-fetch-site": "same-origin" })).status === 200);
check("a read from the main site (Sec-Fetch-Site: same-site) is refused", (await me({ "sec-fetch-site": "same-site" })).status === 403);
check("a read with the main site's Origin is refused", (await me({ origin: MAIN })).status === 403);
check("a cross-site read is refused", (await me({ "sec-fetch-site": "cross-site" })).status === 403);
const w = (h) => H.post("/api/host/events", { name: "CSRF" }, h);
check("a write from the main site's Origin is refused", (await w({ origin: MAIN })).json?.code === "bad_origin");
check("a write from another site is refused", (await w({ origin: "https://evil.example" })).json?.code === "bad_origin");
check("a write with no Origin is refused", (await H.req("POST", "/api/host/events", { name: "x" }, { origin: "" })).status === 403);
check("a write with a typed-address Sec-Fetch-Site is refused", (await w({ "sec-fetch-site": "none" })).status === 403);
check("the same write from the host site works", (await w({ origin: HOST, "sec-fetch-site": "same-origin" })).status === 201);
const fromHostToMain = await A.post("/api/profile", { name: "Pwned" }, { origin: HOST });
check("the attendee API refuses writes from the host site's pages", fromHostToMain.status === 403 && fromHostToMain.json.code === "bad_origin", fromHostToMain.json);

console.log("\n# Signed in to both, completely separately");
const both = client({ ip: "10.50.4.1" });
await both.post("/api/profile", { name: "Bo", acceptTerms: true, over18: true });
const bothHost = client({ ip: "10.50.4.1", site: "host" });
await becomeHost(bothHost, { kind: "individual", email: "bo@company.example.com", fullName: "Bo Both" });
await bothHost.post("/api/host/logout");
check("signing out of the host portal leaves the card signed in", (await both.get("/api/me")).json.user?.id && (await bothHost.get("/api/host/me")).status === 401);
await hostSignIn(bothHost, "bo@company.example.com");
await both.post("/api/logout");
check("signing out of the card leaves the host portal signed in", (await both.get("/api/me")).json.user === null && (await bothHost.get("/api/host/me")).json.account.email === "bo@company.example.com");

console.log("\n# Email-code sign-in");
const out = env.MAIL_OUTBOX;
const S = client({ ip: "10.60.0.1", site: "host" });
const badEmail = await S.post("/api/host/auth/start", { email: "not-an-email" });
check("a malformed email is refused", badEmail.status === 400);
const accountsBefore = q1("SELECT COUNT(*) n FROM host_accounts").n;
const known = await S.post("/api/host/auth/start", { email: "sec@company.example.com" });
const unknown = await S.post("/api/host/auth/start", { email: "new-person@company.example.com" });
check("the reply is the same for an existing account and a new email", known.status === unknown.status && known.text === unknown.text, [known.text, unknown.text]);
check("asking for a code creates no account", q1("SELECT COUNT(*) n FROM host_accounts").n === accountsBefore);
q1("SELECT 1"); // keep order
env.DB.raw.prepare("UPDATE host_accounts SET status = 'disabled' WHERE email = 'bo@company.example.com'").run();
const n0 = out.length;
const disabled = await S.post("/api/host/auth/start", { email: "bo@company.example.com" });
check("a disabled account gets the same reply and no email", disabled.text === known.text && out.length === n0);
check("…and is signed out at once", (await bothHost.get("/api/host/me")).status === 401);
const mail = out.at(-1);
check("the code comes from the hosts sender", mail.kind === "decisions" && /hosts@/.test(mail.from) && mail.to[0] === "new-person@company.example.com");
check("…and the email has no code in a link", !/https?:\/\/\S*\d{6}/.test(mail.text) && mail.text.includes(`${HOST}/signin`), mail.text);
const code = lastCode(S, "new-person@company.example.com");
const row = q1("SELECT * FROM host_login_codes WHERE email = 'new-person@company.example.com'");
check("codes are stored hashed", row.code_hash.length === 64 && !row.code_hash.includes(code) && !JSON.stringify(row).includes(`"${code}"`));
check("codes expire after 10 minutes", Math.abs(row.expires_at - row.created_at - 10 * 60e3) < 5);

const wrong = String((Number(code) + 1) % 1e6).padStart(6, "0");
const missKnown = await client({ ip: "10.60.0.9", site: "host" }).post("/api/host/auth/verify", { email: "sec@company.example.com", code: wrong });
const missNobody = await client({ ip: "10.60.0.9", site: "host" }).post("/api/host/auth/verify", { email: "nobody@company.example.com", code: wrong });
check("a wrong code gets the same reply for an account and for nobody", missKnown.status === missNobody.status && missKnown.text === missNobody.text && missKnown.status === 400, [missKnown.text, missNobody.text]);

const V = client({ ip: "10.60.1.1", site: "host" });
for (let i = 0; i < 5; i++) await V.post("/api/host/auth/verify", { email: "new-person@company.example.com", code: wrong });
const afterFive = await V.post("/api/host/auth/verify", { email: "new-person@company.example.com", code });
check("after 5 wrong tries the code is dead, even the right one", afterFive.status === 400 && afterFive.json.code === "bad_code", afterFive.json);
check("…and no account was made", !q1("SELECT 1 x FROM host_accounts WHERE email = 'new-person@company.example.com'"));

const E = client({ ip: "10.60.2.1", site: "host" });
await E.post("/api/host/auth/start", { email: "expire@company.example.com" });
const ecode = lastCode(E, "expire@company.example.com");
env.DB.raw.prepare("UPDATE host_login_codes SET expires_at = ? WHERE email = 'expire@company.example.com'").run(Date.now() - 1);
check("an expired code does not work", (await E.post("/api/host/auth/verify", { email: "expire@company.example.com", code: ecode })).status === 400);

const U = client({ ip: "10.60.3.1", site: "host" });
await U.post("/api/host/auth/start", { email: "once@company.example.com" });
const old = lastCode(U, "once@company.example.com");
await U.post("/api/host/auth/start", { email: "once@company.example.com" });
const fresh = lastCode(U, "once@company.example.com");
check("a new code replaces the old one", old === fresh || (await U.post("/api/host/auth/verify", { email: "once@company.example.com", code: old })).status === 400);
const ok = await U.post("/api/host/auth/verify", { email: "once@company.example.com", code: fresh });
check("the right code signs in and creates the account then", ok.status === 200 && q1("SELECT email_verified_at v FROM host_accounts WHERE email = 'once@company.example.com'")?.v > 0);
const reuse = await client({ ip: "10.60.3.2", site: "host" }).post("/api/host/auth/verify", { email: "once@company.example.com", code: fresh });
check("a code works only once", reuse.status === 400);

const P = client({ ip: "10.60.4.1", site: "host" });
const perEmail = [];
for (let i = 0; i < 6; i++) perEmail.push((await client({ ip: `10.60.4.${10 + i}`, site: "host" }).post("/api/host/auth/start", { email: "limit@company.example.com" })).status);
check("5 codes per email per hour, from any network", perEmail.slice(0, 5).every((s) => s === 200) && perEmail[5] === 429, perEmail);
const perIp = [];
for (let i = 0; i < 21; i++) perIp.push((await P.post("/api/host/auth/start", { email: `ip${i}@company.example.com` })).status);
check("20 codes per network per hour", perIp.slice(0, 20).every((s) => s === 200) && perIp[20] === 429, perIp);

const G = client({ ip: "10.60.5.1", site: "host" });
const guesses = [];
for (let i = 0; i < 12; i++) guesses.push((await G.post("/api/host/auth/verify", { email: `g${i}@company.example.com`, code: "123456" })).status);
check("wrong guesses from one network are throttled", guesses.includes(429) && guesses.indexOf(429) <= 10, guesses);

console.log("\n# No host route reaches attendee identity");
const src = readFileSync(new URL("../worker/hosts.js", import.meta.url), "utf8") + readFileSync(new URL("../worker/host-auth.js", import.meta.url), "utf8");
check("hostUser() is gone and no host route reads the attendee user", !/hostUser\(/.test(src) && !/c\.get\("user"\)/.test(src));
check("host code never reads attendee sessions, users or the old host tables",
  !/\b(FROM|JOIN|INTO|UPDATE)\s+(users|sessions|host_profiles|org_members|org_transfers|org_invites|host_tickets|consents)\b/i.test(src),
  src.match(/\b(FROM|JOIN|INTO|UPDATE)\s+(users|sessions|host_profiles|org_members|org_transfers|org_invites|host_tickets|consents)\b/gi));
check("…and never reads the attendee cookie", !/getCookie\([^)]*lanyard_session/.test(src) && !/import\s*\{[^}]*COOKIE[^}]*\}\s*from\s*"\.\/session\.js"/.test(src) && src.includes("getCookie(c, hostCookieName(c))"));

console.log("\n# Hosts still see only aggregates (D004)");
const g1 = await attendee("Gina Guest", "10.70.0.1"), g2 = await attendee("Hugo Guest", "10.70.0.2");
for (const g of [g1, g2]) await g.post(`/api/e/${ev.code}/checkin`, { acceptTerms: true, over18: true });
const ids = [(await g1.get("/api/me")).json.user.id, (await g2.get("/api/me")).json.user.id];
const seen = [await H.get(`/api/host/events/${ev.id}/live`), await H.get(`/api/host/events/${ev.id}/report`), await H.get(`/api/host/events/${ev.id}/report.csv`), await H.get("/api/host/me")];
const blob = seen.map((x) => x.text).join("\n");
check("live view, report, CSV and dashboard name nobody who checked in", seen.every((x) => x.status === 200) && !/Gina|Hugo/.test(blob) && !ids.some((id) => blob.includes(id)), seen.map((x) => x.status));
check("…but do count them", seen[0].json.checkins === 2);

summary();
