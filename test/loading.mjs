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
check("the timed note starts hidden (visibility), so it never shifts the page", /\.sk-slow \{[^}]*position: absolute[^}]*visibility: hidden[^}]*8s/.test(waitingCss));

const waiting = read("src/components/Waiting.vue");
check("Waiting.vue marks its region aria-busy", /class="sk-wrap" aria-busy="true"/.test(waiting));
check("Waiting.vue has exactly one polite status line, not one per block", (waiting.match(/role="status"/g) || []).length === 1);
check("Waiting.vue hides its blocks from a screen reader", /class="sk-body" aria-hidden="true"/.test(waiting));
check("Waiting.vue waits 8 seconds before the slow note", /slowMs: \{ type: Number, default: 8000 \}/.test(waiting));
check("Waiting.vue offers Try again after that, and its timer is cleared on unmount", />Try again</.test(waiting) && /onBeforeUnmount\(\(\) => clearTimeout\(timer\)\)/.test(waiting));
check("Waiting.vue says it is taking longer than usual", /This is taking longer than usual/.test(waiting));
check("Waiting.vue draws no colour of its own", !/#[0-9a-f]{3,8}\b|style="[^"]*(color|background)/i.test(waiting));

summary();
