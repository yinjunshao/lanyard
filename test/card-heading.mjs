// F72: My card and Events each have one heading; the card switcher sits under Edit profile and Cards.
//   Source guards (the look is checked in a browser, see the F72 plan note).
// Run: node test/card-heading.mjs
import { readFileSync, readdirSync } from "node:fs";
import { check, summary } from "./harness.mjs";
import { parse } from "@vue/compiler-sfc";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const tpl = (p) => parse(read(p)).descriptor.template.content;

console.log("\n# F72 My card: one heading, \"My card\"");
const my = tpl("src/views/MyCard.vue");
{
  const allViews = readdirSync(new URL("../src/", import.meta.url), { recursive: true }).filter((f) => /\.(vue|js)$/.test(f)).map((f) => read("src/" + f.split("\\").join("/"))).join("\n");
  check("\"Your badge\" and \"Make your badge\" are nowhere in src/", !/Your badge|Make your badge/.test(allViews));
  const h1s = [...my.matchAll(/<h1\b[^>]*>([^<]*)<\/h1>/g)].map((m) => m[1].trim());
  check("both states (no card yet, and a card) have an h1 \"My card\" and no other h1", h1s.length === 2 && h1s.every((t) => t === "My card"), h1s);
  check("there is no small \"My card\" label over a heading any more", !/<span class="label">My card<\/span>/.test(my));
  check("the empty state keeps its sub line and the Set up button", /<p class="sub">Fill in your details once, then show your card at every event\.<\/p>/.test(my) && /Set up your card/.test(my));
  check("Edit profile and Cards are still the two quiet links in .card-actions", /<div class="card-actions">\s*<router-link to="\/app\/profile" class="btn-quiet">Edit profile<\/router-link>\s*<router-link to="\/app\/cards" class="btn-quiet">Cards<\/router-link>\s*<\/div>/.test(my));
}

console.log("\n# F72 The card switcher sits directly under Edit profile and Cards");
{
  const sw = my.match(/<UiSelect [^>]*label="Switch card"[^>]*\/>/g) || [];
  check("one \"Switch card\" selector, same model and options as before", sw.length === 1 && /v-model="selectedId"/.test(sw[0]) && /:options="cardOptions"/.test(sw[0]), sw);
  const at = (s) => my.indexOf(s);
  check("it comes after the heading and action row and before the finish panels and the badge", at("class=\"card-actions\"") < at("Switch card") && at("Switch card") < at("aria-label=\"Finish your card\"") && at("Switch card") < at("<Badge"));
  check("nothing else sits between the action row and the switcher", /<\/router-link>\s*<\/div>\s*<\/div>\s*<UiSelect [^>]*label="Switch card"/.test(my));
  check("it is not at the bottom any more (the last thing is the Share and Download row)", !/Download PNG<\/button>\s*<\/div>\s*<UiSelect/.test(my));
}

console.log("\n# F72 Events: one heading");
const ev = tpl("src/views/Events.vue");
{
  const h1s = [...ev.matchAll(/<h1\b[^>]*>([^<]*)<\/h1>/g)].map((m) => m[1].trim());
  check("Events has one h1, \"Events\"", h1s.length === 1 && h1s[0] === "Events", h1s);
  check("the \"Your events\" label above it is gone", !/<span class="label">Your events<\/span>/.test(ev));
  check("the attendee events page does not say \"Your events\" in a label", !/class="label">Your events</.test(read("src/views/Events.vue")));
  check("the host dashboard is not touched (it still has its own \"Your events\" label)", /class="label">Your events</.test(read("src/views/HostDashboard.vue")));
}
summary();
