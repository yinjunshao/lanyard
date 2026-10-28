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

function parseDataUrl(s) {
  const m = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(s || ""));
  if (!m) return null;
  // Rough size check before decoding, so a huge string isn't decoded at all.
  if (m[2].length * 0.75 > MAX_BYTES + 3) throw new HttpError(413, "That photo is too large.");
  let bytes;
  try { bytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0)); } catch { return null; }
  const real = sniff(bytes);
  if (!real || real !== m[1]) return null;
  return { bytes, type: TYPES[real], ext: real === "jpeg" ? "jpg" : real };
}

export async function putImage(env, dataUrl, prefix = "u") {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new HttpError(400, "That file isn't a supported image (WebP, JPEG or PNG).");
  if (parsed.bytes.byteLength > MAX_BYTES) throw new HttpError(413, "That photo is too large.");
  const key = `${prefix}/${newId()}${newId()}.${parsed.ext}`;
  await env.MEDIA.put(key, parsed.bytes, { httpMetadata: { contentType: parsed.type } });
  return key;
}

// `isPrivate` images (shared selfies) are only cached by the viewer's browser,
// briefly, so removing a connection takes effect quickly.
export async function getImage(env, key, { isPrivate = false } = {}) {
  const obj = await env.MEDIA.get(key);
  if (!obj) return null;
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType || "image/webp",
      "cache-control": isPrivate ? "private, max-age=3600" : "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-origin",
    },
  });
}

export async function deleteImage(env, key) {
  if (key) await env.MEDIA.delete(key);
}
