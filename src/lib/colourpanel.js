// F55.2: the sums and the keyboard behind the Plus colour panel, kept apart from the page so they can be
// tested one by one (test/card-colours.mjs). A colour is held as hue (0 to 360), saturation and brightness (0 to 1),
// the way the square and the slider draw it, and goes out as "#RRGGBB". No imports but the hex reader.
import { typedHex } from "./cardcolour.js";

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// hex "#RRGGBB" -> { h, s, v }. `keepHue` is used when the colour has no hue of its own (grey, black, white),
// so typing 808080 does not throw the slider back to red.
export function hexToHsv(hex, keepHue = 0) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = keepHue;
  if (d > 1e-9) {
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

// { h, s, v } -> "#RRGGBB" in capitals.
export function hsvToHex({ h, s, v }) {
  const hh = ((h % 360) + 360) % 360 / 60, i = Math.floor(hh), f = hh - i;
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  return "#" + [r, g, b].map((x) => Math.round(clamp(x, 0, 1) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

// The square: left and right change saturation, up and down change brightness. One press is 1%; with Shift, 10%.
// Home and End are the least and most saturated, Page Up and Page Down the brightest and the darkest.
// Returns the new { h, s, v }, or null when the key is not one the square uses (so the page leaves it alone).
export function squareKey(hsv, key, shift = false) {
  const step = shift ? 0.1 : 0.01;
  const { h } = hsv;
  let { s, v } = hsv;
  switch (key) {
    case "ArrowLeft": s -= step; break;
    case "ArrowRight": s += step; break;
    case "ArrowUp": v += step; break;
    case "ArrowDown": v -= step; break;
    case "Home": s = 0; break;
    case "End": s = 1; break;
    case "PageUp": v = 1; break;
    case "PageDown": v = 0; break;
    default: return null;
  }
  return { h, s: clamp(Math.round(s * 1000) / 1000, 0, 1), v: clamp(Math.round(v * 1000) / 1000, 0, 1) };
}

// The hue slider: left and down go round one degree the one way, right and up the other; with Shift, 15 degrees.
// Home is 0 (red) and End is 359. It does not wrap: the ends stop, as a slider does.
export function hueKey(hsv, key, shift = false) {
  const step = shift ? 15 : 1;
  let h = hsv.h;
  switch (key) {
    case "ArrowLeft": case "ArrowDown": h -= step; break;
    case "ArrowRight": case "ArrowUp": h += step; break;
    case "PageDown": h -= 30; break;
    case "PageUp": h += 30; break;
    case "Home": h = 0; break;
    case "End": h = 359; break;
    default: return null;
  }
  return { ...hsv, h: clamp(Math.round(h), 0, 359) };
}

// A press or drag at (x, y) inside a box of w by h puts the point there: saturation across, brightness up.
export function pointToSv(x, y, w, h) {
  return { s: clamp(w ? x / w : 0, 0, 1), v: 1 - clamp(h ? y / h : 0, 0, 1) };
}
export const pointToHue = (x, w) => clamp(Math.round((w ? x / w : 0) * 360), 0, 359);

// What the hex box says: the colour for "1a2b3c", "#1A2B3C" or "abc", else null (and why, in words, for the field).
export function readHexBox(text) {
  const hex = typedHex(text);
  if (hex) return { hex };
  return { hex: null, why: "Type a colour like 1A2B3C: three or six letters or numbers." };
}

// The last custom colours used, newest first, no repeats, at most five. A copy; the list passed in is not changed.
export function pushRecent(list, hex, max = 5) {
  const h = typedHex(hex);
  if (!h) return [...(list || [])].slice(0, max);
  return [h, ...(list || []).filter((x) => x !== h)].slice(0, max);
}
// What was stored may be anything: keep only real colours, five at most.
export function cleanRecent(raw, max = 5) {
  const out = [];
  for (const v of Array.isArray(raw) ? raw : []) { const h = typeof v === "string" && /^#[0-9A-F]{6}$/.test(v) ? v : null; if (h && !out.includes(h)) out.push(h); }
  return out.slice(0, max);
}
