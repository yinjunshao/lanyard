// F54: the Midnight app theme. theme.js and the pre-paint file public/theme-init.js are run against stand-ins for
// the page (a fake document, localStorage and matchMedia) for every choice, the tokens are read from main.css and
// their contrast worked out the way WCAG does, and the CSS and settings page are checked as source. What the eye
// sees (the pages in Midnight at 375 and 1280 px) is checked in a browser; see the F54 plan note.
// Run: node test/theme.mjs
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";
import { check, summary } from "./harness.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const css = read("src/styles/main.css");

// ---- a stand-in page ---------------------------------------------------------------------------------------
function page({ store = {}, deviceDark = false, throwing = false } = {}) {
  const meta = { content: "#F4F1EA", setAttribute(k, v) { if (k === "content") this.content = v; } };
  const root = { dataset: {} };
  const listeners = [];
  const win = {
    localStorage: throwing
      ? { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } }
      : { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    matchMedia: () => ({ matches: deviceDark, addEventListener: (_, f) => listeners.push(f) }),
    document: { documentElement: root, querySelector: (q) => (q === 'meta[name="theme-color"]' ? meta : null) },
  };
  win.window = win;
  return { win, root, meta, store, listeners, setDevice: (d) => { deviceDark = d; listeners.forEach((f) => f()); } };
}
const themeSrc = read("src/lib/theme.js").replace(/^export /gm, "").replace(/\bexport \{[^}]*\};?/g, "");
const NAMES = ["getThemePref", "getDarkKind", "themeFor", "applyTheme", "setThemePref", "setDarkKind", "initTheme"];
function loadTheme(p) {
  const ctx = vm.createContext({ ...p.win, localStorage: p.win.localStorage, document: p.win.document, window: p.win });
  vm.runInContext(themeSrc + `\n;globalThis.__t = { ${NAMES.join(", ")} };`, ctx);
  return ctx.__t;
}
const initSrc = readFileSync(new URL("../public/theme-init.js", import.meta.url), "utf8");
function runInit(p) {
  const ctx = vm.createContext({ ...p.win, localStorage: p.win.localStorage, document: p.win.document, window: p.win, matchMedia: p.win.matchMedia });
  vm.runInContext(initSrc, ctx);
}

console.log("\n# F54 theme.js: what each choice puts on the page");
const BAR = { light: "#F4F1EA", night: "#141311", midnight: "#000000" };
for (const [pref, deviceDark, kind, want] of [
  ["light", false, null, "light"], ["light", true, null, "light"],
  ["dark", false, null, "night"], ["dark", true, null, "night"],
  ["midnight", false, null, "midnight"], ["midnight", true, null, "midnight"],
  ["auto", false, null, "light"], ["auto", false, "midnight", "light"],
  ["auto", true, null, "night"], ["auto", true, "dark", "night"], ["auto", true, "midnight", "midnight"],
]) {
  const store = {}; if (pref !== "auto") store["lanyard-theme"] = pref; if (kind) store["lanyard-dark"] = kind;
  const p = page({ store, deviceDark }); const t = loadTheme(p); t.initTheme();
  check(`${pref}${kind ? ` (device dark uses ${kind})` : ""} on a ${deviceDark ? "dark" : "light"} device wears "${want}" and the browser bar ${BAR[want]}`, p.root.dataset.theme === want && p.meta.content === BAR[want], [p.root.dataset.theme, p.meta.content]);
  const q = page({ store, deviceDark }); runInit(q);
  check(`  the pre-paint file does the same for it`, q.root.dataset.theme === want && q.meta.content === BAR[want], [q.root.dataset.theme, q.meta.content]);
}
{
  const p = page(); const t = loadTheme(p); t.initTheme();
  check("with nothing stored the choice is Auto", t.getThemePref() === "auto" && t.getDarkKind() === "dark" && p.root.dataset.theme === "light");
  t.setThemePref("midnight");
  check("choosing Midnight turns the page black at once, the browser bar #000000, and stores the choice", p.root.dataset.theme === "midnight" && p.meta.content === "#000000" && p.store["lanyard-theme"] === "midnight" && t.getThemePref() === "midnight");
  check("a reload (a new page over the same storage) keeps it with no flash: the pre-paint file sets it before the app runs", (() => { const q = page({ store: p.store }); runInit(q); return q.root.dataset.theme === "midnight" && q.meta.content === "#000000"; })());
  t.setThemePref("dark");
  check("Dark is still data-theme night with #141311", p.root.dataset.theme === "night" && p.meta.content === "#141311");
  t.setThemePref("light");
  check("Light is still light with #F4F1EA", p.root.dataset.theme === "light" && p.meta.content === "#F4F1EA");
  t.setThemePref("auto"); p.setDevice(true);
  check("Auto follows the device when it changes (dark device: Dark)", p.root.dataset.theme === "night");
  t.setDarkKind("midnight");
  check("Auto with the second choice Midnight wears Midnight on a dark device and stores it", p.root.dataset.theme === "midnight" && p.store["lanyard-dark"] === "midnight" && t.getDarkKind() === "midnight");
  p.setDevice(false);
  check("and Light again when the device is light", p.root.dataset.theme === "light");
  t.setDarkKind("anything");
  check("an unknown second choice means Dark", t.getDarkKind() === "dark" && p.store["lanyard-dark"] === "dark");
  const bad = page({ throwing: true, deviceDark: true }); const tb = loadTheme(bad); tb.initTheme(); tb.setThemePref("midnight");
  check("storage that throws (private mode) does not break it: Auto, and the choice applies for the page", tb.getThemePref() === "auto" && bad.root.dataset.theme === "midnight");
  const bad2 = page({ throwing: true }); runInit(bad2);
  check("the pre-paint file does not throw when storage does", true);
  const noMeta = page(); noMeta.win.document.querySelector = () => null; const tn = loadTheme(noMeta); tn.setThemePref("midnight");
  check("a page with no theme-color tag is fine", noMeta.root.dataset.theme === "midnight");
}

