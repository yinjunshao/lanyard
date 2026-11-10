// F05 and F06: source guards for the My card tab icon and the quiet buttons on /app.
// The look is checked in a browser (see the F05 and F06 plan notes); this guards the wiring.
import { readFileSync } from "node:fs";
import { check, summary } from "./harness.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

console.log("\n# F05 QR icon for the My card tab");
const icon = read("src/components/Icon.vue");
check("Icon.vue has a qr glyph", /^\s*qr: '/m.test(icon));
const app = read("src/components/AppShell.vue"); // the tab bar lives in the /app frame, loaded only for /app pages (F28)
check("the My card tab uses the qr icon", /key: "card", icon: "qr"/.test(app));
check("the tab bar draws t.icon, falling back to t.key", app.includes('<Icon v-else :name="t.icon || t.key" />'));

console.log("\n# F15 Events tab");
check("the Events glyph is drawn in the frame, not in Icon.vue (public pages load Icon.vue)", /const TICKET =/.test(app) && !/^\s*events: '/m.test(icon));
check("the frame draws a tab's own glyph at the same size and stroke as Icon.vue", /viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"\s+stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" v-html="t.paths"/.test(app));
const keys = [...app.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
check("the tab bar has four tabs, My card, Scan, People, Events, in that order", keys.join() === "card,scan,people,events", keys);
check("the Events tab opens /app/events and stays on for the hub", /to: "\/app\/events", key: "events", label: "Events", paths: TICKET, match: \(p\) => p\.startsWith\("\/app\/events"\)/.test(app));
const cssAll = read("src/styles/main.css");
check("the tab bar grid has four columns", /\.tabbar-inner \{[^}]*grid-template-columns: repeat\(4, 1fr\)/.test(cssAll));
check("the ongoing dot also says so in words for a screen reader", /class="tab-dot" aria-hidden="true"/.test(app) && /visually-hidden">, an event is on now</.test(app));
check("the tab dot uses tokens only", !/#[0-9a-f]{3,8}\b/i.test(/\.tab-dot \{([^}]*)\}/.exec(cssAll)?.[1] || "#"));

console.log("\n# F06 Edit profile and Cards buttons");
const css = read("src/styles/main.css");
const quiet = /\.btn-quiet \{([^}]*)\}/.exec(css);
check(".btn-quiet is defined in main.css", !!quiet);
check(".btn-quiet uses tokens only (no hard-coded colours)", !!quiet && !/#[0-9a-f]{3,8}\b|rgba?\(/i.test(quiet[1]) && /var\(--rule\)|var\(--border\)/.test(quiet[1]) && /var\(--ink\)/.test(quiet[1]));
check(".btn-quiet has no shadow or hover", !!quiet && !/box-shadow/.test(quiet[1]) && !/\.btn-quiet:hover/.test(css));
const mycard = read("src/views/MyCard.vue");
check("MyCard has Edit profile and Cards as .btn-quiet links",
  /<router-link to="\/app\/profile" class="btn-quiet">Edit profile<\/router-link>/.test(mycard) &&
  /<router-link to="\/app\/cards" class="btn-quiet">Cards<\/router-link>/.test(mycard));
check("the old Edit and Cards text links are gone from MyCard", !/class="topbar-link">(Edit|Cards)</.test(mycard));

summary();
