// F14: the onboarding revamp. Migration 0022 on old data, profile creation with
// mode, institution and consent rows, the progress API, the guest who connected
// first, and (later tasks) source guards for the legal steps and the funnel.
// Run: node test/onboarding.mjs
import { makeEnv, makeDb, readMigration, check, summary } from "./harness.mjs";
import { eraseUser } from "../worker/purge.js";
import { readFileSync } from "node:fs";
import { buildLinks, labelForUrl } from "../src/lib/links.js";

const read = (f) => readFileSync(f, "utf8");
const has = (text, ...parts) => parts.every((p) => (p instanceof RegExp ? p.test(text) : text.includes(p)));

const T = await makeEnv();
const { client, q1, q, env } = T;

const create = (c, body = {}) => c.post("/api/profile", { name: "Sam", acceptTerms: true, over18: true, onboarding: true, ...body });
const me = async (c) => (await c.get("/api/me")).json;

console.log("\n# Migration 0022 on data in the old shape");
{
  const db = makeDb({ before: "0022" });
  db.exec("INSERT INTO users (id, created_at) VALUES ('u1', 1)");
  db.exec("INSERT INTO profiles (user_id, name, updated_at) VALUES ('u1', 'Old', 1)");
  db.exec(readMigration("0022_onboarding.sql"));
  const p = await db.prepare("SELECT name, onboarding_step, onboarding_max FROM profiles WHERE user_id = 'u1'").first();
  check("an existing profile is not in onboarding (NULL), so nobody is pulled into it", p.name === "Old" && p.onboarding_step === null && p.onboarding_max === 0, p);
  const sql = readMigration("0022_onboarding.sql").replace(/--.*$/gm, "");
  check("the migration only adds: two columns and one table", !/\b(DROP|DELETE|UPDATE|RENAME)\b/i.test(sql) && (sql.match(/ADD COLUMN/g) || []).length === 2 && (sql.match(/CREATE TABLE/g) || []).length === 1);
}

console.log("\n# Creating a profile (step 1)");
const S = client({ ip: "10.14.0.1" });
{
  const noTerms = await S.post("/api/profile", { name: "Sam", onboarding: true });
  check("without the 18+ and Terms tick nothing is created", noTerms.status === 400 && noTerms.json.code === "terms_required" && !q1("SELECT 1 x FROM profiles"), noTerms.text);
  const half = await S.post("/api/profile", { name: "Sam", acceptTerms: true, onboarding: true });
  check("the Terms alone are not enough, nor the 18+ alone", half.status === 400 && half.json.code === "terms_required"
    && (await S.post("/api/profile", { name: "Sam", over18: true, onboarding: true })).status === 400);
  const blank = await create(S, { name: "   " });
  check("a name is required", blank.status === 400 && /name/.test(blank.json.error), blank.text);
  const r = await create(S, { mode: "career", company: "Acme", role: "Designer" });
  check("a profile is made with its mode, company and role", r.status === 201, r.text);
  const m = await me(S);
  check("mode, company and role are saved", m.profile.mode === "career" && m.profile.company === "Acme" && m.profile.role === "Designer", m.profile);
  check("a default card is made", m.cards.length === 1 && !!m.cards[0].code);
  check("the person is on step 2, having finished step 1", m.profile.onboarding_step === 2 && m.profile.onboarding_max === 2, m.profile);
  const id = m.user.id;
  const consent = q1("SELECT granted FROM consents WHERE user_id = ? AND scope = 'terms:2026-10-26'", id);
  const log = q("SELECT scope, action FROM consent_log WHERE user_id = ?", id);
  check("the Terms and Privacy Policy consent is recorded, with its version", consent?.granted === 1, consent);
  check("and appended to the consent log", log.length === 1 && log[0].action === "granted" && log[0].scope === "terms:2026-10-26", log);
  const u = q1("SELECT over_18, age_confirmed_at FROM users WHERE id = ?", id);
  check("18+ is recorded with its time", u.over_18 === 1 && u.age_confirmed_at > 0, u);
  check("the account does not need the terms again", m.user.termsAccepted === true && m.user.needsTerms === false);
  const again = await create(S);
  check("a second create is refused (use the edit call)", again.status === 409);
}

