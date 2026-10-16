// Lanyard hackathon pitch deck — volt/ink brand, neo-brutalist motif.
// Run: node build-deck.mjs  ->  Lanyard-pitch.pptx
import pptxgen from "pptxgenjs";

const INK = "0E1110";
const PAPER = "EEF0E7";
const SURFACE = "F7F8F2";
const VOLT = "C8F238";
const VOLT_D = "9FD000";
const MUTED = "6C7368";
const SOFT = "39403A";
const WHITE = "FFFFFF";
const LINE = "CFD3C3";
const GREEN = "1F7A43";

const SANS = "Arial";
const MONO = "Courier New";

const pres = new pptxgen();
pres.defineLayout({ name: "W16x9", width: 13.333, height: 7.5 });
pres.layout = "W16x9";
pres.author = "Lanyard";
pres.company = "UCL Claude Builders Club";
pres.subject = "Student networking that sticks";
pres.title = "Lanyard — student networking that sticks";

const W = 13.333, H = 7.5, M = 0.7;

function hardShadow(color = INK, opacity = 0.9, blur = 0, dist = 6, angle = 45) {
  return { type: "outer", color, opacity, blur, offset: dist, angle, align: "tl", rotateWithShape: false };
}

// Light content slide chrome (no accent stripe motif).
function lightSlide(kicker) {
  const s = pres.addSlide();
  s.background = { color: PAPER };
  // faint technical grid via corner ticks
  addTicks(s);
  if (kicker) {
    s.addText(kicker.toUpperCase(), {
      x: M, y: 0.42, w: 8, h: 0.3, fontFace: MONO, fontSize: 11, bold: true,
      color: "4F6B00", charSpacing: 2, margin: 0,
    });
  }
  return s;
}
// Dark bookend slide.
function darkSlide() {
  const s = pres.addSlide();
  s.background = { color: INK };
  addTicks(s, VOLT);
  return s;
}
function addTicks(s, color = LINE) {
  const L = 0.22, t = 2, x0 = 0.28, y0 = 0.28;
  const spec = [
    [x0, y0, L, t], [x0, y0, t, L],
    [W - x0, y0, -L, t], [W - x0, y0, t, L],
    [x0, H - y0, L, -t], [x0, H - y0, t, -L],
    [W - x0, H - y0, -L, -t], [W - x0, H - y0, t, -L],
  ];
  for (const [x, y, w, h] of spec) {
    s.addShape(pres.ShapeType.rect, { x, y, w: Math.abs(w), h: Math.abs(h), fill: { color }, line: { type: "none" } });
  }
}
function footer(s, n) {
  s.addText("lanyard", { x: M, y: H - 0.5, w: 2, h: 0.3, fontFace: MONO, fontSize: 10, bold: true, color: MUTED, margin: 0 });
  s.addText(String(n).padStart(2, "0"), { x: W - M - 0.5, y: H - 0.5, w: 0.5, h: 0.3, align: "right", fontFace: MONO, fontSize: 10, bold: true, color: MUTED, margin: 0 });
}
function voltChip(s, text, x, y, w) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h: 0.38, rectRadius: 0.06,
    fill: { color: VOLT }, line: { color: INK, width: 1 },
  });
  s.addText(text.toUpperCase(), { x, y: y + 0.07, w, h: 0.26, align: "center", fontFace: MONO, fontSize: 9.5, bold: true, color: INK, margin: 0 });
}
function card(s, x, y, w, h, fill = SURFACE) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.08,
    fill: { color: fill }, line: { color: INK, width: 1.25 },
    shadow: hardShadow(INK, 0.85, 0, 5, 45),
  });
}

