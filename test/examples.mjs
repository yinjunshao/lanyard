// F52: rotating examples and better link examples. The pools in src/lib/examples.js fit their fields, stay general
// (not hackathon-led) and name no university or society; RotatingHint is decoration over a real, static placeholder,
// moves only with the motion tokens, and is used on the four fields; the link rows show LinkedIn then Instagram.
// The look and the slide are checked in a browser (see the F52 plan note).
// Run: node test/examples.mjs
import { readFileSync } from "node:fs";
import { check, summary } from "./harness.mjs";
import { HEADLINE_EXAMPLES, WISH_EXAMPLES, HEADLINE_MAX, WISH_MAX, headlineExamples, linkPlaceholder } from "../src/lib/examples.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const all = [...HEADLINE_EXAMPLES.student, ...HEADLINE_EXAMPLES.career, ...WISH_EXAMPLES];
const EMOJI = /\p{Extended_Pictographic}/u;

console.log("\n# F52 The pools");
check("the limits are the fields' own maxlength (80 and 120)", HEADLINE_MAX === 80 && WISH_MAX === 120);
check("every headline example fits 80 characters", [...HEADLINE_EXAMPLES.student, ...HEADLINE_EXAMPLES.career].every((s) => s.length <= HEADLINE_MAX && s.length >= 8),
  [...HEADLINE_EXAMPLES.student, ...HEADLINE_EXAMPLES.career].filter((s) => s.length > HEADLINE_MAX));
check("every wish example fits 120 characters", WISH_EXAMPLES.every((s) => s.length <= WISH_MAX && s.length >= 5));
check("each pool has 8 to 12 examples", [HEADLINE_EXAMPLES.student, HEADLINE_EXAMPLES.career, WISH_EXAMPLES].every((p) => p.length >= 8 && p.length <= 12));
check("no example repeats (ignoring case)", new Set(all.map((s) => s.toLowerCase())).size === all.length);
check("no 'hackathon' in any headline or wish pool", !all.some((s) => /hackathon/i.test(s)));
check("no emoji, no full stop at the end, no double space", !all.some((s) => EMOJI.test(s) || /\.$/.test(s) || /\s{2}/.test(s)));
check("the pools are general: finance, law, health and design all appear in the headlines", ["financ|invest|equity|account", "law|solicitor", "nurs|medic|health", "design"]
  .every((re) => [...HEADLINE_EXAMPLES.student, ...HEADLINE_EXAMPLES.career].some((s) => new RegExp(re, "i").test(s))));
check("headlineExamples picks Career for career and Student for anything else", headlineExamples("career") === HEADLINE_EXAMPLES.career
  && headlineExamples("student") === HEADLINE_EXAMPLES.student && headlineExamples(undefined) === HEADLINE_EXAMPLES.student);