console.log("\n# Student, institution and validation");
{
  const c = client({ ip: "10.14.0.2" });
  const bad = await create(c, { mode: "retired" });
  check("an unknown mode is refused", bad.status === 400 && /mode/.test(bad.json.error));
  const badInst = await create(c, { institutionId: "not-a-real-one" });
  check("an institution id that is not on the list is refused", badInst.status === 400, badInst.text);
  const list = JSON.parse(readFileSync("src/data/institutions-uk.json", "utf8"));
  const inst = list.institutions[0];
  const ok = await create(c, { name: "Stu", mode: "student", institutionId: inst.id, uni: "ignored text", course: "Maths", year: "2" });
  const p = (await me(c)).profile;
  check("a listed institution sets its id and the official name", ok.status === 201 && p.institution_id === inst.id && p.uni === inst.name && p.course === "Maths" && p.year === "2", p);
  const typed = client({ ip: "10.14.0.3" });
  await create(typed, { uni: "Typed College" });
  const tp = (await me(typed)).profile;
  check("a typed institution is kept as typed with no id", tp.uni === "Typed College" && tp.institution_id === null && tp.mode === "student", tp);
}

console.log("\n# A client that is not the welcome steps is not put in them");
{
  const c = client({ ip: "10.14.0.4" });
  await c.post("/api/profile", { name: "Plain", acceptTerms: true, over18: true });
  const p = (await me(c)).profile;
  check("no onboarding flag: not in onboarding", p.onboarding_step === null && p.onboarding_max === 0, p);
  const r = await c.put("/api/onboarding", { step: 3 });
  check("moving someone who is not in onboarding changes nothing", r.status === 200 && r.json.inOnboarding === false && r.json.step === null && (await me(c)).profile.onboarding_step === null, r.text);
}

console.log("\n# The progress API");
{
  const c = client({ ip: "10.14.0.5" });
  const none = await c.put("/api/onboarding", { step: 2 });
  check("a person with no profile is told to create one", none.status === 404, none.text);
  await create(c, { name: "Pat" });
  const step = (n) => c.put("/api/onboarding", typeof n === "object" ? n : { step: n });
  const at = async () => (await me(c)).profile;
  let r = await step(3);
  check("step 3 is saved on the server", r.status === 200 && r.json.step === 3 && (await at()).onboarding_step === 3, r.text);
  r = await step(2);
  check("going Back is saved too (resume where they last were)", r.json.step === 2 && (await at()).onboarding_step === 2 && (await at()).onboarding_max === 3);
  const refused = [];
  for (const bad of [0, 7, 2.5, "3", null, -1, {}, [], true, 9]) {
    const b = await step({ step: bad });
    if (b.status !== 400) refused.push(bad);
  }
  check("steps outside 1 to 6, fractions and non-numbers are refused", refused.length === 0, refused);
  check("a call with neither a step nor done is refused", (await step({})).status === 400);
  check("a refused call changes nothing", (await at()).onboarding_step === 2);
  r = await step({ done: true });
  check("done finishes it", r.json.step === null && (await at()).onboarding_step === null);
  r = await step(4);
  check("after finishing, moving does nothing (a later 'Finish your card' is not onboarding)", r.json.inOnboarding === false && (await at()).onboarding_step === null);
}

