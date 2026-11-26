// F75 (D064): details the admin suggests for someone's card, which change nothing until the person accepts them.
// The real Worker on in-memory SQLite. The bar: before acceptance the suggested values are nowhere anyone but the person
// and the admin can reach; only an allow-list of card fields can be suggested; accepting writes exactly the ticked
// fields through the Edit profile save; one open suggestion per person; the admin routes need the token and are
// audited; the suggestion and its photo go after 30 days and with the account.
// Run: node test/suggested-edits.mjs
import { readFileSync } from "node:fs";
import { makeEnv, makeDb, check, summary, migrationFiles, readMigration, PNG } from "./harness.mjs";
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

summary();
