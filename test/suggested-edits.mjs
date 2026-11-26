// F75 (D064): details the admin suggests for someone's card, which change nothing until the person accepts them.
// The real Worker on in-memory SQLite. The bar: before acceptance the suggested values are nowhere anyone but the person
// and the admin can reach; only an allow-list of card fields can be suggested; accepting writes exactly the ticked
// fields through the Edit profile save; one open suggestion per person; the admin routes need the token and are
// audited; the suggestion and its photo go after 30 days and with the account.
// Run: node test/suggested-edits.mjs
import { readFileSync } from "node:fs";
import { makeEnv, makeDb, check, summary, migrationFiles, readMigration, PNG, becomeHost, withLatency } from "./harness.mjs";
import { gatherPeople } from "../worker/ai/peopleSearch.js";
import { readSuggestion, REQUEST_KEYS, FIELD_KEYS, SUGGEST_MAX_AGE } from "../worker/suggestedEdits.js";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const DAY = 86400e3;

const T = await makeEnv({ ADMIN_TOKEN: "test-admin-token-f75" });
const { client, q, q1, env } = T;
const raw = env.DB.raw;
const ADMIN = { authorization: "Bearer test-admin-token-f75" };
const admin = client({ ip: "10.75.0.1" });
let ipN = 1;
const fresh = () => client({ ip: `10.75.${Math.floor(ipN / 200) + 1}.${(ipN++ % 200) + 1}` });
async function signup(name, extra = {}, { email = null } = {}) {
  const c = fresh();
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, ...extra });
  if (r.status !== 201) throw new Error(r.text);
  const id = (await c.get("/api/me")).json.user.id;
  if (email) raw.prepare("UPDATE users SET recovery_email = ?, email_verified = 1, is_guest = 0 WHERE id = ?").run(email, id);
  return { c, name, id, cardId: r.json.cards[0].id, email };
}
const suggest = (id, body) => admin.post(`/api/admin/suggest/${id}`, { source: "LinkedIn", ...body }, ADMIN);
const rowOf = (id) => q1("SELECT * FROM profile_suggestions WHERE user_id = ?", id);
const profileOf = (id) => q1("SELECT * FROM profiles WHERE user_id = ?", id);
// Distinct values that appear nowhere else, so a leak can be found by searching for them.
const SECRET = { headline: "Zebra-headline-7f31 builds quiet tools", company: "Quokkaworks-9c2e Ltd", role: "Narwhal-role-55ab", about: "Ocelot-about-0d4e" };

/* ------------------------------------------------------------------------------------------------------------------ */
console.log("\n# The migration is additive and safe to apply before the new code");
{
  const sql = read("migrations/0047_profile_suggestions.sql").replace(/--.*$/gm, "");
  check("0047 is the newest migration and follows 0046", migrationFiles().at(-1) === "0047_profile_suggestions.sql" && migrationFiles().at(-2) === "0046_admin_made_profiles.sql");
  check("it only adds: two tables and one index, nothing dropped, altered, renamed or rewritten",
    (sql.match(/CREATE TABLE IF NOT EXISTS/g) || []).length === 2 && /CREATE INDEX IF NOT EXISTS idx_profile_suggestions_expires/.test(sql)
    && /user_id\s+TEXT PRIMARY KEY REFERENCES users\(id\) ON DELETE CASCADE/.test(sql) && /id\s+TEXT NOT NULL UNIQUE/.test(sql)
    && !/\b(DROP|ALTER|RENAME|UPDATE|DELETE|INSERT|TRIGGER)\b/i.test(sql.replace("ON DELETE CASCADE", "")));
  check("the counts table holds a day, an outcome and a number, and nothing that names a person", /CREATE TABLE IF NOT EXISTS suggestion_counts \(\s*day\s+TEXT NOT NULL,\s*outcome TEXT NOT NULL,\s*n\s+INTEGER NOT NULL DEFAULT 0,\s*PRIMARY KEY \(day, outcome\)\s*\)/.test(sql));
  const db = makeDb({ before: "0047" });
  db.raw.prepare("INSERT INTO users (id, created_at, is_guest) VALUES ('old1', 1, 0)").run();
  db.exec(readMigration("0047_profile_suggestions.sql"));
  check("it applies on top of 0046 with existing accounts, and they have no suggestion", db.raw.prepare("SELECT COUNT(*) n FROM profile_suggestions").get().n === 0 && db.raw.prepare("SELECT COUNT(*) n FROM users").get().n === 1);
}

