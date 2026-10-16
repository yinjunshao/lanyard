import QRCode from "qrcode";

// Render a bare QR into a <canvas> element (used for small inline codes).
export async function drawQR(canvas, text, size = 260) {
  return QRCode.toCanvas(canvas, text, { width: size, margin: 1, errorCorrectionLevel: "M", color: { dark: "#0e1110", light: "#ffffff" } });
}

const C = {
  ink: "#0e1110",
  paper: "#eef0e7",
  surface: "#f7f8f2",
  volt: "#c8f238",
  voltDeep: "#9fd000",
  muted: "#6c7368",
  soft: "#39403a",
  line: "#cfd3c3",
};
const FONT_DISPLAY = "600 %spx 'Space Grotesk', Arial, sans-serif";
const FONT_MONO = "700 %spx 'Space Mono', monospace";

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function ageFromBirthday(b) {
  if (!b || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
  const d = new Date(b);
  if (isNaN(d)) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 120 ? age : null;
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// Draw the full branded Lanyard personal pass onto a canvas at a given scale.
export async function drawPass(canvas, profile, url, scale = 2) {
  const W = 720, H = 1180;
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  // setTransform (not scale) so repeated redraws on the same canvas reset
  // instead of compounding — otherwise each pass stacks 2×/4×/8× on itself.
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.textBaseline = "alphabetic";

  // Paper background
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);

  // Technical frame
  ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, W - 28, H - 28);

  // Volt brand band
  const bandH = 132;
  ctx.fillStyle = C.ink;
  ctx.fillRect(14, 14, W - 28, bandH);
  ctx.fillStyle = C.volt;
  ctx.fillRect(14, 14 + bandH - 14, W - 28, 14);

  // Lanyard slot
  ctx.fillStyle = C.paper;
  roundRect(ctx, W / 2 - 46, 40, 92, 14, 7); ctx.fill();

  // Wordmark
  ctx.textAlign = "left";
  ctx.fillStyle = C.volt;
  ctx.font = FONT_MONO.replace("%s", "30");
  ctx.fillText("lanyard", 44, 116);

  // Card body
  const cardX = 40, cardY = 188, cardW = W - 80, cardH = H - 188 - 150;
  ctx.fillStyle = C.surface;
  roundRect(ctx, cardX, cardY, cardW, cardH, 18); ctx.fill();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();

  const pad = 40;
  let y = cardY + 60;

  // Name
  ctx.textAlign = "center";
  ctx.fillStyle = C.ink;
  ctx.font = FONT_DISPLAY.replace("%s", "50");
  const nameLines = wrapText(ctx, profile?.name || "Your name", cardW - pad * 2);
  nameLines.slice(0, 2).forEach((ln, i) => ctx.fillText(ln, W / 2, y + i * 54));
  y += nameLines.slice(0, 2).length * 54 + 8;

  // Course · uni · year (mono meta)
  ctx.fillStyle = C.muted;
  ctx.font = FONT_MONO.replace("%s", "18");
  const age = profile?.age != null ? profile.age : ageFromBirthday(profile?.birthday);
  const metaParts = [profile?.course, profile?.uni, profile?.year, age ? `Age ${age}` : null]
    .filter(Boolean).join("  /  ") || "STUDENT";
  wrapText(ctx, metaParts.toUpperCase(), cardW - pad * 2).slice(0, 2).forEach((ln) => { ctx.fillText(ln, W / 2, y); y += 26; });
  y += 14;

  // Tag chips — volt filled, sharp corners
  const tags = (profile?.specialties || []).slice(0, 4);
  if (tags.length) {
    ctx.font = FONT_MONO.replace("%s", "15");
    const gap = 10;
    const widths = tags.map((t) => ctx.measureText(t.toUpperCase()).width + 28);
    let total = widths.reduce((a, b) => a + b, 0) + gap * (tags.length - 1);
    // wrap chips if too wide
    const maxRow = cardW - pad * 2;
    const rows = [];
    let row = [], rowW = 0;
    tags.forEach((t, i) => {
      const w = widths[i];
      if (rowW + w + (row.length ? gap : 0) > maxRow && row.length) { rows.push({ tags: row, w: rowW }); row = []; rowW = 0; }
      row.push({ t, w }); rowW += w + (row.length > 1 ? gap : 0);
    });
    if (row.length) rows.push({ tags: row, w: row.reduce((s, c, i) => s + c.w + (i ? gap : 0), 0) });
    ctx.textAlign = "left";
    rows.slice(0, 2).forEach((rObj) => {
      let x = W / 2 - rObj.w / 2;
      rObj.tags.forEach(({ t, w }) => {
        ctx.fillStyle = C.volt;
        roundRect(ctx, x, y - 22, w, 36, 8); ctx.fill();
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = C.ink;
        ctx.fillText(t.toUpperCase(), x + 14, y + 2);
        x += w + gap;
      });
      y += 46;
    });
    y += 8;
  }

  // QR — sharp-cornered white plate with volt frame.
  // Anchor the QR + labels + note upward from the footer so it never collides,
  // regardless of how many name/chip lines rendered above.
  const qrSize = 268;
  const qrData = await QRCode.toDataURL(url, { width: 800, margin: 1, errorCorrectionLevel: "M", color: { dark: C.ink, light: "#fff" } });
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = qrData; });

  const footY = H - 150;

  // Pre-wrap the note to know its height.
  const note = profile?.helloNote || "";
  let noteLines = [];
  if (note) {
    ctx.font = FONT_DISPLAY.replace("%s", "22");
    noteLines = wrapText(ctx, "“" + note + "”", cardW - pad * 2 - 24).slice(0, 2);
  }

  const blockBottom = footY - 26; // leave breathing room above the dashed footer
  // Pull the QR up so it sits right under the tags rather than leaving a gap,
  // but never let the labels/note below it breach the footer.
  const tagsBottom = y; // y is where the chip rows ended
  let tail = 44 + 42; // QR gap + "SCAN TO CONNECT"
  if (profile?.code) tail += 48 + 60;   // "OR ENTER CODE" (with gap) + code glyphs
  if (noteLines.length) tail += 18 + noteLines.length * 32;
  const lowestQrTop = blockBottom - tail - qrSize; // keep block above footer
  const qrY = Math.max(tagsBottom + 22, lowestQrTop);
  const qrX = W / 2 - qrSize / 2;

  ctx.fillStyle = C.volt;
  roundRect(ctx, qrX - 14, qrY - 14, qrSize + 28, qrSize + 28, 16); ctx.fill();
  ctx.fillStyle = "#fff";
  roundRect(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 12); ctx.fill();
  ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

  ctx.textAlign = "center";
  let ly = qrY + qrSize + 44;
  ctx.fillStyle = C.ink;
  ctx.font = FONT_MONO.replace("%s", "20");
  ctx.fillText("SCAN TO CONNECT", W / 2, ly);
  ly += 42;

  if (profile?.code) {
    ctx.fillStyle = C.muted;
    ctx.font = FONT_MONO.replace("%s", "14");
    ctx.fillText("OR ENTER CODE", W / 2, ly);
    ly += 48;

    // Large bare code — no background plate, letter-spaced mono.
    const code = String(profile.code).toUpperCase();
    ctx.fillStyle = C.ink;
    ctx.font = FONT_MONO.replace("%s", "46");
    const spacing = 12;
    const chars = code.split("");
    const totalW = chars.reduce((s, ch) => s + ctx.measureText(ch).width, 0) + spacing * (chars.length - 1);
    let tx = W / 2 - totalW / 2;
    chars.forEach((ch) => { ctx.fillText(ch, tx + ctx.measureText(ch).width / 2, ly); tx += ctx.measureText(ch).width + spacing; });
    ly += 60;
  }

  // Hello note
  if (noteLines.length) {
    ly += 18;
    ctx.fillStyle = C.soft;
    ctx.font = FONT_DISPLAY.replace("%s", "22");
    noteLines.forEach((ln) => { ctx.fillText(ln, W / 2, ly); ly += 32; });
  }

  // Footer strip
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 8]);
  ctx.beginPath(); ctx.moveTo(cardX + pad, footY); ctx.lineTo(cardX + cardW - pad, footY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = C.muted;
  ctx.font = FONT_MONO.replace("%s", "17");
  ctx.textAlign = "center";
  const host = (() => { try { return new URL(url).host; } catch { return "lanyard.app"; } })();
  ctx.fillText(host, W / 2, footY + 50);

  return canvas;
}

// Rasterise the branded pass and download it as a phone-friendly PNG.
export async function downloadPass(profile, url, filename = "lanyard-pass.png") {
  const canvas = document.createElement("canvas");
  await drawPass(canvas, profile, url, 2);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
