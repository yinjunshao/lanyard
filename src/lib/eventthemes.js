// F65 (D060): the themes an event can have. Pure data with no imports, read by the Worker (which keeps only these ids), the host's
// forms (the swatches and the preview) and the tests. The drawing itself is CSS: src/styles/eventthemes.css (and, for Formal and
// Night, which are older, main.css) has rules for every id on every surface, and test/event-themes.mjs checks the two agree and
// works out the contrast of the words on each strap.
//   id     what the Worker keeps in events.theme (exact, lower case); the first three are the originals and keep their looks
//   name   what the host sees (plain colour or mood words)
//   strap  the colour of the strap on the check-in page head, the stripe on the Present page and the top rule of the poster
//   ink    the words on the strap: white or the card's near-black, passing 4.5:1 against the strap
//   tint   the paper of the check-in head and the Present page (the light look); Night's is the dark card paper
//   dark   true when the Present page opens dark (Night); the host can still switch it there
export const EVENT_THEMES = [
  { id: "default", name: "Persimmon", strap: "#C4441E", ink: "#FFFFFF", tint: "#FFFDF8", dark: false },
  { id: "formal", name: "Formal", strap: "#2B3138", ink: "#FFFFFF", tint: "#FFFDF8", dark: false },
  { id: "night", name: "Night", strap: "#C4441E", ink: "#FFFFFF", tint: "#1F1D1A", dark: true },
  { id: "forest", name: "Forest", strap: "#2A6B45", ink: "#FFFFFF", tint: "#F1F6F1", dark: false },
  { id: "ocean", name: "Ocean", strap: "#1F5F8B", ink: "#FFFFFF", tint: "#EEF4F8", dark: false },
  { id: "plum", name: "Plum", strap: "#6E3A82", ink: "#FFFFFF", tint: "#F6F0F8", dark: false },
  { id: "rose", name: "Rose", strap: "#B83A5E", ink: "#FFFFFF", tint: "#FBF0F3", dark: false },
  { id: "sand", name: "Sand", strap: "#A67C37", ink: "#1B1A17", tint: "#FAF4E8", dark: false },
];
export const THEME_IDS = EVENT_THEMES.map((t) => t.id);
// Only the exact ids: no other case, no spaces, no other type.
export const isTheme = (v) => typeof v === "string" && THEME_IDS.includes(v);
export const themeOf = (id) => EVENT_THEMES.find((t) => t.id === id) || EVENT_THEMES[0];
// What the Worker keeps for anything else, and what the form falls back to.
export const cleanTheme = (v) => (isTheme(v) ? v : "default");
