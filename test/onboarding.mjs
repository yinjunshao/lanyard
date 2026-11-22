// F14: the onboarding revamp. Migration 0022 on old data, profile creation with
// mode, institution and consent rows, the progress API, the guest who connected
// first, and (later tasks) source guards for the legal steps and the funnel.
// Run: node test/onboarding.mjs
import { makeEnv, makeDb, readMigration, check, summary } from "./harness.mjs";
import { eraseUser, purgeExpired } from "../worker/purge.js";
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
  const consent = q1("SELECT granted FROM consents WHERE user_id = ? AND scope = 'terms:2026-11-13'", id);
  const log = q("SELECT scope, action FROM consent_log WHERE user_id = ?", id);
  check("the Terms and Privacy Policy consent is recorded, with its version", consent?.granted === 1, consent);
  check("and appended to the consent log", log.length === 1 && log[0].action === "granted" && log[0].scope === "terms:2026-11-13", log);
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
  const r = await g.post("/api/connect", { cardId: card, name: "Guest", email: "guest@example.com", acceptTerms: true, over18: true, via: "qr" });
  check("connecting as a guest still works with a name, an email (F45) and the tick", r.status === 200, r.text);
  const m = await me(g);
  check("the guest's stub profile starts at step 1 with the Terms already accepted", m.profile.onboarding_step === 1 && m.profile.onboarding_max === 0 && m.user.termsAccepted === true, m.profile);
  check("and the connection kept how it was made", q1("SELECT via FROM connections WHERE user_a = ?", m.user.id).via === "qr");
  const open = await g.put("/api/onboarding", { step: 1 });
  check("the steps open at step 1 and carry on from there", open.json.step === 1 && (await g.put("/api/onboarding", { step: 2 })).json.step === 2);
  const noTick = client({ ip: "10.14.1.3" });
  const refused = await noTick.post("/api/connect", { cardId: card, name: "NoTick", email: "notick@example.com" });
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

console.log("\n# Steps 5 and 6: save the card, and done");
{
  const save = read("src/components/welcome/StepSave.vue"), done = read("src/components/welcome/StepDone.vue"), shell = read("src/views/Welcome.vue");
  check("step 5 uses the same EmailSetup as Settings and the redeem page, and offers a passkey after the email", has(save, "<EmailSetup", "registerPasskey", "one-tap sign-in", "back in on a new phone") && save.indexOf("<EmailSetup") < save.indexOf("Add a passkey"));
  check("a passkey that was offered and passed on is not asked for again by the banner (same storage key)",
    has(save, 'KEY = "lanyard_banner_dismissed"') && has(read("src/components/AccountBanner.vue"), 'KEY = "lanyard_banner_dismissed"'));
  check("the passkey is only offered once the email is saved, and only where the browser supports it", has(save, "verified && canPasskey && !me.user?.hasPasskey"));
  check("a waiting promo code means step 5 cannot be skipped, since the email is what claims it", has(save, "pendingCode()", "noSkip") && has(shell, "!stepEl?.noSkip"));
  check("the recovery-key way of saving is still one link away (the claim page is unchanged)", has(save, 'to="/claim"') && has(read("src/views/Claim.vue"), "Get a recovery key", "recoveryCreate"));
  check("the done screen shows the same Badge as My card, with the same ?s=q address", has(done, "<Badge", "withSource(", '"q"', "defaultCard()"));
  check("it offers the install prompt by the one shared rule, and Claim your code when one is waiting", has(done, "offerInstall", "<InstallGuide", "pendingCode()", "Claim your code", "/redeem/"));
  check("My card uses that same install rule", has(read("src/views/MyCard.vue"), "offerInstall(me.user)"));
  check("reaching step 6 finishes onboarding on the server", has(shell, "if (to === LAST)", "{ done: true }"));
  check("the progress bar is a labelled progressbar and a step change moves focus to its heading", has(shell, 'role="progressbar"', "aria-valuetext", "h.focus("));
}

