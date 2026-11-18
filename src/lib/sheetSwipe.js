// Swipe a bottom sheet down to close it (F40). Loaded by a sheet only when it opens on a phone, so it is in no
// page's first load (public-page JS budget, D045). Used by UiSheet and the .sheet dialogs.
//
// A press that starts on the handle or the top row can be dragged with a mouse; a finger can drag from anywhere
// as long as the sheet's content is at the top. Past about 30% of the sheet's height, or a quick flick, it
// closes; a short drag springs back. Scrolling a long sheet never closes it: a press that starts on anything
// scrolled down, a drag that goes up or sideways, and a range slider are all left alone.
const GRIP = ".ui-handle, .ui-sheet-head, .sheet-handle, .sheet-head";

// panel: the sheet; close: asks its owner to close it. Returns a function that takes everything off again
// (swipeOff(true) keeps the sheet where it is).
export function swipeClose(panel, close) {
  if (!panel || !matchMedia("(max-width: 599px)").matches) return () => {}; // a phone sheet only
  const layer = panel.parentElement;
  let x0 = 0, y0 = 0, t0 = 0, dy = 0, armed = false, on = false;

  // False when the press starts on something that is scrolled down (the sheet, or a list inside it).
  const atTop = (t) => {
    for (let n = t; n && n !== panel.parentElement; n = n.parentElement) {
      if (n.scrollTop > 0 || n.matches?.("input[type=range], [data-no-swipe]")) return false;
    }
    return true;
  };
  const begin = (t, x, y) => { if (!atTop(t)) return; armed = true; on = false; x0 = x; y0 = y; t0 = Date.now(); dy = 0; };
  function move(x, y, e) {
    if (!armed) return;
    dy = y - y0;
    if (!on) {
      const dx = Math.abs(x - x0);
      if (dy < 8 && dx < 8 && dy > -8) return;
      if (dy < 0 || dx > dy || panel.scrollTop > 0) { armed = false; return; } // up, sideways, or it began to scroll
      on = true;
      panel.style.transition = "none";
      panel.style.userSelect = "none";
    }
    if (e.cancelable) e.preventDefault();
    panel.style.transform = `translateY(${Math.max(0, dy)}px)`;
    layer.style.setProperty("--dim", String(1 - Math.min(1, dy / panel.offsetHeight) * 0.8));
  }
  function rest() {
    panel.style.transition = "transform var(--dur) var(--ease-out)";
    panel.style.transform = "";
    layer.style.removeProperty("--dim");
    setTimeout(() => { panel.style.transition = ""; panel.style.userSelect = ""; }, 260);
  }
  function end() {
    const was = armed && on;
    armed = on = false;
    if (!was) return;
    const speed = dy / Math.max(1, Date.now() - t0); // px per ms
    if (dy > panel.offsetHeight * 0.3 || (speed > 0.5 && dy > 24)) {
      close();
      // If the owner did not close it (it asked a question first), put it back.
      setTimeout(() => { if (!panel.closest(".is-leaving")) rest(); }, 80);
    } else rest();
  }

  const ts = (e) => { if (e.touches.length === 1) begin(e.target, e.touches[0].clientX, e.touches[0].clientY); else armed = false; };
  const tm = (e) => move(e.touches[0].clientX, e.touches[0].clientY, e);
  const pm = (e) => move(e.clientX, e.clientY, e);
  const pu = () => { window.removeEventListener("pointermove", pm); end(); };
  const pd = (e) => {
    if (e.pointerType !== "mouse" || e.button || !e.target.closest(GRIP) || e.target.closest("button, a, input, select, textarea")) return;
    begin(e.target, e.clientX, e.clientY);
    window.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", pu, { once: true });
  };
  panel.addEventListener("touchstart", ts, { passive: true });
  panel.addEventListener("touchmove", tm, { passive: false });
  panel.addEventListener("touchend", end);
  panel.addEventListener("touchcancel", end);
  panel.addEventListener("pointerdown", pd);
  // keep: leave the sheet where it is (it is leaving; the exit carries on from there).
  return (keep) => {
    for (const [n, f] of [["touchstart", ts], ["touchmove", tm], ["touchend", end], ["touchcancel", end], ["pointerdown", pd]]) panel.removeEventListener(n, f);
    window.removeEventListener("pointermove", pm);
    window.removeEventListener("pointerup", pu);
    if (keep) return;
    panel.style.transition = panel.style.transform = panel.style.userSelect = "";
    layer.style.removeProperty("--dim");
  };
}
