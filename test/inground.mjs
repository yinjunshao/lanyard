// F16: shared ground without AI. The matching rules (normalisers, kinds, order, the cap) and the
// privacy rules: a hidden field never produces a fact, on either side. The endpoints, blocking,
// events, export and the screen come with later tasks.
// Run: node test/inground.mjs
import { readFileSync } from "node:fs";
import { makeEnv, check, summary, becomeHost } from "./harness.mjs";
import { inCommon, visibleSide, normTag, normCompany, normCourse, normInstitution, MAX_FACTS } from "../worker/inCommon.js";

const side = (p, card = null) => visibleSide({ mode: "student", uni: "", institution_id: null, course: "", company: "", role: "", tags: [], ...p }, card);
const kinds = (a, b, ev) => inCommon(a, b, ev).map((f) => f.kind);

console.log("\n# Normalisers");
check("tags fold case, spacing, punctuation and plurals", normTag("  Robots ") === normTag("robot") && normTag("Web  apps!") === normTag("web app") && normTag("Hobbies") === normTag("hobby"));
check("tags that differ stay apart", normTag("robotics") !== normTag("robots") && normTag("bus") === "bus" && normTag("glass") === "glass");
check("accents and & fold", normTag("Café") === normTag("cafe") && normCourse("Art & Design") === normCourse("art and design"));
check("company ignores Ltd, Limited, plc and a leading The", normCompany("The Acme Ltd.") === normCompany("acme") && normCompany("Acme Limited") === normCompany("ACME plc"));
check("a company that is only noise reduces to nothing", normCompany("Ltd") === "");
check("course ignores a degree prefix and plurals", normCourse("BSc (Hons) Computer Science") === normCourse("computer science") && normCourse("MEng Robotics") === normCourse("Robotic"));
check("institution ignores a leading The and case", normInstitution("The University of Example") === normInstitution("university of example"));

console.log("\n# Each kind");
const inst = { uni: "University of Example", institution_id: "example" };
{
  const a = side({ ...inst, tags: ["Robotics", "Design"] }), b = side({ ...inst, tags: ["robotics", "music"] });
  const f = inCommon(a, b);
  check("a shared tag is 'Both into <tag>'", f[0].kind === "tags" && f[0].text === "Both into robotics", f);
  check("the same institution is 'Both at <institution>' for two students", f.some((x) => x.kind === "institution" && x.text === "Both at University of Example"), f);
  check("tag first, then institution, in that order", f.map((x) => x.kind).join() === "tags,institution", f);
  const two = inCommon(side({ tags: ["a", "b", "c"] }), side({ tags: ["c", "b", "a"] }));
  check("two shared tags read 'Both into x and y' and no more than two", two.length === 1 && /^Both into c and b$/.test(two[0].text), two);
  check("the same tag twice counts once", inCommon(side({ tags: ["Art", "art"] }), side({ tags: ["ART"] }))[0].text === "Both into ART");
}
{
  const f = inCommon(side({ ...inst, course: "BSc Computer Science" }), side({ ...inst, course: "computer science" }));
  check("same course at the same institution is 'Same course'", f.map((x) => x.kind).join() === "course,institution", f);
  check("the same course at different institutions is not shared", kinds(side({ uni: "A", institution_id: "a", course: "Law" }), side({ uni: "B", institution_id: "b", course: "Law" })).length === 0);
  check("a different course at the same institution is only the institution", kinds(side({ ...inst, course: "Law" }), side({ ...inst, course: "Art" })).join() === "institution");
  check("a course with no institution on either side is not shared", kinds(side({ course: "Law" }), side({ course: "Law" })).length === 0);
}
{
  const c = (p) => side({ mode: "career", ...p });
  const f = inCommon(c({ company: "Acme Ltd", role: "Engineer" }), c({ company: "acme", role: "Designer" }));
  check("two career profiles at one company: 'Both at <company>' (role differences do not matter)", f.length === 1 && f[0].kind === "company" && f[0].text === "Both at acme", f);
  check("different companies share nothing", kinds(c({ company: "Acme" }), c({ company: "Other" })).length === 0);
  check("two profiles with no company share nothing", kinds(c({}), c({})).length === 0);
}
{
  const ev = ["Spring networking night"];
  check("a shared past event is 'Both at <event>'", inCommon(side({}), side({}), ev)[0].text === "Both at Spring networking night");
  check("only the most recent event is used (the caller sends most recent first)", inCommon(side({}), side({}), ["New", "Old"]).length === 1 && inCommon(side({}), side({}), ["New", "Old"])[0].text === "Both at New");
}
{
  const i = inCommon(side(inst), side({ ...inst, mode: "career", company: "Acme" }));
  check("a student and a career profile who studied at the same place: 'Both studied at'", i[0].text === "Both studied at University of Example", i);
  check("typed-in institutions with the same words match, with or without an id", kinds(side({ uni: "Example College" }), side({ uni: "example college" })).join() === "institution" && kinds(side({ uni: "University of Example", institution_id: "example" }), side({ uni: "university of example" })).join() === "institution");
  check("two different ids never match, even with the same text", kinds(side({ uni: "Same", institution_id: "a" }), side({ uni: "Same", institution_id: "b" })).length === 0);
}

