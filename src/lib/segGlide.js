// A segmented control (.seg) whose filled bar glides to the active button instead of jumping (F40).
//
// It measures the button that has the `.on` class and hands its place and size to the CSS (--x, --y, --w, --h), which
// draws the bar as a pseudo-element and moves it with `transform` only (no width or left animating). The first
// measurement draws the bar where it belongs without moving; later ones, after a tab is pressed or the buttons wrap
// differently, slide it. Under reduced motion --dur-glide is 0, so it simply jumps. Used by the host event page.
// Returns a function that stops watching.
export function glideSeg(el) {
  let ready = false;
  function place() {
    const on = el.querySelector(".seg-btn.on");
    if (!on) return;
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
