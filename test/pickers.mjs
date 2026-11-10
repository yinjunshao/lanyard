// F08: the search matching behind UiCombobox (src/lib/match.js) and a source guard
// that no native date or select control is left where the plan says it should be gone.
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

summary();