console.log("\n# Order and the cap");
{
  const a = side({ ...inst, course: "Law", tags: ["chess"] }), b = side({ ...inst, course: "law", tags: ["Chess"] });
  check("tags and course come before institution", kinds(a, b).join() === "tags,course,institution");
  const all4 = inCommon(side({ ...inst, mode: "career", company: "Acme", tags: ["chess"] }), side({ ...inst, mode: "career", company: "Acme", tags: ["chess"] }), ["Night"]);
  check(`never more than ${MAX_FACTS} facts`, all4.length === MAX_FACTS && all4.map((x) => x.kind).join() === "tags,company,event", all4);
  check("nothing in common gives an empty list", inCommon(side({ tags: ["a"] }), side({ tags: ["b"] })).length === 0 && inCommon(null, side({})).length === 0);
}

console.log("\n# A hidden field never produces a fact (privacy)");
{
  // Kept but hidden: a career profile's course, a student profile's company.
  const careerKeepsCourse = side({ mode: "career", ...inst, course: "Law", company: "Acme" });
  const studentLaw = side({ ...inst, course: "Law" });
  check("a career profile's kept course is not shared ground with a student on the same course", !kinds(careerKeepsCourse, studentLaw).includes("course"), kinds(careerKeepsCourse, studentLaw));
  check("and the other way round (the student sees nothing about the kept course)", !kinds(studentLaw, careerKeepsCourse).includes("course"));
  const studentKeepsCompany = side({ ...inst, company: "Acme" });
  const careerAcme = side({ mode: "career", company: "Acme" });
  check("a student profile's kept company is not shared ground with a career profile at that company", !kinds(studentKeepsCompany, careerAcme).includes("company") && !kinds(careerAcme, studentKeepsCompany).includes("company"));
  check("the text never carries a hidden field", !JSON.stringify(inCommon(careerKeepsCourse, studentLaw)).includes("Law") && !JSON.stringify(inCommon(studentKeepsCompany, careerAcme)).includes("Acme"));
  check("visibleSide drops the other mode's fields", visibleSide({ mode: "career", course: "Law", company: "Acme", uni: "", tags: [] }, null).course === "" && visibleSide({ mode: "student", course: "Law", company: "Acme", uni: "", tags: [] }, null).company === "");
  // A tag the shared card leaves out: the card's own list replaces the profile's.
  const profileTags = { tags: ["chess", "robotics"] };
  const sharedCardTags = side(profileTags, { tags: ["chess"] });
  check("a profile tag the shared card leaves out never produces a fact", kinds(side({ tags: ["robotics"] }), sharedCardTags).length === 0 && kinds(sharedCardTags, side({ tags: ["robotics"] })).length === 0);
  check("a card with no tags of its own falls back to the profile's", kinds(side({ tags: ["robotics"] }), side(profileTags, { tags: [] })).join() === "tags");
  check("empty strings and numbers in a tag list are ignored", visibleSide({ mode: "student", tags: ["a", "", 5, " "] }, null).tags.join() === "a");
}


