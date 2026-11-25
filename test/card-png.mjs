// F71: the card image (My card's "Download PNG") is the card alone on a transparent canvas.
//   drawBadge is run in node against a recording canvas stub: the size is 352 x 3 wide, nothing is painted before the
//   rounded 8 px clip, nothing is painted outside the card, there is no paper fill, no shadow and no margin, and every
//   theme and a Plus material still draw. Real pixels (corner alpha 0, centre alpha 255) are read in the browser pane.
// Run: node test/card-png.mjs
import { readFileSync } from "node:fs";
import { check, summary } from "./harness.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// ---- a recording stand-in for the browser's canvas ----
const makeCtx = (log) => {
  const state = {};
  return new Proxy({}, {
    get(_, k) {
      if (k === "measureText") return (t) => ({ width: String(t).length * 7 });
      if (k === "createLinearGradient") return () => ({ addColorStop() {} });
      if (k in state) return state[k];
      return (...a) => { log.push([k, a, { ...state }]); };
    },
    set(_, k, v) { state[k] = v; log.push(["set:" + k, [v]]); return true; },
  });
};
const makeCanvas = () => { const log = []; const ctx = makeCtx(log); return { log, width: 0, height: 0, style: {}, getContext: () => ctx, toDataURL: () => "data:image/png;base64,AA==" }; };

globalThis.document = {
  fonts: { ready: Promise.resolve(), load: async () => {} },
  createElement: () => makeCanvas(),
};
globalThis.Image = class { set src(v) { this._s = v; queueMicrotask(() => this.onload && this.onload()); } width = 10; height = 10; naturalWidth = 10; naturalHeight = 10; };

const { drawBadge } = await import("../src/lib/qr.js");
const CARD_W = 352, S = 3;
const view = (o = {}) => ({ theme: "light", profile: { name: "Sam Rivers", headline: "Product designer", tags: ["Design", "Maps"] }, note: "Keen to talk", subtitle: "Studies design", code: "ABC123", ...o });
const run = async (v) => { const c = makeCanvas(); await drawBadge(c, v, "https://example.test/c/abc"); return c; };

console.log("\n# F71 Size: the card alone, no margin");
const base = await run(view());
{
  check("the canvas is 1056 px wide (352 x 3)", base.width === CARD_W * S, base.width);
  check("the shown width is the card's 352 CSS px, not 408 (no 28 px margin each side)", base.style.width === "352px", base.style.width);
  const first = base.log.find((e) => e[0] === "scale");
  check("the 3x scale is kept", first && first[1][0] === 3 && first[1][1] === 3);
  check("the height is the card's height x 3 and shown height matches", base.height === Math.round(parseFloat(base.style.height) * S) && parseFloat(base.style.height) > 400, [base.height, base.style.height]);
}

console.log("\n# F71 Transparency: nothing is painted outside the 8 px rounded corner");
{
  const H = parseFloat(base.style.height);
  const idx = base.log.findIndex((e) => e[0] === "clip");
  const before = base.log.slice(0, idx).filter((e) => ["fill", "fillRect", "stroke", "fillText", "drawImage", "strokeRect"].includes(e[0]));
  check("a clip is set and nothing is painted before it", idx > 0 && before.length === 0, before.map((e) => e[0]));
  const path = base.log.slice(0, idx);
  const arcs = path.filter((e) => e[0] === "arcTo");
  const mv = path.filter((e) => e[0] === "moveTo").pop();
  check("the clip is a rounded rectangle from (0,0), 352 wide, with an 8 px radius at every corner", mv && mv[1][0] === 8 && mv[1][1] === 0 && arcs.length === 4 && arcs.every((a) => a[1][4] === 8) && arcs[0][1][0] === 352 && arcs[1][1][1] === H, { mv: mv && mv[1], arcs: arcs.map((a) => a[1]) });
  const bad = base.log.filter((e) => e[0] === "fillRect" && (e[1][0] < 0 || e[1][1] < 0 || e[1][0] + e[1][2] > CARD_W + 0.001 || e[1][1] + e[1][3] > H + 0.001));
  check("no rectangle is filled outside the card", bad.length === 0, bad.map((e) => e[1]));
  const card = base.log.find((e) => e[0] === "fillRect");
  check("the first fill is the card's own colour over exactly the card, inside the clip", card && card[1][0] === 0 && card[1][1] === 0 && card[1][2] === 352 && card[1][3] === H && card[2].fillStyle === "#FFFDF8", card && card[1]);
  check("no shadow is set, no paper colour is used, and the canvas is not cleared to a colour", !base.log.some((e) => /^set:shadow/.test(e[0])) && !base.log.some((e) => e[0] === "set:fillStyle" && /^#F4F1EA$/i.test(e[1][0])));
  const border = base.log.filter((e) => e[0] === "stroke").pop();
  check("the card's border is the last thing drawn, inset so it stays inside the edge", border && base.log.slice(base.log.indexOf(border) + 1).every((e) => !["fill", "fillRect", "stroke", "fillText", "drawImage"].includes(e[0])));
}

console.log("\n# F71 Every theme and a Plus material still draw");
for (const [name, v] of [["light", view()], ["formal", view({ theme: "formal" })], ["night", view({ theme: "night" })], ["Plus gold", view({ material: "gold", textColor: "#222222" })]]) {
  const c = await run(v);
  const card = c.log.find((e) => e[0] === "fillRect");
  check(`${name}: 1056 px wide, clipped, card colour first${name === "night" ? " (dark fill)" : ""}`, c.width === 1056 && c.log.some((e) => e[0] === "clip") && card && card[2].fillStyle === (name === "night" ? "#1F1D1A" : "#FFFDF8"), card && card[2].fillStyle);
  check(`${name}: the strap and the QR are still drawn`, c.log.filter((e) => e[0] === "fillRect").length >= 2 && c.log.some((e) => e[0] === "drawImage") && c.log.some((e) => e[0] === "fillText"));
}
{
  const g = await run(view({ material: "gold" }));
  check("a material strap still uses its gradient", g.log.some((e) => e[0] === "set:fillStyle" && typeof e[1][0] === "object"));
}

console.log("\n# F71 Source guards");
{
  const qr = read("src/lib/qr.js"), card = read("src/views/MyCard.vue");
  check("no PAPER backdrop, PAD margin or shadow in the card image", !/PAPER|\bPAD\b|shadowBlur|shadowColor/.test(qr));
  check("the only callers draw through drawBadge and the file name stays lanyard-badge.png", /filename = "lanyard-badge\.png"/.test(qr) && /downloadBadge\(/.test(card));
  check("the picture is still a canvas replica (not a screenshot library)", !/html2canvas|dom-to-image|toBlob\(|screenshot/i.test(qr + card));
}
summary();
