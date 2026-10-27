// Browser-compressed images land as data URLs or raw WebP/JPEG bytes.
// The client is required to compress to WebP, max 1080px longest edge;
// the server only enforces a hard byte ceiling and content sanity.
import { newId } from "./db.js";

const MAX_BYTES = 1200 * 1024;

const TYPES = {
  webp: "image/webp",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
};

function parseDataUrl(s) {
  const m = /^data:image\/(webp|jpeg|png);base64,([A-z0-9+/=]+)$/.exec(String(s || ""));
  if (!m) return null;
  const bytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
  return { bytes, type: TYPES[m[1]], ext: m[1] === "jpeg" ? "jpg" : m[1] };
}

export async function putImage(env, dataUrl, prefix = "u") {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw Object.assign(new Error("invalid image"), { status: 400 });
  if (parsed.bytes.byteLength > MAX_BYTES) {
    throw Object.assign(new Error("image too large"), { status: 413 });
  }
  const key = `${prefix}/${newId()}.${parsed.ext}`;
  await env.MEDIA.put(key, parsed.bytes, {
    httpMetadata: { contentType: parsed.type, cacheControl: "private, max-age=31536000, immutable" },
  });
  return key;
}

export async function getImage(env, key) {
  const obj = await env.MEDIA.get(key);
  if (!obj) return null;
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType || "image/webp",
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}

export async function deleteImage(env, key) {
  if (key) await env.MEDIA.delete(key);
}
