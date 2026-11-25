<script setup>
// Scan a badge or an event poster with the camera, or type a code.
// Both paths accept: a card QR, an event QR, a card's 4-character code and an
// event's 5-character code (case, spaces and dashes don't matter).
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { startScanner, resolveScanned } from "../lib/scanner";
import { withSource } from "../lib/profile";
import { WAIT_MS, buzz, lockMs, pause } from "../lib/scanLock";

const router = useRouter();
const video = ref(null);
const manual = ref("");
const error = ref("");
const hint = ref("");
const busy = ref(false);
const looking = ref(false);
// F73: the frame's state. "wait" is an answer that is slow to come (a thin line, not a spinner), "lock" is a code that
// opens something (the corners close in, then the page moves on), "miss" is a code that opens nothing (one shake).
const state = ref("");
const opening = ref(""); // said once through the polite status line; it never changes between wait and lock
let stop = null;
let handled = false;
let dead = false;
let hintTimer = null;
let waitTimer = null;
let missTimer = null;

function flashHint(text) {
  hint.value = text;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => (hint.value = ""), 2600);
}

// s says how the card was found: q for the camera, c for a typed code (F13).
function go(res, s) {
  if (res.kind === "card") {
    handled = true;
    router.push(`/c/${res.cardId}${withSource(res.search, s)}`);
    return true;
  }
  if (res.kind === "event") {
    handled = true;
    router.push(`/e/${res.eventCode}${res.search || ""}`);
    return true;
  }
  return false;
}

onMounted(() => {
  stop = startScanner(video.value, {
    onResult: handle,
    onError: (e) => {
      error.value = "Camera unavailable. Type a code instead.";
      console.warn(e);
    },
  });
});
onBeforeUnmount(() => { dead = true; stop?.(); clearTimeout(hintTimer); clearTimeout(waitTimer); clearTimeout(missTimer); });

// F73: ask for the answer; if it is slow, hold a calm "Opening card" state. When a card or event comes back, lock the
// frame and wait out the lock (never longer) before the route changes. Resolves true when it opened something.
async function resolveAndOpen(resolve, s) {
  clearTimeout(waitTimer);
  waitTimer = setTimeout(() => { state.value = "wait"; opening.value = "Opening card"; }, WAIT_MS);
  let res;
  try { res = await resolve(); } catch (e) { settle(); throw e; }
  clearTimeout(waitTimer);
  if (res.kind !== "card" && res.kind !== "event") { settle(); return false; }
  handled = true;
  state.value = "lock";
  if (!opening.value) opening.value = res.kind === "event" ? "Opening event" : "Opening card";
  buzz();
  await pause(lockMs());
  if (!dead) go(res, s);
  return true;
}
function settle() { clearTimeout(waitTimer); state.value = ""; opening.value = ""; }
function miss() {
  state.value = "miss";
  clearTimeout(missTimer);
  missTimer = setTimeout(() => { if (state.value === "miss") state.value = ""; }, 420);
}

async function handle(raw) {
  if (handled || busy.value || state.value === "lock") return;
  busy.value = true;
  try {
    const opened = await resolveAndOpen(() => resolveScanned(raw, { camera: true }), "q");
    if (!opened) { miss(); flashHint("That QR isn't a Lanyard badge or event."); }
  } catch {
    miss();
    flashHint("Couldn't read that one. Try again.");
  } finally {
    setTimeout(() => (busy.value = false), 900);
  }
}

async function submitManual() {
  error.value = "";
  const text = manual.value.trim();
  if (!text) return;
  looking.value = true;
  try {
    const opened = await resolveAndOpen(() => resolveScanned(text), "c");
    if (!opened) { miss(); error.value = "Enter the 4-character code on their badge, or the 5-character event code."; }
  } catch (e) {
    miss();
    error.value = e.message || "Code not found.";
  } finally {
    if (!handled) looking.value = false;
  }
}
</script>

<template>
  <div class="stack-2">
    <h1>Scan</h1>
    <div class="scan-frame" :class="state ? 'scan-' + state : null">
      <video ref="video" muted playsinline aria-label="Camera view for scanning a QR code. You can type a code below instead."></video>
      <div class="scan-reticle" aria-hidden="true"></div>
      <div class="scan-lock-mark" aria-hidden="true"></div>
      <div class="scan-bar" aria-hidden="true"></div>
    </div>
    <p class="visually-hidden" role="status">{{ opening }}</p>
    <p class="small muted" style="margin:0">Point at a badge or an event poster.</p>
    <p v-if="hint" class="small" role="status">{{ hint }}</p>

    <form class="stack" @submit.prevent="submitManual">
      <div class="field">
        <label for="code-input">Or type a code</label>
        <div class="row">
          <input id="code-input" v-model="manual" type="text" placeholder="AB3D"
                 maxlength="24" autocapitalize="characters" autocomplete="off" autocorrect="off"
                 spellcheck="false" style="text-transform:uppercase;letter-spacing:.2em" />
          <button class="btn btn-primary" style="width:auto;flex:none" type="submit" :disabled="looking">
            {{ looking ? "…" : "Go" }}
          </button>
        </div>
      </div>
      <p class="small muted" style="margin:0">
        The 4-character code under their QR, or an event's 5-character code.
        Check the code with them, or scan their QR instead.
      </p>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    </form>
  </div>
