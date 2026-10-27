import QRCode from "qrcode";

// Badge colours. These mirror the CSS custom properties on `.badge` in
// main.css, because the PNG export is a scaled-up replica of the on-screen
// badge (same measurements in CSS px, drawn at 3x), not a separate design.
const C = { ink: "#1B1A17" };
const THEMES = {
  light: { bg: "#FFFDF8", ink: "#1B1A17", graphite: "#6B675F", rule: "#D8D2C5", strap: "#D9502B" },
  formal: { bg: "#FFFDF8", ink: "#1B1A17", graphite: "#6B675F", rule: "#D8D2C5", strap: "#2B3138" },
  night: { bg: "#1F1D1A", ink: "#F4F1EA", graphite: "#A29D92", rule: "#38352F", strap: "#D9502B" },
};
const PAPER = "#F4F1EA";

const FONT = (size, weight = 400, italic = false) =>
  `${italic ? "italic " : ""}${weight} ${size}px "Atkinson Hyperlegible Next", system-ui, -apple-system, "Segoe UI", sans-serif`;

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, pa) => {
  const A = hex(a), B = hex(b);
  return "#" + A.map((v, i) => Math.round(v * pa + B[i] * (1 - pa)).toString(16).padStart(2, "0")).join("");
};

// Text with CSS-style letter-spacing (added after every character, including
// the last, exactly as browsers do). `ls` is in px.
function spacedWidth(ctx, text, ls) {
  if (!ls) return ctx.measureText(text).width;
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + ls;
  return w;
}
function truncateTo(ctx, text, maxW, ls) {
  const s = String(text || "");
  if (spacedWidth(ctx, s, ls) <= maxW) return s;
  let cut = s;
  while (cut.length > 1 && spacedWidth(ctx, cut + "…", ls) > maxW) cut = cut.slice(0, -1);
  return cut.trimEnd() + "…";
}
// Baseline of a line box, the way CSS places it: centred half-leading around
// the font's ascent+descent.
function baselineIn(ctx, size, lineH, lineTop) {
  const m = ctx.measureText("Hg");
  const asc = m.fontBoundingBoxAscent ?? size * 0.93;
  const desc = m.fontBoundingBoxDescent ?? size * 0.24;
  return lineTop + (lineH - (asc + desc)) / 2 + asc;
}
// Draw one line in a CSS line box. align: left | right | center (x is the
// left / right / centre of the box).
function line(ctx, text, x, lineTop, { size, lineH, weight = 400, italic = false, color, ls = 0, align = "left" }) {
  ctx.font = FONT(size, weight, italic);
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const w = spacedWidth(ctx, text, ls);
  const left = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  const base = baselineIn(ctx, size, lineH, lineTop);
  if (!ls) { ctx.fillText(text, left, base); return w; }
  let cx = left;
  for (const ch of text) { ctx.fillText(ch, cx, base); cx += ctx.measureText(ch).width + ls; }
  return w;
}

