// Small pieces of the Present page (F19.3), kept out of the page so they can be tested with
// a fake clock and a fake browser.

// Controls: shown on any movement, key or touch, hidden after 3 s without one (and the cursor
// with them). `busy()` lets a control that has keyboard focus keep them up.
export const IDLE_MS = 3000;
export function idleHider({ show, hide, busy = () => false, ms = IDLE_MS, setT = setTimeout, clearT = clearTimeout }) {
  let timer = null;
  const arm = () => {
    clearT(timer);
    timer = setT(() => { if (busy()) arm(); else hide(); }, ms);
  };
  return {
    poke() { show(); arm(); },
    stop() { clearT(timer); },
  };
}

// Keeps the screen awake while the page is open, where the browser allows it. The browser
// drops the lock whenever the tab is hidden, so ask again when it is shown. It never throws
// and never tells the host: a refused request just means the screen may dim.
export function keepAwake({ nav = typeof navigator === "undefined" ? null : navigator, doc = typeof document === "undefined" ? null : document } = {}) {
  let sentinel = null, stopped = false;
  async function acquire() {
    if (stopped || !nav?.wakeLock?.request || doc?.hidden) return;
    try {
      const s = await nav.wakeLock.request("screen");
      if (stopped) { s.release?.().catch?.(() => {}); return; }
      sentinel = s;
      s.addEventListener?.("release", () => { if (sentinel === s) sentinel = null; });
    } catch { /* not allowed, or low battery: carry on without */ }
  }
  const onVisible = () => { if (!doc.hidden && !sentinel) acquire(); };
  doc?.addEventListener?.("visibilitychange", onVisible);
  acquire();
  return () => {
    stopped = true;
    doc?.removeEventListener?.("visibilitychange", onVisible);
    try { sentinel?.release?.()?.catch?.(() => {}); } catch { /* already released */ }
    sentinel = null;
  };
}