console.log("\n# Every consent and legal step the old onboarding had is still there");
{
  // The old first run (Edit profile "Make your card"), the connect sheet, the terms pop-up and the email form:
  //  1. one tick for 18+ and the Terms and Privacy Policy, with links, unticked, before a card is made
  //  2. the same tick in the connect sheet for a guest, and the server refuses without it
  //  3. the Terms pop-up for anyone with a card who has not accepted the current version
  //  4. consent recorded in consents and consent_log under the Terms version; 18+ recorded with its time
  //  5. the news and offers tick in the email form, unticked, and never required
  //  6. the shared selfie consent in the connect sheet
  //  7. a promo code needs a verified email
  const you = read("src/components/welcome/StepYou.vue");
  check("1. step 1 has the tick: 18+, Terms and Privacy Policy, both links, not pre-ticked, new tab",
    has(you, "I'm 18 or over, and I agree to the", 'to="/terms" target="_blank"', 'to="/privacy" target="_blank"', "const agreed = ref(false)", 'type="checkbox"'));
  check("1. step 1 cannot continue without it, and sends both flags to the server",
    has(you, "needsTerms.value && !agreed.value", "over18: true, acceptTerms: true"));
  check("1. step 1 asks again only for someone who has not accepted (a guest who connected has)", has(you, "!me.user?.termsAccepted"));
  check("3. someone with a card but without the current terms accepts them on step 1 through the same call as the pop-up", has(you, "Api.acceptTerms()") && has(read("src/components/TermsGate.vue"), "Api.acceptTerms()"));
  check("3. the Terms pop-up is still on every /app page (the /app frame holds it, and App.vue shows the frame for every meta.app route)",
    has(read("src/components/AppShell.vue"), "<TermsGate />") && has(read("src/App.vue"), 'v-else-if="r.meta.app && shell"') && has(read("src/router/index.js"), "to.meta.app ? loadShell()"));
  const sheet = read("src/components/ConnectSheet.vue");
  check("2. the connect sheet still has its tick, sends both flags, and is not sent through the welcome steps",
    has(sheet, "I'm 18 or over and I agree to the", "acceptTerms: needsAgree.value ? agreed.value : undefined", "over18: needsAgree.value ? agreed.value : undefined") && !/welcome/.test(sheet));
  check("6. the shared selfie consent is unchanged", has(sheet, "Everyone in the shared selfie agrees to it", "consent: consent.value"));
  check("5. the news tick in the email form is still unticked and optional", has(read("src/components/EmailSetup.vue"), "const marketing = ref(false)", "(optional)"));
  check("7. a code still needs a card and a confirmed email", has(read("src/views/Redeem.vue"), "if (!me.user?.emailVerified) return \"email\""));
  const legal = read("worker/legal.js");
  check("the Terms version string is the latest one the owner approved (2026-11-13)", has(legal, 'TERMS_VERSION = "2026-11-13"'));
  check("4. the server still records consent in consents and consent_log on profile creation", /await recordConsent\(db, u\.id, termsScope\(\)\);\s*\n\s*\n?\s*const fields = profilePayload/.test(read("worker/index.js")));
  const T2 = client({ ip: "10.14.9.1" });
  await T2.post("/api/profile", { name: "Late", acceptTerms: true, over18: true });
  q("UPDATE users SET age_confirmed_at = NULL, over_18 = 0 WHERE id = (SELECT user_id FROM profiles WHERE name = 'Late')");
  q("DELETE FROM consents WHERE user_id = (SELECT user_id FROM profiles WHERE name = 'Late')");
  const m = await me(T2);
  check("an account with a card and no accepted terms is flagged, as before", m.user.needsTerms === true && m.user.termsAccepted === false);
  const refused = await T2.post("/api/terms/accept", { accept: true });
  check("the terms call still needs the 18+ flag as well", refused.status === 400 && refused.json.code === "terms_required");
  const okay = await T2.post("/api/terms/accept", { accept: true, over18: true });
  check("and with both it records the consent again", okay.status === 200 && (await me(T2)).user.needsTerms === false);
}

