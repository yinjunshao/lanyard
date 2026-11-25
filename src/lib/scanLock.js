// F73: the timing and the haptic for the scan lock (Scan.vue). Kept apart from the page so a test can run them.
// A code that opens something locks the frame for LOCK_MS and then the page moves on; under prefers-reduced-motion
// the lock is a plain fade, so it is shorter, and there is no haptic (and no shake: the CSS does that part).
export const LOCK_MS = 350;
export const LOCK_REDUCED_MS = 150;
export const WAIT_MS = 250; // an answer slower than this shows the calm "Opening card" line

export function reducedMotion() {
  try { return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

export const lockMs = () => (reducedMotion() ? LOCK_REDUCED_MS : LOCK_MS);

// A light tap where the phone has one (Android Chrome; iOS Safari has none). Never under reduced motion.
export function buzz() {
  if (reducedMotion()) return false;
  try { return typeof navigator !== "undefined" && typeof navigator.vibrate === "function" && navigator.vibrate(15); } catch { return false; }
}

export const pause = (ms) => new Promise((done) => setTimeout(done, ms));