console.log("\n# A guest who connected before making a card");
{
  const owner = client({ ip: "10.14.1.1" });
  await owner.post("/api/profile", { name: "Owner", acceptTerms: true, over18: true });
  const card = (await me(owner)).cards[0].cardId;
  const g = client({ ip: "10.14.1.2" });
  const r = await g.post("/api/connect", { cardId: card, name: "Guest", acceptTerms: true, over18: true, via: "qr" });
  check("connecting as a guest still works with a name and the tick", r.status === 200, r.text);
  const m = await me(g);
  check("the guest's stub profile starts at step 1 with the Terms already accepted", m.profile.onboarding_step === 1 && m.profile.onboarding_max === 0 && m.user.termsAccepted === true, m.profile);
  check("and the connection kept how it was made", q1("SELECT via FROM connections WHERE user_a = ?", m.user.id).via === "qr");
  const open = await g.put("/api/onboarding", { step: 1 });
  check("the steps open at step 1 and carry on from there", open.json.step === 1 && (await g.put("/api/onboarding", { step: 2 })).json.step === 2);
  const noTick = client({ ip: "10.14.1.3" });
  const refused = await noTick.post("/api/connect", { cardId: card, name: "NoTick" });
  check("a guest still cannot connect without the 18+ and Terms tick", refused.status === 400 && refused.json.code === "terms_required");
}

console.log("\n# Deleting an account");
{
  const c = client({ ip: "10.14.2.1" });
  await create(c, { name: "Gone" });
  const id = (await me(c)).user.id;
  await eraseUser(env, id);
  check("the profile and its place in onboarding go with the account", !q1("SELECT 1 x FROM profiles WHERE user_id = ?", id));
}

console.log("\n# Links: the label is filled in from a pasted address");
{
  check("LinkedIn and GitHub addresses are named", labelForUrl("https://www.linkedin.com/in/sam") === "LinkedIn" && labelForUrl("github.com/sam") === "GitHub");
  check("another site gets its own name", labelForUrl("https://sam.example.com/work") === "Example" && labelForUrl("example.co.uk") === "Example");
  check("a half-typed address, spaces or nothing give no label", labelForUrl("") === "" && labelForUrl("lin") === "" && labelForUrl("not a link") === "" && labelForUrl(null) === "");
  const links = buildLinks([{ label: "LinkedIn", url: "linkedin.com/in/sam" }, { label: "", url: "x.com/a" }, { label: "Site", url: "" }, { label: "Web", url: "http://a.example" }]);
  check("rows missing a label or an address are dropped, and https:// is added", JSON.stringify(links) === JSON.stringify({ LinkedIn: "https://linkedin.com/in/sam", Web: "http://a.example" }), links);
}

console.log("\n# The steps share what Edit profile uses (no second copy)");
{
  const edit = read("src/views/EditProfile.vue");
  const stepMode = read("src/components/welcome/StepMode.vue"), stepFor = read("src/components/welcome/StepFor.vue"), stepLinks = read("src/components/welcome/StepLinks.vue");
  check("Edit profile and the mode step use the same ModeFields", has(edit, "<ModeFields") && has(stepMode, "<ModeFields", "tiles"));
  check("Edit profile and the tags step use the same TagFields", has(edit, "<TagFields") && has(stepFor, "<TagFields"));
  check("both build links with the same buildLinks", has(edit, 'from "../lib/links"', "buildLinks(") && has(stepLinks, 'from "../../lib/links"', "buildLinks("));
  check("Edit profile keeps no copy of the switch, the suggestions or the institution picker", !/SUGGESTED|MODES|institutionForDomain|<UiCombobox|seg-btn/.test(edit));
  const fields = read("src/components/ModeFields.vue");
  check("the switch still says Student and Career, and the tiles Student and Working", has(fields, '"Career"', '"Working"', '"Student"'));
  check("each step saves to the server as it is answered (no localStorage progress)", ["StepYou", "StepMode", "StepFor", "StepLinks"].every((n) => {
    const t = read(`src/components/welcome/${n}.vue`);
    return /Api\.(createProfile|updateProfile)/.test(t) && !/localStorage/.test(t);
  }) && !/localStorage/.test(read("src/views/Welcome.vue")));
  check("the welcome page is not an /app page, so no tab bar, banner or Terms pop-up sits over it", has(read("src/router/routes.attendee.js"), /path: "\/app\/welcome", component: \(\) => import\("\.\.\/views\/Welcome\.vue"\) \}/));
  check("steps 2 to 5 can be skipped, step 1 and 6 cannot", has(read("src/views/Welcome.vue"), "SKIPPABLE = [2, 3, 4, 5]"));
}

summary();
