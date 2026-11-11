// A host promo code someone arrived with (host.<domain>/redeem/CODE) is held here while
// they sign in and finish setting up the host account, then the portal takes them back to it.
// Host site only. It is not the attendee code store (lib/redeem.js), and the two never mix.
const KEY = "lanyard-host-redeem";
const TTL = 24 * 60 * 60 * 1000;

export function savePendingHostCode(code) {
  try { localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() })); } catch { /* private mode: the link still has it */ }
}
export function pendingHostCode() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && Date.now() - v.at < TTL && /^[A-Z0-9]{1,24}$/.test(v.code) ? v.code : null;
  } catch { return null; }
}
export function clearPendingHostCode() {
  try { localStorage.removeItem(KEY); } catch { /* nothing stored */ }
}
/** The code in a typed or pasted value: upper-case letters and numbers only, as the server reads it. */
export const cleanHostCode = (raw) => String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