/* ---------------- 1 · Title (dark) ---------------- */
{
  const s = darkSlide();
  s.addText("lanyard", {
    x: M, y: 1.0, w: 4, h: 0.5, fontFace: MONO, fontSize: 18, bold: true, color: VOLT, margin: 0,
  });
  s.addText([
    { text: "Remember every", options: { breakLine: true } },
    { text: "student you", options: { breakLine: true } },
    { text: "actually meet.", options: { color: VOLT } },
  ], {
    x: M, y: 1.7, w: 9.4, h: 3.2, fontFace: SANS, fontSize: 60, bold: true, color: WHITE,
    lineSpacingMultiple: 0.98, margin: 0,
  });
  s.addText("One QR. A living card. A note and a photo for every person — so no connection ever goes cold.",
    { x: M, y: 5.2, w: 8.4, h: 0.8, fontFace: SANS, fontSize: 17, color: "C9CCC0", margin: 0 });
  voltChip(s, "UCL · Claude Builders Club Hackathon", M, 6.35, 4.7);
  // right QR motif block
  card(s, 10.2, 1.5, 2.4, 3.6, WHITE);
  qrMotif(s, 10.45, 1.75, 1.9);
  s.addText("SCAN TO CONNECT", { x: 10.2, y: 4.55, w: 2.4, h: 0.3, align: "center", fontFace: MONO, fontSize: 9, bold: true, color: INK, margin: 0 });
}

/* decorative QR-like finder squares */
function finder(s, x, y, sz, ink = INK) {
  s.addShape(pres.ShapeType.rect, { x, y, w: sz, h: sz, fill: { color: ink }, line: { type: "none" } });
  const i = sz * 0.28;
  s.addShape(pres.ShapeType.rect, { x: x + i, y: y + i, w: sz - i * 2, h: sz - i * 2, fill: { color: WHITE }, line: { type: "none" } });
  const j = sz * 0.5;
  s.addShape(pres.ShapeType.rect, { x: x + j, y: y + j, w: sz - j * 2, h: sz - j * 2, fill: { color: ink }, line: { type: "none" } });
}
function qrMotif(s, x, y, size) {
  const f = size * 0.30;
  finder(s, x, y, f);
  finder(s, x + size - f, y, f);
  finder(s, x, y + size - f, f);
  const dots = [
    [0.36, 0.1], [0.5, 0.1], [0.66, 0.2], [0.4, 0.36], [0.56, 0.42],
    [0.72, 0.5], [0.34, 0.6], [0.5, 0.66], [0.66, 0.72], [0.4, 0.84], [0.6, 0.88], [0.82, 0.7],
  ];
  const d = size * 0.1;
  for (const [dx, dy] of dots)
    s.addShape(pres.ShapeType.rect, { x: x + size * dx, y: y + size * dy, w: d, h: d, fill: { color: INK }, line: { type: "none" } });
}

/* ---------------- 2 · Problem ---------------- */
{
  const s = lightSlide("The problem");
  s.addText([
    { text: "Students meet constantly — ", options: {} },
    { text: "and forget almost all of it.", options: { color: "4F6B00" } },
  ], { x: M, y: 0.95, w: 11.9, h: 1.1, fontFace: SANS, fontSize: 38, bold: true, color: INK, margin: 0, lineSpacingMultiple: 1.0 });

  const items = [
    ["The name", "A great conversation, then “sorry — remind me your name?” by the stairs."],
    ["The context", "You can’t place where you met, which makes following up feel awkward."],
    ["The thread", "No shared anchor. LinkedIn requests go unsent and the lead fades within 48h."],
  ];
  const cw = 3.85, gap = 0.33, x0 = M, y0 = 2.5, ch = 3.5;
  items.forEach(([t, d], i) => {
    const x = x0 + i * (cw + gap);
    card(s, x, y0, cw, ch);
    s.addShape(pres.ShapeType.rect, { x: x + 0.3, y: y0 + 0.32, w: 0.5, h: 0.5, fill: { color: VOLT }, line: { color: INK, width: 1 } });
    s.addText(String(i + 1), { x: x + 0.3, y: y0 + 0.38, w: 0.5, h: 0.4, align: "center", fontFace: MONO, fontSize: 18, bold: true, color: INK, margin: 0 });
    s.addText(t, { x: x + 0.3, y: y0 + 1.15, w: cw - 0.6, h: 0.5, fontFace: SANS, fontSize: 22, bold: true, color: INK, margin: 0 });
    s.addText(d, { x: x + 0.3, y: y0 + 1.75, w: cw - 0.6, h: 1.5, fontFace: SANS, fontSize: 14.5, color: SOFT, margin: 0, lineSpacingMultiple: 1.12 });
  });
  s.addText("The network is there in the room. The memory isn’t.", {
    x: M, y: 6.35, w: 11, h: 0.4, fontFace: MONO, fontSize: 13, bold: true, italic: true, color: MUTED, margin: 0,
  });
  footer(s, 2);
}

