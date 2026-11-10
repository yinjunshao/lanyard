// A promo code someone arrived with (poster QR, /redeem/CODE) is held here
// while they make a card, sign in or confirm their email, then claimed.
const KEY = "lanyard-redeem";
const TTL = 24 * 60 * 60 * 1000;

export function savePendingCode(code) {
  try { localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() })); } catch { /* private mode: the URL still has it */ }
}
export function pendingCode() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && Date.now() - v.at < TTL ? v.code : null;
  } catch { return null; }
}
export function clearPendingCode() {
  try { localStorage.removeItem(KEY); } catch { /* nothing stored */ }
}
/** Where to go after sign-up / sign-in: back to the code, if one is waiting. */
export function afterAccountPath(fallback) {
  const code = pendingCode();
  return code ? `/redeem/${encodeURIComponent(code)}` : fallback;
}
