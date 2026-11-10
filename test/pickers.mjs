// F08: the search matching behind UiCombobox (src/lib/match.js), and source guards
// for the custom pickers: no native select or date input left in src/, the public
// card loads its calendar lazily, and the /ui-test page is development-only.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { check, summary } from "./harness.mjs";
import { fold, highlight, matchOption, rankOptions } from "../src/lib/match.js";

const opts = [
  { value: "a", label: "Northfield College London", aliases: ["NCL", "Northfield"] },
  { value: "b", label: "Example University of Technology", aliases: ["EUT"] },
  { value: "c", label: "Zürich Example Institute" },
  { value: "d", label: "Université Exemple" },
  { value: "e", label: "Old Example College" },
];

console.log("\n# Matching");
check("fold ignores case and accents, one character for one", fold("Zürich ÉCOLE") === "zurich ecole" && fold("Zürich").length === 6);
check("an empty query returns everything in the original order", rankOptions(opts, "").map((r) => r.option.value).join("") === "abcde");
check("an alias finds the long official name (ncl)", rankOptions(opts, "ncl")[0].option.value === "a");
check("an exact alias beats a partial label match (eut)", rankOptions(opts, "eut")[0].option.value === "b");
check("the alias that matched is reported", rankOptions(opts, "ncl")[0].via === "NCL");
check("accents are ignored both ways (zurich, universite)", rankOptions(opts, "zurich")[0].option.value === "c" && rankOptions(opts, "universite")[0].option.value === "d");
check("case is ignored", rankOptions(opts, "NORTHFIELD")[0].option.value === "a");
check("a label that starts with the query comes before one that only contains it", rankOptions(opts, "example").map((r) => r.option.value).join("") === "bce");
check("every word must match, in any order (college example)", rankOptions(opts, "college example").map((r) => r.option.value).join("") === "e");
check("both college names are found by coll", rankOptions(opts, "coll").map((r) => r.option.value).sort().join("") === "ae");
check("no match gives an empty list", rankOptions(opts, "zzzz").length === 0);
check("matchOption returns null for no match", matchOption(opts[0], "qqq") === null);

console.log("\n# Highlighting");
const hl = highlight("Old Example College", matchOption(opts[4], "coll").ranges);
check("the matched part is split out", hl.map((p) => (p.hit ? "[" + p.text + "]" : p.text)).join("") === "Old Example [Coll]ege");
const hl2 = highlight("Zürich Example Institute", rankOptions(opts, "zurich")[0].ranges);
check("highlighting an accented word uses the original letters", hl2[0].hit && hl2[0].text === "Zürich");
check("two words highlight two places", highlight("Old Example College", matchOption(opts[4], "old coll").ranges).filter((p) => p.hit).length === 2);

console.log("\n# No native select or date controls (source guards)");
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const vueFiles = (d) => readdirSync(new URL("../" + d, import.meta.url), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? vueFiles(join(d, e.name)) : e.name.endsWith(".vue") ? [join(d, e.name)] : []));
const native = /<select[\s>]|type="(?:date|datetime-local|time|month|week)"/;
const left = vueFiles("src").filter((f) => native.test(read(f)));
check("no <select>, type=date or type=datetime-local is left in src/", left.length === 0, left);
// The remind-me calendar lives in the "Your connection" panel (CardConnection.vue, its own chunk since F28),
// which PublicCard loads with a plain import() only for a connected viewer. Neither file may import the pickers statically.
const pub = read("src/views/PublicCard.vue"), panel = read("src/components/CardConnection.vue");
check("PublicCard does not import the date picker or the panel statically", !/^import .*ui\/Ui/m.test(pub) && !/^import .*CardConnection/m.test(pub) && /import\("\.\.\/components\/CardConnection\.vue"\)/.test(pub));
check("the connection panel does not import the date picker statically, it loads it when tapped", !/^import .*ui\/Ui/m.test(panel) && /import\("\.\.\/components\/ui\/UiDatePicker\.vue"\)/.test(panel));
check("the connection panel uses the bare date picker", /<component :is="DatePicker"[^>]*bare/.test(panel));
const router = read("src/router/index.js") + read("src/router/routes.attendee.js"); // the main site's route table moved out of index.js in F10
check("the /ui-test route exists only in development", /import\.meta\.env\.DEV \? \[\{ path: "\/ui-test"/.test(router));
const sheetCode = read("src/components/ui/UiSheet.vue").replace(/\/\/.*|<!--[\s\S]*?-->/g, "");
check("UiSheet uses no Teleport, useId or <slot> (keeps the shared Vue chunk small)", !/Teleport|useId|<slot/.test(sheetCode));

summary();