/* ------------------------------------------------------------------------------------------------------------------ */
const A = await signup("Ada Example", {}, { email: "ada@example.com" });
console.log("\n# Every admin route needs the token and is audited");
{
  const routes = [["GET", "/api/admin/suggest/people?q=Ada"], ["GET", "/api/admin/suggest"], ["GET", `/api/admin/suggest/${A.id}`],
    ["POST", `/api/admin/suggest/${A.id}`], ["DELETE", `/api/admin/suggest/${A.id}`], ["GET", `/api/admin/suggest/${A.id}/photo`]];
  let all401 = true, wrong401 = true;
  for (const [m, p] of routes) {
    const body = m === "POST" ? { source: "LinkedIn", headline: "x" } : undefined;
    if ((await fresh().req(m, p, body)).status !== 401) all401 = false;
    if ((await fresh().req(m, p, body, { authorization: "Bearer not-the-token" })).status !== 401) wrong401 = false;
  }
  check("all six routes are 401 without the token", all401);
  check("and 401 with a wrong one", wrong401);
  check("a signed-in person without the token gets 401 too", (await A.c.get("/api/admin/suggest")).status === 401 && (await A.c.post(`/api/admin/suggest/${A.id}`, { source: "x", headline: "y" })).status === 401);
  check("nothing was stored by those calls", q1("SELECT COUNT(*) n FROM profile_suggestions").n === 0);
  const before = q1("SELECT COUNT(*) n FROM admin_audit").n;
  await admin.get("/api/admin/suggest", ADMIN);
  await admin.get(`/api/admin/suggest/people?q=Ada&low=1`, ADMIN);
  const rows = q("SELECT action, detail FROM admin_audit ORDER BY at DESC, rowid DESC LIMIT 2");
  check("each call with the token writes an admin_audit row naming the route (and the search words)", q1("SELECT COUNT(*) n FROM admin_audit").n === before + 2
    && rows.some((r) => r.action === "GET /api/admin/suggest") && rows.some((r) => r.action === "GET /api/admin/suggest/people" && /q=Ada/.test(r.detail || "")), rows);
  const a = read("worker/admin.js");
  check("the routes are registered after the token check, in admin.js, and not in index.js",
    a.indexOf('adminApp.use("/api/admin/*"') < a.indexOf("registerSuggestedEditsAdmin(adminApp)") && !/registerSuggestedEditsAdmin|\/api\/admin\/suggest/.test(read("worker/index.js")));
}

/* ------------------------------------------------------------------------------------------------------------------ */
console.log("\n# Finding people: search, and a low-score filter scored in the Worker");
{
  const full = await signup("Full Card", { mode: "career", company: "Somewhere", role: "Lead", headline: "Does things", links: { Site: "https://example.com" }, photoDataUrl: PNG });
  const low = await signup("Low Card");
  const pm = await admin.post("/api/admin/premade", { name: "Low Waiting", source: "LinkedIn" }, ADMIN);
  const s = await admin.get("/api/admin/suggest/people?q=Card", ADMIN);
  check("a name search finds people with a card, with their score out of six", s.status === 200 && s.json.people.some((p) => p.id === full.id && p.score >= 5 && p.max === 6) && s.json.people.some((p) => p.id === low.id && p.score === 1), s.json);
  const sl = await admin.get("/api/admin/suggest/people?q=Card&low=1", ADMIN);
  check("low=1 keeps only cards of 2 of 6 or under", sl.json.people.some((p) => p.id === low.id) && !sl.json.people.some((p) => p.id === full.id), sl.json);
  const all = await admin.get("/api/admin/suggest/people?low=1", ADMIN);
  check("low=1 with no words lists low cards across all profiles", all.json.people.some((p) => p.id === low.id) && all.json.people.some((p) => p.id === A.id) && !all.json.people.some((p) => p.id === full.id));
  check("an admin-made profile waiting to be claimed is never offered (it is edited as F74's)", ![s, sl, all].some((r) => r.json.people.some((p) => p.id === pm.json.id || p.name === "Low Waiting"))
    && (await admin.get(`/api/admin/suggest/${pm.json.id}`, ADMIN)).status === 404 && (await suggest(pm.json.id, { headline: "x" })).status === 404);
  check("no words and no filter lists nobody", (await admin.get("/api/admin/suggest/people", ADMIN)).json.people.length === 0);
  check("the list says whether they have a verified email, and never what it is", all.json.people.find((p) => p.id === A.id).emailVerified === true && !JSON.stringify(all.json).includes("ada@example.com"));
  const src = read("worker/suggestedEditsAdmin.js");
  check("the score is the six-point profileScore, read in pages as the metrics do (no stored score)", /import \{ profileScore \} from "\.\.\/src\/lib\/profileScore\.js"/.test(src) && /LIMIT \$\{PAGE\}/.test(src) && /WHERE p\.user_id > \?/.test(src));
  const nobody = await admin.get("/api/admin/suggest/no-such-person", ADMIN);
  check("an unknown account is 404", nobody.status === 404);
  // A guest account with no profile has nothing to suggest to.
  const g = fresh(); await g.post("/api/onboarding", {}); const gid = q1("SELECT id FROM users ORDER BY created_at DESC, rowid DESC LIMIT 1").id;
  check("a guest account without a profile is 404 (no suggestion can be made for it)", !q1("SELECT 1 x FROM profiles WHERE user_id = ?", gid) && (await suggest(gid, { headline: "x" })).status === 404 && !rowOf(gid));
}