// ------------------------------------------------------------- the endpoints
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const [I0, I1] = JSON.parse(read("src/data/institutions-uk.json")).institutions; // names are never written in this file
const T = await makeEnv();
const { client, q, q1, env } = T;
const H = 3600e3;
async function signup(name, ip, body = {}) {
  const c = client({ ip });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, ...body });
  if (r.status !== 201) throw new Error(r.text);
  const me = await c.get("/api/me");
  return { c, name, id: me.json.user.id, card: me.json.cards[0].cardId };
}
const student = { mode: "student", institutionId: I0.id, course: "Computer Science" };
const A = await signup("Alice Ground", "10.16.0.1", { ...student, tags: ["Robotics", "Music"] });
const B = await signup("Bea Ground", "10.16.0.2", { ...student, course: "computer science", tags: ["robotics", "Chess"] });
const C = await signup("Cal Ground", "10.16.0.3", { mode: "career", institutionId: I0.id, course: "Computer Science", company: "Acme Ltd", role: "Engineer", tags: ["Gardening"] });
const D = await signup("Dee Ground", "10.16.0.4", { ...student, institutionId: I1.id });
const E = await signup("Eli Ground", "10.16.0.5", { ...student, course: "Law", tags: ["Sailing"] });
const F = await signup("Fay Ground", "10.16.0.6", { mode: "career", company: "ACME", role: "Designer" });
const connect = async (from, to, body = {}) => {
  const r = await from.c.post("/api/connect", { cardId: to.card, ...body });
  if (r.status !== 200) throw new Error(r.text);
  return r.json.connectionId;
};
const card = async (p, id = p.card) => (await p.c.get(`/api/c/${id}`)).json;
const facts = async (p, other) => (await card(p, other.card)).inCommon;
const kindsOf = (f) => (f || []).map((x) => x.kind).join();
const cnOf = (p) => q1("SELECT id FROM connections WHERE user_a = ? OR user_b = ? ORDER BY created_at DESC LIMIT 1", p.id, p.id).id;

console.log("\n# GET /api/c/:cardId");
{
  const f = await facts(A, B);
  check("two students at one institution on one course with a shared tag: tag, course, institution, in that order",
    kindsOf(f) === "tags,course,institution" && f[0].text === "Both into robotics" && f[1].text === "Same course" && f[2].text === `Both at ${I0.name}`, f);
  check("the card page shows it before the viewer has connected", !(await card(A, B.card)).viewer.connection);
  check("signed-out viewers get no shared ground", ((await client({ ip: "10.16.9.1" }).get(`/api/c/${B.card}`)).json.inCommon || []).length === 0);
  check("you get none about your own card", (await card(A)).inCommon.length === 0);
  check("a different institution shares neither course nor institution", kindsOf(await facts(A, D)) === "");
  check("the same institution and a different course: only the institution", kindsOf(await facts(A, E)) === "institution");
  check("the facts are plain text and kind only (no ids, no fields)", Object.keys(f[0]).sort().join() === "kind,text");
  check("institution_id is not added to the card payload", !JSON.stringify(await card(A, B.card)).includes("institution_id"));
}

console.log("\n# GET /api/connections/:id");
const cAB = await connect(A, B);
{
  const r = await A.c.get(`/api/connections/${cAB}`);
  check("the person page returns the same facts as the card page", r.status === 200 && JSON.stringify(r.json.inCommon) === JSON.stringify(await facts(A, B)), r.json.inCommon);
  const back = await B.c.get(`/api/connections/${cAB}`);
  check("the other person sees the same kinds (the rule is symmetric)", kindsOf(back.json.inCommon) === "tags,course,institution", back.json.inCommon);
  const list = await A.c.get("/api/connections");
  check("the people list carries none (rows stay two lines)", !JSON.stringify(list.json).includes("inCommon"));
  const stranger = await C.c.get(`/api/connections/${cAB}`);
  check("someone who is not in the connection is refused", stranger.status === 404);
}