/* ---------------- 3 · Insight / why QR ---------------- */
{
  const s = lightSlide("The insight");
  s.addText("A lanyard already identifies every student — it just does nothing after the room.",
    { x: M, y: 0.95, w: 8.5, h: 1.6, fontFace: SANS, fontSize: 34, bold: true, color: INK, margin: 0, lineSpacingMultiple: 1.05 });
  const points = [
    "Everyone wears one and knows how to show a badge.",
    "A phone camera already scans a QR — no app install.",
    "Turn the badge into a live card that carries the memory itself.",
  ];
  points.forEach((p, i) => {
    const y = 2.95 + i * 0.95;
    s.addShape(pres.ShapeType.rect, { x: M, y: y + 0.05, w: 0.28, h: 0.28, fill: { color: VOLT }, line: { color: INK, width: 1 } });
    s.addText(p, { x: M + 0.5, y, w: 7.6, h: 0.7, fontFace: SANS, fontSize: 18, color: SOFT, margin: 0, valign: "top" });
  });
  card(s, 9.35, 2.4, 3.3, 4.0, INK);
  qrMotif(s, 10.1, 2.85, 1.8);
  s.addText("BADGE →\nLIVE CARD", { x: 9.35, y: 4.95, w: 3.3, h: 0.9, align: "center", fontFace: MONO, fontSize: 15, bold: true, color: VOLT, margin: 0, lineSpacingMultiple: 1.1 });
  footer(s, 3);
}

/* ---------------- 4 · What it is ---------------- */
{
  const s = lightSlide("What it is");
  s.addText("Lanyard is a living profile card students exchange with one scan or a 4-character code.",
    { x: M, y: 0.9, w: 11.9, h: 1.0, fontFace: SANS, fontSize: 30, bold: true, color: INK, margin: 0 });
  const feats = [
    ["Living card", "Name, university, course & year, age, tagline, what people can come to you for, about, and every social link."],
    ["QR or 4-char code", "Show your code; they scan or type it. Both cards land in each other’s networks instantly."],
    ["The hello note", "A per-person note baked into the QR — “we met at the Claude Builders Hackathon” — so the context survives."],
    ["A photo together", "Snap a shared selfie the moment you meet; it’s attached to both cards as the visual memory."],
  ];
  const gw = 5.9, gh = 1.85, gx = 0.3, gy = 0.28;
  feats.forEach(([t, d], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = M + col * (gw + gx), y = 2.15 + row * (gh + gy);
    card(s, x, y, gw, gh);
    s.addText(t, { x: x + 0.3, y: y + 0.24, w: gw - 0.6, h: 0.4, fontFace: SANS, fontSize: 19, bold: true, color: INK, margin: 0 });
    s.addText(d, { x: x + 0.3, y: y + 0.72, w: gw - 0.6, h: 1.0, fontFace: SANS, fontSize: 14, color: SOFT, margin: 0, lineSpacingMultiple: 1.1 });
  });
  footer(s, 4);
}

