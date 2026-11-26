// F74 (D063): profiles the admin makes for someone not on Lanyard yet, and the claim link. The real Worker on in-memory SQLite.
// The bar: private until claimed (the card is the same 404 as a missing one for everyone, and the account is in no list and
// cannot be checked in, connected or signed in to); claim tokens are 32 random bytes kept only as SHA-256, never in
// admin_audit, a log line or a query string; every admin route needs the token, is audited and checks the profile exactly
// as Edit profile does.
// Run: node test/premade.mjs
import { readFileSync } from "node:fs";
import { makeEnv, makeDb, check, summary, migrationFiles, readMigration, PNG, becomeHost } from "./harness.mjs";
import { hashClaimToken, readSource, SOURCE_MAX, TOKEN_RE, isPremade } from "../worker/premade.js";
import { gatherPeople } from "../worker/ai/peopleSearch.js";
import { createHash } from "node:crypto";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const DAY = 86400e3;

// Every line the Worker logs while this file runs is kept, so the tokens can be searched for at the end.
const LOGS = [];
for (const k of ["log", "error", "warn", "info"]) {
  const orig = console[k].bind(console);
  console[k] = (...a) => { LOGS.push(a.map((x) => (typeof x === "string" ? x : (() => { try { return JSON.stringify(x) ?? String(x); } catch { return String(x); } })())).join(" ")); orig(...a); };
}
const TOKENS = []; // every claim token this file is given

const T = await makeEnv({ ADMIN_TOKEN: "test-admin-token-f74" });
const { client, q, q1, env } = T;
const raw = env.DB.raw;
const ADMIN = { authorization: "Bearer test-admin-token-f74" };
const admin = client({ ip: "10.74.0.1" });
let ipN = 1;
const fresh = () => client({ ip: `10.74.${Math.floor(ipN / 200) + 1}.${(ipN++ % 200) + 1}` });
async function signup(name, extra = {}) {
  const c = fresh();
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, ...extra });
  if (r.status !== 201) throw new Error(r.text);
  return { c, name, id: (await c.get("/api/me")).json.user.id, cardId: r.json.cards[0].id };
}
const tokenOf = (link) => { const t = String(link || "").split("/claim/p/")[1]; if (t) TOKENS.push(t); return t; };
async function make(body = {}) {
  const r = await admin.post("/api/admin/premade", { name: "Priya Example", source: "LinkedIn", mode: "career", company: "Example Studio", role: "Designer", headline: "Designs calm software", ...body }, ADMIN);
  if (r.status !== 201) throw new Error(r.text);
  return { ...r.json, token: tokenOf(r.json.link) };
}
const MISSING_CARD = async () => (await fresh().get("/api/c/0000000000")).text;

/* ------------------------------------------------------------------------------------------------------------------ */
console.log("\n# The migration is additive and safe to apply before the new code");
{
  const sql = read("migrations/0046_admin_made_profiles.sql").replace(/--.*$/gm, "");
  check("0046 is the newest migration and follows 0045", migrationFiles().at(-1) === "0046_admin_made_profiles.sql" && migrationFiles().at(-2) === "0045_metrics_daily.sql");
  check("it only adds: two columns with safe defaults, one table, one partial index and two triggers; nothing dropped, renamed or rewritten",
    /ALTER TABLE users ADD COLUMN admin_made INTEGER NOT NULL DEFAULT 0/.test(sql) && /ALTER TABLE users ADD COLUMN claimed_at INTEGER;/.test(sql)
    && /CREATE TABLE IF NOT EXISTS claim_links/.test(sql) && /token_hash TEXT NOT NULL UNIQUE/.test(sql) && /user_id\s+TEXT PRIMARY KEY REFERENCES users\(id\) ON DELETE CASCADE/.test(sql)
    && (sql.match(/CREATE TRIGGER IF NOT EXISTS/g) || []).length === 2 && !/\b(DROP|RENAME|UPDATE|DELETE FROM|INSERT)\b/i.test(sql.replace(/BEFORE INSERT ON/g, "")));
  const db = makeDb({ before: "0046" });
  db.raw.prepare("INSERT INTO users (id, created_at, is_guest) VALUES ('old1', 1, 1)").run();
  db.raw.prepare("INSERT INTO users (id, created_at, is_guest) VALUES ('old2', 1, 0)").run();
  db.exec(readMigration("0046_admin_made_profiles.sql"));
  check("existing accounts (guest or not) are not admin-made after it, so nothing old becomes private", db.raw.prepare("SELECT COUNT(*) n FROM users WHERE admin_made = 0 AND claimed_at IS NULL").get().n === 2);
  db.raw.prepare("INSERT INTO events (id, code, name, created_at) VALUES ('ev1', 'EVT01', 'Night', 1)").run();
  db.raw.prepare("INSERT INTO checkins (event_id, user_id, created_at) VALUES ('ev1', 'old1', 1)").run();
  db.raw.prepare("INSERT INTO connections (id, user_a, user_b, created_at) VALUES ('cn1', 'old1', 'old2', 1)").run();
  check("an ordinary guest still checks in and connects with the triggers in place", db.raw.prepare("SELECT COUNT(*) n FROM checkins").get().n === 1 && db.raw.prepare("SELECT COUNT(*) n FROM connections").get().n === 1);
}

