// F12: the institution list and picker. The list's shape and stable ids, the
// helpers, then (added by later F12 tasks) storage, API, backfill and source guards.
// Run: node test/institutions.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sep } from "node:path";
import { makeEnv, makeDb, readMigration, check, summary, becomeHost } from "./harness.mjs";
import { eraseUser } from "../worker/purge.js";
import { slugify, institutionForDomain, institutionForText } from "../src/lib/institutions.js";

const file = JSON.parse(readFileSync(new URL("../src/data/institutions-uk.json", import.meta.url), "utf8"));
const list = file.institutions;

console.log("\n# The list");
check("it says where it came from", typeof file._source === "string" && /not downloaded|NOT downloaded/.test(file._source) && /owner/.test(file._source));
check(`it has entries (${list.length})`, list.length >= 100);
const ids = list.map((i) => i.id);
check("every id is unique", new Set(ids).size === ids.length);
check("every id is the slug of its name (so ids stay stable and readable)", list.every((i) => i.id === slugify(i.name)), list.filter((i) => i.id !== slugify(i.name)).map((i) => i.id));
check("every entry has a name, a UK nation, and arrays", list.every((i) => i.name && ["England", "Scotland", "Wales", "Northern Ireland"].includes(i.nation) && Array.isArray(i.aliases) && Array.isArray(i.domains)));
check("every nation is present", ["England", "Scotland", "Wales", "Northern Ireland"].every((n) => list.some((i) => i.nation === n)));
check("domains look like domains, lower case", list.every((i) => i.domains.every((d) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d))));
const doms = list.flatMap((i) => i.domains);
check("no domain belongs to two institutions", new Set(doms).size === doms.length);
const names = new Set(list.map((i) => i.name.toLowerCase()));
check("no alias is another institution's name", list.every((i) => i.aliases.every((a) => !names.has(a.toLowerCase()) || a.toLowerCase() === i.name.toLowerCase())));
check("names and aliases fit in 120 characters", list.every((i) => i.name.length <= 120 && i.aliases.every((a) => a.length <= 40)));
// Ids that are already in use in saved profiles must never change. Add to this list; never edit it.
const PINNED = ["university-of-oxford", "university-college-london", "kings-college-london", "university-of-edinburgh", "cardiff-university", "queens-university-belfast", "london-school-of-hygiene-and-tropical-medicine"];
check("pinned ids are still there", PINNED.every((id) => ids.includes(id)), PINNED.filter((id) => !ids.includes(id)));

console.log("\n# Helpers");
check("slugify drops apostrophes and turns & into and", slugify("King's College London") === "kings-college-london" && slugify("A & B") === "a-and-b");
const ex = [{ id: "example-university", name: "Example University", aliases: ["EU"], domains: ["example.ac.uk"] }, { id: "other", name: "Other", aliases: ["Example University"], domains: [] }];
check("a domain finds its institution", institutionForDomain(ex, "example.ac.uk")?.id === "example-university");
check("a subdomain finds it too, in any case", institutionForDomain(ex, "Students.Example.AC.uk")?.id === "example-university");
check("a lookalike domain does not", institutionForDomain(ex, "notexample.ac.uk") === null && institutionForDomain(ex, "gmail.com") === null && institutionForDomain(ex, "") === null);
check("text matches a name or alias exactly, ignoring case", institutionForText(ex, "  eu ")?.id === "example-university");
check("text that matches two institutions matches none", institutionForText(ex, "example university") === null);
check("partial text matches none", institutionForText(ex, "Example") === null);

const T = await makeEnv();
const { client, q1, env } = T;
const L = list[0]; // a listed institution, used without naming it here
const L2 = list[1];

async function signup(name, ip, extra = {}) {
  const c = client({ ip });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, ...extra });
  const me = await c.get("/api/me");
  return { c, r, id: me.json.user?.id, me: me.json };
}
const row = (id) => q1("SELECT uni, institution_id FROM profiles WHERE user_id = ?", id);