console.log("\n# F54 The tokens and where dark is checked");
const rootBlock = (sel) => { const i = css.indexOf(sel + " {"); return i < 0 ? "" : css.slice(i, css.indexOf("\n}", i)); };
const night = rootBlock(':root:is([data-theme="night"], [data-theme="midnight"])');
const mid = rootBlock(':root[data-theme="midnight"]');
const tok = (block, n) => new RegExp(`--${n}:\\s*([^;]+);`).exec(block)?.[1].trim();
check("Dark's tokens are unchanged (paper #141311, raised #201e1a, ink #f4f1ea, graphite #9d988d, rule #3a362f, deep strap #ea7552)", tok(night, "paper") === "#141311" && tok(night, "paper-raised") === "#201e1a" && tok(night, "ink") === "#f4f1ea" && tok(night, "graphite") === "#9d988d" && tok(night, "rule") === "#3a362f" && tok(night, "strap-deep") === "#ea7552" && /color-scheme: dark/.test(night));
check("Midnight's paper is exactly #000000, and it lifts raised surfaces only a little", tok(mid, "paper") === "#000000" && /^#0[0-9a-f]0[0-9a-f]0[0-9a-f]$/i.test(tok(mid, "paper-raised")));
check("Midnight is also dark: it shares the night block (ink, color-scheme dark, strap, shadows) and only overrides paper, raised, graphite, rule and the two shadows", night.length > 0 && Object.keys({ paper: 1, "paper-raised": 1, graphite: 1, rule: 1, "shadow-1": 1, "shadow-2": 1 }).every((n) => tok(mid, n) !== undefined) && !/--ink|--strap|color-scheme/.test(mid));
check("a shadow does not show on black: Midnight's floating things get a 1px rule edge, and bordered things get no shadow", tok(mid, "shadow-2") === "0 0 0 1px var(--rule)" && tok(mid, "shadow-1") === "none");
check("a card keeps Dark's shadow in Midnight (a card is a physical object)", /:root\[data-theme="midnight"\] :is\(\.badge, \.profile\) \{\s*--shadow-2: 0 1px 3px rgba\(0, 0, 0, 0\.35\), 0 12px 28px -8px rgba\(0, 0, 0, 0\.55\);/.test(css));
{
  // Every selector that names the app's dark theme names Midnight with it.
  const hits = [...css.matchAll(/[^\n{}]*\[data-theme="(night|midnight)"\][^\n{}]*/g)].map((m) => m[0].trim());
  const bad = hits.filter((h) => /\[data-theme="night"\]/.test(h) && !/\[data-theme="midnight"\]/.test(h));
  check(`every CSS selector that names data-theme="night" also names midnight (${hits.length} lines)`, hits.length >= 3 && bad.length === 0, bad);
  const ownNight = [...css.matchAll(/^\.[\w.,\s-]*night[\w.,\s-]*\{/gm)].map((m) => m[0]);
  check("a card's own Night theme (.badge.night, .profile.night) is untouched and never mentions Midnight", /\.badge\.night, \.profile\.night \{\s*--paper: #141311; --paper-raised: #1f1d1a; --ink: #f4f1ea;\s*--graphite: #a29d92; --rule: #38352f; --strap-deep: #ea7552;\s*\}/.test(css) && ownNight.every((l) => !/midnight/.test(l)));
}
{
  // Anything in the app's source that reads or writes the theme attribute.
  const files = readdirRec(new URL("../src/", import.meta.url)).filter((f) => /\.(vue|js)$/.test(f));
  const users = files.filter((f) => /data-theme|dataset\.theme|\[data-theme/.test(readFileSync(new URL("../src/" + f, import.meta.url), "utf8")));
  check("the only code that touches the theme attribute is theme.js and the Present page's own light and dark switch (which sets night or light for one page and hands back to applyTheme)", users.sort().join(",") === ["lib/theme.js", "views/HostPresent.vue"].sort().join(","), users);
  const present = read("src/views/HostPresent.vue");
  check("the Present page sets only night or light itself, and calls applyTheme on leaving (so the person's choice, Midnight included, comes back)", /dataset\.theme = on \? "night" : "light"/.test(present) && /\bapplyTheme\(\);\n\}\);/.test(present));
  check("no code decides 'is it dark' by comparing the attribute to night (it would miss Midnight)", !files.filter((f) => f !== "lib/theme.js").some((f) => /theme\s*===?\s*["']night["']|dataset\.theme\s*===?/.test(readFileSync(new URL("../src/" + f, import.meta.url), "utf8").replace(/view\??\.theme|card\.theme|event\??\.theme|\.theme === "night"/g, ""))));
}
function readdirRec(base) {
  const out = [];
  const go = (u, rel) => { for (const e of readdirSync(u, { withFileTypes: true })) { if (e.isDirectory()) go(new URL(e.name + "/", u), rel + e.name + "/"); else out.push(rel + e.name); } };
  go(base, "");
  return out;
}

console.log("\n# F54 Contrast: every text pair on Midnight is at least 4.5:1 (computed from the tokens)");
{
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const paper = tok(mid, "paper"), raised = tok(mid, "paper-raised"), ink = tok(night, "ink"), gr = tok(mid, "graphite"), deep = tok(night, "strap-deep");
  const pairs = [["ink", ink, paper], ["ink on raised", ink, raised], ["muted (graphite)", gr, paper], ["muted on raised", gr, raised], ["error and accent text (strap-deep)", deep, paper], ["strap-deep on raised", deep, raised], ["Saved text", "#74cf8b", paper], ["Saved text on raised", "#74cf8b", raised], ["selected control (paper on ink)", paper, ink]];
  for (const [name, fg, bg] of pairs) check(`${name} ${fg} on ${bg} is ${ratio(fg, bg).toFixed(1)}:1`, ratio(fg, bg) >= 4.5, ratio(fg, bg));
  check("the rule is visible but quiet against black (between 1.2:1 and 2:1)", ratio(tok(mid, "rule"), paper) >= 1.2 && ratio(tok(mid, "rule"), paper) <= 2, ratio(tok(mid, "rule"), paper));
}

console.log("\n# F54 The page, the settings and the cost");
{
  const html = read("index.html");
  check("index.html loads the pre-paint file as a plain script after the theme-color tag and before the app", html.indexOf('<meta name="theme-color"') < html.indexOf('<script src="/theme-init.js"></script>') && html.indexOf('<script src="/theme-init.js"></script>') < html.indexOf('type="module"') && !/<script(?![^>]*\bsrc=)[^>]*>\s*\S/.test(html.replace(/<script[^>]*src=[^>]*><\/script>/g, "")));
  check("the start-up splash follows the chosen theme (Midnight is black), not only the device", /:root\[data-theme="midnight"\] \.boot \{ background: #000;/.test(html) && /:root\[data-theme="night"\] \.boot \{ background: #141311;/.test(html) && /:root\[data-theme="light"\] \.boot/.test(html));
  const init = readFileSync(new URL("../public/theme-init.js", import.meta.url), "utf8");
  check("the pre-paint file is small (under 1 KB) and has no inline script need (the content security policy has no 'unsafe-inline' for scripts)", init.length < 1024 && /"script-src 'self'"/.test(read("worker/security.js")));
  const ap = read("src/views/settings/SettingsAppearance.vue");
  check("Settings > Appearance offers Auto, Light, Dark and Midnight", /\{ value: "auto", label: "Auto" \},\s*\{ value: "light", label: "Light" \},\s*\{ value: "dark", label: "Dark" \},\s*\{ value: "midnight", label: "Midnight" \},/.test(ap));
  check("a second choice, \"When my device is dark\": Dark or Midnight, shown only with Auto, saved with setDarkKind", /v-if="themePref === 'auto'"/.test(ap) && /DARK_OPTIONS = \[\{ value: "dark", label: "Dark" \}, \{ value: "midnight", label: "Midnight" \}\]/.test(ap) && /setDarkKind\(v\)/.test(ap) && /When my device is dark/.test(ap));
  check("the Settings list names the choice (midnight)", /midnight: "midnight"/.test(read("src/views/Settings.vue")));
  const pub = ["Landing", "PublicCard", "Hosts", "Privacy", "Terms", "Redeem", "SignIn", "PrivacyRequest", "EventJoin"];
  check("no public page imports more of the theme than before (they get theme.js only through main.js)", pub.every((p) => !/lib\/theme/.test(read(`src/views/${p}.vue`))));
}

summary();
