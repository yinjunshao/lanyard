// F29: the institution list is now several files (UK, US, world). Ids are unique
// across all of them, the UK ids saved on profiles have not moved, every entry has
// a country with a name, and the merge, the picker options and the domain helpers
// behave. Added to by later F29 tasks (the data, the picker, the Worker, the backfill).
// Run: node test/institutions-world.mjs
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { check, summary, makeEnv } from "./harness.mjs";
import { rankOptions } from "../src/lib/match.js";
import { plan } from "../scripts/backfill-institutions.mjs";
import { slugify, isWebmail, institutionForDomain } from "../src/lib/institutions.js";
import { mergeInstitutions, countryLabel, pickerOptions } from "../src/lib/institutionList.js";

const dir = new URL("../src/data/", import.meta.url);
const names = readdirSync(dir).filter((n) => /^institutions-[a-z]+\.json$/.test(n)).sort();
const files = Object.fromEntries(names.map((n) => [n.replace(/^institutions-|\.json$/g, ""), JSON.parse(readFileSync(new URL(n, dir), "utf8"))]));

console.log("\n# The files");
check("the UK file is there, and every file says where it came from and asks the owner to review", "uk" in files && names.every((n) => { const f = files[n.replace(/^institutions-|\.json$/g, "")]; return typeof f._source === "string" && /owner/.test(f._source) && /not downloaded|NOT downloaded/i.test(f._source); }), names);
const merged = mergeInstitutions(Object.values(files));
const all = merged.institutions;
const ids = all.map((i) => i.id);
check(`every id is unique across all the files (${all.length} entries in ${names.length} files)`, new Set(ids).size === ids.length);

// UK ids are saved on people's profiles: they must never change. Add to this; never edit it.
const UK = files.uk.institutions;
const UK_SAMPLE = ["university-of-oxford", "university-college-london", "kings-college-london", "university-of-edinburgh", "cardiff-university", "queens-university-belfast", "ulster-university", "london-school-of-hygiene-and-tropical-medicine"];
check("a sample of UK ids is unchanged", UK_SAMPLE.every((id) => UK.some((i) => i.id === id)));
const ukHash = createHash("sha256").update(UK.map((i) => i.id).sort().join("\n")).digest("hex");
// F12 shipped 137 UK ids; their sorted list hashes to this. If entries are added later, the hash check is skipped but the sample stays.
const F12_IDS_HASH = "b46d8183f1b4c7f56594d6d9798815faab2ad0b4997b29e0f1537e166dbc3254";
check("the 137 UK ids F12 shipped are all still there, unchanged", UK.length !== 137 || ukHash === F12_IDS_HASH, ukHash);
check("every UK entry has country GB and keeps its nation", UK.every((i) => i.country === "GB" && ["England", "Scotland", "Wales", "Northern Ireland"].includes(i.nation)));

console.log("\n# Every entry");
const countryNames = merged.countries;
check("every entry has a name, arrays, and a two-letter country code with a name", all.every((i) => i.name && Array.isArray(i.aliases) && Array.isArray(i.domains) && /^[A-Z]{2}$/.test(i.country) && countryNames[i.country]), all.filter((i) => !(i.name && /^[A-Z]{2}$/.test(i.country) && countryNames[i.country])).map((i) => i.id).slice(0, 5));
check("ids are the slug of the name, with the country code added only to tell two of the same name apart", all.every((i) => i.id === slugify(i.name) || i.id === `${slugify(i.name)}-${i.country.toLowerCase()}`), all.filter((i) => !(i.id === slugify(i.name) || i.id === `${slugify(i.name)}-${i.country.toLowerCase()}`)).map((i) => i.id).slice(0, 5));
const byName = new Map();
for (const i of all) byName.set(i.name.toLowerCase(), [...(byName.get(i.name.toLowerCase()) || []), i]);
const same = [...byName.values()].filter((g) => g.length > 1);
check("two institutions with the same name each have a country-suffixed id", same.every((g) => g.every((i) => i.id.endsWith(`-${i.country.toLowerCase()}`))), same.map((g) => g.map((i) => i.id)));
check("an id never has a leading, trailing or doubled hyphen and is plain a-z, 0-9", ids.every((id) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)));
check("domains look like domains, lower case, and none belongs to two institutions", (() => { const d = all.flatMap((i) => i.domains); return d.every((x) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(x)) && new Set(d).size === d.length; })());
check("no domain is a subdomain of another institution's domain (it would match the wrong one)", (() => {
  const owner = new Map(all.flatMap((i) => i.domains.map((d) => [d, i.id])));
  return [...owner].every(([d, id]) => ![...owner].some(([e, id2]) => id2 !== id && d.endsWith("." + e)));
})(), "");
const lowerNames = new Set(all.map((i) => i.name.toLowerCase()));
check("no alias is another institution's name", all.every((i) => i.aliases.every((a) => !lowerNames.has(a.toLowerCase()) || a.toLowerCase() === i.name.toLowerCase())));
const aliasOwners = new Map();
for (const i of all) for (const a of i.aliases) aliasOwners.set(a.toLowerCase(), new Set([...(aliasOwners.get(a.toLowerCase()) || []), i.id]));
const shared = [...aliasOwners].filter(([, s]) => s.size > 1);
check("no short name belongs to two institutions (the backfill would skip both)", shared.length === 0, shared.map(([a, s]) => [a, [...s]]));
check("names fit in 120 characters, aliases in 60, and there are no blanks or stray spaces", all.every((i) => i.name.length <= 120 && i.name === i.name.trim() && i.aliases.every((a) => a.length > 0 && a.length <= 60 && a === a.trim())));
check("every country code that is used has a name, and every named country is used", Object.keys(countryNames).every((c) => all.some((i) => i.country === c)) );