/* ------------------------------------------------------------------------------------------------------------------ */
console.log("\n# Only card fields can be suggested (an allow-list on the server)");
{
  const n0 = q1("SELECT COUNT(*) n FROM profile_suggestions").n;
  const refused = {};
  for (const extra of [{ email: "new@example.com" }, { plan: "plus" }, { userId: "someone" }, { user_id: "x" }, { id: "x" }, { marketingOptin: true }, { notify_events: 0 },
    { showAge: true }, { is_public: 0 }, { recovery_email: "x@example.com" }, { emailVerified: 1 }, { projects: [] }, { institution_id: "x" }, { photo_key: "avatar/x.png" }, { wizard: 1 }, { __proto__x: 1 }]) {
    const r = await suggest(A.id, { headline: SECRET.headline, ...extra });
    refused[Object.keys(extra)[0]] = r.status === 400 && r.json.code === "not_allowed";
  }
  check("email, plan, ids, settings, the photo key and unknown keys are each 400 (not_allowed)", Object.values(refused).every(Boolean), refused);
  check("…and nothing was stored by any of them", q1("SELECT COUNT(*) n FROM profile_suggestions").n === n0 && !JSON.stringify(q("SELECT * FROM profile_suggestions")).includes("Zebra"));
  check("the allow-list is the card fields, the photo and the source; nothing about sign-in, email, plan or settings",
    JSON.stringify([...REQUEST_KEYS].sort()) === JSON.stringify(["about", "company", "course", "headline", "institutionId", "links", "mode", "name", "photoDataUrl", "role", "source", "tags", "uni", "year"])
    && JSON.stringify(FIELD_KEYS) === JSON.stringify(["name", "photo", "mode", "uni", "course", "year", "company", "role", "headline", "about", "tags", "links"]));
  check("a body that is not an object is 400", (await admin.post(`/api/admin/suggest/${A.id}`, "[1,2]", { ...ADMIN, "content-type": "application/json" })).status === 400);
  check("an unknown mode is 400, as on Edit profile", (await suggest(A.id, { mode: "wizard" })).status === 400);
  check("an institution not on the list is 400 with Edit profile's words", (await suggest(A.id, { institutionId: "no-such-place" })).json.error === (await A.c.put("/api/profile", { institutionId: "no-such-place" })).json.error);
  check("a suggestion that would change nothing is 400", (await suggest(A.id, { name: "Ada Example" })).status === 400 && (await suggest(A.id, { headline: "   " })).status === 400);
  check("a photo that is not an image is refused (the shared media check)", (await suggest(A.id, { photoDataUrl: "data:image/png;base64,PHN2Zz4=" })).status === 400);
  check("still nothing stored", q1("SELECT COUNT(*) n FROM profile_suggestions").n === n0);
}

console.log("\n# Where the details came from is required and limited, as on F74");
{
  const bad = (source) => admin.post(`/api/admin/suggest/${A.id}`, { headline: SECRET.headline, ...(source === undefined ? {} : { source }) }, ADMIN);
  const r = await bad(undefined);
  check("no source: 400 in plain words", r.status === 400 && /where the details came from/.test(r.json.error));
  check("empty, blank, not text and 81 characters: 400", (await bad("")).status === 400 && (await bad("  \n ")).status === 400 && (await bad(7)).status === 400 && (await bad("x".repeat(81))).status === 400);
  check("nothing stored", !rowOf(A.id));
}

