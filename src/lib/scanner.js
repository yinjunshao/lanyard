// QR scanning: native BarcodeDetector where available, jsQR fallback.
// Lazy-loads jsQR so public pages stay under the JS budget.
import { Api } from "./api";

const detectors = ("BarcodeDetector" in window)
  ? (() => { try { return [new BarcodeDetector({ formats: ["qr_code"] })]; } catch { return []; } })()
  : [];

let jsqrPromise = null;
function loadJsQR() {
  if (!jsqrPromise) jsqrPromise = import("jsqr").then((m) => m.default || m.jsQR);
  return jsqrPromise;
}

async function decodeFrame(video) {
  if (detectors.length) {
    const codes = await detectors[0].detect(video);
    const v = codes?.[0]?.rawValue;
    if (v) return v;
    return null;
  }
  const canvas = document.createElement("canvas");
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return null;
  // Sample at reduced resolution for speed.
  const scale = Math.min(1, 720 / Math.max(w, h));
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const jsQR = await loadJsQR();
  const found = jsQR(data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" });
  return found?.data || null;
}

// Start scanning into a <video> element. Calls onResult(rawValue) once.
// Returns a stop() function.
export function startScanner(video, { onResult, onError } = {}) {
  let stopped = false;
  let stream = null;
  let raf = 0;
  let last = 0;

  async function loop() {
    if (stopped) return;
    try {
      if (video.readyState >= 2 && Date.now() - last > 250) {
        const value = await decodeFrame(video);
        if (value) {
          last = Date.now();
          await onResult?.(value);
        }
      }
    } catch (e) {
      // transient decode error; keep looping
    }
    raf = requestAnimationFrame(loop);
  }

  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      video.setAttribute("playsinline", "");
      await video.play();
      loop();
    } catch (e) {
      onError?.(e);
    }
  })();

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
}

// Resolve any scanned or typed string into a route descriptor:
//   { kind: "card", cardId, search } | { kind: "event", eventCode, search } | { kind: "unknown" }
// - A card URL (/c/<10-hex id>) already names the card, so it resolves locally,
//   and its query (?n= personal-note token, ?event=) is carried along.
// - An event URL (/e/<CODE>) resolves locally too: the QR a host displays is
//   always /e/<code>, whatever origin it was generated on.
// - Anything else is treated as a typed short code (spaces and dashes ignored,
//   case-insensitive): the 4-character card code or the 5-character event
//   code. Those go to the API, which also rate-limits wrong guesses. With
//   { camera: true } bare strings are never looked up.
export async function resolveScanned(raw, { camera = false } = {}) {
  let value_ = null;
  const value = String(raw || "").trim();
  let search = "";
  try {
    const u = new URL(value, location.origin);
    const m = u.pathname.match(/^\/([ce])\/([A-Za-z0-9]{4,12})\/?$/);
    if (m) {
      search = u.search;
      const kind = m[1].toLowerCase();
      const id = m[2];
      if (kind === "c" && /^[0-9a-f]{10}$/i.test(id)) return { kind: "card", cardId: id.toLowerCase(), search };
      if (kind === "e") return { kind: "event", eventCode: id.toUpperCase(), search };
      value_ = id; // /c/<short code>: fall through to the API lookup
    }
  } catch { /* not a URL */ }
  // A camera only ever sees QR payloads; random QR codes in the wild must not
  // be looked up as short codes (each wrong lookup counts against the limit).
  if (camera && value_ === null) return { kind: "unknown", value };
  const code = String(value_ ?? value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < 4 || code.length > 12) return { kind: "unknown", value };
  const res = await Api.resolveCode(code);
  return { ...res, search };
}