console.log("\n# Tags: only the card that was shared");
{
  // B makes a card that lists only Chess. Alice opens it: Robotics (on B's profile, left off this card) is not a fact.
  const mk = await B.c.post("/api/cards", { name: "Chess card", tags: ["Chess"] });
  const f1 = (await A.c.get(`/api/c/${mk.json.id}`)).json.inCommon;
  check("a tag left off the card the viewer is looking at never appears", !JSON.stringify(f1).toLowerCase().includes("robotics"), f1);
  // Alice makes a card that lists only Music; Gus scans it. Robotics is on Alice's profile and default card, not on this one.
  const mkA = await A.c.post("/api/cards", { name: "Music card", tags: ["Music"] });
  const G = await signup("Gus Ground", "10.16.0.7", { ...student, tags: ["Robotics", "Music"] });
  await connect(G, { card: mkA.json.id });
  const f2 = (await G.c.get(`/api/c/${mkA.json.id}`)).json.inCommon;
  check("the viewer sees a tag the card shows", f2.some((x) => x.text === "Both into Music"), f2);
  check("a tag the card does not show is not a fact (Robotics is on the profile only)", !JSON.stringify(f2).toLowerCase().includes("robotics"), f2);
  const back = (await A.c.get(`/api/connections/${cnOf(G)}`)).json.inCommon;
  check("the card's owner, seeing Gus, gets the same limit: Music only", JSON.stringify(back).includes("Music") && !JSON.stringify(back).toLowerCase().includes("robotics"), back);
}

console.log("\n# Kept but hidden fields (a career profile's course, a student's company)");
{
  check("career profile with a kept course, student on the same course: no course fact for the student", !kindsOf(await facts(A, C)).includes("course"), await facts(A, C));
  check("and none for the career profile looking at the student", !kindsOf(await facts(C, A)).includes("course"), await facts(C, A));
  check("they still share where they studied, worded for a career profile", (await facts(A, C))[0]?.text === `Both studied at ${I0.name}`, await facts(A, C));
  // Alice keeps a company that Cal shows. Alice is a student, so it is not shown and not used.
  await A.c.put("/api/profile", { company: "Acme", role: "Intern" });
  const toC = await facts(A, C), toA = await facts(C, A);
  check("a student's kept company is not a fact for the career profile at that company", !kindsOf(toC).includes("company") && !kindsOf(toA).includes("company"), [toC, toA]);
  check("the career profile is never told the student's kept company", !JSON.stringify(toA).includes("Acme"), toA);
  const g = await facts(F, C);
  check("two career profiles at one company: 'Both at <company>', whatever the case or Ltd", kindsOf(g) === "company" && g[0].text === "Both at Acme Ltd", g);
  await C.c.put("/api/profile", { mode: "student" });
  check("when the career profile switches to student the company stops being a fact and the course starts", kindsOf(await facts(F, C)) === "" && kindsOf(await facts(A, C)).includes("course"), [await facts(F, C), await facts(A, C)]);
  await C.c.put("/api/profile", { mode: "career" });
}

console.log("\n# Institutions: compare ids, not look-alike text");
{
  const typed1 = await signup("Hal Ground", "10.16.0.8", { uni: "Example University", course: "Art" });
  const typed2 = await signup("Ida Ground", "10.16.0.9", { uni: "example university", course: "art" });
  check("two typed-in institutions with the same words match, and so do the courses", kindsOf(await facts(typed1, typed2)) === "course,institution", await facts(typed1, typed2));
  check("a typed-in name does not match a different institution", kindsOf(await facts(typed1, D)) === "");
  check("a profile with no institution and a profile with one share nothing", kindsOf(await facts(F, A)) === "");
}

console.log("\n# Blocking");
{
  const X = await signup("Xia Ground", "10.16.1.1", { ...student, tags: ["Robotics"] });
  const cn = await connect(X, A);
  check("before blocking the person page has facts", (await X.c.get(`/api/connections/${cn}`)).json.inCommon.length > 0);
  await X.c.post(`/api/connections/${cn}/report`, { reason: "spam", block: true });
  check("after a block the card page is not found for either person", (await A.c.get(`/api/c/${X.card}`)).status === 404 && (await X.c.get(`/api/c/${A.card}`)).status === 404);
  const afterX = await X.c.get(`/api/connections/${cn}`), afterA = await A.c.get(`/api/connections/${cn}`);
  check("and the person page, if it still answers, carries no shared ground for either person", (afterX.json?.inCommon || []).length === 0 && (afterA.json?.inCommon || []).length === 0, [afterX.status, afterA.status]);
}

