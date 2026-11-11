// Refreshes the Present page every 15 s (F19.2), and stops while the tab is hidden: a hidden
// tab asks for nothing, and the moment it is shown again it asks straight away. One request
// at a time; the next one is timed from when the last one finished. Returns a stop function.
export const POLL_MS = 15000;

export function startPolling(load, { every = POLL_MS, doc = document, setT = setTimeout, clearT = clearTimeout } = {}) {
  let timer = null, stopped = false, busy = false;
  const schedule = () => { clearT(timer); if (!stopped && !doc.hidden) timer = setT(tick, every); };
  async function tick() {
    if (stopped || doc.hidden || busy) return;
    busy = true;
    try { await load(); } catch { /* the page keeps what it has */ }
    busy = false;
    schedule();
  }
  const onVisible = () => { if (doc.hidden) clearT(timer); else tick(); };
  doc.addEventListener("visibilitychange", onVisible);
  schedule();
  return () => { stopped = true; clearT(timer); doc.removeEventListener("visibilitychange", onVisible); };
}