console.log("\n# Connecting from a scanned card: no extra steps, and how it was made survives");
{
  const card = read("src/views/PublicCard.vue"), sheet = read("src/components/ConnectSheet.vue"), landing = read("src/views/Landing.vue");
  check("the public card and connect sheet never send a visitor into the welcome steps", !/welcome/.test(card) && !/welcome/.test(sheet));
  check("?s= is still read once, taken out of the address, and sent as via", has(card, "viaOfS(route.query.s)", "router.replace(", ':via="via"') && has(sheet, "via: props.via || undefined"));
  // F45: the owner asked for an email from a new person, so the sheet has one more field (and its hint); nothing else.
  check("a guest connects with a name, an email (F45) and one tick (the connect sheet asks for nothing more)", has(sheet, 'id="sheet-name"') && [...sheet.matchAll(/id="(sheet-[a-z-]+)"/g)].map((m) => m[1]).join() === "sheet-name,sheet-email,sheet-email-hint,sheet-selfie,sheet-message,sheet-private");
  check("the landing page sends a new person to the welcome steps", has(landing, 'to="/app/welcome"'));
  check("every way into a first card now goes to the welcome steps", ["src/views/SignIn.vue", "src/views/Redeem.vue", "src/views/MyCard.vue"].every((f) => /['"]\/app\/welcome['"]/.test(read(f))));
  check("Edit profile sends someone with no card to the welcome steps, and no old link to it is left for a new person", has(read("src/views/EditProfile.vue"), 'router.replace("/app/welcome")')
    && !/to="\/app\/profile"[^>]*>(Make your card|Set up your card)/.test(read("src/views/Landing.vue") + read("src/views/SignIn.vue") + read("src/views/MyCard.vue")));
  check("My card carries on in the steps for someone still in them, unless they left", has(read("src/views/MyCard.vue"), "onboarding_step != null && !left", "lanyard-onboarding-left"));
  check("People asks a guest who connected first to finish their card, by name", has(read("src/views/People.vue"), "Finish your card so {{ finishFor }} can find you again."));
  check("step 1 says who, for that guest", has(read("src/views/Welcome.vue"), 'api("/api/connections")') && has(read("src/components/welcome/StepYou.vue"), "Finish your card so {{ from }} can find you again."));
}

console.log("\n# While in the steps, nothing else nags; after them My card lists only what is missing");
{
  const banner = read("src/components/AccountBanner.vue"), my = read("src/views/MyCard.vue"), edit = read("src/views/EditProfile.vue");
  const kind = banner.slice(banner.indexOf("const kind = computed"), banner.indexOf("async function move"));
  check("the account banner says nothing while someone is in the welcome steps, but still moves a workers.dev account first",
    kind.indexOf('return "move"') > 0 && kind.indexOf('return "move"') < kind.indexOf("onboarding_step != null") && kind.indexOf("onboarding_step != null") < kind.indexOf('return "email"'), kind);
  check("My card shows one way back in, not the list, while the steps are unfinished", has(my, 'v-if="inSteps"', "Pick up where you left off") && has(my, "const showFinish = computed(() => !inSteps.value"));
  check("the old Your card is ready panel and its ?welcome=1 are gone", !/welcome=1|closeWelcome|welcome-steps/.test(my + read("src/views/EditProfile.vue") + banner));
  check("the Finish your card list shows only what is missing and each item opens its own step", has(my, 'v-for="st in missing"', "/app/welcome?step=${st.step}") && !/finish-tick[^>]*>\{\{ st\.ok/.test(my));
  check("each item is on the step that asks for it: photo 1, school or work 2, headline and tags 3, links 4",
    has(my, 'key: "photo", step: 1', 'key: "course", step: 2', 'key: "headline", step: 3', 'key: "tags", step: 3', 'key: "links", step: 4', 'key: "company", step: 2'));
  check("Edit profile only edits now: it cannot create a card and has no Terms tick of its own", !/createProfile|acceptTerms|agreed|firstRun/.test(edit));
}

console.log("\n# The funnel: daily counts, nothing about who");
{
  const F = await makeEnv({ ADMIN_TOKEN: "funnel-admin-token" });
  const fc = (o) => F.client(o);
  const admin = (token) => fc({ ip: "10.14.7.99" }).get("/api/admin/onboarding", token ? { authorization: `Bearer ${token}` } : {});
  const funnel = async () => Object.fromEntries((await admin("funnel-admin-token")).json.steps.map((s) => [s.step, [s.reached, s.completed]]));
  check("no one has been through the steps: no rows", (await admin("funnel-admin-token")).json.steps.length === 0);
  check("the page is for the admin token only", (await admin()).status === 401 && (await admin("wrong")).status === 401);

  const A = fc({ ip: "10.14.7.1" });
  await create(A, { name: "Ann" });
  let t = await funnel();
  check("a new card counts as reaching and getting past step 1, and reaching step 2", t[1]?.join() === "1,1" && t[2]?.join() === "1,0", t);
  const mv = (c, s) => c.put("/api/onboarding", s === "done" ? { done: true } : { step: s });
  await mv(A, 3);
  t = await funnel();
  check("step 3 reached, step 2 got past", t[2].join() === "1,1" && t[3].join() === "1,0", t);
  await mv(A, 2); await mv(A, 3); await mv(A, 2); await mv(A, 3);
  check("going Back and forward again is not counted twice", (await funnel())[3].join() === "1,0" && (await funnel())[2].join() === "1,1");
  await mv(A, 4); await mv(A, 5);
  await mv(A, 6);
  check("a skipped step still counts as got past (4 and 5 were only moved over)", (await funnel())[4].join() === "1,1" && (await funnel())[5].join() === "1,1");
  await mv(A, "done");
  t = await funnel();
  check("finishing counts the done step as reached and got past", t[6].join() === "1,1", t);
  await mv(A, 2); await mv(A, 5);
  check("anything after finishing is not counted", JSON.stringify(await funnel()) === JSON.stringify(t));

  // A person who stopped at step 3.
  const B = fc({ ip: "10.14.7.2" });
  await create(B, { name: "Ben" }); await mv(B, 3);
  t = await funnel();
  check("two people: both reached 3, one got past it", t[1].join() === "2,2" && t[3].join() === "2,1", t);

  // A guest who connected first (stub profile at step 1) counts when step 1 is shown, not before.
  const card = (await me(A)).cards[0].cardId;
  const G = fc({ ip: "10.14.7.3" });
  await G.post("/api/connect", { cardId: card, name: "Gus", email: "gus@example.com", acceptTerms: true, over18: true });
  check("a guest who has not opened the steps is not counted", (await funnel())[1].join() === "2,2");
  await mv(G, 1);
  check("they are counted once they reach step 1", (await funnel())[1].join() === "3,2");

  // A card made some other way is never counted.
  const P = fc({ ip: "10.14.7.4" });
  await P.post("/api/profile", { name: "Pat", acceptTerms: true, over18: true });
  await mv(P, 2); await mv(P, 3);
  check("a card made outside the steps is not counted", JSON.stringify(await funnel()) === JSON.stringify({ ...t, 1: [3, 2] }), await funnel());

  const body = (await admin("funnel-admin-token")).json;
  check("the admin response is counts only: no ids, names or times", Object.keys(body).sort().join() === "days,since,steps" && body.steps.every((s) => Object.keys(s).sort().join() === "completed,reached,step"), body);
  const cols = F.q("SELECT name FROM pragma_table_info('onboarding_stats')").map((c) => c.name).sort().join();
  check("the table has no column that could say who", cols === "completed,day,reached,step", cols);

  F.q("INSERT INTO onboarding_stats (day, step, reached, completed) VALUES ('2020-01-01', 1, 5, 5)");
  await purgeExpired(F.env);
  check("rows older than 400 days are deleted by the daily purge", !F.q1("SELECT 1 x FROM onboarding_stats WHERE day = '2020-01-01'") && !!F.q1("SELECT 1 x FROM onboarding_stats"));

  const adm = read("src/views/Admin.vue");
  check("the admin page shows the table", has(adm, "/api/admin/onboarding", 'class="funnel', "Of step 1"));
  check("it is not read by any host route (hosts only ever see aggregates of their events)", !/onboarding/.test(read("worker/hosts.js") + read("worker/events.js") + read("worker/host-auth.js")));
}

summary();
