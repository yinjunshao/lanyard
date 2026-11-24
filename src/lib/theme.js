// Auto / Light / Dark / Midnight. The choice lives in this browser only.
// Dark is the `night` token set in main.css and Midnight is `midnight` (pure black paper for OLED screens), both
// switched on via <html data-theme>. A card's own "Night" theme is a different thing and is not touched here.
// Auto follows the device: light by day and, when the device is dark, Dark or (a second choice, "lanyard-dark")
// Midnight. public/theme-init.js repeats these few lines before first paint, so there is no flash; test/theme.mjs
// runs both and checks they agree.
const KEY = "lanyard-theme";
const KIND = "lanyard-dark";
const mq = () => window.matchMedia?.("(prefers-color-scheme: dark)");
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

export const getThemePref = () => read(KEY) || "auto";
// What Auto uses when the device is dark: "dark" (the default) or "midnight".
export const getDarkKind = () => (read(KIND) === "midnight" ? "midnight" : "dark");

// The theme the page wears for a choice: "light", "night" (Dark) or "midnight".
export function themeFor(pref = getThemePref(), kind = getDarkKind(), deviceDark = !!mq()?.matches) {
  const key = pref === "auto" ? (deviceDark ? kind : "light") : pref;
  return key === "midnight" ? "midnight" : key === "dark" ? "night" : "light";
}

export function applyTheme(pref = getThemePref()) {
  const theme = themeFor(pref);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "midnight" ? "#000000" : theme === "night" ? "#141311" : "#F4F1EA");
}

export function setThemePref(pref) {
  try { localStorage.setItem(KEY, pref); } catch { /* private mode */ }
  applyTheme(pref);
}

export function setDarkKind(kind) {
  try { localStorage.setItem(KIND, kind === "midnight" ? "midnight" : "dark"); } catch { /* private mode */ }
  applyTheme();
}

export function initTheme() {
  applyTheme();
  mq()?.addEventListener?.("change", () => applyTheme());
}
