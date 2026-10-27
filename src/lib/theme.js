// Light / dark / follow-the-system. The choice lives in this browser only.
// Dark is the `night` token set in main.css, switched on via <html data-theme>.
const KEY = "lanyard-theme";
const mq = () => window.matchMedia?.("(prefers-color-scheme: dark)");

export function getThemePref() {
  try { return localStorage.getItem(KEY) || "auto"; } catch { return "auto"; }
}

export function applyTheme(pref = getThemePref()) {
  const dark = pref === "dark" || (pref === "auto" && !!mq()?.matches);
  document.documentElement.dataset.theme = dark ? "night" : "light";
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#141311" : "#F4F1EA");
}

export function setThemePref(pref) {
  try { localStorage.setItem(KEY, pref); } catch { /* private mode */ }
  applyTheme(pref);
}

export function initTheme() {
  applyTheme();
  mq()?.addEventListener?.("change", () => applyTheme());
}
