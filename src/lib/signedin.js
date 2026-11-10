// A hint, kept in this browser only, that someone was signed in last time. It
// lets "/" send them to My card at once without waiting for /api/me. It is only
// a hint: the /app guard still asks the server, and a stale one is cleared there.
const KEY = "lanyard-signed-in";

export function hasSignedInHint() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function setSignedInHint(on) {
  try { on ? localStorage.setItem(KEY, "1") : localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}