/* ---------------- 5 · The card fields ---------------- */
{
  const s = lightSlide("The card");
  s.addText("Everything a contact app should have — built for a student.", {
    x: M, y: 0.9, w: 11.5, h: 0.7, fontFace: SANS, fontSize: 28, bold: true, color: INK, margin: 0 });
  // pass mock
  card(s, 8.95, 0.9, 3.55, 5.9, WHITE);
  s.addShape(pres.ShapeType.rect, { x: 8.95, y: 0.9, w: 3.55, h: 0.85, fill: { color: INK }, line: { type: "none" } });
  s.addShape(pres.ShapeType.rect, { x: 8.95, y: 1.66, w: 3.55, h: 0.09, fill: { color: VOLT }, line: { type: "none" } });
  s.addText("lanyard", { x: 9.2, y: 1.08, w: 2, h: 0.4, fontFace: MONO, fontSize: 16, bold: true, color: VOLT, margin: 0 });
  s.addText("Maya Chen", { x: 9.2, y: 2.0, w: 3.1, h: 0.45, fontFace: SANS, fontSize: 22, bold: true, color: INK, margin: 0 });
  s.addText("BSc MECHANICAL / UCL / YEAR 2", { x: 9.2, y: 2.5, w: 3.1, h: 0.3, fontFace: MONO, fontSize: 9, bold: true, color: MUTED, margin: 0 });
  ["CAD", "MOTORSPORT", "INTERNSHIPS"].forEach((t, i) => voltChip(s, t, 9.2 + i * 1.08, 2.95, 1.0));
  qrMotif(s, 9.62, 3.55, 2.2);
  s.addText("SCAN TO CONNECT", { x: 8.95, y: 5.95, w: 3.55, h: 0.3, align: "center", fontFace: MONO, fontSize: 9, bold: true, color: INK, margin: 0 });

  const fields = ["Name", "University", "Course / degree", "Year of study", "Age (from birthday)", "One-line tagline",
    "What people can come to me for", "About me", "Hello note (per person)", "LinkedIn · GitHub · Portfolio · Instagram", "Email", "A photo together"];
  fields.forEach((f, i) => {
    const col = i < 6 ? 0 : 1;
    const row = col === 0 ? i : i - 6;
    const x = M + col * 3.55, y = 1.95 + row * 0.78;
    s.addShape(pres.ShapeType.rect, { x, y: y + 0.08, w: 0.16, h: 0.16, fill: { color: VOLT_D }, line: { type: "none" } });
    s.addText(f, { x: x + 0.32, y, w: 3.2, h: 0.55, fontFace: SANS, fontSize: 14.5, bold: i === 8 || i === 11, color: i === 8 || i === 11 ? "4F6B00" : INK, margin: 0, valign: "top" });
  });
  footer(s, 5);
}

/* ---------------- 6 · How it works ---------------- */
{
  const s = lightSlide("How it works");
  s.addText("Four seconds. Both networks updated.", { x: M, y: 0.9, w: 10, h: 0.7, fontFace: SANS, fontSize: 32, bold: true, color: INK, margin: 0 });
  const steps = [
    ["Show", "Open your pass — the QR and 4-char code are right there."],
    ["Scan / type", "They scan with their camera or enter the code in Swap."],
    ["Note + photo", "The hello note rides in the QR; optionally snap a selfie."],
    ["Saved", "Both cards, the note and the photo land in each other’s network."],
  ];
  const cw = 2.92, gap = 0.28;
  steps.forEach(([t, d], i) => {
    const x = M + i * (cw + gap), y = 2.2;
    card(s, x, y, cw, 3.3);
    s.addText("0" + (i + 1), { x: x + 0.25, y: y + 0.25, w: 1.4, h: 0.6, fontFace: MONO, fontSize: 26, bold: true, color: "4F6B00", margin: 0 });
    if (i < 3) s.addText("→", { x: x + cw - 0.55, y: y + 0.3, w: 0.5, h: 0.5, fontFace: MONO, fontSize: 22, bold: true, color: MUTED, margin: 0 });
    s.addText(t, { x: x + 0.25, y: y + 1.1, w: cw - 0.5, h: 0.45, fontFace: SANS, fontSize: 20, bold: true, color: INK, margin: 0 });
    s.addText(d, { x: x + 0.25, y: y + 1.6, w: cw - 0.5, h: 1.5, fontFace: SANS, fontSize: 13.5, color: SOFT, margin: 0, lineSpacingMultiple: 1.12 });
  });
  s.addText("Works over plain HTTPS — cellular, guest Wi-Fi, anywhere. No pairing friction.",
    { x: M, y: 5.85, w: 11.5, h: 0.4, fontFace: MONO, fontSize: 13, bold: true, color: "4F6B00", margin: 0 });
  footer(s, 6);
}

