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


// ---------------------------------------------------------------------------------------------------------
// F40: motion for sheets, panels and tabs. Source guards (what the eye sees is checked in a browser; see the
// F40 plan note): the tokens exist, nothing is longer than 300 ms, a thing leaves faster than it arrives,
// only transform and opacity move, and one global rule turns slides into short fades.
// ---------------------------------------------------------------------------------------------------------
const SRC = walk("src").filter((f) => /\.(vue|css)$/.test(f));
// Every style rule text in the app: main.css and the <style> blocks of every component.
const styleOf = (f) => (f.endsWith(".css") ? read(f) : [...read(f).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n"));
const ALL_CSS = SRC.map((f) => [f, styleOf(f)]).filter(([, t]) => t);
const rootBlock = /:root \{([\s\S]*?)\n\}/.exec(css)?.[1] || "";
const token = (n) => new RegExp(`--${n}:\s*([^;]+);`).exec(rootBlock)?.[1].trim();
const ms = (v) => (v?.endsWith("ms") ? parseFloat(v) : v?.endsWith("s") ? parseFloat(v) * 1000 : NaN);

console.log("\n# F40.1 Motion tokens and the reduced-motion rule");
const TOKENS = ["ease-out", "ease-in", "dur-fast", "dur-fast-out", "dur", "dur-out", "dur-sheet", "dur-sheet-out", "slide", "slide-fade", "shift"];
check("every motion token is defined in :root", TOKENS.every((t) => token(t) !== undefined), TOKENS.filter((t) => token(t) === undefined));
check("the curves are the two cubic-béziers (out for arriving, in for leaving)", /^cubic-bezier\(/.test(token("ease-out")) && /^cubic-bezier\(/.test(token("ease-in")));
const DURS = ["dur-fast", "dur-fast-out", "dur", "dur-out", "dur-sheet", "dur-sheet-out"];
check("no duration token is longer than 300 ms", DURS.every((t) => ms(token(t)) <= 300 && ms(token(t)) > 0), DURS.map((t) => token(t)));
check("a thing leaves faster than it arrives (the sheet exit is about 70% of the enter)", ms(token("dur-sheet-out")) < ms(token("dur-sheet")) && ms(token("dur-out")) < ms(token("dur")) && ms(token("dur-fast-out")) < ms(token("dur-fast")) && ms(token("dur-sheet-out")) / ms(token("dur-sheet")) <= 0.8);
const reduceRoot = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{\s*:root \{([^}]*)\}\s*\}/g)];
check("one global prefers-reduced-motion rule redefines the tokens", reduceRoot.length === 1);
const rr = reduceRoot[0]?.[1] || "";
check("under reduced motion a slide has no distance and fades instead (slide 0, slide-fade 0, shift 0)", /--slide:\s*0px/.test(rr) && /--slide-fade:\s*0;/.test(rr) && /--shift:\s*0px/.test(rr));
check("under reduced motion every duration is under 150 ms", DURS.every((t) => ms(new RegExp(`--${t}:\s*([^;]+);`).exec(rr)?.[1].trim()) < 150));
const frames = ALL_CSS.flatMap(([f, t]) => [...t.matchAll(/@keyframes ([\w-]+) \{([\s\S]*?\})\s*\}/g)].map((m) => [f, m[1], m[2]]));
const badFrames = frames.filter(([, name, body]) => name !== "sk-in" && [...body.matchAll(/([\w-]+)\s*:/g)].some((m) => !["opacity", "transform"].includes(m[1])));
check(`only transform and opacity move in any keyframes (${frames.length} checked; sk-in only flips visibility)`, frames.length > 8 && badFrames.length === 0, badFrames.map((f) => f[0] + " " + f[1]));