console.log("\n# Events: only ones you may already know the other was at");
{
  const host = client({ ip: "10.16.2.1", site: "host" });
  const info = await becomeHost(host, { kind: "company", name: "Ground Test Co" });
  env.DB.raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES (?, ?, 20, 0, ?, ?)").run("cr-ground", info.org.json.id, "test", Date.now());
  const mk = async (body) => { const r = await host.post("/api/host/events", body); if (r.status !== 201) throw new Error(r.text); return r.json; };
  const checkIn = async (p, ev, extra = {}) => { const r = await p.c.post(`/api/e/${ev.code}/checkin`, extra); if (r.status !== 200) throw new Error(r.text); };
  const t0 = Date.now();
  const P = await signup("Pia Ground", "10.16.3.1", { course: "Mime" }), Q = await signup("Quin Ground", "10.16.3.2", { course: "Opera" });
  const R = await signup("Rae Ground", "10.16.3.3", { course: "Dance" });
  const solo = await mk({ name: "Quiet night", startsAt: t0 - 30 * H, endsAt: t0 - 28 * H });               // both attended, no directory, not where they connected
  const dir = await mk({ name: "Open room", startsAt: t0 - 20 * H, endsAt: t0 - 18 * H, directoryOn: true }); // directory on, Q joined it
  const met = await mk({ name: "Where we met", startsAt: t0 - 10 * H, endsAt: t0 - 8 * H });                // they connected here
  const live = await mk({ name: "Still on", startsAt: t0 - H, endsAt: t0 + 5 * H, directoryOn: true });     // not over
  for (const ev of [solo, met]) { await checkIn(P, ev); await checkIn(Q, ev); }
  await checkIn(P, dir); await checkIn(Q, dir, { directoryConsent: true });
  await checkIn(P, live, { directoryConsent: true }); await checkIn(Q, live, { directoryConsent: true });
  await checkIn(R, solo);
  await checkIn(P, solo);
  const seen = async (v, o) => (await facts(v, o)).filter((x) => x.kind === "event").map((x) => x.text);
  check("not connected, no directory: attending the same past event is not shown", (await seen(R, P)).length === 0 && (await seen(P, R)).length === 0);
  check("the peer joined that event's directory: the shared past event is shown to the viewer", (await seen(P, Q)).join() === "Both at Open room", await seen(P, Q));
  check("the one who did not join the directory is not told about the other direction", (await seen(Q, P)).length === 0, await seen(Q, P));
  check("an event that is still on is not shown, even with a directory", !(await seen(P, Q)).includes("Both at Still on"));
  await connect(P, Q, { eventId: met.id });
  check("connected at an event: that event is shown", (await seen(P, Q)).length === 1, await seen(P, Q));
  check("a connection does not reveal the other past events they attended (Quiet night is not listed)", !JSON.stringify(await facts(P, Q)).includes("Quiet night"));
  const person = (await P.c.get(`/api/connections/${cnOf(P)}`)).json;
  check("the person page and the card page agree", JSON.stringify(person.inCommon) === JSON.stringify(await facts(P, Q)));
}

console.log("\n# Nothing is stored, hosts see none, it is one module");
{
  const src = read("worker/inCommon.js");
  check("the module only reads (no INSERT, UPDATE or DELETE)", !/\b(INSERT|UPDATE|DELETE)\b/i.test(src.replace(/\/\/.*$/gm, "")));
  const hostFiles = ["worker/hosts.js", "worker/events.js", "worker/host-auth.js", "worker/hostorg.js", "worker/admin.js", "worker/feedback.js", "worker/integrations.js", "worker/eventmail.js"];
  check("no host-facing file imports it (D004)", hostFiles.every((f) => !/inCommon|sharedGround/.test(read(f))), hostFiles.filter((f) => /inCommon|sharedGround/.test(read(f))));
  const exp = await A.c.get("/api/account/export");
  check("your data export carries no shared ground (it is worked out, not kept)", exp.status === 200 && !/inCommon|Both into|Same course|Both at/.test(exp.text));
  const tables = q("SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name).filter((n) => /ground|common/i.test(n));
  check("there is no table for it", tables.length === 0, tables);
}

summary();
