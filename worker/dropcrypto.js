// F32: the encryption behind drops. Pasted items are secrets (API keys, codes, Wi-Fi passwords), so the
// database never holds one in the clear.
//
//   - AES-256-GCM through Web Crypto, a fresh random 96-bit IV for every item, the tag checked on open.
//   - The key is derived (HKDF-SHA-256) from the Worker secret DROP_KEY, never stored. The drop id and the
//     item id are bound in as "additional data", so a ciphertext copied onto another row will not open.
//   - Fails closed: with no DROP_KEY (or a short one) nothing is sealed, nothing is stored and the caller gets
//     one clear error. This differs from TOTP_KEY on purpose: totp.js falls back to plain text without its key.
//     A wrong or changed DROP_KEY makes open() throw the same error; it never returns something that looks like
//     a value. Errors name no item and no key.
//   - The staff PIN of a voucher is kept only as an HMAC (same secret, another derived key).
import { HttpError } from "./session.js";

const te = new TextEncoder();
const MIN_KEY = 16;

export const DROPS_OFF = "Drops are switched off on this server: its DROP_KEY secret is missing or too short. Ask whoever runs Lanyard to set it.";
export const DROPS_UNREADABLE = "These items can't be read with the key this server has now. The organisers need to load them again.";

/** "No usable DROP_KEY". Expected on a server that has not set it up, so the error handler shows its message and logs no stack for it. */
export const unavailable = () => Object.assign(new HttpError(503, DROPS_OFF, "drops_unavailable"), { quiet: true, expose: true });
const unreadable = () => Object.assign(new HttpError(503, DROPS_UNREADABLE, "drops_unreadable"), { expose: true });

/** True when this server can seal and open items. */
export const dropsReady = (env) => typeof env?.DROP_KEY === "string" && env.DROP_KEY.length >= MIN_KEY;

async function derive(env, info, usage, algo) {
  if (!dropsReady(env)) throw unavailable();
  const base = await crypto.subtle.importKey("raw", te.encode(env.DROP_KEY), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: te.encode("lanyard-drops"), info: te.encode(info) },
    base, algo, false, usage
  );
}
const aesKey = (env) => derive(env, "aes-gcm-v1", ["encrypt", "decrypt"], { name: "AES-GCM", length: 256 });
const macKey = (env) => derive(env, "pin-hmac-v1", ["sign"], { name: "HMAC", hash: "SHA-256", length: 256 });

const b64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));

const aad = (dropId, itemId) => te.encode(`lanyard-drop:${dropId}:${itemId}`);

/** Seals one item. The result is "v1." + base64url(iv + ciphertext + tag). Throws drops_unavailable without a key. */
export async function sealItem(env, dropId, itemId, plain) {
  const key = await aesKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(dropId, itemId) }, key, te.encode(plain)));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return "v1." + b64(out);
}

/** Opens one item. Throws drops_unavailable (no key) or drops_unreadable (wrong key, changed row, bad data). */
export async function openItem(env, dropId, itemId, stored) {
  const key = await aesKey(env);
  try {
    if (typeof stored !== "string" || !stored.startsWith("v1.")) throw new Error("format");
    const all = unb64(stored.slice(3));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12), additionalData: aad(dropId, itemId) }, key, all.slice(12));
    return new TextDecoder().decode(pt);
  } catch {
    throw unreadable();
  }
}

/** A staff PIN as a stored MAC, bound to its drop. Compare two with sameMac(). */
export async function pinMac(env, dropId, pin) {
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await macKey(env), te.encode(`pin:${dropId}:${pin}`)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two hex strings of the same kind. */
export function sameMac(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
