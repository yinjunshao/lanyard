// The spam skip (F42): a tap while the bar is still moving, or a third tap within about 600 ms, jumps the bar with
// no transition, and the next calm tap takes the spring again. Nothing is queued. SPRING_MS is --dur-elastic in
// main.css. AppShell carries a copy of makeGlideCalm (the frame must not import this file); test/loading.mjs checks
// the two copies are the same.
const SPRING_MS = 420;
const BURST_MS = 600;

export function makeGlideCalm() {
  let movedAt = -Infinity;
  let taps = [];
  return function jumpNow(now = Date.now()) {
    taps = taps.filter((t) => now - t < BURST_MS);
    taps.push(now);
    const stillMoving = now - movedAt < SPRING_MS;
    movedAt = now;
    return stillMoving || taps.length > 2;
  };
}

// A segmented control (.seg) whose filled bar glides to the active button instead of jumping (F40).
//
// It measures the button that has the `.on` class and hands its place and size to the CSS (--x, --y, --w, --h), which
// draws the bar as a pseudo-element and moves it with `transform` only (no width or left animating). The first
// measurement draws the bar where it belongs without moving; later ones, after a tab is pressed or the buttons wrap
// differently, slide it, with the F42 elastic spring (--dur-elastic, --ease-spring). Under reduced motion the duration
// is 0, so it simply jumps. A tap while it is still moving, or a third within about 600 ms, jumps (makeGlideCalm).
// Used by the host event page and Settings. Returns a function that stops watching.
export function glideSeg(el) {
  let ready = false;
  let lastOn = null;
  const jumpNow = makeGlideCalm();
  function place() {
    const on = el.querySelector(".seg-btn.on");
    if (!on) return;
    // A new tab chosen (not the first draw, and not a resize or a class change of the same button) is a tap.
    const tapped = ready && on !== lastOn;
    lastOn = on;
    if (tapped) el.classList.toggle("jump", jumpNow());
    el.style.setProperty("--x", on.offsetLeft + "px");
    el.style.setProperty("--y", on.offsetTop + "px");
    el.style.setProperty("--w", on.offsetWidth);
    el.style.setProperty("--h", on.offsetHeight);
    if (!el.classList.contains("glides")) el.classList.add("glides");
    if (!ready) {
      ready = true;
      // Switch the transition on only after the bar has been drawn where it belongs.
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("ready")));
    }
  }
  place();
  const resize = new ResizeObserver(place);
  resize.observe(el);
  const classes = new MutationObserver(place);
  classes.observe(el, { attributes: true, attributeFilter: ["class"], subtree: true });
  return () => { resize.disconnect(); classes.disconnect(); };
}
