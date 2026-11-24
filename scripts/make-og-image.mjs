// Draws public/og-image.png, the 1200x630 picture link previews show (F37).
// Paper, ink and the strap colour from the brand, the wordmark "lanyard." and one line.
// Run: node scripts/make-og-image.mjs
// Needs `sharp`, which wrangler already brings into node_modules; nothing is added to package.json.
// The wordmark is drawn as shapes, so it looks the same on any machine. The one line under it is text (Arial or the nearest sans-serif the machine has).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const PAPER = "#F4F1EA", INK = "#15130F", STRAP = "#C4441E", MUTED = "#5E5A50";
const out = fileURLToPath(new URL("../public/og-image.png", import.meta.url));

// Each letter is a stroke path on a 100 x 140 box (x-height from y=40 to y=120, ascenders from y=0).
// Round caps and joins, one stroke weight, so the word reads as one hand.
const W = 17; // stroke weight
const G = {
  l: ["M20 0V120"],
  a: ["M70 40V120", "M70 80C70 55 55 48 40 48C22 48 12 62 12 80C12 98 22 112 40 112C55 112 70 105 70 80"],
  n: ["M16 40V120", "M16 70C20 52 34 46 46 46C62 46 70 56 70 74V120"],
  y: ["M10 40L40 120", "M72 40L36 140"],
  r: ["M16 40V120", "M16 72C20 54 32 46 50 48"],
  d: ["M64 0V120", "M64 80C64 55 50 48 36 48C20 48 10 62 10 80C10 98 20 112 36 112C50 112 64 105 64 80"],
  ".": [],
};
const ADV = { l: 52, a: 88, n: 90, y: 90, r: 70, d: 86, ".": 40 };
const word = ["l", "a", "n", "y", "a", "r", "d"];

let x = 0;
const parts = [];
for (const ch of word) {
  for (const d of G[ch]) parts.push(`<path d="${d}" transform="translate(${x} 0)"/>`);
  x += ADV[ch];
}
const dotX = x + 6;
const wordWidth = dotX + 20;
const scale = 1.45;
const left = (1200 - wordWidth * scale) / 2;
const top = 165;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${PAPER}"/>
  <rect width="1200" height="22" fill="${STRAP}"/>
  <g transform="translate(${left} ${top}) scale(${scale})" fill="none" stroke="${INK}" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round">
    ${parts.join("\n    ")}
  </g>
  <circle cx="${left + (dotX + 6) * scale}" cy="${top + 113 * scale}" r="${W * 0.9 * scale}" fill="${STRAP}"/>
  <g font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="700" fill="${MUTED}" text-anchor="middle">
    <text x="600" y="560">Show a card. Scan to connect. Remember who you met.</text>
  </g>
</svg>`;

const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, colours: 16 }).toBuffer();
writeFileSync(out, png);
console.log(`wrote ${out}: ${png.length} bytes`);
