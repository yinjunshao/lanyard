// F55: card colour presets and the Plus colour wheel. Grows with each task:
//   F55.0 the deeper brand orange (the value and the ratios are pinned here),
//   F55.1 presets and the server rule, F55.2 the colour panel, F55.3 the text colour.
// Run: node test/card-colours.mjs
import { readFileSync } from "node:fs";
import { check, summary } from "./harness.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

console.log("\n# F55.0 The brand strap orange is #C4441E");
{
  const css = read("src/styles/main.css");
  const root = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")));
  const strap = /--strap:\s*(#[0-9a-f]{6});/i.exec(root)?.[1];
  const deep = /--strap-deep:\s*(#[0-9a-f]{6});/i.exec(root)?.[1];
  check("--strap is #c4441e", strap?.toLowerCase() === "#c4441e", strap);
  check(`white on the strap is at least 4.5:1 (${ratio("#ffffff", strap).toFixed(2)}:1)`, ratio("#ffffff", strap) >= 4.5);
  check("--strap-deep (pressed button, error text) is darker than the strap and reads on the paper at 4.5:1", lum(deep) < lum(strap) && ratio(deep, "#f4f1ea") >= 4.5 && ratio(deep, "#fffdf8") >= 4.5);
  check("the small event line on a card's strap is solid white (the old 82% white was 3.9:1)", /\.badge-strap-event \{[^}]*color: #fff;/.test(css) && /\.profile-strap-card \{[^}]*color: #fff;/.test(css) && !/rgba\(255,\s*255,\s*255,\s*\.?0?\.82\)/.test(css));
  check("the card image export draws the event line in solid white too", /ls: 1\.26, align: "right"/.test(read("src/lib/qr.js")) && !/255,255,255,\.82/.test(read("src/lib/qr.js")));
  const stale = ["index.html", "src/lib/qr.js", "src/styles/main.css", "public/icon.svg", "public/favicon.svg", "public/host-icon.svg", "scripts/make-og-image.mjs", "src/views/HostPrint.vue", "src/components/EventPreview.vue", "src/components/EventStepLook.vue", "src/views/HostLive.vue", "src/components/PhotoCropper.vue", "logo-kit/GUIDELINES.md"].filter((f) => /d9502b/i.test(read(f)));
  check("the old #D9502B is gone from the app, public icons, boot screen and brand kit", stale.length === 0, stale);
  check("the boot screen and the card image use the new value", /#C4441E/.test(read("index.html")) && /strap: "#C4441E"/.test(read("src/lib/qr.js")));
}

summary();
