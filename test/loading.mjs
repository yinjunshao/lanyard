// F38: loading states. Source guards (the look is checked in a browser with the network slowed; see the
// F38 plan note): the skeleton is CSS only and stops under reduced motion, every waiting region is
// aria-busy with ONE polite message, a slow page offers Try again, public pages stay light, and every
// button that sends something is disabled while it waits.
// Run: node test/loading.mjs
import { readFileSync } from "node:fs";
import { check, summary } from "./harness.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const css = read("src/styles/main.css");
const waitingCss = css.slice(css.indexOf("/* ---------- Waiting (F38)"));

console.log("\n# F38.2 The skeleton style");
check("the waiting block exists in main.css", waitingCss.length > 100 && css.includes("Waiting (F38)"));
check("blocks use tokens only (paper and ink greys, no hard-coded colour)", !/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(waitingCss));
check("a block is the --rule grey on paper", /\.sk \{[^}]*background: var\(--rule\)/.test(waitingCss));
check("the sweep is one animation on the wrapper, not on every block", /\.sk-wrap::after \{[^}]*animation: sk-sweep/.test(waitingCss) && !/\.sk\s*\{[^}]*animation/.test(waitingCss));
check("the sweep is gentle (about 2 seconds, soft ink band)", /sk-sweep 1\.[5-9]s|sk-sweep 2/.test(waitingCss) && /color-mix\(in srgb, var\(--ink\) [1-9]%/.test(waitingCss));
const reduce = /@media \(prefers-reduced-motion: reduce\) \{([^}]*\{[^}]*\}[^}]*)\}/.exec(waitingCss);
check("the sweep stops under prefers-reduced-motion", !!reduce && /\.sk-wrap::after \{[^}]*animation: none/.test(reduce[1]));
check("the QR square pulse stops under prefers-reduced-motion", !!reduce && /\.badge-qr canvas:not\(\[width\]\) \{[^}]*animation: none/.test(reduce[1]));
check("no skeleton animation is infinite without a reduced-motion off switch", [...waitingCss.matchAll(/animation:[^;]*infinite/g)].length === 2 && !!reduce);
check("the QR placeholder shows only until the library sets the canvas size", /\.badge-qr canvas:not\(\[width\]\) \{[^}]*background: var\(--rule\)/.test(waitingCss));
check("the start-up splash has a note after 8 seconds, with no script", /\.boot-splash::after \{[^}]*animation: sk-in 1ms 8s forwards/.test(waitingCss) && /Taking longer than usual/.test(waitingCss));
check("the timed note starts hidden (visibility), so it never shifts the page", /\.sk-slow \{[^}]*visibility: hidden[^}]*animation: sk-in 1ms 8s forwards/.test(waitingCss) && /\.sk-profile \.sk-slow \{[^}]*position: absolute/.test(waitingCss));

const waiting = read("src/components/Waiting.vue");
check("Waiting.vue marks its region aria-busy", /class="sk-wrap" aria-busy="true"/.test(waiting));
check("Waiting.vue has exactly one polite status line, not one per block", (waiting.match(/role="status"/g) || []).length === 1);
check("Waiting.vue hides its blocks from a screen reader", /class="sk-body" aria-hidden="true"/.test(waiting));
check("Waiting.vue waits 8 seconds before the slow note", /slowMs: \{ type: Number, default: 8000 \}/.test(waiting));
check("Waiting.vue offers Try again after that, and its timer is cleared on unmount", />Try again</.test(waiting) && /onBeforeUnmount\(\(\) => clearTimeout\(timer\)\)/.test(waiting));
check("Waiting.vue says it is taking longer than usual", /This is taking longer than usual/.test(waiting));
check("Waiting.vue draws no colour of its own", !/#[0-9a-f]{3,8}\b|style="[^"]*(color|background)/i.test(waiting));

console.log("\n# F38.3 Public pages: CSS only, no new module");
const PUBLIC = ["Landing", "PublicCard", "Hosts", "Privacy", "Terms", "Redeem", "SignIn", "PrivacyRequest", "EventJoin"];
const importsOf = (src) => [...src.matchAll(/^import [^\n]*from "([^"]+)"/gm)].map((m) => m[1]);
for (const name of PUBLIC) {
  const src = read(`src/views/${name}.vue`);
  check(`${name} does not import the Waiting component`, !importsOf(src).some((i) => /Waiting/.test(i)), importsOf(src));
}
// What the two pages that wait imported before F38 (commit 07c94e6), so a new import shows up here.
const BEFORE = {
  PublicCard: ["../lib/store", "vue", "vue-router", "../lib/api", "../components/CardView.vue", "../lib/lightbox", "../components/ConnectSheet.vue", "../lib/profile"],
  EventJoin: ["vue", "vue-router", "../lib/api", "../lib/store", "../components/EventPage.vue"],
};
for (const name of ["PublicCard", "EventJoin"]) {
  const imports = importsOf(read(`src/views/${name}.vue`));
  check(`${name} imports nothing new for its skeleton`, imports.every((i) => BEFORE[name].includes(i)), imports);
}
for (const [name, text] of [["PublicCard", "Loading card"], ["Redeem", "Checking the code"], ["EventJoin", "Opening event"]]) {
  const src = read(`src/views/${name}.vue`);
  const tpl = src.slice(src.indexOf("<template>"));
  const sk = tpl.slice(tpl.indexOf('class="sk-wrap'), tpl.indexOf("</a></div>") + 10);
  check(`${name} shows a skeleton while it waits, aria-busy, with one polite line`, /^class="sk-wrap[^"]*" aria-busy="true"/.test(sk) && new RegExp(`role="status">${text}`).test(sk) && (sk.match(/role="status"/g) || []).length === 1);
  check(`${name} offers Try again after 8 seconds with CSS alone (a link, no timer in the page)`, /<a class="sk-slow" href="">Try again<\/a>/.test(tpl) && !/setTimeout/.test(src));
  check(`${name} skeleton blocks hold no text (decorative)`, !/<span class="sk[^"]*">[^<]/.test(tpl));
}
check("the card skeleton is one element drawn by CSS (strap, photo, name, headline)", /class="sk-wrap sk-profile"/.test(read("src/views/PublicCard.vue")) && /\.sk-profile \{[^}]*linear-gradient/.test(waitingCss));
check("the bare Loading words are gone from the public pages", !PUBLIC.some((n) => />(Loading…|Opening event…|Checking the code…)<\/p>/.test(read(`src/views/${n}.vue`))));

summary();