console.log("\n# F40.2 UiSheet: enter, exit, swipe down");
const sheetSrc = read("src/components/ui/UiSheet.vue").replace(/\r\n/g, "\n");
const sheetScript = sheetSrc.slice(0, sheetSrc.indexOf("</script>"));
const sheetTpl = sheetSrc.slice(sheetSrc.indexOf("<template>"), sheetSrc.indexOf("<style"));
const sheetCss = styleOf("src/components/ui/UiSheet.vue");
const fnBody = (src, name) => { const i = src.indexOf(`function ${name}(`); return i < 0 ? "" : src.slice(i, src.indexOf("\n}\n", i)); };
check("UiSheet keeps the layer in the page while it leaves (shown / leaving), and the layer is v-if shown, not v-if open", /const shown = ref\(false\)/.test(sheetScript) && /const leaving = ref\(false\)/.test(sheetScript) && /v-if="shown"/.test(sheetTpl) && !/v-if="open"/.test(sheetTpl));
check("the leaving layer carries .is-leaving", /'is-leaving': leaving/.test(sheetTpl));
check("a bottom sheet slides down on leaving, a modal and a popover drop and fade, and the dim fades", /\.ui-layer\.is-sheet\.is-leaving \.ui-panel \{[^}]*animation: m-sheet-out var\(--dur-sheet-out\)/.test(sheetCss) && /\.ui-layer\.is-modal\.is-leaving \.ui-panel \{[^}]*animation: m-pop-out/.test(sheetCss) && /\.ui-layer\.is-leaving \.ui-panel \{[^}]*animation: m-pop-out var\(--dur-fast-out\)/.test(sheetCss) && /is-sheet\.is-leaving::before \{[^}]*animation: m-fade-out/.test(sheetCss));
check("a sheet slides up (not 12 px) on opening, from --slide", /\.is-sheet \.ui-panel \{[^}]*animation: m-sheet-in var\(--dur-sheet\)/.test(sheetCss) && /@keyframes m-sheet-in \{ from \{ transform: translateY\(var\(--slide\)\)/.test(css));
check("a layer that is leaving takes no clicks, panel included (no invisible backdrop in the way)", /\.ui-layer\.is-leaving, \.ui-layer\.is-leaving \.ui-panel \{ pointer-events: none; \}/.test(sheetCss));
check("the dim is a pseudo-element, so it fades while the panel slides", /\.ui-layer\.is-sheet::before, \.ui-layer\.is-modal::before \{[^}]*opacity: var\(--dim, 1\)/.test(sheetCss) && !/\.ui-layer\.is-sheet \{[^}]*background:/.test(sheetCss));
check("no duration is written out in UiSheet's rules (only the tokens)", !/animation:[^;]*\b\d+(ms|s)\b/.test(sheetCss.replace(/var\([^)]*\)/g, "")));
check("Escape and a press outside stop counting at once, before the exit (detach in closed)", /function closed\(\) \{\s*detach\(\);/.test(sheetScript));
check("the page behind and focus wait for the exit: release() runs from finish() and unmount only, never from closed()", !/release\(\)/.test(fnBody(sheetScript, "closed")) && /release\(\);/.test(fnBody(sheetScript, "finish")) && /setBehind\(false\)/.test(fnBody(sheetScript, "release")) && /\.focus\?\.\(/.test(fnBody(sheetScript, "release")));
check("the exit ends on animationend for an exit animation, with a timer of no more than 300 ms behind it", /@animationend="onEnd"/.test(sheetTpl) && /\/\^m-\.\+-out\$\/\.test\(e\.animationName\)/.test(sheetScript) && Number(/setTimeout\(finish, (\d+)\)/.exec(sheetScript)?.[1]) <= 300);
check("opening again during the exit keeps one layer and does not lock the page twice", /const again = shown\.value/.test(sheetScript) && /if \(!lockedBy\) \{ lockedBy = true; setBehind\(true\); \}/.test(sheetScript));
check("UiSheet loads the swipe code with a plain import() when a phone sheet opens, never statically", /import\("\.\.\/\.\.\/lib\/sheetSwipe"\)/.test(sheetScript) && !/^import .*sheetSwipe/m.test(sheetScript));
check("UiSheet still uses no Teleport, Transition or <slot> (they would add to the Vue chunk every public page loads)", !/Teleport|<Transition|TransitionGroup|<slot/.test((sheetScript + sheetTpl).replace(/\/\/.*|<!--[\s\S]*?-->/g, "")));

// The swipe, run against stand-ins for the sheet: a short drag springs back, a long drag or a flick closes,
// and nothing closes while the sheet's content is scrolled or the finger goes up or sideways.
{
  const { swipeClose } = await import("../src/lib/sheetSwipe.js");
  globalThis.window ||= { addEventListener() {}, removeEventListener() {} };
  globalThis.matchMedia ||= (q) => ({ matches: /max-width: 599px/.test(q) }); // a phone
  let now = 0;
  const realNow = Date.now;
  Date.now = () => now;
  const make = (opts = {}) => {
    const handlers = {};
    const layerProps = {};
    const style = {};
    const layer = { style: { setProperty: (k, v) => { layerProps[k] = v; }, removeProperty: (k) => { delete layerProps[k]; } } };
    const panel = {
      scrollTop: 0, offsetHeight: 400, parentElement: layer, style,
      addEventListener: (n, f) => { handlers[n] = f; }, removeEventListener: (n) => { delete handlers[n]; },
      closest: () => (opts.leaving ? {} : null),
    };
    let closed = 0;
    const off = swipeClose(panel, () => { closed++; });
    const target = Object.assign({ scrollTop: 0, parentElement: panel, matches: () => false }, opts.target || {});
    const touch = (type, x, y) => ({ target, touches: type === "touchend" ? [] : [{ clientX: x, clientY: y }], cancelable: true, preventDefault() { this.prevented = true; } });
    const drag = (dx, dy, ms) => {
      handlers.touchstart(touch("touchstart", 100, 300));
      const events = [];
      for (let i = 1; i <= 5; i++) { now += ms / 5; const e = touch("touchmove", 100 + (dx * i) / 5, 300 + (dy * i) / 5); handlers.touchmove(e); events.push(e); }
      handlers.touchend(touch("touchend", 100 + dx, 300 + dy));
      return events;
    };
    return { panel, style, drag, closed: () => closed, off, layerProps, handlers };
  };
  let s = make();
  s.drag(0, 60, 600);
  check("a short, slow drag (60 of 400 px) springs back and does not close", s.closed() === 0 && s.style.transform === "" && /transform var\(--dur\) var\(--ease-out\)/.test(s.style.transition));
  s = make();
  const ev = s.drag(0, 160, 600);
  check("a drag past 30% of the height (160 of 400 px) closes, and the page's own scroll is stopped meanwhile", s.closed() === 1 && ev.every((e) => e.prevented));
  s = make();
  s.drag(0, 30, 40);
  check("a quick flick closes even when short (30 px in 40 ms)", s.closed() === 1);
  s = make();
  s.drag(0, 5, 20);
  check("a tap or a 5 px wobble closes nothing and moves nothing", s.closed() === 0 && s.style.transform === undefined);
  s = make();
  s.panel.scrollTop = 20;
  s.drag(0, 300, 300);
  check("a sheet scrolled down is never closed by a drag (the content scrolls instead)", s.closed() === 0 && s.style.transform === undefined);
  s = make({ target: { scrollTop: 15 } });
  s.drag(0, 300, 300);
  check("a list inside the sheet that is scrolled down is left alone too", s.closed() === 0);
  s = make();
  s.drag(0, -300, 300);
  check("dragging up never closes", s.closed() === 0);
  s = make();
  s.drag(200, 120, 300);
  check("a mostly sideways drag never closes", s.closed() === 0);
  s = make({ target: { matches: (q) => /range/.test(q) } });
  s.drag(0, 300, 300);
  check("a range slider inside a sheet keeps its own drag", s.closed() === 0);
  s = make({ leaving: true });
  s.drag(0, 200, 300);
  check("when the owner closes it, the sheet is left where the finger let go for the exit to carry on from", s.closed() === 1 && s.style.transform === "translateY(200px)");
  s = make();
  s.off();
  check("taking the swipe off removes every listener and its inline styles", Object.keys(s.handlers).length === 0 && s.style.transform === "");
  Date.now = realNow;
}

console.log("\n# F40.3 The connect sheet, the follow-up composer, People search and the global .sheet styles");
const SHEETS = ["src/components/ConnectSheet.vue", "src/components/FollowupComposer.vue", "src/components/PeopleAsk.vue"];
for (const f of SHEETS) {
  const src = read(f).replace(/\r\n/g, "\n");
  const script = src.slice(0, src.indexOf("</script>"));
  const tpl = src.slice(src.indexOf("<template>"), src.lastIndexOf("</template>") + 11);
  const name = f.split("/").pop();
  check(`${name} asks lib/sheetMotion.js to close instead of emitting at once, so it can slide out first`, /import \{ useSheetExit \} from "\.\.\/lib\/sheetMotion"/.test(script) && /const \{ leaving, close \} = useSheetExit\(emit, root\)/.test(script));
  check(`${name}: the backdrop carries .is-leaving, the panel is the swipe's root, and nothing emits "close" directly any more`, /class="sheet-backdrop" :class="\{ 'is-leaving': leaving \}"/.test(tpl) && /<section ref="root" class="sheet"/.test(tpl) && !/emit\(["']close["']\)/.test(src));
  check(`${name}: Escape and the backdrop and every Close go through close()`, /e\.key === "Escape"\) \{?[^}]*close\(\)/.test(script) && /@click\.self="close\(\)"/.test(tpl));
}
const sheetMotion = read("src/lib/sheetMotion.js").replace(/\r\n/g, "\n");
const mainSheetCss = css.slice(css.indexOf("/* ---------- Bottom sheet"), css.indexOf("/* ---------- Waiting (F38)"));
check("the global .sheet slides up on opening and down on leaving, its dim fades beside it, and a leaving backdrop takes no clicks", /\.sheet \{[^}]*animation: m-sheet-in var\(--dur-sheet\) var\(--ease-out\)/.test(mainSheetCss) && /\.sheet-backdrop\.is-leaving \.sheet \{ animation: m-sheet-out var\(--dur-sheet-out\) var\(--ease-in\) forwards; \}/.test(mainSheetCss) && /\.sheet-backdrop\.is-leaving::before \{ animation: m-fade-out/.test(mainSheetCss) && /\.sheet-backdrop\.is-leaving \{ pointer-events: none; \}/.test(mainSheetCss));
check("the sheet's dim is a pseudo-element (the backdrop itself has no background to fade the sheet with it)", /\.sheet-backdrop \{[^}]*\}/.exec(mainSheetCss) && !/background/.test(/\.sheet-backdrop \{([^}]*)\}/.exec(mainSheetCss)[1]) && /\.sheet-backdrop::before \{[^}]*opacity: var\(--dim, 1\)/.test(mainSheetCss));
check("the .sheet handle is a larger touch target and the top row cannot be panned (so a finger can drag it)", /\.sheet-handle \{[^}]*touch-action: none/.test(mainSheetCss) && /\.sheet-handle::before/.test(mainSheetCss) && /\.sheet-head \{[^}]*touch-action: none/.test(mainSheetCss));
check("the swipe stays a chunk of its own with nothing behind it: UiSheet and sheetMotion both load it with a plain import(), never statically", /import\("\.\/sheetSwipe\.js"\)/.test(sheetMotion) && !/^import .*sheetSwipe/m.test(sheetMotion) && !/^import /m.test(read("src/lib/sheetSwipe.js")));
check("the exit wait is at least the slowest exit and at most 300 ms", Number(/EXIT_MS = (\d+)/.exec(sheetMotion)?.[1]) >= ms(token("dur-sheet-out")) && Number(/EXIT_MS = (\d+)/.exec(sheetMotion)?.[1]) <= 300);
{
  // useSheetExit against a stand-in emit: nothing is emitted until the exit time has passed, a second press changes
  // nothing, and a different event can carry a value (the photo cropper's "done").
  const warn = console.warn;
  console.warn = () => {};
  const { useSheetExit, EXIT_MS } = await import("../src/lib/sheetMotion.js");
  const emitted = [];
  const { leaving, close } = useSheetExit((...a) => emitted.push(a), { value: null });
  const b = useSheetExit((...a) => emitted.push(a), { value: null }, "close");
  close();
  close();
  const early = emitted.length === 0 && leaving.value === true;
  await new Promise((r) => setTimeout(r, EXIT_MS + 80));
  check("close() marks the sheet as leaving at once and emits close once, only after the exit time", early && emitted.length === 1 && emitted[0][0] === "close");
  console.warn = warn;
  b.close("done", "photo.png");
  await new Promise((r) => setTimeout(r, EXIT_MS + 80));
  check("close('done', value) emits that event and its value after the exit", emitted.at(-1)?.[0] === "done" && emitted.at(-1)?.[1] === "photo.png");
}
{
  const card = read("src/views/PublicCard.vue").replace(/\r\n/g, "\n").replace(/\/\/.*/g, "");
  check("the card page fetches the connect sheet with a plain import() beside the card (never imports it statically), so its first load stays under the budget", /import\("\.\.\/components\/ConnectSheet\.vue"\)/.test(card) && !/^import .*ConnectSheet/m.test(card) && !/defineAsyncComponent/.test(card) && /v-if="sheetOpen && view && ConnectSheet"/.test(card));
  check("no public page imports the sheet motion or swipe code statically", PUBLIC.every((n) => !/sheetMotion|sheetSwipe/.test(read(`src/views/${n}.vue`))) && ["src/main.js", "src/App.vue", "src/lib/store.js", "src/lib/api.js"].every((f) => !/sheetMotion|sheetSwipe/.test(read(f))));
}

console.log("\n# F40.4 Event preview panel, check-in dialog, Lightbox, photo cropper, Terms pop-up");
const lbSrc = read("src/components/Lightbox.vue").replace(/\r\n/g, "\n");
const lbCss = styleOf("src/components/Lightbox.vue");
{
  const { lightbox, openPhoto, closePhoto } = await import("../src/lib/lightbox.js");
  openPhoto("a.png", "First");
  const opened = lightbox.open === true && lightbox.src === "a.png";
  closePhoto();
  check("the Lightbox: closing hides it but keeps the photo for the fade, and opening another replaces it", opened && lightbox.open === false && lightbox.src === "a.png" && (openPhoto("b.png", "Second"), lightbox.src === "b.png" && lightbox.open === true));
  openPhoto(null);
  check("openPhoto with nothing to show changes nothing", lightbox.src === "b.png");
  closePhoto();
}
check("the Lightbox stays in the page (no v-if on the overlay), and its .open class is what shows it", !/class="lb"[^>]*v-if|v-if="[^"]*"\s+class="lb"/.test(lbSrc) && /class="lb" :class="\{ open: lightbox\.open \}"/.test(lbSrc));
check("a closed Lightbox is invisible, takes no clicks and is out of the tab and reading order (visibility), and only after the fade", /\.lb \{[^}]*opacity: 0; visibility: hidden; pointer-events: none;[^}]*transition: opacity var\(--dur-out\) var\(--ease-in\), visibility 0s linear var\(--dur-out\)/.test(lbCss) && /\.lb\.open \{[^}]*opacity: 1; visibility: visible; pointer-events: auto;[^}]*transition: opacity var\(--dur\) var\(--ease-out\), visibility 0s/.test(lbCss));
check("the page behind scrolls again only after the fade, and a photo opened again in that time keeps the lock", /clearTimeout\(unlock\)/.test(lbSrc) && /setTimeout\(\(\) => \{ document\.body\.style\.overflow = ""; \}, 160\)/.test(lbSrc) && 160 >= ms(token("dur-out")) && 160 <= 300);
check("Lightbox has no keyframes of its own left (its old lb-in is replaced by the transition and the tokens)", !/@keyframes lb-in|animation:/.test(lbCss));

const cropSrc = read("src/components/PhotoCropper.vue").replace(/\r\n/g, "\n");
const cropCss = styleOf("src/components/PhotoCropper.vue");
check("the photo cropper fades out before it goes: Cancel, Escape and Use photo all go through close(), none emits directly", /useSheetExit\(emit, null, "cancel"\)/.test(cropSrc) && /close\("done", url\)/.test(cropSrc) && /e\.key === "Escape"\) close\(\)/.test(cropSrc) && !/emit\(["'](cancel|done)["']/.test(cropSrc) && /class="crop-backdrop" :class="\{ 'is-leaving': leaving \}"/.test(cropSrc));
check("the cropper's dim and box fade and drop in, and out faster, and a leaving cropper takes no clicks", /\.crop-backdrop::before \{[^}]*animation: m-fade var\(--dur\)/.test(cropCss) && /\.crop-sheet \{[^}]*animation: m-pop-in var\(--dur\)/.test(cropCss) && /\.crop-backdrop\.is-leaving \.crop-sheet \{ animation: m-pop-out var\(--dur-out\)/.test(cropCss) && /\.crop-backdrop\.is-leaving \{ pointer-events: none; \}/.test(cropCss) && !/\.crop-backdrop \{[^}]*background:/.test(cropCss));
const tgCss = styleOf("src/components/TermsGate.vue");
check("the Terms pop-up fades in and drops in, with no exit (it cannot be dismissed)", /\.tg-backdrop::before \{[^}]*animation: m-fade var\(--dur\)/.test(tgCss) && /\.tg-sheet \{[^}]*animation: m-pop-in var\(--dur\)/.test(tgCss) && !/is-leaving/.test(read("src/components/TermsGate.vue")) && !/\.tg-backdrop \{[^}]*background:/.test(tgCss));

const pvSrc = read("src/components/EventPreview.vue").replace(/\r\n/g, "\n");
const pvScript = pvSrc.slice(0, pvSrc.indexOf("</script>"));
const pvCss = styleOf("src/components/EventPreview.vue");
check("the preview panel waits for its exit: hide() marks it leaving, then hides it and gives focus back to the Preview button", /function hide\(\) \{\s*if \(!open\.value \|\| leaving\.value\) return;\s*leaving\.value = true;\s*leaveTimer = setTimeout\(\(\) => \{\s*open\.value = leaving\.value = false;\s*nextTick\(\(\) => opener\?\.focus\?\.\(\)\);/.test(pvScript) && Number(/\}, (\d+)\);\n\}/.exec(pvScript)?.[1]) <= 300);
check("the preview panel slides in from the right and out again (below 1000 px), and takes no clicks while leaving", /\.pv-side\.open \{[^}]*animation: m-side-in var\(--dur-sheet\) var\(--ease-in|\.pv-side\.open \{[^}]*animation: m-side-in var\(--dur-sheet\) var\(--ease-out\)/.test(pvCss) && /\.pv-side\.open\.is-leaving \{ pointer-events: none; animation: m-side-out var\(--dur-sheet-out\) var\(--ease-in\) forwards; \}/.test(pvCss) && /'is-leaving': leaving/.test(pvSrc));
check("opening the preview again mid-exit keeps one panel, and widening the window clears the timer", /clearTimeout\(leaveTimer\);\s*leaving\.value = false;/.test(pvScript) && /onWide = \(e\) => \{ if \(e\.matches\) \{ clearTimeout\(leaveTimer\)/.test(pvScript) && /clearTimeout\(timer\); clearTimeout\(leaveTimer\)/.test(pvScript));

const dialogCss = css.slice(css.indexOf("/* A native <dialog>"), css.indexOf("/* ---------- Waiting (F38)"));
const pageSrc = read("src/components/EventPage.vue").replace(/\r\n/g, "\n");
check("the check-in dialog drops in and fades out with CSS alone: transitions on opacity and transform, display and overlay allowed to be discrete, a starting style, and its dim fades too", /\.collect-dialog, \.collect-dialog::backdrop \{\s*opacity: 0;\s*transition: opacity var\(--dur-out\) var\(--ease-in\), transform var\(--dur-out\) var\(--ease-in\),\s*overlay var\(--dur-out\) allow-discrete, display var\(--dur-out\) allow-discrete;/.test(dialogCss) && /\.collect-dialog\[open\], \.collect-dialog\[open\]::backdrop \{\s*opacity: 1;/.test(dialogCss) && /@starting-style \{[^}]*\.collect-dialog\[open\]\s*\{[^}]*opacity: 0/.test(dialogCss) && /\.collect-dialog\[open\]::backdrop \{ opacity: 0; \}/.test(dialogCss));
check("the check-in page gained no script for it (still showModal() and close() on a native dialog, no timer)", /info\.value\?\.showModal\?\.\(\)/.test(pageSrc) && /info\.value\?\.close\?\.\(\)/.test(pageSrc) && !/setTimeout|animationend|transitionend/.test(pageSrc));

console.log("\n# F40.5 Content arriving: panels, list rows and new pages");
const arriveCss = css.slice(css.indexOf("/* Content that has just loaded"), css.indexOf("/* A native <dialog>"));
check("the glide and stagger tokens exist, and both are 0 under reduced motion (a tab indicator jumps, rows arrive together)", token("dur-glide") === "200ms" && token("stagger") === "30ms" && /--dur-glide:\s*0ms/.test(rr) && /--stagger:\s*0ms/.test(rr));
check("panels, empty notes and tab panels fade in as they arrive", /\.in-app :is\(\.panel, \.empty, \.album-grid, \.perk-list, \[role="tabpanel"\]\) \{ animation: m-fade var\(--dur\) var\(--ease-out\) backwards; \}/.test(arriveCss));
check("the first six rows of a list rise in 30 ms apart (the token), and the seventh onward do not move", /\.in-app \.list-row:nth-child\(-n\+6\) \{ animation: m-rise var\(--dur-fast\) var\(--ease-out\) calc\(var\(--i, 0\) \* var\(--stagger\)\) backwards; \}/.test(arriveCss) && [2, 3, 4, 5, 6].every((n) => new RegExp(`\\.in-app \\.list-row:nth-child\\(${n}\\) \\{ --i: ${n - 1}; \\}`).test(arriveCss)) && !/nth-child\((7|8|9)\)/.test(arriveCss));
check("the whole stagger takes no more than 300 ms (5 gaps plus one row's rise)", 5 * ms(token("stagger")) + ms(token("dur-fast")) <= 300);
check("arrival animations are scoped to the signed-in frame and the host pages (.in-app), never to public pages", arriveCss.split("\n").filter((l) => /\.(panel|list-row|empty)\b/.test(l) && /\{/.test(l)).every((l) => l.startsWith(".in-app")) && ["Admin", "HostAccount", "HostBilling", "HostDashboard", "HostLive"].every((n) => /class="wide-col in-app /.test(read(`src/views/${n}.vue`))) && /class="wide-col in-app /.test(read("src/components/HostRedeem.vue")) && !/in-app/.test(read("src/views/Hosts.vue")) && PUBLIC.every((n) => !/in-app/.test(read(`src/views/${n}.vue`))));
const shellSrc = read("src/components/AppShell.vue").replace(/\r\n/g, "\n");
check("a new page in the signed-in frame fades in at once and the old page is not waited for: a keyed wrapper, no <Transition>, no mode=\"out-in\"", /<main class="app-col in-app">/.test(shellSrc) && /<div :key="pageKey" :class="\{ 'page-in': moved \}"><router-view \/><\/div>/.test(shellSrc) && !/Transition|out-in/.test(shellSrc));
check("the page key is the route record, and the first page does not fade (it comes with the frame)", /r\.matched\[r\.matched\.length - 1\]\?\.path \|\| r\.path/.test(shellSrc) && /watch\(pageKey, \(\) => \{ moved\.value = true; \}\)/.test(shellSrc));
check("the page fade is the quick token (120 ms), opacity only", /\.page-in \{ animation: m-fade var\(--dur-fast\) var\(--ease-out\); \}/.test(arriveCss) && ms(token("dur-fast")) === 120);
check("no Vue <Transition>, <TransitionGroup>, mode=\"out-in\" or animation library anywhere in src (each would add to the Vue chunk every public page loads, or wait for the old page)", !SRC.some((f) => f.endsWith(".vue") && /<Transition|<transition|TransitionGroup|mode="out-in"/.test(read(f).replace(/<!--[\s\S]*?-->|\/\/.*/g, ""))) && !/"(framer-motion|gsap|animejs|@vueuse\/motion|motion|auto-animate|@formkit\/auto-animate)"/.test(read("package.json")));

console.log("\n# F40.6 Tab indicators, details, small label swaps, and the whole app's motion rules");
const shell6 = read("src/components/AppShell.vue").replace(/\r\n/g, "\n");
const tabCss = css.slice(css.indexOf("/* ---------- Bottom tab bar"), css.indexOf("/* ---------- Landing"));
check("the tab bar has one indicator that slides between the four columns with transform, not a bar per tab", /\.tabbar-inner::before \{[^}]*transform: translateX\(calc\(var\(--tab, 0\) \* 100%\)\);[^}]*transition: transform var\(--dur-glide\) var\(--ease-out\)/.test(tabCss) && !/\.tab(\.on)?::before/.test(tabCss) && !/transition:[^;]*(width|left|margin)/.test(tabCss));
check("AppShell hands the open tab's number to it, and hides it on a page that is none of the tabs", /const activeTab = computed\(\(\) => tabs\.findIndex\(\(t\) => t\.match\(r\.path\)\)\)/.test(shell6) && /:class="\{ 'no-tab': activeTab < 0 \}" :style="\{ '--tab': Math\.max\(activeTab, 0\) \}"/.test(shell6) && /\.tabbar-inner\.no-tab::before \{ opacity: 0; \}/.test(tabCss));

// The sliding bar of a segmented control, run against stand-ins for the buttons and the observers.
{
  const { glideSeg } = await import("../src/lib/segGlide.js");
  const frames = [];
  const watchers = [];
  globalThis.requestAnimationFrame = (fn) => frames.push(fn);
  globalThis.ResizeObserver = class { constructor(fn) { this.fn = fn; watchers.push(this); } observe() {} disconnect() { this.off = true; } };
  globalThis.MutationObserver = class { constructor(fn) { this.fn = fn; watchers.push(this); } observe() {} disconnect() { this.off = true; } };
  const vars = {};
  const classes = new Set();
  let on = { offsetLeft: 80, offsetTop: 0, offsetWidth: 96, offsetHeight: 40 };
  const el = { style: { setProperty: (k, v) => { vars[k] = String(v); } }, classList: { contains: (c) => classes.has(c), add: (c) => classes.add(c) }, querySelector: (q) => (q === ".seg-btn.on" ? on : null) };
  const stop = glideSeg(el);
  check("the bar is placed on the open button (left, top, width, height) and the control is marked as gliding", vars["--x"] === "80px" && vars["--y"] === "0px" && vars["--w"] === "96" && vars["--h"] === "40" && classes.has("glides"));
  check("the slide is switched on only two frames later, so the first placement does not move", !classes.has("ready") && frames.length === 1 && (frames.shift()(), frames.length === 1) && !classes.has("ready") && (frames.shift()(), classes.has("ready")));
  on = { offsetLeft: 200, offsetTop: 44, offsetWidth: 70, offsetHeight: 40 }; // another tab, on a second line
  watchers.find((w) => w instanceof MutationObserver).fn();
  check("a changed tab or a wrapped line is measured again, and the new place is handed to the CSS", vars["--x"] === "200px" && vars["--y"] === "44px" && vars["--w"] === "70" && frames.length === 0);
  stop();
  check("stopping it lets go of both observers", watchers.length === 2 && watchers.every((w) => w.off));
  on = null;
  const quiet = { ...el, querySelector: () => null };
  check("a control with no open button is left alone", (glideSeg(quiet)(), true));
}
const segCss = css.slice(css.indexOf("/* A control that glides"), css.indexOf("@media (prefers-reduced-motion: reduce) {\n  .shutter-flash"));
check("the gliding bar is one pseudo-element moved and stretched with transform only, under the buttons, and the move is off until the first draw", /\.seg\.glides::before \{[^}]*transform: translate\(var\(--x, 0px\), var\(--y, 0px\)\) scale\(var\(--w, 0\), var\(--h, 0\)\);/.test(segCss) && /\.seg\.glides \.seg-btn \{ position: relative; z-index: 1; \}/.test(segCss) && /\.seg\.glides\.ready::before \{ transition: transform var\(--dur-glide\) var\(--ease-out\); \}/.test(segCss) && !/transition:[^;]*(width|height|left|top)/.test(segCss));
const live6 = read("src/views/HostLive.vue").replace(/\r\n/g, "\n");
check("the host event page's tabs use it, and let go of it when the page goes", /import \{ glideSeg \} from "\.\.\/lib\/segGlide"/.test(live6) && /<div :ref="glide" class="seg host-tabs" role="tablist"/.test(live6) && /stopGlide\?\.\(\)/.test(live6));
check("no entry or public file imports the glide code (it is host-only)", ["src/main.js", "src/App.vue", "src/lib/store.js", "src/lib/api.js", "src/components/AppShell.vue"].every((f) => !/segGlide/.test(read(f))) && PUBLIC.every((n) => !/segGlide/.test(read(`src/views/${n}.vue`))));
const detailsCss = css.slice(css.indexOf("/* A <details> opens"), css.indexOf("/* A native <dialog>"));
check("a <details> eases open and closed where the browser can (interpolate-size and ::details-content), closing quicker, and is left alone elsewhere", /@supports \(interpolate-size: allow-keywords\) and selector\(::details-content\) \{/.test(detailsCss) && /details \{ interpolate-size: allow-keywords; \}/.test(detailsCss) && /details::details-content \{[^}]*block-size: 0;[^}]*transition: block-size var\(--dur-out\) var\(--ease-in\), content-visibility var\(--dur-out\) allow-discrete;/.test(detailsCss) && /details\[open\]::details-content \{[^}]*block-size: auto;[^}]*transition: block-size var\(--dur\) var\(--ease-out\), content-visibility var\(--dur\) allow-discrete;/.test(detailsCss) && !/interpolate-size/.test(css.replace(detailsCss, "")));
check("a message that appears (Saved, Copied) and a button's new label fade in; the label is a keyed span so it is a new element when it changes", /\.success-text, \[role="status"\]:not\(\.visually-hidden\)\) \{ animation: m-fade var\(--dur-fast\)/.test(css) && /\.swap \{ animation: m-fade var\(--dur-fast\)/.test(css) && [["src/components/EventDrops.vue", /<span :key="copied === d\.id" class="swap">/], ["src/components/FeedbackSummary.vue", /<span :key="!!copied" class="swap">/], ["src/components/HostDrops.vue", /<span :key="!!copiedLink" class="swap">/], ["src/views/EditProfile.vue", /<span :key="busy \? 1 : saved \? 2 : 0" class="swap">/]].every(([f, re]) => re.test(read(f))));

// The motion bar for the whole app: only transform and opacity move, nothing is longer than 300 ms, and every
// duration comes from a token (the skeleton and the camera flash, which F38 and the first release made, are named).
const ALLOWED = new Set(["opacity", "transform", "visibility", "overlay", "display", "content-visibility", "block-size"]);
const decls = ALL_CSS.flatMap(([f, t]) => [...t.matchAll(/(?<![-\w])(transition|animation)(-property)?\s*:\s*([^;}]+)/g)].map((m) => [f, m[1], m[3].trim()]));
const badTransitions = decls.filter(([, kind, v]) => kind === "transition" && v !== "none" && v.split(/,(?![^(]*\))/).some((part) => !ALLOWED.has(part.trim().split(/\s+/)[0])));
check(`every transition in the app moves only transform or opacity (or flips visibility, display, overlay, content-visibility, or a details panel's block-size) (${decls.filter((d) => d[1] === "transition").length} checked)`, badTransitions.length === 0, badTransitions);
const NAMED = /sk-|shutter|scan-pop|0\.12s/;
const longOnes = decls.filter(([, , v]) => !NAMED.test(v)).flatMap(([f, kind, v]) => [...v.replace(/var\([^)]*\)/g, "").matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)].map((m) => [f, kind, v, ms(m[1] + m[2])]).filter((x) => x[3] > 300));
check("no animation or transition is written with a time over 300 ms (the tokens are the only long ones, and none is over 300)", longOnes.length === 0, longOnes);
const literal = decls.filter(([f, , v]) => !NAMED.test(v) && !/^(none|var\()/.test(v) && /(?<![\w.-])\d*\.?\d+(ms|s)\b/.test(v.replace(/var\([^)]*\)/g, "").replace(/\b0s\b/g, "")) && !/main\.css/.test(f));
check("components write no duration of their own: they use the tokens", literal.length === 0, literal.map((d) => d.join(" ")));

console.log("\n# F40.7 What the browser check found: a sheet must still be whole while it leaves");
check("UiSheet shows what it showed last while it leaves, because a parent clears what the content was about (the voucher, the person) when it closes", /let last = null;\s*const Body = \(\) => \(!props\.open && last \? last : \(last = slots\.default\?\.\(\{ sheet: isSheet\.value \}\)\)\);/.test(sheetScript) && /last = null;\s*release\(\);/.test(fnBody(sheetScript, "finish")));
{
  // No page may take a sheet out of the page by itself when it closes: that would skip the exit. A condition on the
  // tag that only says whether the feature exists at all is fine; one that is the open state is not.
  const offenders = [];
  for (const f of SRC.filter((x) => x.endsWith(".vue"))) {
    const src = read(f).replace(/\r\n/g, "\n");
    for (const m of src.matchAll(/<UiSheet\b[^>]*>/g)) {
      const cond = /v-if="([^"]+)"/.exec(m[0])?.[1];
      const open = /:open="([^"]+)"/.exec(m[0])?.[1] || "";
      if (cond && open && open.replace(/^!+/, "").split(/[\s.?]/)[0] && new RegExp(`\\b${open.replace(/^!+/, "").split(/[\s.?]/)[0]}\\b`).test(cond)) offenders.push(`${f}: ${m[0].slice(0, 80)}`);
    }
    // The bare date picker (a public card's reminder) is mounted once it has loaded and opened by its `open` prop.
    for (const m of src.matchAll(/<component :is="DatePicker"[^>]*>/g)) if (/v-if="[^"]*(picking|pickingDate)/.test(m[0])) offenders.push(`${f}: ${m[0].slice(0, 80)}`);
  }
  check("no page unmounts a sheet or the bare date picker with its own v-if when it closes (the exit would never play)", offenders.length === 0, offenders);
}

summary();