/* ------------------------------------------------------------------------------------------------------------------ */
console.log("\n# Every admin route needs the token and is audited");
const P = await make({ photoDataUrl: PNG, links: { LinkedIn: "https://example.com/in/priya", Bad: "javascript:alert(1)" }, tags: ["Design", "Research"] });
{
  const routes = [["GET", "/api/admin/premade"], ["POST", "/api/admin/premade"], ["GET", `/api/admin/premade/${P.id}`], ["PUT", `/api/admin/premade/${P.id}`],
    ["POST", `/api/admin/premade/${P.id}/link`], ["DELETE", `/api/admin/premade/${P.id}`], ["GET", `/api/admin/premade/${P.id}/photo`]];
  let all401 = true, wrong401 = true;
  for (const [m, p] of routes) {
    const body = m === "GET" || m === "DELETE" ? undefined : { name: "X", source: "LinkedIn" };
    if ((await fresh().req(m, p, body)).status !== 401) all401 = false;
    if ((await fresh().req(m, p, body, { authorization: "Bearer not-the-token" })).status !== 401) wrong401 = false;
  }
  check("all seven routes are 401 without the token", all401);
  check("and 401 with a wrong one", wrong401);
  check("nothing was made, changed or deleted by those calls", q1("SELECT COUNT(*) n FROM users WHERE admin_made = 1").n === 1 && !!q1("SELECT 1 x FROM claim_links WHERE user_id = ?", P.id));
  const before = q1("SELECT COUNT(*) n FROM admin_audit").n;
  await admin.get("/api/admin/premade", ADMIN);
  await admin.get(`/api/admin/premade/${P.id}`, ADMIN);
  const rows = q("SELECT action, detail FROM admin_audit ORDER BY at DESC, rowid DESC LIMIT 2");
  check("each call with the token writes an admin_audit row naming the route", q1("SELECT COUNT(*) n FROM admin_audit").n === before + 2 && rows.some((r) => r.action === `GET /api/admin/premade/${P.id}`) && rows.some((r) => r.action === "GET /api/admin/premade"), rows);
  check("the routes are registered after the token check, in admin.js", (() => { const a = read("worker/admin.js"); return a.indexOf('adminApp.use("/api/admin/*"') < a.indexOf("registerPremadeAdmin(adminApp)"); })() && /app\.(get|post|put|delete)\("\/api\/admin\/premade/.test(read("worker/premadeAdmin.js")) && !/registerPremadeAdmin/.test(read("worker/index.js")));
  check("no admin route takes a token in its path or query", !/:token|query\(["']t(oken)?["']\)/.test(read("worker/premadeAdmin.js")));
}

/* ------------------------------------------------------------------------------------------------------------------ */
console.log("\n# Making one: a link, a hashed token, the source required");
{
  check("making one answers 201 with a link /claim/p/<43 characters> and the card id", /^https:\/\/lanyard\.test\/claim\/p\/[A-Za-z0-9_-]{43}$/.test(P.link) && P.path === `/claim/p/${P.token}` && TOKEN_RE.test(P.token) && !!P.cardId);
  const u = q1("SELECT is_guest, admin_made, recovery_email, email_verified, claimed_at FROM users WHERE id = ?", P.id);
  check("the account is a guest, admin-made, with no email and no session", u.is_guest === 1 && u.admin_made === 1 && u.recovery_email === null && u.email_verified === 0 && u.claimed_at === null && q1("SELECT COUNT(*) n FROM sessions WHERE user_id = ?", P.id).n === 0);
  check("it has one profile and one default card", q1("SELECT COUNT(*) n FROM profiles WHERE user_id = ?", P.id).n === 1 && q1("SELECT COUNT(*) n FROM cards WHERE user_id = ? AND is_default = 1", P.id).n === 1);
  const l = q1("SELECT * FROM claim_links WHERE user_id = ?", P.id);
  const sha = createHash("sha256").update(`claim-link:${P.token}`).digest("hex");
  check("only the token's SHA-256 is stored", l.token_hash === sha && l.token_hash === (await hashClaimToken(P.token)) && l.token_hash !== P.token);
  check("the token is 32 random bytes", Buffer.from(P.token.replace(/-/g, "+").replace(/_/g, "/"), "base64").length === 32);
  check("the link ends 30 days after the account was made", l.expires_at === q1("SELECT created_at FROM users WHERE id = ?", P.id).created_at + 30 * DAY);
  check("the source is kept with the link", l.source === "LinkedIn");
  // The token itself is in no table at all.
  const tables = q("SELECT name FROM sqlite_master WHERE type = 'table'").map((t) => t.name);
  const hits = tables.filter((t) => q(`SELECT * FROM "${t}"`).some((r) => Object.values(r).some((v) => typeof v === "string" && v.includes(P.token))));
  check("the token is not stored anywhere in the database", hits.length === 0, hits);
  const two = await make({ name: "Second Person" });
  check("two profiles get different tokens", two.token !== P.token && q1("SELECT COUNT(DISTINCT token_hash) n FROM claim_links").n === 2);
  check("the photo was stored as an avatar", /^avatar\/[a-z0-9]+\.png$/.test(q1("SELECT photo_key FROM profiles WHERE user_id = ?", P.id).photo_key) && env.MEDIA.store.has(q1("SELECT photo_key FROM profiles WHERE user_id = ?", P.id).photo_key));

  const bad = async (b) => (await admin.post("/api/admin/premade", { name: "Someone", ...b }, ADMIN));
  const n0 = q1("SELECT COUNT(*) n FROM users").n;
  const noSrc = await bad({});
  check("no source: 400 in plain words", noSrc.status === 400 && /where the details came from/.test(noSrc.json.error), noSrc.json);
  check("an empty or blank source: 400", (await bad({ source: "" })).status === 400 && (await bad({ source: "   \n\t " })).status === 400);
  check("a source that is not text: 400", (await bad({ source: 42 })).status === 400 && (await bad({ source: ["LinkedIn"] })).status === 400);
  check(`a source over ${SOURCE_MAX} characters: 400`, SOURCE_MAX === 80 && (await bad({ source: "x".repeat(81) })).status === 400);
  check("nothing was made by any refused call", q1("SELECT COUNT(*) n FROM users").n === n0);
  const ok80 = await make({ name: "Eighty", source: "y".repeat(80) });
  check(`${SOURCE_MAX} characters is fine`, q1("SELECT source FROM claim_links WHERE user_id = ?", ok80.id).source.length === 80);
  check("a source is one clean line: control, zero-width and direction characters go", readSource("Linked‮In​\n page\u0000").source === "Linked In page");
}

/* ------------------------------------------------------------------------------------------------------------------ */
console.log("\n# The profile is checked exactly as Edit profile checks it");
{
  const messy = {
    name: "  Mess  ", mode: "career", company: "C".repeat(200), role: "R".repeat(200), headline: "H".repeat(900), about: "A".repeat(900), course: "Co", year: "2",
    uni: "U".repeat(300), links: { Site: "https://example.com/" + "p".repeat(400), Bad: "ftp://x", ["L".repeat(41)]: "https://example.com" },
    tags: Array.from({ length: 40 }, (_, i) => "t".repeat(70) + i), showAge: true,
  };
  const person = await signup("Mess Person");
  await person.c.put("/api/profile", messy);
  const m = await make({ name: "Mess" });
  const put = await admin.put(`/api/admin/premade/${m.id}`, { ...messy, source: "A society page" }, ADMIN);
  const cols = "name, mode, company, role, headline, about, course, year, uni, links, tags, show_age, institution_id";
  const a = q1(`SELECT ${cols} FROM profiles WHERE user_id = ?`, person.id), b = q1(`SELECT ${cols} FROM profiles WHERE user_id = ?`, m.id);
  check("the same messy edit saves the same profile through Edit profile and through the admin", put.status === 200 && JSON.stringify(a) === JSON.stringify(b), { a, b });
  const modeBad = await admin.put(`/api/admin/premade/${m.id}`, { mode: "wizard" }, ADMIN);
  const modeBadUser = await person.c.put("/api/profile", { mode: "wizard" });
  check("an unknown mode is 400 on both", modeBad.status === 400 && modeBadUser.status === 400);
  const instBad = await admin.post("/api/admin/premade", { name: "Inst", source: "LinkedIn", institutionId: "no-such-place" }, ADMIN);
  const instBadUser = await person.c.put("/api/profile", { institutionId: "no-such-place" });
  check("an institution id not on the list is 400 with the same words", instBad.status === 400 && instBad.json.error === instBadUser.json.error, [instBad.json, instBadUser.json]);
  check("a blank name is refused on make and on edit", (await admin.post("/api/admin/premade", { name: "  ", source: "LinkedIn" }, ADMIN)).status === 400 && (await admin.put(`/api/admin/premade/${m.id}`, { name: "" }, ADMIN)).status === 400);
  check("a bad source on edit is 400 and the old one stays", (await admin.put(`/api/admin/premade/${m.id}`, { source: "" }, ADMIN)).status === 400 && q1("SELECT source FROM claim_links WHERE user_id = ?", m.id).source === "A society page");
  check("a photo that is not an image is refused (the shared media check)", (await admin.post("/api/admin/premade", { name: "Pic", source: "LinkedIn", photoDataUrl: "data:image/png;base64,PHN2Zz4=" }, ADMIN)).status === 400);
  const src = read("worker/premadeAdmin.js"), idx = read("worker/index.js");
  check("one code path: the admin routes and index.js both import profilePayload, validMode, applyInstitution and photoAllowed from worker/profileFields.js, and neither defines its own",
    /import \{ validMode, profilePayload, applyInstitution, photoAllowed \} from "\.\/profileFields\.js"/.test(src) && /import \{ validMode, profilePayload, applyInstitution, photoAllowed \} from "\.\/profileFields\.js"/.test(idx)
    && !/function profilePayload|function applyInstitution|const validMode/.test(src + idx));
  const edited = await admin.get(`/api/admin/premade/${m.id}`, ADMIN);
  check("the edit form reads it back", edited.status === 200 && edited.json.profile.name === "Mess" && edited.json.source === "A society page" && edited.json.profile.mode === "career");
  // a new photo replaces the old one, and the old one is deleted from storage
  const p1 = await admin.put(`/api/admin/premade/${m.id}`, { photoDataUrl: PNG }, ADMIN);
  const k1 = q1("SELECT photo_key FROM profiles WHERE user_id = ?", m.id).photo_key;
  await admin.put(`/api/admin/premade/${m.id}`, { photoDataUrl: PNG }, ADMIN);
  const k2 = q1("SELECT photo_key FROM profiles WHERE user_id = ?", m.id).photo_key;
  check("a new photo replaces the old one and the old file is deleted", p1.status === 200 && k1 && k2 && k1 !== k2 && !env.MEDIA.store.has(k1) && env.MEDIA.store.has(k2));
  const ph = await admin.get(`/api/admin/premade/${m.id}/photo`, ADMIN);
  check("the admin sees the photo through its own route, never cached", ph.status === 200 && /image\/png/.test(ph.headers.get("content-type")) && /no-store/.test(ph.headers.get("cache-control")));
  check("the admin routes cannot reach an ordinary account", (await admin.get(`/api/admin/premade/${person.id}`, ADMIN)).status === 404 && (await admin.put(`/api/admin/premade/${person.id}`, { name: "Hijack" }, ADMIN)).status === 404
    && (await admin.del(`/api/admin/premade/${person.id}`, ADMIN)).status === 404 && (await admin.post(`/api/admin/premade/${person.id}/link`, {}, ADMIN)).status === 404 && q1("SELECT name FROM profiles WHERE user_id = ?", person.id).name === "Mess");
}

/* ------------------------------------------------------------------------------------------------------------------ */
console.log("\n# Private until claimed: the card");
{
  const missing = await MISSING_CARD();
  const other = await signup("Someone Else");
  const outs = [await fresh().get(`/api/c/${P.cardId}`), await other.c.get(`/api/c/${P.cardId}`), await fresh().get(`/api/c/${P.cardId}`, ADMIN), await other.c.get(`/api/c/${P.cardId}`, ADMIN)];
  check("GET /api/c/<its card> is 404 signed out, signed in as someone else, and with the admin token", outs.every((r) => r.status === 404), outs.map((r) => r.status));
  check("the 404 body is identical to a missing card's", outs.every((r) => r.text === missing), [outs[0].text, missing]);
  check("it has no session of its own to open it with (no session row exists, and no way to sign in)", q1("SELECT COUNT(*) n FROM sessions WHERE user_id = ?", P.id).n === 0 && q1("SELECT COUNT(*) n FROM webauthn_credentials WHERE user_id = ?", P.id).n === 0 && !q1("SELECT recovery_email FROM users WHERE id = ?", P.id).recovery_email);
  const code = q1("SELECT code FROM cards WHERE id = ?", P.cardId).code;
  const byCode = await fresh().get(`/api/code/${code}`), wrong = await fresh().get("/api/code/ZZ99");
  check("its card code opens nothing: the same 404 as a code that does not exist", byCode.status === 404 && byCode.text === wrong.text, byCode.json);
  const photoKey = q1("SELECT photo_key FROM profiles WHERE user_id = ?", P.id).photo_key;
  const gone = await fresh().get("/media/avatar/0123456789abcdef0123.png");
  const photo = await other.c.get(`/media/${photoKey}`);
  check("its photo is not served at /media, to anyone: the same 404 as a photo that does not exist", photo.status === 404 && photo.text === gone.text);
  const page = await fresh().get(`/c/${P.cardId}`), made = await fresh().get("/c/0000000000");
  check("the shared-link page carries no name, headline or photo of it: the same tags as a made-up card", page.status === 200 && !/Priya|calm software/.test(page.text) && page.text.replace(/0000000000/g, P.cardId) === made.text.replace(/0000000000/g, P.cardId));
  const realPhoto = await other.c.get(`/media/${q1("SELECT photo_key FROM profiles WHERE user_id = ?", other.id).photo_key || "avatar/none.png"}`);
  check("(an ordinary avatar route still answers as before)", realPhoto.status === 404 || realPhoto.status === 200);
}

console.log("\n# Private until claimed: it cannot be connected, checked in or found");
{
  const viewer = await signup("Viewer Person");
  const missing = await viewer.c.post("/api/connect", { cardId: "0000000000", acceptTerms: true, over18: true, name: "x", email: "x@example.com" });
  const r = await viewer.c.post("/api/connect", { cardId: P.cardId });
  check("connecting to its card is 404, the same as a missing card, and no connection is made", r.status === 404 && r.text === missing.text && q1("SELECT COUNT(*) n FROM connections WHERE user_a = ? OR user_b = ?", P.id, P.id).n === 0);
  const stranger = fresh();
  const r2 = await stranger.post("/api/connect", { cardId: P.cardId, name: "New Person", email: "new.person@example.com", acceptTerms: true, over18: true });
  check("a signed-out visitor connecting to it gets the same 404 and no guest account is made", r2.status === 404 && r2.text === missing.text && stranger.jar.size === 0);
  let threw = "";
  try { raw.prepare("INSERT INTO connections (id, user_a, user_b, created_at) VALUES ('force1', ?, ?, 1)").run(viewer.id, P.id); } catch (e) { threw = String(e.message); }
  check("the database refuses a connection with it even when a route is wrong (trigger)", /unclaimed admin-made account/.test(threw), threw);
  threw = "";
  try { raw.prepare("INSERT INTO connections (id, user_a, user_b, created_at) VALUES ('force2', ?, ?, 1)").run(P.id, viewer.id); } catch (e) { threw = String(e.message); }
  check("on either side", /unclaimed admin-made account/.test(threw));
  // an event with a real person checked in
  const host = client({ ip: "10.74.250.1", site: "host" });
  const hi = await becomeHost(host, { kind: "company", name: "Premade Test Co" });
  raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES (?, ?, 5, 0, 'test', ?)").run("cr-pm", hi.org.json.id, Date.now());
  const ev = (await host.post("/api/host/events", { name: "Premade night", startsAt: Date.now() - 3600e3, endsAt: Date.now() + 5 * 3600e3 })).json;
  const ci = await viewer.c.post(`/api/e/${ev.code}/checkin`, { suggest: true, directory: true });
  threw = "";
  try { raw.prepare("INSERT INTO checkins (event_id, user_id, created_at) VALUES (?, ?, 1)").run(ev.id, P.id); } catch (e) { threw = String(e.message); }
  check("the database refuses a check-in for it (trigger), while a real person checks in as usual", ci.status === 200 && /unclaimed admin-made account/.test(threw), [ci.status, threw]);
  const lists = [await viewer.c.get(`/api/e/${ev.id}/room`), await viewer.c.get(`/api/e/${ev.id}/suggest`), await viewer.c.get(`/api/e/${ev.id}/presence`), await viewer.c.get("/api/connections"), await host.get(`/api/host/events/${ev.id}/live`), await host.get(`/api/host/events/${ev.id}/report`)];
  check("it is in no event list (room, Who to meet, presence), no People list and no host view", lists.every((x) => x.status === 200 && !/Priya/.test(x.text)), lists.map((x) => [x.status, x.text.slice(0, 60)]).slice(3));
  check("people search: it is not among anyone's people to search", (await gatherPeople(env.DB, viewer.id)).every((p) => p.name !== "Priya Example"));
  const search = await admin.get("/api/admin/users?q=Priya", ADMIN);
  check("the admin's account recovery search does not find it, by name or by card code", search.status === 200 && search.json.users.length === 0 && (await admin.get(`/api/admin/users?q=${q1("SELECT code FROM cards WHERE id = ?", P.cardId).code}`, ADMIN)).json.users.length === 0);
  const sc = await admin.post(`/api/admin/users/${P.id}/signin-code`, {}, ADMIN);
  check("and the admin cannot make a sign-in code for it: it is claimed only by its link", sc.status === 409 && q1("SELECT COUNT(*) n FROM login_codes WHERE user_id = ?", P.id).n === 0, sc.json);
  check("isPremade says so, and says no for an ordinary guest", (await isPremade(env.DB, P.id)) && !(await isPremade(env.DB, viewer.id)));
}

/* ------------------------------------------------------------------------------------------------------------------ */
console.log("\n# Waiting list, Copy link and Delete");
{
  const list = await admin.get("/api/admin/premade", ADMIN);
  const w = list.json.waiting.find((x) => x.id === P.id);
  check("the waiting list shows name, made on, expires on and the card id, and no token or hash", !!w && w.name === "Priya Example" && w.cardId === P.cardId && w.expiresAt === w.createdAt + 30 * DAY && w.source === "LinkedIn" && !/token|hash/i.test(JSON.stringify(list.json)) && !list.text.includes(P.token));
  check("claimed is a count (none yet)", list.json.claimed.count === 0 && Array.isArray(list.json.claimed.recent));
  const oldHash = q1("SELECT token_hash FROM claim_links WHERE user_id = ?", P.id).token_hash;
  const rot = await admin.post(`/api/admin/premade/${P.id}/link`, {}, ADMIN);
  const newTok = tokenOf(rot.json.link);
  check("Copy link gives a new link and stores a new hash in place of the old one", rot.status === 200 && newTok && newTok !== P.token && q1("SELECT token_hash FROM claim_links WHERE user_id = ?", P.id).token_hash === (await hashClaimToken(newTok)) && !q1("SELECT 1 x FROM claim_links WHERE token_hash = ?", oldHash));
  check("the link still ends 30 days after the account was made (Copy link never extends it)", rot.json.expiresAt === q1("SELECT created_at FROM users WHERE id = ?", P.id).created_at + 30 * DAY);
  P.token = newTok;
  const d = await make({ name: "Delete Me", photoDataUrl: PNG });
  const key = q1("SELECT photo_key FROM profiles WHERE user_id = ?", d.id).photo_key;
  const del = await admin.del(`/api/admin/premade/${d.id}`, ADMIN);
  check("Delete erases the account, its profile, card, link and photo", del.status === 200 && !q1("SELECT 1 x FROM users WHERE id = ?", d.id) && !q1("SELECT 1 x FROM cards WHERE user_id = ?", d.id) && !q1("SELECT 1 x FROM claim_links WHERE user_id = ?", d.id) && !env.MEDIA.store.has(key) && !q1("SELECT 1 x FROM media_deletes WHERE key = ?", key));
  check("deleting it again is a 404", (await admin.del(`/api/admin/premade/${d.id}`, ADMIN)).status === 404);
  check("an erased profile leaves the erasure in the consent history only", q1("SELECT COUNT(*) n FROM consent_log WHERE user_id = ? AND ref = 'erased'", d.id).n === 1);
}


/* ------------------------------------------------------------------------------------------------------------------ */
console.log("\n# No token in admin_audit or in anything logged");
{
  const audit = q("SELECT action, detail FROM admin_audit");
  check(`no claim token (${TOKENS.length} given out) is in any admin_audit row`, TOKENS.length >= 3 && audit.every((r) => TOKENS.every((t) => !String(r.action).includes(t) && !String(r.detail || "").includes(t))));
  check("no claim token is in any line logged while these tests ran", LOGS.every((l) => TOKENS.every((t) => !l.includes(t))));
}

summary();
