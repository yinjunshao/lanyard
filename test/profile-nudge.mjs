// F49: profile score and finish-your-profile emails. Run: node test/profile-nudge.mjs
// The real Worker on in-memory SQLite. The clock is a number passed to the job, so every timing line is exact.
import { readFileSync, readdirSync } from "node:fs";
import { check, summary } from "./harness.mjs";
import { profileScore, SCORE_MAX } from "../src/lib/profileScore.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

console.log("\n# The score: six items, one point each");
{
  const base = { name: "Sam Lee", photo: "/media/x", mode: "student", uni: "A University", course: "Maths", headline: "Building things", links: { Site: "https://example.com" } };
  const keys = (p) => profileScore(p).items.map((i) => i.key).join(",");
  check("six items in all, out of six", profileScore(base).items.length === 6 && SCORE_MAX === 6 && profileScore(base).max === 6);
  check("a full student profile scores 6 and nothing is missing", profileScore(base).score === 6 && profileScore(base).missing.length === 0);
  check("student items are name, photo, university, course, what you do, link", keys(base) === "name,photo,uni,course,headline,links");

  // The plan's example: name, photo, university and course, no headline and no link.
  const four = profileScore({ ...base, headline: "", links: {} });
  check("name, photo, university and course but no headline and no link scores 4 and names the two missing items",
    four.score === 4 && four.missing.map((m) => m.label).join("|") === "What you do|A link", four.missing);
  check("each missing item says which field to go to", four.missing.map((m) => m.field).join(",") === "headline,links");

  // Career mode asks for company and role, and ignores university and course.
  const career = { ...base, mode: "career", uni: "", course: "", company: "Acme", role: "Designer" };
  check("a career person scores company and role instead of university and course", profileScore(career).score === 6 && keys(career) === "name,photo,company,role,headline,links");
  check("a career profile with an old university but no company or role scores 4", profileScore({ ...career, company: "", role: "", uni: "A University", course: "Maths" }).score === 4);
  check("a career profile with company but no role is missing the role only", profileScore({ ...career, role: "" }).missing.map((m) => m.key).join() === "role");
  check("a student profile with company and role but no university scores 4", profileScore({ ...base, uni: "", course: "", company: "Acme", role: "Designer" }).score === 4);
  check("a mode that is not 'career' is scored as student", profileScore({ ...base, mode: "", company: "x", role: "y", uni: "", course: "" }).score === 4);

  // Blank and spaces-only values never count.
  const blank = { name: "   ", photo: "  ", mode: "student", uni: " \t", course: "\n", headline: "   ", links: { Site: "   " } };
  check("values of only spaces score 0 in student mode", profileScore(blank).score === 0 && profileScore(blank).missing.length === 6);
  check("values of only spaces score 0 in career mode", profileScore({ ...blank, mode: "career", company: " ", role: "  " }).score === 0);
  check("a link with a blank address does not count; one with an address does", profileScore({ ...base, links: { A: " ", B: "" } }).score === 5 && profileScore({ ...base, links: { A: " ", B: "https://x.test" } }).score === 6);
  check("nothing at all, and no profile, score 0", profileScore({}).score === 0 && profileScore(null).score === 0 && profileScore(null).missing.length === 6);
  check("the database's shape works: photo_key, links as JSON text", profileScore({ ...base, photo: undefined, photo_key: "avatar/k", links: JSON.stringify({ A: "https://x.test" }) }).score === 6
    && profileScore({ ...base, photo: undefined, photo_key: null, links: "{}" }).score === 4 && profileScore({ ...base, links: "not json" }).score === 5);
  check("a name alone scores 1", profileScore({ name: "Sam" }).score === 1);
}

console.log("\n# Where the score module is loaded");
{
  const importers = [];
  const walk = (dir) => {
    for (const e of readdirSync(new URL("../" + dir, import.meta.url), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.(vue|js)$/.test(e.name) && /profileScore/.test(read(p)) && e.name !== "profileScore.js") importers.push(p);
    }
  };
  walk("src");
  check("only Edit profile in src/ imports it (so no public page's first load carries it)", importers.join() === "src/views/EditProfile.vue", importers);
  check("the module has no imports", !/^\s*import\s/m.test(read("src/lib/profileScore.js")));
  check("api.js, store.js and main.css do not mention it", !/profileScore/.test(read("src/lib/api.js") + read("src/lib/store.js") + read("src/styles/main.css")));
}

summary();