const copy = read("test/copycheck.mjs");
check("the F03 copy check scans src/ and has no allowance for examples.js (so no named university or society)", /walk\(join\(root, "src"\)|"src"/.test(copy) && !/examples\.js/.test(copy));

console.log("\n# F52 Link examples");
check("the first row is linkedin.com/in/you and the second instagram.com/you", linkPlaceholder(0) === "linkedin.com/in/you" && linkPlaceholder(1) === "instagram.com/you");
check("a third row and beyond is a plain website", linkPlaceholder(2) === "yourwebsite.com" && linkPlaceholder(9) === "yourwebsite.com");
check("the placeholders differ", new Set([0, 1, 2].map(linkPlaceholder)).size === 3);
const links = read("src/components/welcome/StepLinks.vue"), edit = read("src/views/EditProfile.vue");
check("the links step and Edit profile draw each row's placeholder from linkPlaceholder(i)", /:placeholder="linkPlaceholder\(i\)"/.test(links) && /:placeholder="linkPlaceholder\(i\)"/.test(edit));
check("neither writes linkedin.com/in/you as a fixed placeholder any more", !/ placeholder="linkedin\.com/.test(links + edit));
check("the links step help names LinkedIn, Instagram and a portfolio, not GitHub", /LinkedIn, Instagram, a portfolio\. People tap them straight from your card\. You can skip this\./.test(links));

console.log("\n# F52 RotatingHint");
const hint = read("src/components/ui/RotatingHint.vue");
check("the overlay is aria-hidden and the input's own placeholder comes through the slot", /class="rot-hint-text" aria-hidden="true"/.test(hint) && /<slot :placeholder="placeholder">/.test(hint));
check("the static placeholder is 'e.g. ' plus the first example", /props\.prefix \+ props\.pool\[0\]/.test(hint) && /prefix: \{ type: String, default: "e\.g\. " \}/.test(hint));
check("it shows only while the field is empty, so the first keystroke removes it", /v-if="!off && empty && n"/.test(hint));
check("it pauses while the tab is hidden and clears its timer", /document\.hidden/.test(hint) && /clearInterval\(timer\)/.test(hint));
check("it rotates about every 3.5 seconds from a random start", /every: \{ type: Number, default: 3500 \}/.test(hint) && /Math\.random\(\)/.test(hint));
check("no Vue <Transition> and no library", !/<Transition|<TransitionGroup/.test(hint) && [...hint.matchAll(/^import .* from "([^"]+)"/gm)].every((m) => m[1] === "vue"));
const css = read("src/styles/main.css");
check("the overlay takes no clicks (they reach the input)", /\.rot-hint-text \{[^}]*pointer-events: none/.test(css));
check("the real placeholder is drawn clear only while the overlay is up", /\.rot-hint\.rot-on ::placeholder \{ color: transparent; \}/.test(css));
check("the slide uses the motion tokens, transform and opacity only, under 300 ms",
  /@keyframes m-hint-out \{ to \{ opacity: 0; transform: translateY\(calc\(var\(--shift\) \* -1\.5\)\); \} \}/.test(css)
  && /@keyframes m-hint-in \{ from \{ opacity: 0; transform: translateY\(calc\(var\(--shift\) \* 1\.5\)\); \} \}/.test(css)
  && /\.rot-hint-line\.rot-in \{ animation: m-hint-in var\(--dur\) var\(--ease-out\)/.test(css)
  && /\.rot-hint-line\.rot-out \{ animation: m-hint-out var\(--dur-out\) var\(--ease-in\)/.test(css));
check("the old line travels up and the new rises from below (opposite signs)", /m-hint-out[^}]*-1\.5/.test(css) && /m-hint-in[^}]*\* 1\.5/.test(css));
check("reduced motion needs no rule of its own: the tokens it redefines (--shift 0px, shorter times) make it a fade", /prefers-reduced-motion: reduce\) \{\s*:root \{[^}]*--shift: 0px/.test(css) && !/rot-hint[^{]*\{[^}]*prefers-reduced/.test(css));

console.log("\n# F52 Where it is used");
const uses = [["src/components/welcome/StepFor.vue", "the welcome headline"], ["src/views/EditProfile.vue", "Edit profile's headline"],
  ["src/components/CardForm.vue", "a card's headline"],
  // F60 replaced the presence wish with "What are you hoping to get from this event?" on the check-in page and the hub.
  ["src/components/EventPage.vue", "the check-in intention"], ["src/components/EventWhoToMeet.vue", "the hub's intention"]];
for (const [f, what] of uses) {
  const t = read(f);
  check(`${what} uses RotatingHint with the placeholder it hands over`, /<RotatingHint /.test(t) && /v-slot="\{ placeholder \}"/.test(t) && /:placeholder="[^"]*placeholder"/.test(t));
}
check("a card shows an example only when the profile has no headline (the profile's own line stays the placeholder)", /:off="!!me\.profile\?\.headline"/.test(read("src/components/CardForm.vue")) && /me\.profile\?\.headline \|\| placeholder/.test(read("src/components/CardForm.vue")));
check("the intention fields (F60, in place of the presence wish) use the intention pool and keep their 120 limit", ["src/components/EventPage.vue", "src/components/EventWhoToMeet.vue"].every((f) => /:pool="INTENTION_EXAMPLES"/.test(read(f)) && /:maxlength="INTENTION_MAX"/.test(read(f))) && !/<input id="presence-wish"/.test(read("src/components/EventPresence.vue")));
check("no public page imports the examples or the hint", ["Landing", "PublicCard", "Hosts", "Privacy", "Terms", "Redeem", "SignIn", "PrivacyRequest", "EventJoin"]
  .every((n) => !/examples|RotatingHint/.test(read(`src/views/${n}.vue`))));
check("no old fixed headline example is left", !/Building robots and Roblox|e\.g\. Building robots/.test(["StepFor.vue", "../CardForm.vue", "../../views/EditProfile.vue"].map((f) => read("src/components/welcome/" + f)).join("")));

summary();