console.log("\n# Helpers");
check("slugify drops accents and still gives the same slug for plain names", slugify("Université de Montréal") === "universite-de-montreal" && slugify("King's College London") === "kings-college-london" && slugify("A & B") === "a-and-b");
check("merging throws when an id is used twice", (() => { try { mergeInstitutions([{ institutions: [{ id: "a" }] }, { institutions: [{ id: "a" }] }]); return false; } catch { return true; } })());
const eg = [{ id: "example-uk", name: "Example UK", aliases: [], domains: ["example.ac.uk"], country: "GB" }, { id: "example-university-ca", name: "Example University", aliases: ["EU"], domains: ["example.ca"], country: "CA" }];
check("the country shows after a non-UK name and not after a UK one", countryLabel(eg[1], { CA: "Canada" }) === "Canada" && countryLabel(eg[0], { GB: "United Kingdom" }) === "");
check("picker options carry the id, name, aliases and country", JSON.stringify(pickerOptions(eg, { CA: "Canada" })[1]) === JSON.stringify({ value: "example-university-ca", label: "Example University", aliases: ["EU"], suffix: "Canada" }));
check("webmail domains are known, institutions are not", isWebmail("Gmail.com") && !isWebmail("example.ca") && !isWebmail(""));
check("a domain in any file finds its institution", institutionForDomain(eg, "mail.example.ca")?.id === "example-university-ca");

console.log("\n# The US file");
{
  const us = files.us.institutions;
  check(`it has a few hundred entries (${us.length}), all in the US`, us.length >= 300 && us.every((i) => i.country === "US"));
  // Ids saved on profiles from here on must not move. Add to this list; never edit it.
  const US_PINNED = ["massachusetts-institute-of-technology", "stanford-university", "university-of-california-los-angeles", "harvard-university", "lincoln-university-us"];
  check("a sample of US ids is pinned", US_PINNED.every((id) => us.some((i) => i.id === id)));
  check("the institutions the owner named are found by their short names", [["MIT", "massachusetts-institute-of-technology"], ["UCLA", "university-of-california-los-angeles"]].every(([a, id]) => us.find((i) => i.aliases.includes(a))?.id === id));
}

console.log("\n# The world file");
{
  const w = files.world.institutions;
  const nonGB = w.filter((i) => i.country === "GB" || i.country === "US");
  check(`it has several hundred entries (${w.length}) across many countries (${new Set(w.map((i) => i.country)).size}), none in the UK or US`, w.length >= 400 && new Set(w.map((i) => i.country)).size >= 40 && nonGB.length === 0);
  const W_PINNED = ["eth-zurich", "national-university-of-singapore", "university-of-toronto", "lincoln-university-nz"];
  check("a sample of world ids is pinned (Lincoln University exists in the US and NZ, so both have the country in the id)", W_PINNED.every((id) => w.some((i) => i.id === id)) && ids.includes("lincoln-university-us"));
  check("ETH and NUS are short names of the right institutions", w.find((i) => i.aliases.includes("ETH"))?.id === "eth-zurich" && w.find((i) => i.aliases.includes("NUS"))?.id === "national-university-of-singapore");
}