/* ---------------- 7 · The memory layer ---------------- */
{
  const s = lightSlide("Why it sticks");
  s.addText("We don’t just store a link — we store the reason you’d message them.",
    { x: M, y: 0.9, w: 11.9, h: 0.9, fontFace: SANS, fontSize: 29, bold: true, color: INK, margin: 0 });
  const blocks = [
    ["The hello note", "Different for every person you show. Embedded in the QR itself, so a passive lock-screen code still carries where you met."],
    ["The together photo", "A shared JPEG attached to both connection cards — the fastest cue for a face and a night."],
    ["The follow-up", "A one-tap AI draft references what they offer and where you met — a specific, sendable opener before it goes cold."],
  ];
  const cw = 3.85;
  blocks.forEach(([t, d], i) => {
    const x = M + i * (cw + 0.33), y = 2.2;
    card(s, x, y, cw, 3.9, i === 0 ? VOLT : SURFACE);
    s.addText(t, { x: x + 0.3, y: y + 0.3, w: cw - 0.6, h: 0.8, fontFace: SANS, fontSize: 21, bold: true, color: INK, margin: 0 });
    s.addText(d, { x: x + 0.3, y: y + 1.2, w: cw - 0.6, h: 2.4, fontFace: SANS, fontSize: 14.5, color: INK, margin: 0, lineSpacingMultiple: 1.15 });
  });
  footer(s, 7);
}

/* ---------------- 8 · Tech / stats ---------------- */
{
  const s = lightSlide("Built for real");
  s.addText("A real, deployed product — near-zero cost, no app to install.", {
    x: M, y: 0.9, w: 11.9, h: 0.7, fontFace: SANS, fontSize: 28, bold: true, color: INK, margin: 0 });
  const stats = [
    ["1", "scan to exchange a full card"],
    ["4", "characters to join without a camera"],
    ["0", "apps to install — runs in the browser"],
    ["~2 s", "to a reciprocal connection"],
  ];
  stats.forEach(([n, l], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = M + col * 3.35, y = 2.1 + row * 2.15;
    card(s, x, y, 3.05, 1.9);
    s.addText(n, { x: x + 0.28, y: y + 0.22, w: 2.5, h: 0.9, fontFace: MONO, fontSize: 44, bold: true, color: INK, margin: 0 });
    s.addText(l, { x: x + 0.3, y: y + 1.2, w: 2.5, h: 0.6, fontFace: SANS, fontSize: 13, color: SOFT, margin: 0 });
  });
  const stack = ["Vue 3 + Vite", "Cloudflare Workers", "Cloudflare KV", "client-side QR", "WebRTC-free HTTPS relay", "Claude follow-ups"];
  s.addText("STACK", { x: 7.7, y: 2.2, w: 4, h: 0.3, fontFace: MONO, fontSize: 11, bold: true, color: MUTED, charSpacing: 2, margin: 0 });
  stack.forEach((t, i) => voltChip(s, t, 7.7 + (i % 2) * 2.45, 2.6 + Math.floor(i / 2) * 0.62, 2.3));
  s.addText("Free tier comfortably covers a campus-scale demo: 100k KV reads / day.",
    { x: 7.7, y: 5.0, w: 4.9, h: 0.8, fontFace: SANS, fontSize: 14, color: SOFT, margin: 0 });
  footer(s, 8);
}

/* ---------------- 9 · Vision / close (dark) ---------------- */
{
  const s = darkSlide();
  s.addText("From “nice to meet you”\nto actually meeting again.", {
    x: M, y: 1.5, w: 9.6, h: 1.9, fontFace: SANS, fontSize: 44, bold: true, color: WHITE, margin: 0, lineSpacingMultiple: 1.02,
  });
  s.addText("Lanyard turns every campus encounter into a card, a note and a face — so the people you meet become the network you keep.",
    { x: M, y: 3.7, w: 8.6, h: 1.0, fontFace: SANS, fontSize: 18, color: "C9CCC0", margin: 0 });
  voltChip(s, "Try it — scan or enter the code live", M, 5.2, 5.0);
  card(s, 10.2, 1.5, 2.4, 3.6, WHITE);
  qrMotif(s, 10.45, 1.75, 1.9);
  s.addText("SCAN TO CONNECT", { x: 10.2, y: 4.55, w: 2.4, h: 0.3, align: "center", fontFace: MONO, fontSize: 9, bold: true, color: INK, margin: 0 });
  s.addText("lanyard", { x: M, y: 6.6, w: 3, h: 0.4, fontFace: MONO, fontSize: 13, bold: true, color: VOLT, margin: 0 });
}

pres.writeFile({ fileName: "Lanyard-pitch.pptx" }).then((f) => console.log("wrote", f));