console.log("\n# Migration 0020 on a profile in the old shape");
{
  const db = makeDb({ before: "0020" });
  db.exec("INSERT INTO users (id, created_at) VALUES ('u1', 1)");
  db.exec("INSERT INTO profiles (user_id, name, uni, updated_at) VALUES ('u1', 'Old', 'Some Uni', 1)");
  db.exec(readMigration("0020_institution_id.sql"));
  const p = await db.prepare("SELECT uni, institution_id FROM profiles WHERE user_id = 'u1'").first();
  check("an existing profile keeps its text and has no institution id", p.uni === "Some Uni" && p.institution_id === null, p);
  check("orgs have the column too", (await db.prepare("SELECT institution_id FROM orgs LIMIT 1").first()) === null);
}

console.log("\n# Profile API");
const A = await signup("Ada", "10.6.0.1", { institutionId: L.id, uni: "ignored text" });
check("a listed id is saved and uni becomes the official name", A.r.status === 201 && row(A.id).institution_id === L.id && row(A.id).uni === L.name, row(A.id));
check("/api/me returns institution_id", A.me.profile.institution_id === L.id);
const bad = await signup("Bad", "10.6.0.2", { institutionId: "not-a-listed-id" });
check("an id that is not on the list is refused", bad.r.status === 400 && /list/.test(bad.r.json.error), bad.r.text);
const badType = await signup("Bad2", "10.6.0.3", { institutionId: { x: 1 } });
check("an id that is not a string is refused", badType.r.status === 400);
const C = await signup("Cus", "10.6.0.4", { uni: "My Own College" });
check("custom text saves as typed with no id", row(C.id).uni === "My Own College" && row(C.id).institution_id === null);
const longText = "x".repeat(300);
const D = await signup("Long", "10.6.0.5", { uni: longText });
check("custom text is capped at 120 characters", row(D.id).uni.length === 120);

{
  const r = await A.c.put("/api/profile", { headline: "Hello" });
  check("an edit that does not mention it leaves the id and name alone", r.status === 200 && row(A.id).institution_id === L.id && row(A.id).uni === L.name);
  const same = await A.c.put("/api/profile", { uni: L.name });
  check("sending the same name again keeps the id", same.status === 200 && row(A.id).institution_id === L.id);
  const wrong = await A.c.put("/api/profile", { institutionId: "nope", uni: "Changed" });
  check("a bad id on edit is refused and nothing changes", wrong.status === 400 && row(A.id).uni === L.name && row(A.id).institution_id === L.id);
  const typed = await A.c.put("/api/profile", { uni: "Typed By Hand" });
  check("changing only the text (an old client) clears the id", typed.status === 200 && row(A.id).uni === "Typed By Hand" && row(A.id).institution_id === null);
  const pick2 = await A.c.put("/api/profile", { institutionId: L2.id });
  check("picking another listed one changes both", pick2.status === 200 && row(A.id).institution_id === L2.id && row(A.id).uni === L2.name);
  const custom = await A.c.put("/api/profile", { institutionId: null, uni: "Another Custom" });
  check("null id with text is a custom entry", custom.status === 200 && row(A.id).institution_id === null && row(A.id).uni === "Another Custom");
  await A.c.put("/api/profile", { institutionId: L.id });
  const clear = await A.c.put("/api/profile", { institutionId: null, uni: "" });
  check("clearing removes both", row(A.id).institution_id === null && row(A.id).uni === "" && clear.status === 200);
  await A.c.put("/api/profile", { institution_id: L.id });
  check("snake_case is accepted too", row(A.id).institution_id === L.id);
}

console.log("\n# Email-domain hint, export, deletion");
{
  check("/api/me carries emailDomain (null with no email)", A.me.user.emailDomain === null);
  env.DB.raw.prepare("UPDATE users SET email_domain = 'example.ac.uk' WHERE id = ?").run(A.id);
  check("and the domain once there is a verified email", (await A.c.get("/api/me")).json.user.emailDomain === "example.ac.uk");
  const ex = (await A.c.get("/api/account/export")).json;
  check("the data export includes institution_id", ex.profile?.institution_id === L.id, ex.profile);
  await eraseUser(env, A.id);
  check("deleting the account deletes the profile row, and the id with it", q1("SELECT 1 x FROM profiles WHERE user_id = ?", A.id) == null);
}