/* ------------------------------------------------------------------------------------------------------------------ */
console.log("\n# Making, replacing and withdrawing one");
{
  const before = { ...profileOf(A.id) };
  const r = await suggest(A.id, { ...SECRET, tags: ["Design", "Research"], links: { LinkedIn: "https://example.com/in/ada", Bad: "javascript:alert(1)" }, photoDataUrl: PNG, source: "LinkedIn page‮" });
  const row = rowOf(A.id);
  check("making one answers 201 and stores one row, 30 days long", r.status === 201 && !!row && row.expires_at === row.created_at + SUGGEST_MAX_AGE && row.id === r.json.id, r.json);
  const f = JSON.parse(row.fields);
  check("only the suggested fields are stored, cleaned by Edit profile's checks (the bad link dropped)", JSON.stringify(Object.keys(f).sort()) === JSON.stringify(["about", "company", "headline", "links", "role", "tags"]) && f.links.Bad === undefined && f.links.LinkedIn === "https://example.com/in/ada", f);
  check("the source is cleaned to one line", row.source === "LinkedIn page");
  check("the photo is stored under suggest/, not avatar/", /^suggest\/[a-z0-9]+\.png$/.test(row.photo_key) && env.MEDIA.store.has(row.photo_key));
  check("the profile is unchanged", JSON.stringify(profileOf(A.id)) === JSON.stringify(before));
  const one = await admin.get(`/api/admin/suggest/${A.id}`, ADMIN);
  check("the admin sees the card now and the suggestion next to it", one.status === 200 && one.json.profile.name === "Ada Example" && one.json.suggestion.fields.headline === SECRET.headline && one.json.suggestion.hasPhoto && one.json.suggestion.offered.map((o) => o.key).join() === "photo,company,role,headline,about,tags,links");
  const ph = await admin.get(`/api/admin/suggest/${A.id}/photo`, ADMIN);
  check("the admin can see the suggested photo, never cached", ph.status === 200 && /no-store/.test(ph.headers.get("cache-control")));
  const list = await admin.get("/api/admin/suggest", ADMIN);
  check("the list shows it as waiting, with when it was sent and the totals", list.json.open.some((o) => o.userId === A.id && o.status === "waiting" && o.createdAt === row.created_at) && typeof list.json.totals.accepted30d === "number");

  // A new one replaces the old one, and the old photo goes.
  const oldKey = row.photo_key;
  const r2 = await suggest(A.id, { headline: "A second headline", source: "Their website" });
  const row2 = rowOf(A.id);
  check("one open suggestion per person: a new one replaces the old one", r2.status === 201 && q1("SELECT COUNT(*) n FROM profile_suggestions WHERE user_id = ?", A.id).n === 1 && row2.id !== row.id && JSON.parse(row2.fields).headline === "A second headline" && !JSON.parse(row2.fields).company && row2.source === "Their website");
  check("…and the old one's photo is deleted from storage", !env.MEDIA.store.has(oldKey) && row2.photo_key === null && !q1("SELECT 1 x FROM media_deletes WHERE key = ?", oldKey));

  const w = await admin.del(`/api/admin/suggest/${A.id}`, ADMIN);
  check("withdraw deletes it", w.status === 200 && !rowOf(A.id) && (await admin.del(`/api/admin/suggest/${A.id}`, ADMIN)).status === 404);
  await suggest(A.id, { headline: "Third", photoDataUrl: PNG });
  const k3 = rowOf(A.id).photo_key;
  await admin.del(`/api/admin/suggest/${A.id}`, ADMIN);
  check("withdrawing one with a photo deletes the photo", !env.MEDIA.store.has(k3));
  check("the profile was never changed by any of this", JSON.stringify(profileOf(A.id)) === JSON.stringify(before));
}

console.log("\n# readSuggestion cleans like Edit profile and keeps only changes");
{
  const cur = { name: "Ada", mode: "student", uni: "", course: "", year: "", company: "", role: "", headline: "Same", about: "", tags: [], links: {} };
  const r = readSuggestion({ headline: "Same", company: "  Spaced  ", tags: ["x".repeat(70)], about: "A".repeat(900) }, cur);
  check("an unchanged field is left out, text is trimmed and cut as Edit profile cuts it", !("headline" in r.fields) && r.fields.company === "Spaced" && r.fields.tags[0].length === 60 && r.fields.about.length === 400, r.fields);
}

