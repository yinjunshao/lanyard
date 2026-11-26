// F73: the scan lock and the card arrival.
//   The timing and haptic helper is run for real (with a fake matchMedia and vibrate); the page code and the CSS are
//   source guards. How it looks is checked in a browser (see the F73 plan note).
// Run: node test/motion-scan.mjs
import { readFileSync } from "node:fs";
import { check, summary } from "./harness.mjs";
import { parse, compileStyle } from "@vue/compiler-sfc";
import { LOCK_MS, LOCK_REDUCED_MS, WAIT_MS, lockMs, buzz, reducedMotion } from "../src/lib/scanLock.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const scan = parse(read("src/views/Scan.vue")).descriptor;
const card = parse(read("src/views/PublicCard.vue")).descriptor;
const scanCss = scan.styles[0].content, cardCss = card.styles[0].content;
const scanJs = scan.scriptSetup.content, cardJs = card.scriptSetup.content;

// The properties set inside each @keyframes block.
function keyframes(css) {
  const out = {};
  for (const m of css.matchAll(/@keyframes ([\w-]+) \{((?:[^{}]|\{[^}]*\})*)\}/g)) {
    out[m[1]] = [...m[2].matchAll(/([a-z-]+)\s*:/g)].map((d) => d[1]);
  }
  return out;
}
// What is inside the reduced-motion block.
const reducedBlock = (css) => (css.match(/@media \(prefers-reduced-motion: reduce\) \{((?:[^{}]|\{[^}]*\})*)\}/) || [])[1] || "";

console.log("\n# F73 The timing and the haptic (run for real)");
{
  let vibrated = [];
  Object.defineProperty(globalThis.navigator, "vibrate", { value: (ms) => { vibrated.push(ms); return true; }, configurable: true, writable: true });
  const media = (reduce) => { globalThis.matchMedia = (q) => ({ matches: reduce && /reduce/.test(q) }); };
  media(false);
  check("without reduced motion the lock is 350 ms and there is one light buzz of 15 ms", lockMs() === 350 && LOCK_MS === 350 && buzz() === true && vibrated.length === 1 && vibrated[0] === 15, vibrated);
  vibrated = [];
  media(true);
  check("with reduced motion the lock is a 150 ms fade and navigator.vibrate is never called", reducedMotion() && lockMs() === 150 && LOCK_REDUCED_MS === 150 && buzz() === false && vibrated.length === 0, vibrated);
  delete globalThis.matchMedia;
  check("a browser with no matchMedia counts as full motion and never throws", reducedMotion() === false && lockMs() === 350);
  media(false);
  Object.defineProperty(globalThis.navigator, "vibrate", { value: undefined, configurable: true, writable: true });
  check("a phone with no vibrate (an iPhone) buzzes nothing and does not throw", (() => { try { return !buzz(); } catch { return false; } })());
  delete globalThis.matchMedia;
  check("a slow answer shows the calm state after 250 ms", WAIT_MS === 250);
}