console.log("\n# Host organisation");
{
  const H = client({ ip: "10.6.2.1", site: "host" });
  const r = await becomeHost(H, { kind: "society", name: "Example Robotics Society", email: "lead@example.ac.uk",
    extra: { leaderName: "Ada Leader", orgLink: "https://union.example.ac.uk/robotics", university: "typed", institutionId: L.id } });
  const o = q1("SELECT university, institution_id FROM orgs WHERE id = ?", r.org.json.id);
  check("a society's listed university is saved with its official name", r.org.status === 201 && o.institution_id === L.id && o.university === L.name, [r.org.status, r.org.text, o]);
  const H2 = client({ ip: "10.6.2.2", site: "host" });
  const bad2 = await becomeHost(H2, { kind: "society", name: "Example Chess Society", email: "lead2@example.ac.uk",
    extra: { leaderName: "Bob Leader", orgLink: "https://union.example.ac.uk/chess", university: "x", institutionId: "nope" } });
  check("an id that is not on the list is refused for an organisation", bad2.org.status === 400, bad2.org.text);
  const H3 = client({ ip: "10.6.2.3", site: "host" });
  const own = await becomeHost(H3, { kind: "society", name: "Example Film Society", email: "lead3@example.ac.uk",
    extra: { leaderName: "Cy Leader", orgLink: "https://union.example.ac.uk/film", university: "Typed College" } });
  const o3 = q1("SELECT university, institution_id FROM orgs WHERE id = ?", own.org.json.id);
  check("a typed university is kept as typed with no id", o3.university === "Typed College" && o3.institution_id === null, o3);
  const ex = (await H.get("/api/host/account/export")).json;
  check("the host export lists the organisation's university and id", ex.organisations?.[0]?.institution_id === L.id && ex.organisations[0].university === L.name, ex.organisations);
}

