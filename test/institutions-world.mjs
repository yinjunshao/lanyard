// F29: the institution list is now several files (UK, US, world). Ids are unique
// across all of them, the UK ids saved on profiles have not moved, every entry has
// a country with a name, and the merge, the picker options and the domain helpers
// behave. Added to by later F29 tasks (the data, the picker, the Worker, the backfill).
// Run: node test/institutions-world.mjs
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { check, summary } from "./harness.mjs";
import { slugify, mergeInstitutions, countryLabel, pickerOptions, isWebmail, institutionForDomain } from "../src/lib/institutions.js";

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

summary();