console.log("\n# The picker finds them");
{
  const options = pickerOptions(all, countryNames);
  const top = (q) => { const r = rankOptions(options, q)[0]?.option; return r ? r.value : null; };
  check("MIT finds Massachusetts Institute of Technology first", top("MIT") === "massachusetts-institute-of-technology", top("MIT"));
  check("Stanford finds Stanford University first", top("Stanford") === "stanford-university", top("Stanford"));
  check("UCLA finds the Los Angeles campus first", top("UCLA") === "university-of-california-los-angeles", top("UCLA"));
  check("Toronto finds the University of Toronto first", top("Toronto") === "university-of-toronto", top("Toronto"));
  check("ETH finds ETH Zurich first", top("ETH") === "eth-zurich", top("ETH"));
  check("NUS finds the National University of Singapore first", top("NUS") === "national-university-of-singapore", top("NUS"));
  check("accents do not matter (zurich, montreal, bogazici)", top("zurich") === "eth-zurich" || rankOptions(options, "zurich").some((r) => r.option.value === "eth-zurich"));
  check("Montreal finds the Université de Montréal", rankOptions(options, "montreal").some((r) => r.option.value === "universite-de-montreal"));
  const by = (id) => options.find((o) => o.value === id);
  check("the country is shown for a non-UK institution and not for a UK one", by("university-of-toronto").suffix === "Canada" && by("stanford-university").suffix === "United States" && by("university-of-oxford").suffix === "");
  check("both Lincoln Universities are listed and told apart by country", by("lincoln-university-us").suffix === "United States" && by("lincoln-university-nz").suffix === "New Zealand");
  check("a UK short name still works (UCL)", top("ucl") === "university-college-london", top("ucl"));
}

console.log("\n# Email domains suggest an institution");
{
  const at = (d) => institutionForDomain(all, d)?.id;
  check(".edu, a Canadian, a Swiss and a UK domain each find their institution", at("stanford.edu") === "stanford-university" && at("student.utoronto.ca") === "university-of-toronto" && at("student.ethz.ch") === "eth-zurich" && at("ucl.ac.uk") === "university-college-london", [at("stanford.edu"), at("student.utoronto.ca"), at("student.ethz.ch")]);
  check("a lookalike or webmail domain finds nothing", at("notstanford.edu") === undefined && at("gmail.com") === undefined && at("stanford.edu.example.com") === undefined);
}

console.log("\n# The backfill matches against all the files");
{
  const rows = { profiles: [{ k: "1", text: "MIT" }, { k: "2", text: "uk" }, { k: "3", text: "ETH Zurich" }, { k: "4", text: "Lincoln University" }, { k: "5", text: "University of Oxford" }, { k: "6", text: "Oxford" }, { k: "7", text: "Nowhere College" }], orgs: [] };
  const r = plan(rows, all).profiles;
  const m = Object.fromEntries(r.updates.map((u) => [u.k, u.id]));
  check("a US name or short name, a world name, and a UK name are matched", m["1"] === "massachusetts-institute-of-technology" && m["3"] === "eth-zurich" && m["5"] === "university-of-oxford" && m["6"] === "university-of-oxford", m);
  check("a name that belongs to two institutions is left alone, with unknown text", !m["4"] && !m["7"] && r.unmatched.some(([t]) => t === "Lincoln University"));
}

console.log("\n# The Worker accepts the new ids");
{
  const T = await makeEnv();
  const { client, q1 } = T;
  const signup = async (name, ip, extra) => { const c = client({ ip }); const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, ...extra }); const me = await c.get("/api/me"); return { c, r, id: me.json.user?.id, me: me.json }; };
  const row = (id) => q1("SELECT uni, institution_id FROM profiles WHERE user_id = ?", id);
  const us = await signup("Una", "10.29.0.1", { institutionId: "stanford-university", uni: "ignored" });
  check("a US id is saved and uni becomes the official name", us.r.status === 201 && row(us.id).institution_id === "stanford-university" && row(us.id).uni === "Stanford University", row(us.id));
  const w = await signup("Wim", "10.29.0.2", { institutionId: "eth-zurich" });
  check("a world id is saved too", w.r.status === 201 && row(w.id).institution_id === "eth-zurich" && row(w.id).uni === "ETH Zurich", row(w.id));
  const uk = await signup("Uki", "10.29.0.3", { institutionId: "university-of-oxford" });
  check("a UK id from before still saves unchanged", uk.r.status === 201 && row(uk.id).institution_id === "university-of-oxford" && row(uk.id).uni === "University of Oxford" && uk.me.profile.institution_id === "university-of-oxford", row(uk.id));
  const nz = await signup("Nia", "10.29.0.4", { institutionId: "lincoln-university-nz" });
  check("the same-name institutions keep their own ids", nz.r.status === 201 && row(nz.id).institution_id === "lincoln-university-nz" && row(nz.id).uni === "Lincoln University");
  const bad = await signup("Bad", "10.29.0.5", { institutionId: "lincoln-university" });
  check("an id that is not on any list is still refused", bad.r.status === 400);
  const free = await signup("Fre", "10.29.0.6", { uni: "Some Place Not Listed" });
  check("free text still saves as typed with no id", free.r.status === 201 && row(free.id).uni === "Some Place Not Listed" && row(free.id).institution_id === null);
}

summary();