console.log("\n# F73 Scan: lock, wait, miss (source guards)");
{
  check("the page waits for the lock and no longer: one pause(lockMs()) between the answer and go()",
    /state\.value = "lock";[\s\S]*buzz\(\);\s*await pause\(lockMs\(\)\);\s*if \(!dead\) go\(res, s\);/.test(scanJs) && (scanJs.match(/await pause\(/g) || []).length === 1);
  check("the route changes through go(res, s) once, for the camera (q) and for the typed code (c)",
    /resolveAndOpen\(\(\) => resolveScanned\(raw, \{ camera: true \}\), "q"\)/.test(scanJs) && /resolveAndOpen\(\(\) => resolveScanned\(text\), "c"\)/.test(scanJs) && (scanJs.match(/\) go\(res, s\)/g) || []).length === 1);
  check("leaving during the lock never navigates (dead flag, timers cleared)", /onBeforeUnmount\(\(\) => \{ dead = true;[^}]*clearTimeout\(waitTimer\)[^}]*clearTimeout\(missTimer\)/.test(scanJs));
  check("a second code is ignored while the lock runs", /state\.value === "lock"\) return;/.test(scanJs) && /handled = true;\s*state\.value = "lock"/.test(scanJs));
  check("a miss shakes the frame and shows the existing hint and error text",
    /miss\(\);\s*flashHint\("That QR isn't a Lanyard badge or event\."\)/.test(scanJs) && /miss\(\);\s*error\.value = "Enter the 4-character code/.test(scanJs));
  check("the haptic goes through buzz() (silent under reduced motion); navigator.vibrate is not called by either page", /buzz\(\)/.test(scanJs) && !/vibrate/.test(scanJs) && !/vibrate/.test(cardJs));
  check("the only buzz is on a lock (not on a miss or a wait)", (scanJs.match(/buzz\(\)/g) || []).length === 1 && /state\.value = "lock";[\s\S]*buzz\(\)/.test(scanJs));
  const tpl = scan.template.content;
  check("\"Opening card\" is said through one always-present polite status line, visually hidden", /<p class="visually-hidden" role="status">\{\{ opening \}\}<\/p>/.test(tpl));
  check("it is said once: wait sets it, lock sets it only when it is empty, nothing clears it between",
    /state\.value = "wait"; opening\.value = "Opening card"/.test(scanJs) && /if \(!opening\.value\) opening\.value = res\.kind === "event" \? "Opening event" : "Opening card"/.test(scanJs));
  check("there is no spinner in the frame (a thin line that runs along it)", /scan-bar/.test(tpl) && !/spin|loader|<svg/i.test(tpl) && !/@keyframes (spin|rotate)/.test(scanCss));
  check("the frame carries the state as a class, scan-lock, scan-wait or scan-miss", /:class="state \? 'scan-' \+ state : null"/.test(tpl));
}