/* ------------------------------------------------------------------------------------------------------------------ */
console.log("\n# Before acceptance the suggested values are nowhere anyone else can reach");
const B = await signup("Bea Example", {}, { email: "bea@example.com" });
const V = await signup("Vic Viewer", { headline: "Looks around" });
{
  // Vic and Bea are connected and both checked in to one event, so every list that shows people could show Bea.
  await V.c.post("/api/connect", { cardId: B.cardId });
  raw.prepare("UPDATE users SET ai_search_ok = 1 WHERE id = ?").run(B.id); // she can be found by people search
  const host = client({ ip: "10.75.250.1", site: "host" });
  const hi = await becomeHost(host, { kind: "company", name: "Suggest Test Co" });
  raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES (?, ?, 5, 0, 'test', ?)").run("cr-sg", hi.org.json.id, Date.now());
  const ev = (await host.post("/api/host/events", { name: "Suggest night", startsAt: Date.now() - 3600e3, endsAt: Date.now() + 5 * 3600e3 })).json;
  await V.c.post(`/api/e/${ev.code}/checkin`, { suggest: true, directory: true });
  await B.c.post(`/api/e/${ev.code}/checkin`, { suggest: true, directory: true });
  env.MAIL_OUTBOX.length = 0;
  const r = await suggest(B.id, { ...SECRET, tags: ["Kakapo-tag-1a2b"], photoDataUrl: PNG, source: "LinkedIn" });
  const key = rowOf(B.id).photo_key;
  const values = [...Object.values(SECRET), "Kakapo-tag-1a2b"];
  const outs = {
    "card signed out": await fresh().get(`/api/c/${B.cardId}`), "card as Vic": await V.c.get(`/api/c/${B.cardId}`),
    "link preview": await fresh().get(`/c/${B.cardId}`), "card code": await fresh().get(`/api/code/${q1("SELECT code FROM cards WHERE id = ?", B.cardId).code}`),
    "Vic's People": await V.c.get("/api/connections"), "Vic's export": await V.c.get("/api/account/export"), "Vic's me": await V.c.get("/api/me"),
    "event room": await V.c.get(`/api/e/${ev.id}/room`), "Who to meet": await V.c.get(`/api/e/${ev.id}/suggest`), "presence": await V.c.get(`/api/e/${ev.id}/presence`),
    "host live": await host.get(`/api/host/events/${ev.id}/live`), "host report": await host.get(`/api/host/events/${ev.id}/report`),
    "admin recovery search": await admin.get("/api/admin/users?q=Bea", ADMIN),
  };
  const leaks = Object.entries(outs).filter(([, x]) => values.some((v) => x.text.includes(v))).map(([k]) => k);
  check("a suggestion was made for Bea with distinct values", r.status === 201 && !!key);
  check("none of the suggested values is in her card, its link preview, its code, Vic's People, export or account, the event room, Who to meet, presence, the host views or the recovery search", leaks.length === 0, leaks);
  check("…and those answers were real (her card and Vic's People show Bea)", outs["card signed out"].status === 200 && /Bea Example/.test(outs["card signed out"].text) && /Bea Example/.test(outs["Vic's People"].text), Object.fromEntries(Object.entries(outs).map(([k, x]) => [k, x.status])));
  const gp = JSON.stringify(await gatherPeople(env.DB, V.id));
  check("people search: Bea is among the people Vic can search, with none of the values", gp.includes(B.id) && !values.some((v) => gp.includes(v)));
  const m1 = await fresh().get(`/media/${key}`), m2 = await V.c.get(`/media/${key}`), m3 = await B.c.get(`/media/${key}`);
  check("/media never serves the suggested photo, to anyone, even its owner", [m1, m2, m3].every((m) => m.status === 400 || m.status === 404) && !/^image\//.test(m3.headers.get("content-type") || ""));
  check("the photo key is never given out (not in the person's review answer or the admin's)", !(await B.c.get("/api/profile/suggested")).text.includes(key) && !(await admin.get(`/api/admin/suggest/${B.id}`, ADMIN)).text.includes(key));
  const me = await B.c.get("/api/me");
  check("her own /api/me (her card as she sees it) shows none of the values", !values.some((v) => me.text.includes(v)));
  check("the profile row has none of them", !values.some((v) => JSON.stringify(profileOf(B.id)).includes(v)));

  /* The email */
  const mail = env.MAIL_OUTBOX.filter((x) => x.to[0] === "bea@example.com");
  const all = mail.map((x) => `${x.subject}\n${x.text}\n${x.html}`).join("\n");
  check("a verified address gets one email, with the subject the plan names", mail.length === 1 && mail[0].subject === "We filled in some details on your Lanyard card" && mail[0].kind === "accounts", mail.map((x) => x.subject));
  check("it names the fields and the source", /What you do/.test(mail[0].text) && /Company/.test(mail[0].text) && /Role/.test(mail[0].text) && /Photo/.test(mail[0].text) && /LinkedIn/.test(mail[0].text) && /Nothing changes on your card until you accept/.test(mail[0].text));
  check("it holds none of the values (subject, text and HTML searched)", !values.some((v) => all.includes(v)));
  check("it links to the review page", /https:\/\/lanyard\.test\/app\/profile\/suggested/.test(mail[0].text));
  check("the row records that it was emailed", !!rowOf(B.id).emailed_at);
  // A replacement minutes later is a new suggestion, but the person is not emailed twice in a day.
  await suggest(B.id, { ...SECRET, tags: ["Kakapo-tag-1a2b"], photoDataUrl: PNG, source: "LinkedIn" });
  check("a quick replacement sends no second email the same day (the banner shows the latest)", env.MAIL_OUTBOX.filter((x) => x.to[0] === "bea@example.com").length === 1 && rowOf(B.id).emailed_at === null);
  check("its old photo went with it", !env.MEDIA.store.has(key));
}

console.log("\n# No verified email: no email, the banner only");
{
  env.MAIL_OUTBOX.length = 0;
  const N = await signup("Nia Noemail");
  const U = await signup("Uma Unverified");
  raw.prepare("UPDATE users SET recovery_email = 'uma@example.com', email_verified = 0 WHERE id = ?").run(U.id);
  const P = await signup("Pat Pending");
  raw.prepare("UPDATE users SET pending_email = 'pat@example.com' WHERE id = ?").run(P.id);
  const rs = [await suggest(N.id, { headline: "N" }), await suggest(U.id, { headline: "U" }), await suggest(P.id, { headline: "P" })];
  check("no email to an account with no address, an unverified one or only a pending one", rs.every((r) => r.status === 201 && r.json.emailed === false) && env.MAIL_OUTBOX.length === 0, env.MAIL_OUTBOX.map((m) => m.to));
  const h = await N.c.get("/api/home");
  check("the banner flag is on in /api/home for the person", h.json.suggested === true);
  check("…and off for someone with none, and signed out", !("suggested" in (await V.c.get("/api/home")).json) && !("suggested" in (await fresh().get("/api/home")).json));
  const mc = read("src/views/MyCard.vue");
  check("My card shows a one-line banner linking to the review page when the flag is on", /v-if="home\.suggested" to="\/app\/profile\/suggested"/.test(mc) && /We suggested some details for your card\./.test(mc) && />Review</.test(mc));
  check("there is no account-wide no-emails switch to respect, and news-email opt-in is not read (a service message)", !/emails_off|no_emails|all_emails/.test(migrationFiles().map(readMigration).join("\n")) && !/marketing_optin/.test(read("worker/suggestedEdits.js")));
}

/* ------------------------------------------------------------------------------------------------------------------ */
console.log("\n# The person's routes: theirs only");
{
  const r0 = await fresh().get("/api/profile/suggested");
  const posts = [await fresh().post("/api/profile/suggested/accept", { id: "x", fields: ["headline"] }), await fresh().post("/api/profile/suggested/decline", { id: "x" })];
  check("signed out: 401 on read, photo, accept and decline, and no guest is made", r0.status === 401 && (await fresh().get("/api/profile/suggested/photo")).status === 401 && posts.every((p) => p.status === 401 && !p.setCookies.length));
  check("someone with none gets 404", (await V.c.get("/api/profile/suggested")).status === 404 && (await V.c.get("/api/profile/suggested/photo")).status === 404);
  const id = rowOf(B.id).id;
  const steal = [await V.c.post("/api/profile/suggested/accept", { id, fields: ["headline"] }), await V.c.post("/api/profile/suggested/decline", { id })];
  check("another person's suggestion is unreachable: Vic gets 404 with Bea's id, and Bea's is untouched", steal.every((x) => x.status === 404) && rowOf(B.id)?.id === id && !profileOf(V.id).company);
  const g = fresh(); await g.post("/api/onboarding", {});
  check("a guest account without a profile has none", (await g.get("/api/profile/suggested")).status === 404);
  const mine = await B.c.get("/api/profile/suggested");
  const f = Object.fromEntries(mine.json.fields.map((x) => [x.key, x]));
  check("the person reads each field as now and as suggested, with the source and the end date", mine.status === 200 && mine.json.source === "LinkedIn" && f.headline.now === "" && f.headline.suggested === SECRET.headline && f.company.suggested === SECRET.company && !!f.photo && mine.json.expiresAt > Date.now());
  const ph = await B.c.get("/api/profile/suggested/photo");
  check("…and sees the suggested photo through its own route, never cached", ph.status === 200 && /no-store/.test(ph.headers.get("cache-control")) && /^image\//.test(ph.headers.get("content-type")));
  const exp = (await B.c.get("/api/account/export")).json;
  check("her own data export includes the open suggestion and where it came from", exp.suggestedEdit?.source === "LinkedIn" && exp.suggestedEdit.fields.headline === SECRET.headline);
}

console.log("\n# Accepting a subset writes exactly that subset, through the Edit profile save");
{
  const before = profileOf(B.id);
  const s = rowOf(B.id);
  check("no fields ticked is 400 and changes nothing", (await B.c.post("/api/profile/suggested/accept", { id: s.id, fields: [] })).status === 400 && !!rowOf(B.id));
  check("a field that is not offered (or not a card field) is 400", (await B.c.post("/api/profile/suggested/accept", { id: s.id, fields: ["headline", "email"] })).status === 400 && (await B.c.post("/api/profile/suggested/accept", { id: s.id, fields: ["links"] })).status === 400 && !!rowOf(B.id));
  check("an old suggestion id is 409 and changes nothing", (await B.c.post("/api/profile/suggested/accept", { id: "old", fields: ["headline"] })).status === 409 && JSON.stringify(profileOf(B.id)) === JSON.stringify(before));
  const r = await B.c.post("/api/profile/suggested/accept", { id: s.id, fields: ["headline"] });
  const after = profileOf(B.id);
  check("accepting only the headline writes the headline", r.status === 200 && after.headline === SECRET.headline);
  check("…and nothing else: the company, role, about, tags, photo and name are as they were", after.company === before.company && after.role === before.role && after.about === before.about && after.tags === before.tags && after.photo_key === before.photo_key && after.name === before.name);
  check("the suggestion is gone afterwards, and its unused photo deleted", !rowOf(B.id) && !env.MEDIA.store.has(s.photo_key) && !q1("SELECT 1 x FROM media_deletes WHERE key = ?", s.photo_key));
  const card = await fresh().get(`/api/c/${B.cardId}`);
  check("the card now shows the headline, and not the company", card.text.includes(SECRET.headline) && !card.text.includes(SECRET.company));
  check("it is counted as accepted, with no value kept", q1("SELECT SUM(n) n FROM suggestion_counts WHERE outcome = 'accepted'").n === 1 && !JSON.stringify(q("SELECT * FROM suggestion_counts")).includes("Zebra"));
  check("accepting again is 404 (nothing left), and the banner flag is off", (await B.c.post("/api/profile/suggested/accept", { id: s.id, fields: ["headline"] })).status === 404 && !("suggested" in (await B.c.get("/api/home")).json));

  // The photo: accepted, it becomes an ordinary avatar, public like any other.
  await suggest(B.id, { photoDataUrl: PNG, role: SECRET.role });
  const s2 = rowOf(B.id);
  const r2 = await B.c.post("/api/profile/suggested/accept", { id: s2.id, fields: ["photo"] });
  const k = profileOf(B.id).photo_key;
  check("an accepted photo is stored as a new avatar (through Edit profile's photo upload) and the suggest/ copy is deleted", r2.status === 200 && /^avatar\//.test(k) && env.MEDIA.store.has(k) && !env.MEDIA.store.has(s2.photo_key) && (await fresh().get(`/media/${k}`)).status === 200 && profileOf(B.id).role === before.role);

  // The same messy body through Edit profile and through a suggestion stores the same profile.
  const messy = {
    name: "  Mess  ", mode: "career", company: "C".repeat(200), role: "R".repeat(200), headline: "H".repeat(900), about: "A".repeat(900), course: "Co", year: "2",
    uni: "U".repeat(300), links: { Site: "https://example.com/" + "p".repeat(400), Bad: "ftp://x", ["L".repeat(41)]: "https://example.com" },
    tags: Array.from({ length: 40 }, (_, i) => "t".repeat(70) + i),
  };
  const E = await signup("Edit Way"), S = await signup("Suggest Way");
  await E.c.put("/api/profile", messy);
  const made = await suggest(S.id, messy);
  const keys = (await S.c.get("/api/profile/suggested")).json.fields.map((x) => x.key);
  const acc = await S.c.post("/api/profile/suggested/accept", { id: made.json.id, fields: keys });
  const strip = (p) => { const { user_id, updated_at, ...rest } = p; return rest; };
  check("the same messy body saved through Edit profile and accepted through a suggestion stores the same profile", acc.status === 200 && JSON.stringify(strip(profileOf(E.id))) === JSON.stringify(strip(profileOf(S.id))), [strip(profileOf(E.id)), strip(profileOf(S.id))]);
  // Sensitive words (D057): stored exactly as an Edit profile save stores them; matching screens them later, as for anyone.
  const W1 = await signup("Word One"), W2 = await signup("Word Two");
  const sens = { tags: ["Christian Union", "Design"], headline: "Runs the LGBTQ+ network" };
  await W1.c.put("/api/profile", sens);
  const ms = await suggest(W2.id, sens);
  await W2.c.post("/api/profile/suggested/accept", { id: ms.json.id, fields: ["tags", "headline"] });
  check("sensitive words in a suggestion are treated as in an Edit profile save (same stored tags and headline, no new screen here)",
    profileOf(W1.id).tags === profileOf(W2.id).tags && profileOf(W1.id).headline === profileOf(W2.id).headline && !/sensitiveTerms|suggestScreen|isSensitive/.test(read("worker/suggestedEdits.js") + read("worker/suggestedEditsAdmin.js")));
  const src = read("worker/suggestedEdits.js");
  check("accepting goes through readProfileEdit and profileEditStmt, the functions PUT /api/profile uses", /readProfileEdit\(c, u, current, edit\)/.test(src) && /profileEditStmt\(db, u\.id, ed, gate/.test(src) && /readProfileEdit\(c, u, current, body\)/.test(read("worker/index.js")) && /profileEditStmt\(db, u\.id, edit\)/.test(read("worker/index.js")));
}

console.log("\n# Declining writes nothing and deletes it");
{
  const before = profileOf(B.id);
  await suggest(B.id, { company: SECRET.company, photoDataUrl: PNG });
  const s = rowOf(B.id);
  check("an old id is 409", (await B.c.post("/api/profile/suggested/decline", { id: "old" })).status === 409 && !!rowOf(B.id));
  const r = await B.c.post("/api/profile/suggested/decline", { id: s.id });
  check("decline: 200, nothing written to the profile, the suggestion and its photo gone, counted as declined", r.status === 200 && JSON.stringify(profileOf(B.id)) === JSON.stringify(before) && !rowOf(B.id) && !env.MEDIA.store.has(s.photo_key) && q1("SELECT SUM(n) n FROM suggestion_counts WHERE outcome = 'declined'").n === 1);
  check("declining again is 404", (await B.c.post("/api/profile/suggested/decline", { id: s.id })).status === 404);
}

console.log("\n# At the same moment: one consistent answer");
{
  const base = env.DB;
  const C = await signup("Cy Concurrent");
  // Two accepts at once (two tabs), on a database where every query waits a turn, as on D1.
  await suggest(C.id, { headline: "Race headline", photoDataUrl: PNG });
  const s = rowOf(C.id);
  env.DB = withLatency(base);
  const two = await Promise.all([C.c.post("/api/profile/suggested/accept", { id: s.id, fields: ["headline", "photo"] }), C.c.post("/api/profile/suggested/accept", { id: s.id, fields: ["headline", "photo"] })]);
  env.DB = base;
  const pk = profileOf(C.id).photo_key;
  const orphans = [...env.MEDIA.store.keys()].filter((k) => k.startsWith("avatar/") && !q1("SELECT 1 x FROM profiles WHERE photo_key = ?", k));
  check("two accepts at once: one 200 and one 409", two.map((x) => x.status).sort().join() === "200,409", two.map((x) => [x.status, x.text]));
  check("…the profile has the headline and one photo, with no orphan photo and no suggestion left", profileOf(C.id).headline === "Race headline" && env.MEDIA.store.has(pk) && orphans.length === 0 && !rowOf(C.id) && !env.MEDIA.store.has(s.photo_key), orphans);
  // An accept and a new suggestion from the admin at once.
  await suggest(C.id, { company: "First Co" });
  const s1 = rowOf(C.id);
  env.DB = withLatency(base);
  const [acc, rep] = await Promise.all([C.c.post("/api/profile/suggested/accept", { id: s1.id, fields: ["company"] }), suggest(C.id, { company: "Second Co", source: "Their website" })]);
  env.DB = base;
  const open = rowOf(C.id), comp = profileOf(C.id).company;
  const consistent = acc.status === 200 ? comp === "First Co" && !!open && JSON.parse(open.fields).company === "Second Co" : acc.status === 409 && comp !== "First Co" && !!open && open.id !== s1.id;
  check("an accept and a replacement at once: either the accept won and the new one waits, or it lost and wrote nothing", rep.status === 201 && consistent && q1("SELECT COUNT(*) n FROM profile_suggestions WHERE user_id = ?", C.id).n === 1, [acc.status, comp, open?.fields]);
  // Accept and decline at once.
  await admin.del(`/api/admin/suggest/${C.id}`, ADMIN);
  await suggest(C.id, { role: "Race role" });
  const s3 = rowOf(C.id);
  env.DB = withLatency(base);
  const ad = await Promise.all([C.c.post("/api/profile/suggested/accept", { id: s3.id, fields: ["role"] }), C.c.post("/api/profile/suggested/decline", { id: s3.id })]);
  env.DB = base;
  const wrote = profileOf(C.id).role === "Race role";
  check("accept and decline at once: exactly one wins, and the profile matches the winner", ad.filter((x) => x.status === 200).length === 1 && (ad[0].status === 200) === wrote && !rowOf(C.id), ad.map((x) => x.status));
}

summary();
