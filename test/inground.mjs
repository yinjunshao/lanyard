// F16: shared ground without AI. The matching rules (normalisers, kinds, order, the cap) and the
// privacy rules: a hidden field never produces a fact, on either side. The endpoints, blocking,
// events, export and the screen come with later tasks.
// Run: node test/inground.mjs
import { check, summary } from "./harness.mjs";
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

summary();