// Up to maxLines wrapped lines; the last is cut with an ellipsis if it overflows
// (-webkit-line-clamp behaviour).
function wrapClamp(ctx, text, maxW, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (cur && ctx.measureText(t).width > maxW) { lines.push(cur); cur = w; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const head = lines.slice(0, maxLines - 1);
  return [...head, truncateTo(ctx, lines.slice(maxLines - 1).join(" "), maxW, 0)];
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Draws the badge exactly as `components/Badge.vue` + the `.badge*` CSS lay it
// out (352px wide card, 76px strap, 68px photo, 160px QR box …), scaled 3x.
export async function drawBadge(canvas, view, url) {
  const S = 3;
  const CARD_W = 352, B = 1.5, PAD = 28;
  const t = { ...(THEMES[view?.theme === "night" ? "night" : view?.theme === "formal" ? "formal" : "light"]) };
  if (view?.strapColor) t.strap = view.strapColor;
  const p = view?.profile || {};

  await document.fonts.ready;
  try { await document.fonts.load(FONT(16, 700), "Ag"); await document.fonts.load(FONT(16, 400), "Ag"); } catch { /* fall back to system font */ }

  const headline = (p.headline || "").slice(0, 80);
  const tags = (p.tags || []).slice(0, 4);
  const note = (view?.note || "").slice(0, 160);
  const meta = [p.course, p.uni, p.year].filter(Boolean).join(" · ");
  const caption = view?.code && view?.codeRotatesAt
    ? `Code valid until ${new Date(view.codeRotatesAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
    : "";

  const mctx = document.createElement("canvas").getContext("2d");
  const bodyW = CARD_W - 2 * B - 40; // 309

  // ---- measure (CSS px) ----
  const chipFont = FONT(12.5, 700);
  mctx.font = chipFont;
  const chips = [];
  { let x = 0, row = 0;
    for (const tag of tags) {
      const maxText = 136 - 29;
      const label = truncateTo(mctx, tag, maxText, 0.125);
      const w = Math.min(136, spacedWidth(mctx, label, 0.125) + 29);
      if (x + w > bodyW && x > 0) { row++; x = 0; }
      chips.push({ label, x, row, w });
      x += w + 8;
    } }
  const chipRows = chips.length ? chips[chips.length - 1].row + 1 : 0;

  mctx.font = FONT(14, 400, true);
  const noteLines = note ? wrapClamp(mctx, `“${note}”`, bodyW, 2) : [];

  const headH = 68;
  let bodyH = headH;
  if (headline) bodyH += 12 + 49.75;
  if (chipRows) bodyH += 12 + (1 + 9 + 16.5 + 7 + chipRows * 29.75 + (chipRows - 1) * 7);
  if (noteLines.length) bodyH += 12 + (12 + noteLines.length * 21);
  bodyH += 12 + 2 + 160; // qr (+ margin-top 2)
  bodyH += 12 + 16.5 + (view?.code ? 2 + 27 : 0); // footer
  const cardH = B + 76 + 20 + bodyH + 18 + B;

  const W = CARD_W + PAD * 2;
  const H = PAD + cardH + PAD + (caption ? 26 : 0);
  canvas.width = Math.round(W * S);
  canvas.height = Math.round(H * S);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(S, S);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // page backdrop
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  const cx = PAD, cy = PAD;
  // card + shadow
  ctx.save();
  ctx.shadowColor = "rgba(27,26,23,0.18)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 9;
  ctx.fillStyle = t.bg;
  rr(ctx, cx, cy, CARD_W, cardH, 8); ctx.fill();
  ctx.restore();

  ctx.save();
  rr(ctx, cx, cy, CARD_W, cardH, 8); ctx.clip();
  ctx.fillStyle = t.bg; ctx.fillRect(cx, cy, CARD_W, cardH);

  const ix = cx + B, iy = cy + B, iw = CARD_W - 2 * B;

  // ---- strap ----
  ctx.fillStyle = t.strap; ctx.fillRect(ix, iy, iw, 76);
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  rr(ctx, ix + iw / 2 - 36, iy + 20, 72, 15, 3); ctx.fill();
  mctx.font = FONT(15, 700);
  const word = truncateTo(mctx, "lanyard", iw * 0.35, -0.15);
  line(ctx, word, ix + 22, iy + 76 - 12 - 22.5, { size: 15, lineH: 22.5, weight: 700, color: "#FFFFFF", ls: -0.15 });
  mctx.font = FONT(10.5, 700);
  const evW = iw - iw / 2 - 22;
  const ev = truncateTo(mctx, String(view?.name || "General").toUpperCase(), evW, 1.26);
  line(ctx, ev, ix + iw - 22, iy + 76 - 13 - 15.75, { size: 10.5, lineH: 15.75, weight: 700, color: "rgba(255,255,255,.82)", ls: 1.26, align: "right" });

  // ---- body ----
  const bx = ix + 20;
  let y = iy + 76 + 20;

  // head row
  const photoX = bx, photoY = y;
  ctx.fillStyle = t.rule;
  rr(ctx, photoX, photoY, 68, 68, 4); ctx.fill();
  ctx.save();
  rr(ctx, photoX + 1.5, photoY + 1.5, 65, 65, 2.5); ctx.clip();
  let drewPhoto = false;
  if (p.photo) {
    try {
      const img = await loadImage(p.photo);
      const sc = Math.max(65 / img.width, 65 / img.height);
      const dw = img.width * sc, dh = img.height * sc;
      ctx.drawImage(img, photoX + 1.5 + (65 - dw) / 2, photoY + 1.5 + (65 - dh) / 2, dw, dh);
      drewPhoto = true;
    } catch { /* placeholder below */ }
  }
  if (!drewPhoto) {
    // silhouette, same shapes as components/Avatar.vue, in the photo's content box
    const k = 65 / 64, ox = photoX + 1.5, oy = photoY + 1.5;
    ctx.fillStyle = mix(t.graphite, t.rule, 0.7);
    ctx.beginPath(); ctx.arc(ox + 32 * k, oy + 24 * k, 11 * k, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ox + 9 * k, oy + 64 * k);
    ctx.bezierCurveTo(ox + 9 * k, oy + 49.6 * k, ox + 19.3 * k, oy + 41 * k, ox + 32 * k, oy + 41 * k);
    ctx.bezierCurveTo(ox + 44.7 * k, oy + 41 * k, ox + 55 * k, oy + 49.6 * k, ox + 55 * k, oy + 64 * k);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = t.ink; ctx.lineWidth = 1.5;
  rr(ctx, photoX + 0.75, photoY + 0.75, 66.5, 66.5, 3.25); ctx.stroke();

  const tx = photoX + 68 + 14, tw = bodyW - 68 - 14;
  const blockH = 22.4 + (meta ? 2 + 19.5 : 0);
  const blockTop = photoY + (68 - blockH) / 2;
  mctx.font = FONT(20, 700);
  line(ctx, truncateTo(mctx, p.name || "Your name", tw, -0.3), tx, blockTop, { size: 20, lineH: 22.4, weight: 700, color: t.ink, ls: -0.3 });
  if (meta) {
    mctx.font = FONT(13, 400);
    line(ctx, truncateTo(mctx, meta, tw, 0), tx, blockTop + 22.4 + 2, { size: 13, lineH: 19.5, color: t.graphite });
  }
  y += headH + 12;

  const rule = (yy) => { ctx.fillStyle = t.rule; ctx.fillRect(bx, yy, bodyW, 1); };
  const label = (text, yy) => line(ctx, text.toUpperCase(), bx, yy, { size: 11, lineH: 16.5, weight: 700, color: t.graphite, ls: 1.43 });

  if (headline) {
    rule(y);
    label("What I do", y + 1 + 9);
    mctx.font = FONT(13.5, 400);
    line(ctx, truncateTo(mctx, headline, bodyW, 0), bx, y + 1 + 9 + 16.5 + 3, { size: 13.5, lineH: 20.25, color: t.ink });
    y += 49.75 + 12;
  }

  if (chips.length) {
    rule(y);
    label("Come to me for", y + 1 + 9);
    const top = y + 1 + 9 + 16.5 + 7;
    for (const c of chips) {
      const cyy = top + c.row * (29.75 + 7);
      const cxx = bx + c.x;
      ctx.strokeStyle = t.rule; ctx.lineWidth = 1.5;
      rr(ctx, cxx + 0.75, cyy + 0.75, c.w - 1.5, 29.75 - 1.5, 3.25); ctx.stroke();
      line(ctx, c.label, cxx + 1.5 + 13, cyy + 1.5 + 4, { size: 12.5, lineH: 18.75, weight: 700, color: t.graphite, ls: 0.125 });
    }
    y += 1 + 9 + 16.5 + 7 + chipRows * 29.75 + (chipRows - 1) * 7 + 12;
  }

  if (noteLines.length) {
    rule(y);
    noteLines.forEach((ln, i) =>
      line(ctx, ln, bx + bodyW / 2, y + 1 + 11 + i * 21, { size: 14, lineH: 21, italic: true, color: t.graphite, align: "center" }));
    y += 12 + noteLines.length * 21 + 12;
  }

  // QR box
  const qrTop = y + 2;
  const qrLeft = bx + (bodyW - 160) / 2;
  ctx.fillStyle = "#FFFFFF";
  rr(ctx, qrLeft, qrTop, 160, 160, 4); ctx.fill();
  ctx.strokeStyle = t.ink; ctx.lineWidth = 1.5;
  rr(ctx, qrLeft + 0.75, qrTop + 0.75, 158.5, 158.5, 3.25); ctx.stroke();
  const qrImg = await loadImage(await QRCode.toDataURL(url, {
    width: 1200, margin: 0, errorCorrectionLevel: "M",
    color: { dark: C.ink, light: "#FFFFFF" },
  }));
  ctx.drawImage(qrImg, qrLeft + 12, qrTop + 12, 136, 136);
  y = qrTop + 160 + 12;

  // footer
  line(ctx, "SCAN TO CONNECT", bx + bodyW / 2, y, { size: 11, lineH: 16.5, weight: 700, color: t.graphite, ls: 1.43, align: "center" });
  if (view?.code) {
    line(ctx, String(view.code), bx + bodyW / 2 + 2.34, y + 16.5 + 2, { size: 18, lineH: 27, weight: 700, color: t.ink, ls: 4.68, align: "center" });
  }
  ctx.restore();

  // border
  ctx.strokeStyle = t.ink; ctx.lineWidth = 1.5;
  rr(ctx, cx + 0.75, cy + 0.75, CARD_W - 1.5, cardH - 1.5, 7.25); ctx.stroke();

  // The typed code expires; the QR doesn't. Say so under the card, outside it,
  // so the card itself stays identical to the one on screen.
  if (caption) {
    line(ctx, caption, W / 2, cy + cardH + PAD - 4, { size: 13, lineH: 19.5, color: "#6B675F", align: "center" });
  }

  return canvas;
}

export async function badgeDataUrl(view, url) {
  const canvas = document.createElement("canvas");
  await drawBadge(canvas, view, url);
  return canvas.toDataURL("image/png");
}

export async function downloadBadge(view, url, filename = "lanyard-badge.png") {
  const canvas = document.createElement("canvas");
  await drawBadge(canvas, view, url);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Small inline QR (e.g. on-screen badge). qrcode's canvas renderer writes an
// inline width/height equal to `size` onto the element, which beats any
// stylesheet rule and made the on-screen QR spill out of its box and over the
// tags and "Scan to connect" text. Clear them so CSS decides the shown size
// and `size` only sets how many pixels are drawn.
export async function drawQR(canvas, text, size = 240) {
  const out = await QRCode.toCanvas(canvas, text, {
    width: size, margin: 0, errorCorrectionLevel: "M",
    color: { dark: C.ink, light: "#FFFFFF" },
  });
  canvas.style.width = "";
  canvas.style.height = "";
  return out;
}
