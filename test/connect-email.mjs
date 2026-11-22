// F45: email when someone new connects. Run: node test/connect-email.mjs
// The real Worker on in-memory SQLite, with a stubbed AI gateway (no network). Each section names the line of
// the privacy and sign-in bar it tests; the F45 plan note's Log lists them.
import { readFileSync, readdirSync } from "node:fs";
import { makeEnv, makeDb, migrationFiles, readMigration, withLatency, becomeHost, check, summary, reqBody } from "./harness.mjs";
import { setSetting } from "../worker/ai/store.js";
import { findUserByEmail } from "../worker/email-auth.js";
import { mailableAddress, releaseMail, confirmLink, validTz, setPending, PENDING_MAIL_CAP, CONFIRM_TTL, PENDING_KEEP } from "../worker/pending-email.js";
import { withConfirm, confirmEmail } from "../worker/mail-templates.js";
import { purgeExpired } from "../worker/purge.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const sha = async (t) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const DAY = 86400e3, H = 3600e3;

// A stubbed AI gateway that records every request (the AI inputs are searched for the address).
const model = { calls: [] };
globalThis.fetch = async (url, init = {}) => {
  if (!String(url).startsWith("https://gateway.test/")) throw new Error(`unexpected network call to ${url}`);
  model.calls.push(init.body);
  const body = reqBody(init.body);
  const text = /people|search/i.test(body.system || "") ? JSON.stringify({ matches: [] })
    : JSON.stringify({ subject: "Good to meet you", body: "Hi, it was good to meet you. Let's keep in touch." });
  return new Response(JSON.stringify({ choices: [{ message: { content: text }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { status: 200 });
};

console.log("\n# Migration 0036 on a database in the old shape");
{
  const db = makeDb({ before: "0036" });
  const raw = db.raw;
  raw.prepare("INSERT INTO users (id, created_at, recovery_email, email_verified) VALUES ('u1', 1, 'old@example.com', 1)").run();
  const m = migrationFiles().find((f) => f.startsWith("0036_"));
  raw.exec(readMigration(m));
  const u = raw.prepare("SELECT recovery_email, email_verified, pending_email, pending_email_at, pending_mails, tz FROM users WHERE id = 'u1'").get();
  check("0036 keeps an existing account as it was, with no pending email, 0 emails sent to one and no time zone",
    u.recovery_email === "old@example.com" && u.email_verified === 1 && u.pending_email === null && u.pending_email_at === null && u.pending_mails === 0 && u.tz === null, u);
  const sql = readMigration(m).replace(/--.*$/gm, "");
  check("it only adds (ALTER TABLE ADD COLUMN, CREATE TABLE, CREATE INDEX): no DROP, DELETE, UPDATE or INSERT",
    !/\b(DROP|DELETE\s+FROM|UPDATE\s+\w+\s+SET|INSERT\s+INTO)\b/i.test(sql) && /ALTER TABLE users ADD COLUMN pending_email TEXT/.test(sql));
  check("the pending address is not unique (two accounts may type the same address)", !/UNIQUE/i.test(sql));
  raw.prepare("INSERT INTO email_confirms (id, user_id, email, secret_hash, created_at, expires_at) VALUES ('t1', 'u1', 'x@example.com', 'h', 1, 2)").run();
  raw.prepare("DELETE FROM users WHERE id = 'u1'").run();
  check("a confirm link goes with its account (ON DELETE CASCADE)", raw.prepare("SELECT COUNT(*) n FROM email_confirms").get().n === 0);
}

const T = await makeEnv({ AI_ENABLED: "1", AI_GATEWAY_URL: "https://gateway.test/v1/a/b/anthropic", OPENROUTER_API_KEY: "sk-test-not-a-real-key-0123456789", AI_PRICE_INPUT_PER_MTOK_USD: "1", AI_PRICE_OUTPUT_PER_MTOK_USD: "5" });
const { client, q, q1, env } = T;
await setSetting(env.DB, "rollout", "everyone");
const outbox = env.MAIL_OUTBOX;
const count = (t) => q1(`SELECT COUNT(*) n FROM ${t}`).n;
const world = () => ["users", "profiles", "connections", "cards", "sessions", "consents"].map(count).join();

let ipn = 0;
const ip = () => `10.45.${Math.floor(++ipn / 200)}.${(ipn % 200) + 1}`;
async function signup(name, body = {}, { email } = {}) {
  const c = client({ ip: ip() });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, ...body });
  if (r.status !== 201) throw new Error(r.text);
  const me = (await c.get("/api/me")).json;
  if (email) q("UPDATE users SET recovery_email = ?, email_verified = 1, is_guest = 0 WHERE id = ?", email, me.user.id);
  return { c, name, id: me.user.id, card: me.cards[0].cardId };
}
const guestConnect = (c, card, body = {}) => c.post("/api/connect", { cardId: card, name: "Sam Guest", acceptTerms: true, over18: true, ...body });
const userRow = (id) => q1("SELECT recovery_email, email_verified, is_guest, pending_email, pending_email_at, pending_mails, tz FROM users WHERE id = ?", id);
const linkIn = (m) => /https?:\/\/[^\s]+\/api\/email\/confirm\?t=([0-9a-f]+)/.exec(m?.text || "");
const mailsTo = (to) => outbox.filter((m) => m.to[0] === to);

const O = await signup("Owen Owner", { tags: ["Robotics"], headline: "Builds robots" }, { email: "owen@example.com" });

console.log("\n# Bar 1: a guest connect without a valid email is a 400 and creates nothing");
{
  const before = world(), mails = outbox.length;
  const c = client({ ip: ip() });
  const r = await guestConnect(c, O.card);
  check("no email: 400 with a plain message and a code", r.status === 400 && r.json.code === "email_required" && /^Add your email to connect\./.test(r.json.error), r.json);
  check("…no user, profile, card, connection, session or consent is made, no cookie is set and no email is sent",
    world() === before && !c.jar.has("lanyard_session") && outbox.length === mails, [before, world()]);
  for (const [label, email] of [["an empty string", ""], ["spaces", "   "], ["no @", "sam.example.com"], ["no dot after the @", "sam@example"], ["two @", "sam@@example.com"], ["a space inside", "sam guest@example.com"],
    ["over 254 characters", "a".repeat(250) + "@example.com"], ["a number", 12345], ["a list", ["sam@example.com"]], ["an object", { email: "sam@example.com" }], ["true", true], ["null", null]]) {
    const cc = client({ ip: ip() });
    const rr = await guestConnect(cc, O.card, { email });
    check(`${label}: refused the same way, nothing made`, rr.status === 400 && rr.json.code === "email_required" && world() === before && !cc.jar.has("lanyard_session"), [rr.status, rr.json]);
  }
  const noTerms = await client({ ip: ip() }).post("/api/connect", { cardId: O.card, name: "Sam", email: "sam@example.com" });
  check("an email without the 18+ and Terms tick is still refused, and nothing is made", noTerms.status === 400 && noTerms.json.code === "terms_required" && world() === before);
  const noName = await client({ ip: ip() }).post("/api/connect", { cardId: O.card, email: "sam@example.com", acceptTerms: true, over18: true });
  check("an email without a name is refused, and nothing is made", noName.status === 400 && world() === before);
  const noCard = await guestConnect(client({ ip: ip() }), "ffffffffff", { email: "sam@example.com" });
  check("a made-up card is a 404, and nothing is made (before F45 it made a guest)", noCard.status === 404 && world() === before);
  const selfie = await guestConnect(client({ ip: ip() }), O.card, { email: "sam@example.com", selfieDataUrl: "data:image/png;base64,AAAA" });
  check("a selfie without the shared-selfie tick is refused before anything is made", selfie.status === 400 && world() === before);
  // A visitor who already has a guest session (made by another action) but no card: no profile or connection is made.
  const g = client({ ip: ip() });
  await g.post("/api/terms/accept", {}); // a write: mints the guest session, refused
  const users = count("users"), profiles = count("profiles"), conns = count("connections");
  const r2 = await guestConnect(g, O.card);
  check("a guest session with no card and no email: 400, and no profile or connection is made", r2.status === 400 && r2.json.code === "email_required" && count("users") === users && count("profiles") === profiles && count("connections") === conns);
}

console.log("\n# A guest connects with an email: stored only as the pending address");
const S = client({ ip: ip() });
const SAM = "sam.pending@example.com";
let samId, samLink;
{
  const mails = outbox.length;
  const r = await guestConnect(S, O.card, { email: "  Sam.Pending@Example.COM ", tz: "Asia/Hong_Kong", message: "Hello Owen" });
  check("the connection is made", r.status === 200 && !!r.json.connectionId && count("connections") >= 1, r.text);
  samId = (await S.get("/api/me")).json.user.id;
  const u = userRow(samId);
  check("users.pending_email is the address, trimmed and lower-case", u.pending_email === SAM, u);
  check("recovery_email is unchanged (NULL) and email_verified is 0", u.recovery_email === null && u.email_verified === 0, u);
  check("the time zone is kept (Intl knows it)", u.tz === "Asia/Hong_Kong", u);
  const sent = outbox.slice(mails);
  check("exactly one email goes out, to that address: Confirm your email, with the link", sent.length === 1 && sent[0].to[0] === SAM && sent[0].subject === "Confirm your email for Lanyard" && !!linkIn(sent[0]) && sent[0].html.includes("Confirm it&#39;s you"), sent.map((m) => m.subject));
  check("…and it counts as one of the two emails an unconfirmed address may get", u.pending_mails === 1);
  check("the email names nobody (the address may not be theirs)", !/Owen/.test(sent[0].text + sent[0].html));
  samLink = linkIn(sent[0])[1];
  const me = (await S.get("/api/me")).json.user;
  check("the guest's own /api/me shows the pending address, and says it is not confirmed", me.pendingEmail === SAM && me.emailVerified === false && me.recoveryEmail === null, me);
  check("the response to the connect does not echo the address", !JSON.stringify(r.json).includes(SAM));
}

console.log("\n# Bar 2: the pending address never signs anyone in");
{
  check("findUserByEmail never returns an account by its pending address", (await findUserByEmail(env.DB, SAM)) === null);
  const mails = outbox.length;
  const start = await client({ ip: ip() }).post("/api/auth/email/start", { email: SAM });
  check("asking for a sign-in code for it answers as for any address (no hint)", start.status === 200 && start.json.ok === true);
  check("…but sends no code and stores none", outbox.length === mails && q1("SELECT COUNT(*) n FROM email_codes WHERE email = ?", SAM).n === 0);
  // Even a sign-in code row planted for the address (as if one had been sent) cannot sign in to the account.
  q("INSERT INTO email_codes (email, purpose, user_id, code_hash, attempts, created_at, expires_at) VALUES (?, 'signin', '', ?, 0, ?, ?)", SAM, await sha(`${SAM}:123456`), Date.now(), Date.now() + 600e3);
  const v = client({ ip: ip() });
  const verify = await v.post("/api/auth/email/verify", { email: SAM, code: "123456" });
  check("a code verify for it cannot sign in, even with a right code on file", verify.status === 404 && verify.json.code === "bad_code" && (await v.get("/api/me")).json.user?.id !== samId, verify.json);
  q("DELETE FROM email_codes WHERE email = ?", SAM);
  check("the session count for the account is still one (the guest's own)", q1("SELECT COUNT(*) n FROM sessions WHERE user_id = ?", samId).n === 1);
  const u = userRow(samId);
  check("recovery_email and email_verified are still untouched", u.recovery_email === null && u.email_verified === 0);
}

console.log("\n# Someone who already has a card: no email is asked for, and one sent is ignored");
{
  const P = await signup("Pat Peer");
  const r = await P.c.post("/api/connect", { cardId: O.card, email: "pat.typed@example.com", tz: "Europe/London" });
  const u = userRow(P.id);
  check("a person with a card connects without an email", (await P.c.post("/api/connect", { cardId: O.card })).status === 200);
  check("an email sent by a person with a card is ignored (nothing pending, nothing sent)", r.status === 200 && u.pending_email === null && mailsTo("pat.typed@example.com").length === 0, u);
  check("their time zone is still kept", u.tz === "Europe/London");
  // A person with a confirmed email and no card yet (signed in, never made one) is not asked again.
  const V = client({ ip: ip() });
  await V.post("/api/terms/accept", {});
  const vid = q1("SELECT id FROM users ORDER BY created_at DESC, rowid DESC LIMIT 1").id;
  q("UPDATE users SET recovery_email = 'vic@example.com', email_verified = 1 WHERE id = ?", vid);
  const rv = await guestConnect(V, O.card, { name: "Vic" });
  check("a signed-in person with a confirmed email and no card connects with a name only, and nothing is made pending", rv.status === 200 && userRow(vid).pending_email === null, rv.text);
}

console.log("\n# Bar 8: tz only if Intl knows it");
{
  check("validTz: Europe/London, UTC, Asia/Hong_Kong", validTz("Europe/London") === "Europe/London" && validTz("UTC") === "UTC" && validTz("Asia/Hong_Kong") === "Asia/Hong_Kong");
  check("validTz canonicalises the spelling Intl accepts", validTz("europe/london") === "Europe/London");
  check("validTz: made-up, empty, markup, too long, not a string are all null",
    [validTz("Mars/Olympus"), validTz(""), validTz("<script>"), validTz("Europe/" + "x".repeat(60)), validTz(5), validTz(null), validTz({}), validTz(["UTC"])].every((x) => x === null));
  for (const bad of ["Mars/Olympus", "", 7, ["UTC"], { a: 1 }, "x".repeat(65), "'; DROP TABLE users; --"]) {
    await S.put("/api/profile", { tz: bad });
  }
  check("an unknown or malformed tz on a profile save is ignored (the kept one stays)", userRow(samId).tz === "Asia/Hong_Kong", userRow(samId));
  await S.put("/api/profile", { tz: "Europe/Paris" });
  check("a valid one on a profile save replaces it", userRow(samId).tz === "Europe/Paris");
  const N = client({ ip: ip() });
  await N.post("/api/profile", { name: "Nia", acceptTerms: true, over18: true, tz: "America/New_York" });
  check("a valid one is kept when a card is made", userRow((await N.get("/api/me")).json.user.id).tz === "America/New_York");
}

console.log("\n# Bar 3: nobody else ever sees the pending address");
const HOST = client({ ip: ip(), site: "host" });
const hostInfo = await becomeHost(HOST, { kind: "company", name: "Email Test Events" });
q("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES ('cr-f45', ?, 20, 0, 'test', ?)", hostInfo.org.json.id, Date.now());
const ev = (await HOST.post("/api/host/events", { name: "Connect night", startsAt: Date.now() - H, endsAt: Date.now() + 5 * H, directoryOn: true,
  collect: { attendance: true, items: ["email", "card"], why: "So we can keep a register for fire safety" } })).json;
{
  const ALL = { attendance: true, email: true, card: true };
  for (const p of [O.c, S]) {
    const r = await p.post(`/api/e/${ev.code}/checkin`, { collect: ALL, directoryConsent: true });
    if (r.status !== 200) throw new Error(r.text);
    await p.put(`/api/e/${ev.id}/presence`, { consent: true, intro: "Here to meet people", lookingFor: "a robot builder" });
  }
  await guestConnect(S, O.card, { eventId: ev.id }); // files the connection under the event
  const cn = (await O.c.get("/api/connections")).json.connections.find((x) => x.peer?.userId === samId || x.peer?.name === "Sam Guest");
  const samCard = (await S.get("/api/me")).json.cards[0].cardId;
  const seen = {
    "the card owner's People list": await O.c.get("/api/connections"),
    "the card owner's view of the connection": await O.c.get(`/api/connections/${cn?.id}`),
    "the card owner opening the guest's card": await O.c.get(`/api/c/${samCard}`),
    "the guest's card page JSON, signed out": await client({ ip: ip() }).get(`/api/c/${samCard}`),
    "the card owner's own card page as the guest sees it": await S.get(`/api/c/${O.card}`),
    "the card owner's data download": await O.c.get("/api/account/export"),
    "the card owner's /api/me": await O.c.get("/api/me"),
    "the card owner's events list": await O.c.get("/api/my/events"),
    "the card owner's event hub": await O.c.get(`/api/my/events/${ev.id}`),
    "the event room": await O.c.get(`/api/e/${ev.id}/room`),
    "presence: who to meet": await O.c.get(`/api/e/${ev.id}/suggestions`),
    "the host's attendee list": await HOST.get(`/api/host/events/${ev.id}/attendees`),
    "the host's attendee CSV": await HOST.get(`/api/host/events/${ev.id}/attendees.csv`),
    "the host's live view": await HOST.get(`/api/host/events/${ev.id}/live`),
    "the host's report": await HOST.get(`/api/host/events/${ev.id}/report`),
    "the host's report CSV": await HOST.get(`/api/host/events/${ev.id}/report.csv`),
    "the host's data download": await HOST.get("/api/host/account/export"),
    "a follow-up draft (AI)": await O.c.post(`/api/ai/followup/${cn?.id}`, { channel: "email", tone: "friendly", goal: "stay_in_touch", talkAbout: [], offer: [], useNote: false, extra: "", regenerate: true }),
  };
  q("DELETE FROM rate_limits WHERE key LIKE 'ai:burst:%'"); // one AI call every few seconds per person
  seen["a people search (AI)"] = await O.c.post("/api/ai/people-search", { query: "someone who builds robots" });
  check("the test is real: the owner sees the connection, the list has the guest, presence shows them and both AI requests reached the gateway (the draft names the guest)",
    !!cn && seen["the host's attendee list"].text.includes("Sam Guest") && seen["presence: who to meet"].text.includes("Sam") && model.calls.length === 2 && String(model.calls[0]).includes("Sam") && seen["the card owner's data download"].text.includes(samId),
    [!!cn, seen["the host's attendee list"].status, seen["presence: who to meet"].text.slice(0, 120), model.calls.length]);
  for (const [label, r] of Object.entries(seen)) {
    check(`${label} (${r.status}) never contains the pending address`, r.status < 500 && !r.text.toLowerCase().includes(SAM) && !r.text.toLowerCase().includes("sam.pending"), r.status);
  }
  check("every request the AI gateway got never contains it", model.calls.every((b) => !String(b).toLowerCase().includes("sam.pending")));
  check("F31's list shows a verified email for the owner, and none for the guest (verified emails only)",
    seen["the host's attendee list"].text.includes("owen@example.com") && /Sam Guest/.test(seen["the host's attendee CSV"].text));
  // Source guard: only these files read the column at all.
  const files = (dir) => readdirSync(new URL("../" + dir, import.meta.url), { withFileTypes: true }).flatMap((d) => d.isDirectory() ? files(`${dir}/${d.name}`) : d.name.endsWith(".js") ? [`${dir}/${d.name}`] : []);
  const readers = files("worker").filter((f) => /pending_email/.test(read(f))).sort();
  check("only index.js (/api/me, connect, export, step 5), pending-email.js and email-auth.js (clears it on a code confirm) name pending_email",
    JSON.stringify(readers) === JSON.stringify(["worker/email-auth.js", "worker/index.js", "worker/pending-email.js"]), readers);
  check("no AI, host, event or admin file reads whole user rows", files("worker").filter((f) => !/worker\/(index|session)\.js$/.test(f)).every((f) => !/SELECT \*\s+FROM users|\bu\.\*/.test(read(f))));
  const idx = read("worker/index.js");
  check("/api/me sends the pending address only to its own account, and only while unconfirmed", /pendingEmail: \(!u\.email_verified && data\.user\?\.pending_email\) \|\| null/.test(idx));
}

console.log("\n# Bar 4: the confirm link");
{
  const row = q1("SELECT * FROM email_confirms WHERE user_id = ?", samId);
  const [id, secret] = [samLink.slice(0, 10), samLink.slice(10)];
  check("the link is 10 + 32 random hex characters (newId and newToken, both crypto.getRandomValues)", /^[0-9a-f]{42}$/.test(samLink) && row.id === id);
  check("only a SHA-256 of the secret is stored; the secret is in no table", row.secret_hash === await sha(secret) && !JSON.stringify(q("SELECT * FROM email_confirms")).includes(secret));
  check("it expires 14 days after it was made", row.expires_at - row.created_at === 14 * DAY && CONFIRM_TTL === 14 * DAY);
  const src = read("worker/pending-email.js");
  check("the secret is compared in constant time (sameText), and single use is one DELETE ... RETURNING", /sameText\(hash, row\.secret_hash\)/.test(src) && /DELETE FROM email_confirms WHERE id = \? AND secret_hash = \? RETURNING/.test(src));

  const V = client({ ip: ip() });
  const open = await V.get(`/api/email/confirm?t=${samLink}`);
  check("opening it shows the address and a Confirm it's me button, and changes nothing (mail scanners open links)",
    open.status === 200 && open.text.includes(SAM) && /<form method="post"/.test(open.text) && /Confirm it&#39;s me|Confirm it's me/.test(open.text) && userRow(samId).email_verified === 0 && !!q1("SELECT 1 x FROM email_confirms WHERE id = ?", id));
  check("…sets no cookie and makes no account", !V.jar.size && open.setCookies.length === 0);
  await V.get(`/api/email/confirm?t=${samLink}`);
  check("opening it twice still changes nothing", userRow(samId).email_verified === 0);

  // Every way of being wrong gives the same answer.
  const flip = (s) => s.slice(0, -1) + (s.at(-1) === "0" ? "1" : "0");
  const bad = {
    wrong: await V.post(`/api/email/confirm?t=${flip(samLink)}`, {}),
    madeUp: await V.post(`/api/email/confirm?t=${"ab".repeat(21)}`, {}),
    short: await V.post(`/api/email/confirm?t=${samLink.slice(0, 41)}`, {}),
    none: await V.post("/api/email/confirm", {}),
    junk: await V.post("/api/email/confirm?t=%3Cscript%3E", {}),
  };
  const ref = bad.wrong;
  check("a wrong, made-up, short, missing or junk token all fail the same way (400, the same page)", Object.values(bad).every((r) => r.status === 400 && r.text === ref.text) && /This link doesn&#39;t work|This link doesn't work/.test(ref.text), Object.values(bad).map((r) => r.status));
  check("…and none of them confirmed anything or used the real link up", userRow(samId).email_verified === 0 && !!q1("SELECT 1 x FROM email_confirms WHERE id = ?", id));
  // An expired one.
  const other = await signup("Exa Expired");
  await setPending(env.DB, other.id, "exa@example.com");
  const expUrl = await confirmLink(env.DB, "https://lanyard.test", other.id, "exa@example.com");
  q("UPDATE email_confirms SET expires_at = ? WHERE user_id = ?", Date.now() - 1, other.id);
  const exp = await V.post(expUrl.replace("https://lanyard.test", ""), {});
  check("an expired link fails the same way and confirms nothing", exp.status === 400 && exp.text === ref.text && userRow(other.id).email_verified === 0);
  check("GET of a wrong or expired link shows the same page too", (await V.get(`/api/email/confirm?t=${flip(samLink)}`)).text === ref.text && (await V.get(expUrl.replace("https://lanyard.test", ""))).text === ref.text);

  const ok = await V.post(`/api/email/confirm?t=${samLink}`, {});
  const u = userRow(samId);
  check("pressing the button confirms it once: the confirmed page", ok.status === 200 && /Email confirmed/.test(ok.text) && ok.text.includes(SAM), ok.text.slice(0, 200));
  check("…recovery_email and email_domain are set, email_verified = 1, is_guest = 0, the pending address and its count are cleared",
    u.recovery_email === SAM && u.email_verified === 1 && u.is_guest === 0 && u.pending_email === null && u.pending_mails === 0 && q1("SELECT email_domain d FROM users WHERE id = ?", samId).d === "example.com", u);
  check("…its links are gone, nobody was signed in by it", q1("SELECT COUNT(*) n FROM email_confirms WHERE user_id = ?", samId).n === 0 && !V.jar.size && q1("SELECT COUNT(*) n FROM sessions WHERE user_id = ?", samId).n === 1);
  const again = await V.post(`/api/email/confirm?t=${samLink}`, {});
  check("a second use fails the same way", again.status === 400 && again.text === ref.text);
  const mails = outbox.length;
  await client({ ip: ip() }).post("/api/auth/email/start", { email: SAM });
  check("now (and only now) the address signs in: a code is sent", outbox.length === mails + 1 && /code is \d{6}/.test(outbox.at(-1).text));

  // Single use under a burst: ten presses at once on one link confirm it once.
  const R = await signup("Rae Racer");
  await setPending(env.DB, R.id, "rae@example.com");
  const raeUrl = (await confirmLink(env.DB, "https://lanyard.test", R.id, "rae@example.com")).replace("https://lanyard.test", "");
  const realDb = env.DB;
  env.DB = withLatency(realDb);
  const burst = await Promise.all(Array.from({ length: 10 }, (_, i) => client({ ip: `10.46.0.${i + 1}` }).post(raeUrl, {})));
  env.DB = realDb;
  check("ten presses sent together: exactly one confirmed page, nine 'doesn't work'", burst.filter((r) => /Email confirmed/.test(r.text)).length === 1 && burst.filter((r) => r.status === 400).length === 9, burst.map((r) => r.status));

  // Changing the address stops the old link.
  const C2 = await signup("Cy Changer");
  await setPending(env.DB, C2.id, "cy.old@example.com");
  const oldUrl = (await confirmLink(env.DB, "https://lanyard.test", C2.id, "cy.old@example.com")).replace("https://lanyard.test", "");
  await setPending(env.DB, C2.id, "cy.new@example.com");
  const oldR = await V.post(oldUrl, {});
  check("a link for an address that has since been changed fails the same way and confirms neither", oldR.status === 400 && oldR.text === ref.text && userRow(C2.id).email_verified === 0 && userRow(C2.id).pending_email === "cy.new@example.com");
  check("confirmLink refuses an address that is not the person's pending one", (await confirmLink(env.DB, "https://lanyard.test", C2.id, "cy.old@example.com")) === null);

  // Rate limit: counted before it is checked, per IP.
  const L = client({ ip: "10.47.0.1" });
  const tries = [];
  for (let i = 0; i < 11; i++) tries.push((await L.post(`/api/email/confirm?t=${"cd".repeat(21)}`, {})).status);
  check("the 11th wrong link from one IP in 10 minutes is refused with 429", tries.slice(0, 10).every((s) => s === 400) && tries[10] === 429, tries);
  const goodUrl = (await confirmLink(env.DB, "https://lanyard.test", C2.id, "cy.new@example.com")).replace("https://lanyard.test", "");
  check("…and while over the limit even a right link from that IP is not checked", (await L.post(goodUrl, {})).status === 429 && userRow(C2.id).email_verified === 0);
  check("…GET is limited by the same counter", (await L.get(goodUrl)).status === 429);
  check("another IP is not affected, and a right link gives its try back", (await client({ ip: "10.47.0.2" }).get(goodUrl)).status === 200 && q1("SELECT count FROM rate_limits WHERE key = 'confirm:ip:10.47.0.2'").count === 0);
  check("the POST page came from our own page only: a cross-site POST is refused", (await client({ ip: "10.47.0.3", origin: "https://evil.example" }).post(goodUrl, {})).status === 403 && userRow(C2.id).email_verified === 0);
}

console.log("\n# Bar 5: confirming an address another account already has confirmed");
{
  const X = await signup("Xena Owner", {}, { email: "taken@example.com" });
  const t = client({ ip: ip() });
  const mails = outbox.length;
  const r = await guestConnect(t, O.card, { email: "taken@example.com" });
  const tid = (await t.get("/api/me")).json.user.id;
  check("typing it at connect is not refused and says nothing about another account (same answer as any connect)",
    r.status === 200 && JSON.stringify(Object.keys(r.json).sort()) === JSON.stringify(["connectionId", "event", "ok", "receivedNote"]) && !/account|taken/i.test(r.text));
  check("the confirm email goes to the mailbox (only its owner learns anything)", outbox.length === mails + 1 && outbox.at(-1).to[0] === "taken@example.com");
  const link = linkIn(outbox.at(-1))[1];
  const page = await client({ ip: ip() }).get(`/api/email/confirm?t=${link}`);
  check("opening the link shows the usual confirm page (no hint yet)", page.status === 200 && /Confirm your email/.test(page.text));
  const res = await client({ ip: ip() }).post(`/api/email/confirm?t=${link}`, {});
  const u = userRow(tid);
  check("pressing it does not confirm it: 'That email already has a Lanyard account. Sign in with it instead.'", res.status === 409 && res.text.includes("That email already has a Lanyard account. Sign in with it instead.") && u.email_verified === 0 && u.recovery_email === null, u);
  check("…the pending address is cleared and its links are gone", u.pending_email === null && q1("SELECT COUNT(*) n FROM email_confirms WHERE user_id = ?", tid).n === 0);
  check("…and the page never says which account (no id, name or other detail of it)", !res.text.includes(X.id) && !/Xena/.test(res.text));
  check("the other account is unchanged", userRow(X.id).recovery_email === "taken@example.com" && userRow(X.id).email_verified === 1);
  // Someone confirms it between the email and the press.
  const late = client({ ip: ip() });
  await guestConnect(late, O.card, { email: "late@example.com" });
  const lid = (await late.get("/api/me")).json.user.id;
  const lateLink = linkIn(outbox.at(-1))[1];
  const Y = await signup("Yan Late", {}, { email: "late@example.com" });
  const lr = await client({ ip: ip() }).post(`/api/email/confirm?t=${lateLink}`, {});
  check("an address confirmed by another account after the email was sent is not confirmed either", lr.status === 409 && userRow(lid).email_verified === 0 && userRow(lid).pending_email === null && userRow(Y.id).recovery_email === "late@example.com");
}

console.log("\n# Bar 6: mailableAddress and the two-email cap");
{
  check("the cap is two", PENDING_MAIL_CAP === 2);
  // The guest who connected has had one email (the confirm). One more, then none.
  const g = client({ ip: ip() });
  await guestConnect(g, O.card, { email: "gwen@example.com" });
  const gid = (await g.get("/api/me")).json.user.id;
  check("after the connect email, one more send is allowed", JSON.stringify(await mailableAddress(env.DB, gid)) === JSON.stringify({ to: "gwen@example.com", pending: true }));
  check("…and the third is null", (await mailableAddress(env.DB, gid)) === null && userRow(gid).pending_mails === 2);
  q("UPDATE users SET pending_mails = 0 WHERE id = ?", gid);
  const seq = [await mailableAddress(env.DB, gid), await mailableAddress(env.DB, gid), await mailableAddress(env.DB, gid)];
  check("a pending address: the first two sends, then null", seq[0]?.to === "gwen@example.com" && seq[0].pending === true && seq[1]?.to === "gwen@example.com" && seq[2] === null, seq);
  await releaseMail(env.DB, gid, "gwen@example.com");
  check("releaseMail gives a failed send back", (await mailableAddress(env.DB, gid))?.to === "gwen@example.com" && (await mailableAddress(env.DB, gid)) === null);
  check("a confirmed address: always, with no claim", (await Promise.all([1, 2, 3, 4, 5].map(() => mailableAddress(env.DB, O.id)))).every((a) => a?.to === "owen@example.com" && a.pending === false));
  const none = await signup("Ned Noemail");
  check("no address at all, or an unknown user: null", (await mailableAddress(env.DB, none.id)) === null && (await mailableAddress(env.DB, "ffffffffff")) === null);
  // Two jobs at once: the claim is one conditional write.
  q("UPDATE users SET pending_mails = 0 WHERE id = ?", gid);
  for (let round = 0; round < 5; round++) {
    q("UPDATE users SET pending_mails = 0 WHERE id = ?", gid);
    const slow = withLatency(env.DB);
    const got = await Promise.all(Array.from({ length: 12 }, () => mailableAddress(slow, gid)));
    check(`round ${round + 1}: twelve calls at once give exactly two sends, never a third`, got.filter(Boolean).length === 2 && userRow(gid).pending_mails === 2, got.filter(Boolean).length);
  }
  q("UPDATE users SET pending_mails = 1 WHERE id = ?", gid);
  const slow = withLatency(env.DB);
  const got = await Promise.all(Array.from({ length: 8 }, () => mailableAddress(slow, gid)));
  check("with one already sent, eight calls at once give exactly one", got.filter(Boolean).length === 1);
  const link = await confirmLink(env.DB, "https://lanyard.test", gid, "gwen@example.com");
  const msg = withConfirm({ subject: "Time to follow up", text: "Body", html: "<p>Body</p>" }, link);
  check("withConfirm adds the Confirm it's you button and link to an email for F48 and F49", msg.text.includes(link) && msg.html.includes("Confirm it&#39;s you") && msg.subject === "Time to follow up");
  check("withConfirm leaves an email for a confirmed address as it is", JSON.stringify(withConfirm({ subject: "s", text: "t", html: "h" }, null)) === JSON.stringify({ subject: "s", text: "t", html: "h" }));
  check("the confirm email itself is plain text and HTML, UK English, no emoji", /Confirm it's you: https:/.test(confirmEmail({ url: "https://x/y", reason: "card" }).text) && !/\p{Extended_Pictographic}/u.test(JSON.stringify(confirmEmail({ url: "u", reason: "connect" }))));
}

console.log("\n# Step 5: saving a pending email when signed in (same rules)");
{
  const signedOut = client({ ip: ip() });
  const before = count("users");
  const r0 = await signedOut.post("/api/account/pending-email", { email: "x@example.com" });
  check("signed out: 401, and no guest is made", r0.status === 401 && count("users") === before && !signedOut.jar.has("lanyard_session"));
  const noCard = client({ ip: ip() });
  await noCard.post("/api/terms/accept", {});
  check("no card yet: 404", (await noCard.post("/api/account/pending-email", { email: "x@example.com" })).status === 404);
  const W = await signup("Wren Welcome");
  check("an invalid email: 400 with a plain message", (await W.c.post("/api/account/pending-email", { email: "nope" })).status === 400 && userRow(W.id).pending_email === null);
  let mails = outbox.length;
  const r1 = await W.c.post("/api/account/pending-email", { email: "Wren@Example.com", tz: "Europe/London" });
  check("a valid email is kept as pending and one confirm email goes to it", r1.status === 200 && r1.json.pendingEmail === "wren@example.com" && userRow(W.id).pending_email === "wren@example.com" && userRow(W.id).recovery_email === null && outbox.length === mails + 1 && outbox.at(-1).to[0] === "wren@example.com" && /made your Lanyard card/.test(outbox.at(-1).text));
  const firstAt = userRow(W.id).pending_email_at;
  const firstLink = linkIn(outbox.at(-1))[1];
  mails = outbox.length;
  await W.c.post("/api/account/pending-email", { email: "wren@example.com" });
  check("the same address again sends nothing more and keeps its 30-day clock", outbox.length === mails && userRow(W.id).pending_email_at === firstAt && userRow(W.id).pending_mails === 1);
  await W.c.post("/api/account/pending-email", { email: "wren.new@example.com" });
  check("a new address starts again: one new email, the count is 1 for it", outbox.length === mails + 1 && outbox.at(-1).to[0] === "wren.new@example.com" && userRow(W.id).pending_mails === 1);
  check("…and the link for the old address no longer works", (await client({ ip: ip() }).post(`/api/email/confirm?t=${firstLink}`, {})).status === 400);
  check("someone with a confirmed email gets 409 and nothing changes", (await O.c.post("/api/account/pending-email", { email: "owen.other@example.com" })).status === 409 && userRow(O.id).pending_email === null);
  const codes = [];
  for (let i = 0; i < 9; i++) codes.push((await W.c.post("/api/account/pending-email", { email: "wren.new@example.com" })).status);
  check("more than 10 changes in an hour: 429", codes.at(-1) === 429, codes);
  // Many accounts typing one address cannot fill its inbox.
  const before3 = mailsTo("victim@example.com").length;
  for (let i = 0; i < 6; i++) await guestConnect(client({ ip: ip() }), O.card, { email: "victim@example.com" });
  check("six new guests typing one address in a day send it at most three emails", mailsTo("victim@example.com").length - before3 === 3);
  check("the counter for that is keyed by a hash, not the address", !q("SELECT key FROM rate_limits").some((r) => r.key.includes("victim@")));
  // Confirming another address by code replaces the pending one.
  q("UPDATE users SET pending_email = 'pend@example.com', pending_mails = 1 WHERE id = ?", W.id);
  await confirmLink(env.DB, "https://lanyard.test", W.id, "pend@example.com");
  await W.c.post("/api/account/email", { email: "wren.code@example.com" });
  const code = /code is (\d{6})/.exec(mailsTo("wren.code@example.com").at(-1).text)[1];
  const done = await W.c.post("/api/account/email/confirm", { email: "wren.code@example.com", code });
  const u = userRow(W.id);
  check("confirming an email with a code clears the pending one and its links", done.status === 200 && u.recovery_email === "wren.code@example.com" && u.email_verified === 1 && u.pending_email === null && q1("SELECT COUNT(*) n FROM email_confirms WHERE user_id = ?", W.id).n === 0, u);
}

console.log("\n# Bar 7: cleared after 30 days, in the person's own download, deleted with the account");
{
  const A = client({ ip: ip() });
  await guestConnect(A, O.card, { email: "ada@example.com", tz: "Europe/London" });
  const aid = (await A.get("/api/me")).json.user.id;
  const exp = (await A.get("/api/account/export")).json;
  check("the person's own data download has the pending address, since when, how many emails went to it, and the time zone",
    exp.user.pendingEmail === "ada@example.com" && typeof exp.user.pendingEmailSince === "number" && exp.user.emailsToPendingEmail === 1 && exp.user.timeZone === "Europe/London", exp.user);
  check("…and no confirm secret or hash", !JSON.stringify(exp).includes(q1("SELECT secret_hash h FROM email_confirms WHERE user_id = ?", aid).h));
  const B = client({ ip: ip() });
  await guestConnect(B, O.card, { email: "bo@example.com" });
  const bid = (await B.get("/api/me")).json.user.id;
  const ts = Date.now();
  q("UPDATE users SET pending_email_at = ? WHERE id = ?", ts - 31 * DAY, aid);
  q("UPDATE users SET pending_email_at = ? WHERE id = ?", ts - 29 * DAY, bid);
  const out = await purgeExpired(env, ts);
  check("the daily purge clears an address typed 31 days ago and never confirmed", userRow(aid).pending_email === null && userRow(aid).pending_mails === 0 && out.pendingEmails >= 1, userRow(aid));
  check("…and its links", q1("SELECT COUNT(*) n FROM email_confirms WHERE user_id = ?", aid).n === 0);
  check("…but keeps one typed 29 days ago", userRow(bid).pending_email === "bo@example.com" && PENDING_KEEP === 30 * DAY);
  q("UPDATE email_confirms SET expires_at = ? WHERE user_id = ?", ts - 1, bid);
  await purgeExpired(env, ts);
  check("an expired link is deleted by the purge (the address stays until its 30 days are up)", q1("SELECT COUNT(*) n FROM email_confirms WHERE user_id = ?", bid).n === 0 && userRow(bid).pending_email === "bo@example.com");
  check("the account (a guest with a card) is not deleted by any of this", !!userRow(aid) && !!userRow(bid));
  const D = client({ ip: ip() });
  await guestConnect(D, O.card, { email: "del.me@example.com" });
  const did = (await D.get("/api/me")).json.user.id;
  const del = await D.del("/api/account");
  const everything = () => q("SELECT name FROM sqlite_master WHERE type = 'table'").map((t) => JSON.stringify(q(`SELECT * FROM "${t.name}"`))).join("\n");
  check("deleting the account deletes the pending address and its links: it is in no table any more", del.status === 200 && !userRow(did) && q1("SELECT COUNT(*) n FROM email_confirms WHERE user_id = ?", did).n === 0 && !everything().includes("del.me@example.com"));
}

console.log("\n# The emails are worded plainly, and the confirm page is plain HTML with no script");
{
  const m = confirmEmail({ url: "https://lanyard.test/api/email/confirm?t=x", reason: "connect" });
  check("subject and lines", m.subject === "Confirm your email for Lanyard" && /connected with someone on Lanyard/.test(m.text) && /Until it is confirmed, nobody can sign in with it/.test(m.text) && /14 days/.test(m.text));
  const page = await client({ ip: ip() }).get(`/api/email/confirm?t=${"ef".repeat(21)}`);
  check("the page has no script, is not cached and never sends its address (with the token) to another site", !/<script/i.test(page.text) && page.headers.get("cache-control") === "no-store" && page.headers.get("referrer-policy") === "same-origin");
}

console.log("\n# F45.2 The pages (source guards; the browser check is in the plan note)");
{
  const sheet = read("src/components/ConnectSheet.vue");
  check("the connect sheet asks a guest without a card or a confirmed email for an email under the name",
    /const needsEmail = computed\(\(\) => !me\.profile && !me\.user\?\.emailVerified\)/.test(sheet) && sheet.indexOf('id="sheet-name"') < sheet.indexOf('id="sheet-email"') && /<div v-if="needsEmail" class="field">/.test(sheet));
  check("…required, type=email, autocomplete=email, labelled, with the 'Only we see this' line naming the person",
    /<label for="sheet-email">Your email<\/label>/.test(sheet) && /type="email" autocomplete="email"/.test(sheet) && / required /.test(sheet) && sheet.includes("Only we see this. It isn't shown to {{ first }} or on your card."));
  check("…and a quiet 'Already on Lanyard? Sign in' link back to this card", sheet.includes('Already on Lanyard?</span> <router-link :to="signInTo">Sign in</router-link>') && /\/signin\?next=\$\{encodeURIComponent\(`\/c\/\$\{props\.view\.cardId\}`\)\}/.test(sheet));
  check("Connect without an email: 'Add your email…' and nothing is sent (the check returns before Api.connect)",
    /error\.value = "Add your email to connect\./.test(sheet) && sheet.indexOf('"Add your email to connect.') < sheet.indexOf("Api.connect("));
  check("it sends the email only when asked for one, and the browser's time zone", /email: needsEmail\.value \? email\.value\.trim\(\) : undefined/.test(sheet) && /tz: \(\(\) => \{ try \{ return Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/.test(sheet));
  check("someone signed in with a card sees no email field (needsEmail is false with a profile)", /!me\.profile && !me\.user\?\.emailVerified/.test(sheet));
  check("the card page still fetches the sheet lazily (its first load is unchanged)", /import\("\.\.\/components\/ConnectSheet\.vue"\)/.test(read("src/views/PublicCard.vue")) && !/^import .*ConnectSheet/m.test(read("src/views/PublicCard.vue")));
  check("no shared public file was touched for it (api.js, store.js, main.css have no F45 code)", ["src/lib/api.js", "src/lib/store.js", "src/styles/main.css"].every((f) => !/pending-email|pendingEmail|sheet-email/.test(read(f))));
  const signin = read("src/views/SignIn.vue");
  check("Sign in follows ?next= only to a card address", signin.includes('const next = /^\\/c\\/[0-9a-f]{10}$/.test(q("next")) ? q("next") : "/app";') && /afterAccountPath\(next\)/.test(signin));
  const save = read("src/components/welcome/StepSave.vue");
  check("step 5 cannot be skipped without an email on file, confirmed or pending", /const noSkip = computed\(\(\) => !hasEmail\.value \|\| promo\.value\)/.test(save) && /const hasEmail = computed\(\(\) => verified\.value \|\| !!pending\.value\)/.test(save) && /!stepEl\?\.noSkip/.test(read("src/views/Welcome.vue")));
  check("with a pending email it shows the address with 'We'll send you a link to confirm it', and Continue shows",
    /\{\{ pending \}\}/.test(save) && save.includes("We'll send you a link to confirm it.") && /hideContinue: computed\(\(\) => \(promo\.value \? !verified\.value : !hasEmail\.value\)\)/.test(save));
  check("'Confirm now with a code' opens the existing code flow, and a typed email is saved as pending", save.includes("Confirm now with a code") && /<EmailSetup \/>/.test(save) && /api\("\/api\/account\/pending-email", "POST", \{ email: email\.value\.trim\(\), tz \}\)/.test(save));
  check("the passkey extra is unchanged", /verified && canPasskey && !me\.user\?\.hasPasskey/.test(save) && save.indexOf("<EmailSetup") < save.indexOf("Add a passkey"));
  check("Settings' email form shows a pending address and fills it in for the code", /const email = ref\(me\.user\?\.pendingEmail \|\| ""\)/.test(read("src/components/EmailSetup.vue")) && read("src/components/EmailSetup.vue").includes("isn't confirmed yet"));
  check("the time zone is sent when a card is made and when Edit profile saves", /tz: \(\(\) => \{ try \{ return Intl/.test(read("src/components/welcome/StepYou.vue")) && /payload\.tz = Intl\.DateTimeFormat/.test(read("src/views/EditProfile.vue")));
  const pol = read("src/views/Privacy.vue");
  check("Privacy Policy section 2 lists the email you must give when you connect or make a card, and that only we see it",
    pol.includes("Your email, which you must give when you connect or make a card") && pol.includes("Only we see it: never the people you meet, organisers or your card"));
  check("…and section 6 says it is cleared 30 days after you gave it if never confirmed", pol.includes("If you never confirm it, it is cleared 30 days after you gave it"));
  check("the Terms version is not bumped (F50 does one bump for F45 to F50)", /TERMS_VERSION = "2026-11-13"/.test(read("worker/legal.js")));
  check("the dead Connect page says why it is out of step", /Not routed: no route imports this page/.test(read("src/views/Connect.vue")));
}

summary();
