// F55: card colours. Pure functions and the ten strap presets, with no imports, so the Worker (which decides
// what an account may save) and the app (which draws the swatches and the previews) read the very same list
// and the very same contrast sums. Nothing here touches the page, so a public page that imports it pays only
// for what it calls.

// The ten strap colours every account may choose. Each reaches 4.5:1 with white strap text (test/card-colours.mjs
// works it out). Ochre was #A86F12 in the plan (4.2:1 with white) and is deepened to #9A6410 (5.0:1).
export const STRAP_PRESETS = [
  { name: "Persimmon", hex: "#C4441E" },
  { name: "Graphite", hex: "#2B3138" },
  { name: "Navy", hex: "#1F3A5F" },
  { name: "Cobalt", hex: "#2F5BD3" },
  { name: "Teal", hex: "#12817A" },
  { name: "Forest", hex: "#2E7D4F" },
  { name: "Ochre", hex: "#9A6410" },
  { name: "Rose", hex: "#C23B66" },
  { name: "Plum", hex: "#7A3E8E" },
  { name: "Slate", hex: "#55606E" },
];

// A colour as the Worker keeps it: "#RRGGBB" in capitals, or null. Only a string with its # and six hex digits
// is accepted (any case); nothing is guessed from other shapes.
export function strictHex(v) {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : null;
}

// The same for something a person typed in a box: with or without the #, three or six digits, spaces around.
export function typedHex(v) {
  if (typeof v !== "string") return null;
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(v.trim());
  if (!m) return null;
  const d = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return "#" + d.toUpperCase();
}

export const presetOf = (hex) => { const h = strictHex(hex); return h ? STRAP_PRESETS.find((p) => p.hex === h) || null : null; };
export const isPreset = (hex) => !!presetOf(hex);

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
// WCAG contrast of two "#RRGGBB" colours, 1 to 21.
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// The colour of the words on a strap: white or black, whichever reads better on it. Always at least 4.5:1.
export function strapInk(strap) {
  const h = strictHex(strap);
  return h && contrast("#FFFFFF", h) < contrast("#000000", h) ? "#000" : "#fff";
}