console.log("\n# Source guards");
{
  const { readdirSync, statSync } = await import("node:fs");
  const walk = (d, out = []) => { for (const n of readdirSync(d)) { const f = d + "/" + n; if (statSync(f).isDirectory()) walk(f, out); else out.push(f); } return out; };
  const src = walk(fileURLToPath(new URL("../src", import.meta.url))).map((f) => f.split(sep).join("/")).filter((f) => /\.(vue|js)$/.test(f));
  const read = (f) => readFileSync(f, "utf8");
  // F29: the three data files are put together in src/data/institutions.js, the one module the pickers fetch.
  // F14 moved the picker out of EditProfile.vue into the shared ModeFields.vue, which Edit profile and the welcome steps both use.
  const importers = src.filter((f) => /institutions-[a-z]+\.json/.test(read(f))).map((f) => f.split("/").pop());
  check("only the combined data module names the data files", importers.join() === "institutions.js", importers);
  const fetchers = src.filter((f) => /data\/institutions\.js"/.test(read(f))).map((f) => f.split("/").pop());
  check("only the shared mode fields and the host dashboard fetch that module", fetchers.sort().join() === "HostDashboard.vue,ModeFields.vue", fetchers);
  check("each fetches it with a plain import(), never a static import or defineAsyncComponent", src.filter((f) => /(ModeFields|HostDashboard)\.vue$/.test(f)).every((f) => {
    const t = read(f);
    return /import\("\.\.\/data\/institutions\.js"\)/.test(t) && !/^import .*data\/institutions\.js/m.test(t) && !/defineAsyncComponent/.test(t);
  }));
  const combo = read(src.find((f) => /UiCombobox\.vue$/.test(f)));
  check("the list is fetched when the picker opens (UiCombobox emits open)", /emit\("open"\)/.test(combo));
  const edit = read(src.find((f) => /EditProfile\.vue$/.test(f)));
  const fields = read(src.find((f) => /ModeFields\.vue$/.test(f)));
  check("the shared mode fields have no plain text field for the university or studied-at", !/<input[^>]*id="uni"/.test(fields) && (fields.match(/<UiCombobox/g) || []).length === 2);
  check("Edit profile and the welcome step take them from there and build no picker of their own",
    /<ModeFields/.test(edit) && /<ModeFields/.test(read(src.find((f) => /StepMode\.vue$/.test(f)))) && !/<UiCombobox|<input[^>]*id="uni"/.test(edit));
  check("and the organisation form sends the id", /institutionId: o\.institutionId/.test(read(src.find((f) => /HostDashboard\.vue$/.test(f)))));
  check("and it sends the id with the text", /institutionId: f\.value\.institutionId/.test(edit));
}

console.log("\n# Search finds the official name from a common short name");
{
  const { rankOptions } = await import("../src/lib/match.js");
  const options = list.map((i) => ({ value: i.id, label: i.name, aliases: i.aliases }));
  const first = (q) => rankOptions(options, q)[0]?.option.label;
  check("the short name UCL finds the full official name first", first("ucl") === "University College London", first("ucl"));
  check("LSE and QMUL do too", first("lse") === "London School of Economics and Political Science" && first("qmul") === "Queen Mary University of London");
  check("case and accents do not matter", first("  UCL ") === "University College London");
  check("a word from the name finds it", rankOptions(options, "edinburgh").some((r) => r.option.value === "university-of-edinburgh"));
}

console.log("\n# Backfill script");
{
  const { plan, sqlFor, report } = await import("../scripts/backfill-institutions.mjs");
  const demo = [
    { id: "example-university", name: "Example University", aliases: ["EU"], domains: [] },
    { id: "other-college", name: "Other College", aliases: ["Example University"], domains: [] },
    { id: "third-place", name: "Third Place", aliases: ["TP"], domains: [] },
  ];
  const r = plan({
    profiles: [{ k: "p1", text: "Third Place" }, { k: "p2", text: " tp " }, { k: "p3", text: "Third" }, { k: "p4", text: "example university" }, { k: "p5", text: "Mine" }, { k: "p6", text: "Mine" }],
    orgs: [{ k: "o1", text: "third place" }],
  }, demo);
  const ups = Object.fromEntries(r.profiles.updates.map((u) => [u.k, u]));
  check("an exact name matches", ups.p1?.id === "third-place" && ups.p1.renamed === false);
  check("an alias matches, ignoring case and spaces, and the text becomes the official name", ups.p2?.id === "third-place" && ups.p2.renamed === true);
  check("a partial name is not guessed", !ups.p3 && r.profiles.unmatched.some(([t]) => t === "Third"));
  check("text that is one institution's name and another's alias is left alone", !ups.p4);
  check("unmatched values are counted", r.profiles.unmatched.find(([t]) => t === "Mine")?.[1] === 2);
  check("organisations are matched too", r.orgs.updates[0]?.id === "third-place");
  check("the report lists the unmatched values", /2 x "Mine"/.test(report(r)));
  const db = makeDb();
  db.exec("INSERT INTO users (id, created_at) VALUES ('b1', 1), ('b2', 1)");
  db.exec("INSERT INTO profiles (user_id, name, uni, updated_at) VALUES ('b1', 'A', 'x', 1), ('b2', 'B', 'x', 1)");
  const p = plan({ profiles: [{ k: "b1", text: "TP" }], orgs: [] }, demo);
  db.exec(sqlFor(p).replace(/\n/g, " "));
  const a = await db.prepare("SELECT uni, institution_id FROM profiles WHERE user_id = 'b1'").first();
  const b = await db.prepare("SELECT uni, institution_id FROM profiles WHERE user_id = 'b2'").first();
  check("the generated SQL updates only the matched row", a.institution_id === "third-place" && a.uni === "Third Place" && b.institution_id === null && b.uni === "x", [a, b]);
  check("a quote in a value cannot break the SQL", sqlFor({ profiles: { updates: [{ k: "a'b", id: "i", name: "O'Name" }] }, orgs: { updates: [] } }).includes("'O''Name'"));
}

summary();