console.log("\n# F73 Scan: the CSS moves only transform and opacity");
{
  const k = keyframes(scanCss);
  const names = Object.keys(k);
  check("the scan keyframes exist (close, pulse, tick, run, shake)", ["scan-close", "scan-pulse", "scan-tick", "scan-run", "scan-shake"].every((n) => names.includes(n)), names);
  check("every scan keyframe sets only transform and opacity", names.every((n) => k[n].every((p) => p === "transform" || p === "opacity")), k);
  const compiled = compileStyle({ source: scanCss, filename: "Scan.vue", id: "data-v-test", scoped: true });
  check("the scoped style compiles and the global m-fade is used by name", !compiled.errors.length && compiled.code.includes("animation: m-fade var(--lock-in)"), compiled.errors);
  const reduced = reducedBlock(scanCss);
  check("under reduced motion the lock, the wait and the miss are each the 150 ms m-fade (the times are 150 ms there)",
    /\.scan-frame \{ --lock-in: 150ms; --shake: 150ms; \}/.test(reduced) && /\.scan-lock \.scan-lock-mark \{ animation: m-fade var\(--lock-in\) linear/.test(reduced) && /\.scan-wait \.scan-bar \{ animation: m-fade var\(--lock-in\) linear/.test(reduced) && /\.scan-miss \.scan-reticle \{ animation: m-fade var\(--shake\) linear/.test(reduced));
  check("and nothing there scales, moves or shakes, and the pulse ring is gone", !/scan-(close|pulse|tick|run|shake)|transform|translate|scale/.test(reduced) && /\.scan-lock-mark::before \{ display: none/.test(reduced));
  const tok = Object.fromEntries([...scanCss.match(/\.scan-frame \{([^}]*)\}/)[1].matchAll(/--([\w-]+): ([\d.]+)(ms|s);/g)].map((m) => [m[1], Number(m[2]) * (m[3] === "s" ? 1000 : 1)]));
  const ends = [...scanCss.matchAll(/^\.scan-lock [^{]*\{[^}]*animation: (scan-\w+) var\(--([\w-]+)\) var\(--ease-out\)(?: var\(--([\w-]+)\))? backwards/gm)].map((m) => ({ n: m[1], end: tok[m[2]] + (m[3] ? tok[m[3]] : 0) }));
  check("the three lock animations (close, pulse, tick) all end within the 350 ms lock", ends.length === 3 && ends.every((a) => a.end > 0 && a.end <= LOCK_MS), ends);
  check("no scan time is over 300 ms except the waiting line's slow loop", Object.entries(tok).every(([n, v]) => v <= 300 || n === "run") && tok.run === 1400, tok);
  check("the calm wait line is a slow loop that only translates", /\.scan-wait \.scan-bar \{[^}]*scan-run var\(--run\) ease-in-out infinite/.test(scanCss) && /@keyframes scan-run \{ from \{ transform: translateX\(-100%\); \} to \{ transform: translateX\(100%\); \} \}/.test(scanCss));
  check("the miss shakes once (300 ms, no repeat)", /\.scan-miss \.scan-reticle \{ animation: scan-shake var\(--shake\) var\(--ease-out\); \}/.test(scanCss) && /--shake: 300ms/.test(scanCss));
}

console.log("\n# F73 The card arrives (CSS only)");
{
  const k = keyframes(cardCss);
  check("one keyframe, arrive, from opacity 0 and 16 px down, setting only transform and opacity",
    Object.keys(k).join() === "arrive" && k.arrive.every((p) => p === "transform" || p === "opacity") && /@keyframes arrive \{ from \{ opacity: 0; transform: translateY\(var\(--arrive-y\)\); \} \}/.test(cardCss) && /--arrive-y: 16px/.test(cardCss));
  check("the notes and the card rise in 300 ms with the shared ease-out", /--arrive-dur: 300ms/.test(cardCss) && /\.profile-page > :is\(\.notice, \.note-callout, \.profile\) \{ animation: arrive var\(--arrive-dur\) var\(--ease-out\) backwards; \}/.test(cardCss));
  check("the panels under the card follow 60 ms later", /--arrive-lag: 60ms/.test(cardCss) && /\.profile ~ :is\(\.panel, \.connected-foot\) \{ animation: arrive var\(--arrive-dur\) var\(--ease-out\) var\(--arrive-lag\) backwards; \}/.test(cardCss));
  const reduced = reducedBlock(cardCss);
  check("under reduced motion both are the 150 ms m-fade (the same selectors, so it wins for the panels too), with no movement",
    /--arrive-dur: 150ms/.test(reduced) && /:is\(\.notice, \.note-callout, \.profile\) \{ animation-name: m-fade/.test(reduced) && /\.profile ~ :is\(\.panel, \.connected-foot\) \{ animation-name: m-fade/.test(reduced) && !/arrive(?!-dur)|transform|translate/.test(reduced.replace(/--arrive-dur/g, "")));
  check("the scoped style compiles", !compileStyle({ source: cardCss, filename: "PublicCard.vue", id: "data-v-test", scoped: true }).errors.length);
  check("no script was added for it: the page script has no matchMedia, timer, animation call or class toggling", !/matchMedia|requestAnimationFrame|\.animate\(|classList|setTimeout/.test(cardJs));
  check("the arrival adds no live region: the template keeps its two role=\"status\" lines (loading, selfie ask)", (card.template.content.match(/role="status"/g) || []).length === 2);
  check("the skeleton is still one aria-busy element with the card's width and a fixed 400 px height", /<div v-if="loading" class="sk-wrap sk-profile" aria-busy="true">/.test(card.template.content) && /\.sk-profile \{[^}]*height: 400px/.test(read("src/styles/main.css")));
  check("CardView still gets only the view (the motion is on the page's CSS, not on a wrapper)", /<CardView :view="view">/.test(card.template.content));
  check("the card page's style block has no transition and no animated layout property", !/transition\s*:/.test(cardCss));
}

summary();
