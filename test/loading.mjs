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


console.log("\n# F38.4 Signed-in app");
const SIGNED_IN = ["views/People", "views/Events", "views/EventDetail", "views/Person", "views/Feedback", "views/Welcome", "views/Settings", "components/FollowupComposer"];
// Every page or panel that waits uses Waiting, and Try again calls a function that exists in that file.
function usesWaiting(path, minCount = 1) {
  const src = read(`src/${path}.vue`);
  const tags = [...src.matchAll(/<Waiting\b[^>]*>/g)].map((m) => m[0]);
  const name = path.split("/").pop();
  check(`${name} imports Waiting and uses it ${minCount > 1 ? `(${minCount} places)` : ""}`, /^import Waiting from "(\.\.\/components\/|\.\/)Waiting\.vue";/m.test(src) && tags.length >= minCount, tags.length);
  check(`${name}: every Waiting says what it is loading (a label)`, tags.length > 0 && tags.every((t) => /label="[^"]{6,}"/.test(t)));
  for (const t of tags) {
    const fn = /:retry="(\w+)"/.exec(t)?.[1];
    if (fn) check(`${name}: Try again calls ${fn}, which is declared`, new RegExp(String.raw`function ${fn}\b|const ${fn} =`).test(src));
  }
  check(`${name}: no bare Loading text left`, !/>\s*(Loading|Opening)[^<]*…<\/p>/.test(src));
  return src;
}
for (const p of SIGNED_IN) usesWaiting(p, p.endsWith("EventDetail") ? 3 : 1);
const ev = read("src/views/EventDetail.vue");
check("the Room and Album tabs wait with rows, not with 'No one else yet'", /<Waiting v-if="roomWait"[^>]*\/>\s*<div v-else-if="!room\.length"/.test(ev) && /<Waiting v-if="albumWait"[^>]*\/>\s*<div v-else-if="!album\.length"/.test(ev));
check("the Room and Album flags are cleared in a finally, so a failed request cannot leave them waiting", /finally \{ roomWait\.value = false; \}/.test(ev) && /finally \{ albumWait\.value = false; \}/.test(ev));
const settings = read("src/views/Settings.vue");
check("Settings shows panels while a page's code loads, only for a real page (not the list)", /<Waiting v-else-if="!isIndex" shape="panel"/.test(settings));
check("Settings Try again loads the page's code again", /:retry="\(\) => loadPage\(key\)"/.test(settings) && /async function loadPage\(k\)/.test(settings));
// Only signed-in, host and admin files import Waiting; the shared entry files and every public page stay clear (D043).
import { readdirSync, statSync } from "node:fs";
const walk = (d) => readdirSync(new URL("../" + d, import.meta.url)).flatMap((f) => (statSync(new URL("../" + d + "/" + f, import.meta.url)).isDirectory() ? walk(d + "/" + f) : [d + "/" + f]));
const SHARED = ["src/main.js", "src/App.vue", "src/lib/api.js", "src/lib/store.js", "src/lib/profile.js", "src/components/Icon.vue", "src/components/Badge.vue", "src/components/CardView.vue", ...walk("src/router")];
check("the shared entry files do not import Waiting", SHARED.every((f) => !/Waiting/.test(read(f))), SHARED.filter((f) => /Waiting/.test(read(f))));
check("Waiting is imported only from views and components, never from lib or the router", walk("src").filter((f) => /\bWaiting\.vue"/.test(read(f)) && !/^src\/(views|components)\//.test(f)).length === 0);


console.log("\n# F38.5 Host site and Admin");
for (const p of ["views/HostDashboard", "views/HostAccount", "views/HostBilling", "components/HostAttendees", "components/HostDrops", "components/HostRedeem", "components/FeedbackSummary", "views/Admin"]) usesWaiting(p);
const live = usesWaiting("views/HostLive", 3);
check("the live page shows its shape while it loads (it showed nothing at all before)", /<Waiting v-if="!live && !error && !signedOut" stats shape="panel"/.test(live));
check("the live page's Try again starts the page's load again, and does not stack a second poll", /async function load\(\) \{[^}]*signedOut\.value = false;/.test(live) && /clearInterval\(timer\);\s*timer = setInterval\(refresh, 5000\)/.test(live) && /onMounted\(load\)/.test(live));
check("the Feedback and Report tabs wait in the same way", /<Waiting v-if="!fb && !fbErr"/.test(live) && /<Waiting v-if="reportLoading && !report"/.test(live));
for (const [p, text] of [["HostPresent", "Opening the event"], ["HostPrint", "Getting the poster ready"]]) {
  const src = read(`src/views/${p}.vue`);
  check(`${p} says it is opening, as a polite status, while the event loads`, new RegExp(`<p v-else-if="!ev" class="[^"]*" role="status" aria-busy="true">${text}…`).test(src));
  check(`${p} offers Try again after 8 seconds with CSS alone`, /<a class="sk-late" href="">Taking longer than usual\. Try again<\/a>/.test(src) && /\.sk-late \{[^}]*visibility: hidden[^}]*animation: sk-in 1ms 8s forwards/.test(waitingCss));
}
check("Admin waits while the queue has not arrived, and stops waiting on an error", /<Waiting v-if="!queue && !error"/.test(read("src/views/Admin.vue")));
check("HostDrops waits again when it loads again (Try again, or after a change)", /async function load\(\) \{\s*loading\.value = true;/.test(read("src/components/HostDrops.vue")));
// Nothing that waits on the network is left as a bare "Loading…" line. Two are deliberate: Connect.vue is not
// routed anywhere (F28 notes it), and CopiedFacts is a one-line status inside the create form.
const BARE = /(<p|<span)[^>]*>\s*(Loading|Opening|Checking the code|Building|Reading its)[^<]*(…|\.\.\.)\s*<\/(p|span)>/;
const left = walk("src").filter((f) => f.endsWith(".vue") && BARE.test(read(f)) && !/Connect\.vue$|CopiedFacts\.vue$|HostPresent\.vue$/.test(f));
check("no page or panel is left with a bare Loading line", left.length === 0, left);

// The card page had a few inline styles; they moved to main.css (global CSS is not counted in the JS
// budget) to pay for the skeleton's markup. Keep it that way: each inline style is bytes of script.
const cardTpl = read("src/views/PublicCard.vue");
check("the card page's selfie panel and header are styled in main.css, not inline", !/style="(justify-content|max-width|margin:0)/.test(cardTpl) && /\.selfie-ask img \{[^}]*max-width: 100%/.test(css) && /\.profile-top \{[^}]*justify-content: space-between/.test(css));


console.log("\n# F38.6 Buttons that send something cannot be pressed twice");
check("useBusy().once ignores a second press while the first waits, and always lets go", /if \(working\.value\) return;\s*working\.value = run;\s*try \{ return await fn\(\.\.\.args\); \} finally \{ working\.value = null; \}/.test(waiting));
check("useBusy lives in Waiting.vue, so it adds no chunk name to the entry that public pages load", /export function useBusy\(\)/.test(waiting) && !walk("src").some((f) => /lib\/busy/.test(f)));
// The pattern, checked across every view and component:
//  1. a button or form whose handler sends something (a POST, PUT, DELETE, or a host or admin call) is disabled while it waits;
//  2. the handler itself ignores a second call: it is wrapped in once(), starts with a guard, or sets its busy flag before its first await.
const WRITE = /(Api\.(?!me\b|connections\b|connection\b|home\b|event\b|room\b|album\b|myEvents\b|feedbackForm\b|eventChoices\b|consentHistory\b|sessions\b|getCard\b|personalNote\b|promo\b|resolveCode\b)\w+|HostApi\.\w+|api\([^)]*"(POST|PUT|DELETE|PATCH)"|call\([^)]*"(POST|PUT|DELETE)")/;
const BTN = /<button(?:[^>"']|"[^"]*"|'[^']*')*>/g;
const FORM = /<form(?:[^>"']|"[^"]*"|'[^']*')*@submit(?:\.\w+)*="(\w+)[^"]*"(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/form>/g;
const hasDisabled = (t) => /:disabled=|\sdisabled[\s>=]/.test(t);
// Reads, local changes and handlers that guard themselves through a wrapper: named so a new send button is not waved through by accident.
const NOT_SENDING = new Set(["load", "loadHosts", "loadRequests", "addTag", "claim"]);
const problems = [];
let senders = 0;
for (const f of walk("src").filter((p) => p.endsWith(".vue"))) {
  const src = read(f).replace(/\r\n/g, "\n");
  const script = src.slice(0, src.indexOf("</script>"));
  const tpl = src.slice(src.indexOf("<template>"));
  const fns = new Map();
  for (const m of script.matchAll(/(?:async function (\w+)\([^)]*\)\s*\{|const (\w+) = (once\()?async \([^)]*\) => \{?)/g)) {
    const name = m[1] || m[2];
    const rest = script.slice(m.index + m[0].length);
    const end = rest.search(/\n(?:async function|function|const \w+ = (?:once\()?(?:async )?\(|onMounted|watch\()/);
    const body = rest.slice(0, end < 0 ? rest.length : end);
    if (/await/.test(body) && WRITE.test(body) && !NOT_SENDING.has(name)) fns.set(name, { body, once: !!m[3] });
  }
  const bound = []; // [handler, opening tag text(s)]
  for (const m of tpl.matchAll(BTN)) { const h = /@click(?:\.\w+)*="(\w+)(?:\([^"]*\))?"/.exec(m[0])?.[1]; if (h && fns.has(h)) bound.push([h, m[0]]); }
  for (const m of tpl.matchAll(FORM)) {
    if (!fns.has(m[1])) continue;
    for (const b of m[2].matchAll(BTN)) if (!/type="button"|@click/.test(b[0])) bound.push([m[1], b[0]]);
  }
  for (const [h, tag] of bound) {
    senders++;
    if (!hasDisabled(tag)) problems.push(`${f}: ${h} has a button that is not disabled while it waits`);
  }
  for (const h of new Set(bound.map((b) => b[0]))) {
    const { body, once } = fns.get(h);
    const beforeAwait = body.slice(0, body.indexOf("await"));
    const guarded = once || /if \([^)]*\) return/.test(beforeAwait) || /\.value = (true|"[^"]+"|`[^`]*`|[\w.]+ \+ )/.test(beforeAwait) || /^\s*(return )?(await )?act\(/.test(body);
    if (!guarded) problems.push(`${f}: ${h}() would run twice if called twice`);
  }
}
check(`every button or form that sends something is disabled while it waits and its handler ignores a second call (${senders} checked)`, problems.length === 0 && senders > 60, problems);

summary();
