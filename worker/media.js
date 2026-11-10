// Browser-compressed images land as data URLs (WebP/JPEG/PNG).
// The client compresses to WebP, max 1080px longest edge; the server enforces a
// byte ceiling and checks the bytes really are the image type they claim, so
// nothing else (HTML, SVG, scripts) can be stored and served back.
import { newId } from "./db.js";
import { HttpError } from "./session.js";

const MAX_BYTES = 1200 * 1024;

const TYPES = { webp: "image/webp", jpeg: "image/jpeg", png: "image/png" };

function sniff(b) {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "webp";
  return null;
}

function parseDataUrl(s, maxBytes = MAX_BYTES) {
  const m = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(s || ""));
  if (!m) return null;
  // Rough size check before decoding, so a huge string isn't decoded at all.
  if (m[2].length * 0.75 > maxBytes + 3) throw new HttpError(413, "That photo is too large.");
  let bytes;
  try { bytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0)); } catch { return null; }
  const real = sniff(bytes);
  if (!real || real !== m[1]) return null;
  return { bytes, type: TYPES[real], ext: real === "jpeg" ? "jpg" : real };
}

// Metadata that can say where or when a photo was taken, or who with. The browser's canvas
// re-encode already drops it, but the Worker does not trust the browser: for face photos
// (F17 event presence) it is removed again here, from the bytes, before anything is stored.
const u32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const le32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const tag = (b, i) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
const join = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
const bad = () => new HttpError(400, "That photo can't be used. Take a new one.");

export function stripMetadata(b, ext) {
  if (ext === "png") {
    const parts = [b.slice(0, 8)];
    let i = 8;
    while (i + 12 <= b.length) {
      const end = i + 12 + u32(b, i);
      if (end > b.length) throw bad();
      if (!["eXIf", "tEXt", "iTXt", "zTXt", "tIME"].includes(tag(b, i + 4))) parts.push(b.slice(i, end));
      i = end;
    }
    return join(parts);
  }
  if (ext === "jpg") {
    const parts = [b.slice(0, 2)];
    let i = 2;
    while (i + 4 <= b.length) {
      if (b[i] !== 0xff) throw bad();
      const m = b[i + 1];
      if (m === 0xda) { parts.push(b.slice(i)); return join(parts); } // the picture itself follows
      const end = i + 2 + ((b[i + 2] << 8) | b[i + 3]);
      if (end > b.length) throw bad();
      if (m !== 0xe1 && m !== 0xed && m !== 0xfe) parts.push(b.slice(i, end)); // not Exif/XMP, Photoshop or comments
      i = end;
    }
    throw bad();
  }
  // webp: RIFF chunks; drop EXIF and XMP and say so in the VP8X flags
  const parts = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const size = le32(b, i + 4);
    const end = i + 8 + size + (size & 1);
    if (i + 8 + size > b.length) throw bad();
    const t = tag(b, i);
    if (t !== "EXIF" && t !== "XMP ") {
      const chunk = b.slice(i, Math.min(end, b.length));
      if (t === "VP8X" && chunk.length > 8) chunk[8] &= ~0x0c;
      parts.push(chunk);
    }
    i = end;
  }
  const body = join(parts);
  const out = new Uint8Array(12 + body.length);
  out.set(b.slice(0, 12));
  out.set(body, 12);
  const riff = out.length - 8;
  out[4] = riff & 255; out[5] = (riff >> 8) & 255; out[6] = (riff >> 16) & 255; out[7] = (riff >>> 24) & 255;
  return out;
}

// strip: remove metadata first (face photos). maxBytes: a lower ceiling than the default.
export async function putImage(env, dataUrl, prefix = "u", { strip = false, maxBytes = MAX_BYTES } = {}) {
  const parsed = parseDataUrl(dataUrl, maxBytes);
  if (!parsed) throw new HttpError(400, "That file isn't a supported image (WebP, JPEG or PNG).");
  if (parsed.bytes.byteLength > maxBytes) throw new HttpError(413, "That photo is too large.");
  const bytes = strip ? stripMetadata(parsed.bytes, parsed.ext) : parsed.bytes;
  const key = `${prefix}/${newId()}${newId()}.${parsed.ext}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: parsed.type } });
  return key;
}

// `isPrivate` images (shared selfies) are only cached by the viewer's browser,
// briefly, so removing a connection takes effect quickly.
// `noStore` (event presence selfies) is not cached at all, so withdrawing one takes effect at once.
export async function getImage(env, key, { isPrivate = false, noStore = false } = {}) {
  const obj = await env.MEDIA.get(key);
  if (!obj) return null;
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType || "image/webp",
      "cache-control": noStore ? "private, no-store" : isPrivate ? "private, max-age=3600" : "public, max-age=86400",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-origin",
    },
  });
}

export async function deleteImage(env, key) {
  if (key) await env.MEDIA.delete(key);
}