</template>

<style scoped>
/* F73: the lock, the calm waiting line and the miss. Only transform and opacity move, and nothing but the waiting line
   (which loops while it waits, like the skeleton's sweep) runs over 300 ms. The times are these properties, not
   numbers in the rules. The classes are general (.scan-lock-mark, .scan-bar), so the Connect flow can borrow them
   later. Under reduced motion each is a plain 150 ms fade: nothing scales, slides or shakes. */
.scan-frame { --lock-in: 200ms; --lock-lag: 150ms; --lock-tick: 160ms; --shake: 300ms; --run: 1.4s; }
.scan-lock-mark, .scan-bar { position: absolute; pointer-events: none; opacity: 0; }
.scan-lock-mark { inset: 16%; border-radius: 10px; }
/* Four strap-coloured corner marks (the reticle's own line stays under them). */
.scan-lock-mark {
  --c: var(--strap);
  background-repeat: no-repeat;
  background-image:
    linear-gradient(var(--c), var(--c)), linear-gradient(var(--c), var(--c)), linear-gradient(var(--c), var(--c)), linear-gradient(var(--c), var(--c)),
    linear-gradient(var(--c), var(--c)), linear-gradient(var(--c), var(--c)), linear-gradient(var(--c), var(--c)), linear-gradient(var(--c), var(--c));
  background-position: 0 0, 0 0, 100% 0, 100% 0, 0 100%, 0 100%, 100% 100%, 100% 100%;
  background-size: 28px 5px, 5px 28px, 28px 5px, 5px 28px, 28px 5px, 5px 28px, 28px 5px, 5px 28px;
}
/* The soft pulse, and the tick. */
.scan-lock-mark::before, .scan-lock-mark::after { content: ""; position: absolute; opacity: 0; }
.scan-lock-mark::before { inset: 0; border: 2px solid var(--strap); border-radius: 10px; }
.scan-lock-mark::after {
  left: 50%; top: 50%; width: 26px; height: 14px; margin: -11px 0 0 -13px;
  border-left: 4px solid var(--strap); border-bottom: 4px solid var(--strap);
  transform: rotate(-45deg);
}
.scan-bar { left: 0; right: 0; bottom: 0; height: 3px; background: var(--strap); }

.scan-lock .scan-reticle::after, .scan-wait .scan-reticle::after { opacity: 0; }
.scan-lock .scan-reticle { opacity: 0.35; transition: opacity var(--lock-in) var(--ease-out); } /* the plain line steps back so the corners read as closing in */
.scan-lock .scan-lock-mark { opacity: 1; animation: scan-close var(--lock-in) var(--ease-out) backwards; }
.scan-lock .scan-lock-mark::before { animation: scan-pulse var(--lock-in) var(--ease-out) var(--lock-lag) backwards; }
.scan-lock .scan-lock-mark::after { opacity: 1; animation: scan-tick var(--lock-tick) var(--ease-out) var(--lock-lag) backwards; }
.scan-wait .scan-bar { opacity: 1; animation: scan-run var(--run) ease-in-out infinite, m-fade var(--lock-in) linear backwards; }
.scan-miss .scan-reticle { animation: scan-shake var(--shake) var(--ease-out); }

@keyframes scan-close { from { opacity: 0; transform: scale(1.18); } }
@keyframes scan-pulse { from { opacity: 0.55; transform: scale(1); } to { opacity: 0; transform: scale(1.14); } }
@keyframes scan-tick { from { opacity: 0; transform: rotate(-45deg) scale(0.4); } }
@keyframes scan-run { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
@keyframes scan-shake {
  18% { transform: translateX(-7px); } 36% { transform: translateX(6px); } 54% { transform: translateX(-4px); }
  72% { transform: translateX(3px); } 100% { transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .scan-frame { --lock-in: 150ms; --shake: 150ms; }
  .scan-lock .scan-lock-mark { animation: m-fade var(--lock-in) linear backwards; }
  .scan-lock .scan-lock-mark::before { display: none; }
  .scan-lock .scan-lock-mark::after { animation: none; }
  .scan-wait .scan-bar { animation: m-fade var(--lock-in) linear backwards; }
  .scan-miss .scan-reticle { animation: m-fade var(--shake) linear; }
}
</style>
