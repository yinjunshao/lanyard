// A QR code as one SVG path (F19), for the present page and the poster. Vector, so it stays
// sharp from a laptop to a 4K screen to paper, and nothing is drawn on a canvas. The quiet
// zone is 4 modules on every side, as the QR standard asks; error correction M, like the badge.
import QRCode from "qrcode";

export function qrPath(text) {
  const { modules } = QRCode.create(String(text), { errorCorrectionLevel: "M" });
  const n = modules.size, margin = 4;
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!modules.get(x, y)) continue;
      let w = 1;
      while (x + w < n && modules.get(x + w, y)) w++;
      d += `M${x + margin} ${y + margin}h${w}v1h-${w}z`;
      x += w - 1;
    }
  }
  return { size: n + margin * 2, modules: n, d };
}
