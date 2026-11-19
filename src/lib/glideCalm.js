// F42: the spam skip for a sliding notch (the tab bar, a segmented control). A tap is drawn with the elastic spring
// unless the bar is still moving from the tap before, or it is the third tap within about 600 ms; then the bar jumps
// straight there. The calm tap after that takes the spring again. Nothing is queued. The caller sets or clears the
// `.jump` class from the result on the same change as the new place, so the browser never animates a jump.
// SPRING_MS is --dur-elastic in main.css (test/loading.mjs checks they agree).
const SPRING_MS = 420;
const BURST_MS = 600;

export function makeGlideCalm() {
  let movedAt = -Infinity; // when the bar last started a move
  let taps = []; // when the recent taps were
  return function jumpNow(now = Date.now()) {
    taps = taps.filter((t) => now - t < BURST_MS);
    taps.push(now);
    const stillMoving = now - movedAt < SPRING_MS;
    movedAt = now;
    return stillMoving || taps.length > 2;
  };
}
