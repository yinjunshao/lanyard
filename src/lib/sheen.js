// F56: the sheen on a Plus card's strap material follows the pointer. Fetched by a plain import() only for a card that has a
// material, on a device with a hover pointer and without reduced motion; it is in no first load. It does one thing: it sets
// --sheen (-0.5 at the left edge of the card to 0.5 at the right) on the strap, and the CSS moves a highlight layer with
// transform alone (main.css, ".mat::before": 200 ms a move, no loop). No device-orientation or motion permission is asked for.
export function sheen(card) {
  if (!card || card._sheen || !matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)").matches) return;
  card._sheen = true;
  const strap = () => card.querySelector(".mat");
  card.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const r = card.getBoundingClientRect();
    strap()?.style.setProperty("--sheen", Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5)).toFixed(2));
  });
  card.addEventListener("pointerleave", () => strap()?.style.removeProperty("--sheen"));
}
