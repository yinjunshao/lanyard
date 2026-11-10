// F12: the institution list and picker. The list's shape and stable ids, the
// helpers, then (added by later F12 tasks) storage, API, backfill and source guards.
// Run: node test/institutions.mjs
import { readFileSync } from "node:fs";
import { check, summary } from "./harness.mjs";
import { slugify, institutionOptions, institutionForDomain, institutionForText } from "../src/lib/institutions.js";

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
const opts = institutionOptions(list);
check("options are { value, label, aliases }", opts.length === list.length && opts[0].value === list[0].id && opts[0].label === list[0].name && Array.isArray(opts[0].aliases));
const ex = [{ id: "example-university", name: "Example University", aliases: ["EU"], domains: ["example.ac.uk"] }, { id: "other", name: "Other", aliases: ["Example University"], domains: [] }];
check("a domain finds its institution", institutionForDomain(ex, "example.ac.uk")?.id === "example-university");
check("a subdomain finds it too, in any case", institutionForDomain(ex, "Students.Example.AC.uk")?.id === "example-university");
check("a lookalike domain does not", institutionForDomain(ex, "notexample.ac.uk") === null && institutionForDomain(ex, "gmail.com") === null && institutionForDomain(ex, "") === null);
check("text matches a name or alias exactly, ignoring case", institutionForText(ex, "  eu ")?.id === "example-university");
check("text that matches two institutions matches none", institutionForText(ex, "example university") === null);
check("partial text matches none", institutionForText(ex, "Example") === null);

summary();
