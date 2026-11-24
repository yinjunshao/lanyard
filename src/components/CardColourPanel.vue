<script setup>
// F55.2: the Plus colour panel, built by hand (no library). A square for saturation (across) and brightness (up),
// a hue slider, a hex box and the last five custom colours. It is a popover from 600 px and a bottom sheet on a
// phone (UiSheet), and it is a lazy chunk: CardSwatches loads it the first time it is opened.
// It changes the colour as you go (the card preview beside the form follows). Done, or Enter, keeps it and remembers
// it; Cancel, Escape, a press outside or Close puts back what was there when it opened.
// Keys: in the square the arrows move the point (Shift for bigger steps), Home and End, Page Up and Page Down; on
// the hue slider the arrows, Home and End; the hex box takes #RGB or #RRGGBB, with or without the #.
// The sums and the keys are in lib/colourpanel.js, which is tested on its own.
import { computed, ref, watch } from "vue";
import UiSheet from "./ui/UiSheet.vue";
import { hexToHsv, hsvToHex, squareKey, hueKey, pointToSv, pointToHue, readHexBox, pushRecent, cleanRecent } from "../lib/colourpanel";
import { contrast, isPreset, strictHex, TEXT_REFUSE_BELOW, TEXT_WARN_BELOW } from "../lib/cardcolour";

const props = defineProps({
  open: Boolean,
  anchor: { type: Object, default: null },
  modelValue: { type: String, default: "" },      // "#RRGGBB", or "" for the theme's own colour
  fallback: { type: String, default: "#C4441E" }, // what the panel starts from when there is no colour yet
  label: { type: String, default: "Choose a colour" },
  against: { type: String, default: "" },         // the text colour's panel: the card's paper, so it says how well this reads on it
});
const emit = defineEmits(["update:modelValue", "done", "close"]);

const RECENT_KEY = "lanyard-recent-colours";
const readRecent = () => { try { return cleanRecent(JSON.parse(localStorage.getItem(RECENT_KEY))); } catch { return []; } };
const writeRecent = (list) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* private window: it just is not remembered */ } };

let before = ""; // what the colour was when the panel opened
const hsv = ref(hexToHsv(props.fallback));
const hexText = ref("");
const hexError = ref("");
const recent = ref([]);
const hex = computed(() => hsvToHex(hsv.value));
// How the colour reads on the card (the text colour only): under 3:1 it cannot be kept, under 4.5:1 it is "Hard to read".
const ratio = computed(() => (props.against ? contrast(hex.value, props.against) : 0));
const level = computed(() => (!props.against ? "" : ratio.value < TEXT_REFUSE_BELOW ? "no" : ratio.value < TEXT_WARN_BELOW ? "hard" : "ok"));
const ratioText = computed(() => ratio.value.toFixed(1));

watch(() => props.open, (v) => {
  if (!v) return;
  before = props.modelValue;
  const start = strictHex(props.modelValue) || strictHex(props.fallback) || "#C4441E";
  hsv.value = hexToHsv(start);
  hexText.value = start.slice(1);
  hexError.value = "";
  recent.value = readRecent();
}, { immediate: true });

function set(next) {
  hsv.value = next;
  hexText.value = hsvToHex(next).slice(1);
  hexError.value = "";
  emit("update:modelValue", hsvToHex(next));
}
const setHex = (h) => set(hexToHsv(h, hsv.value.h));

// ---- the square and the slider: a press or a drag, and the keys ----
function drag(e, apply) {
  const el = e.currentTarget, box = el.getBoundingClientRect();
  const at = (ev) => apply(ev.clientX - box.left, ev.clientY - box.top, box.width, box.height);
  at(e);
  if (e.pointerType === "mouse" && e.button !== 0) return;
  el.setPointerCapture?.(e.pointerId);
  el.focus({ preventScroll: true });
  const move = (ev) => at(ev);
  const end = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", end); el.removeEventListener("pointercancel", end); };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}
const onSquare = (e) => drag(e, (x, y, w, h) => set({ h: hsv.value.h, ...pointToSv(x, y, w, h) }));
const onHue = (e) => drag(e, (x, y, w) => set({ ...hsv.value, h: pointToHue(x, w) }));
function keySquare(e) { const n = squareKey(hsv.value, e.key, e.shiftKey); if (n) { e.preventDefault(); set(n); } }
function keyHue(e) { const n = hueKey(hsv.value, e.key, e.shiftKey); if (n) { e.preventDefault(); set(n); } }

// ---- the hex box ----
function typed() {
  const t = hexText.value.trim().replace(/^#/, "");
  hexError.value = "";
  if (/^[0-9a-fA-F]{6}$/.test(t)) setHex("#" + t.toUpperCase());
}
function leaveHex() {
  const r = readHexBox(hexText.value);
  if (r.hex) { if (r.hex !== hex.value) setHex(r.hex); hexText.value = r.hex.slice(1); hexError.value = ""; }
  else if (hexText.value.trim()) hexError.value = r.why;
}

// ---- keep or put back ----
function done() {
  const r = readHexBox(hexText.value);
  if (!r.hex) { hexError.value = r.why; return; }
  if (r.hex !== hex.value) setHex(r.hex);
  if (level.value === "no") return; // the message under the box says why; it cannot be kept
  if (!isPreset(r.hex)) { recent.value = pushRecent(readRecent(), r.hex); writeRecent(recent.value); }
  emit("done", r.hex);
}
function cancel() {
  emit("update:modelValue", before);
  emit("close");
}
function onKeyPanel(e) {
  // Enter keeps, wherever it is pressed except on a button (a button does its own thing).
  if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); done(); }
}

const sText = computed(() => `Saturation ${Math.round(hsv.value.s * 100)} percent, brightness ${Math.round(hsv.value.v * 100)} percent`);
</script>

<template>
  <UiSheet :open="open" :anchor="anchor" :label="label" focus=".colp-square" @close="cancel">
    <div class="colp" @keydown="onKeyPanel">
      <div class="colp-square" role="slider" tabindex="0" aria-label="Saturation and brightness"
           aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(hsv.s * 100)" :aria-valuetext="sText"
           :style="{ '--h': hsv.h }" @pointerdown="onSquare" @keydown="keySquare">
        <span class="colp-thumb" :style="{ left: hsv.s * 100 + '%', top: (1 - hsv.v) * 100 + '%', background: hex }"></span>
      </div>
      <div class="colp-hue" role="slider" tabindex="0" aria-label="Hue" aria-valuemin="0" aria-valuemax="359"
           :aria-valuenow="Math.round(hsv.h)" :aria-valuetext="`Hue ${Math.round(hsv.h)} degrees`"
           @pointerdown="onHue" @keydown="keyHue">
        <span class="colp-thumb" :style="{ left: (hsv.h / 360) * 100 + '%', background: `hsl(${hsv.h} 100% 50%)` }"></span>
      </div>

      <div class="colp-hexrow">
        <span class="colp-chip" :style="{ background: hex }" aria-hidden="true"></span>
        <label class="colp-hexlabel">
          <span class="label">Hex</span>
          <span class="colp-hexfield">
            <span aria-hidden="true">#</span>
            <input v-model="hexText" type="text" spellcheck="false" autocomplete="off" autocapitalize="characters" maxlength="8"
                   aria-label="Hex colour, three or six letters or numbers" :aria-invalid="!!hexError" @input="typed" @blur="leaveHex" />
          </span>
        </label>
      </div>
      <p v-if="hexError" class="error-text colp-msg" role="alert">{{ hexError }}</p>
      <p v-else-if="level === 'no'" class="error-text colp-msg" role="alert">Too hard to read on this card ({{ ratioText }} to 1). Choose a darker or lighter colour.</p>
      <p v-else-if="level === 'hard'" class="small colp-msg colp-note" role="status">Hard to read ({{ ratioText }} to 1). It will save, but some people will struggle.</p>
      <p v-else-if="level === 'ok'" class="small muted colp-msg" role="status">Reads well on this card ({{ ratioText }} to 1).</p>

      <div v-if="recent.length" class="colp-recent">
        <span class="label">Recent</span>
        <div class="colp-recent-row">
          <button v-for="c in recent" :key="c" type="button" class="colp-r" :aria-label="`Recent colour ${c}`" :title="c" @click="setHex(c)">
            <span :style="{ background: c }"></span>
          </button>
        </div>
      </div>

      <div class="btn-row colp-actions">
        <button type="button" class="btn" @click="cancel">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="level === 'no'" @click="done">Done</button>
      </div>
    </div>
  </UiSheet>
</template>

<style>
.colp { display: flex; flex-direction: column; gap: 14px; width: min(100%, 292px); min-width: 252px; padding: 4px 2px 2px; margin: 0 auto; }
.ui-layer:not(.is-sheet):not(.is-modal) .colp { padding: 14px; }
.ui-layer.is-sheet .colp { width: 100%; }
.colp-square, .colp-hue { position: relative; touch-action: none; cursor: crosshair; user-select: none; -webkit-user-select: none; }
.colp-square {
  height: 164px; border-radius: var(--radius);
  background: linear-gradient(to top, #000, rgba(0, 0, 0, 0)), linear-gradient(to right, #fff, hsl(var(--h) 100% 50%));
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18);
}
.colp-hue {
  height: 20px; border-radius: 10px;
  background: linear-gradient(to right, #f00, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18);
}
.colp-square:focus-visible, .colp-hue:focus-visible { outline: 2.5px solid var(--strap); outline-offset: 3px; }
.colp-thumb {
  position: absolute; width: 22px; height: 22px; border-radius: 50%;
  border: 3px solid #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4), 0 2px 5px rgba(0, 0, 0, 0.35);
  transform: translate(-50%, -50%); pointer-events: none;
}
.colp-hue .colp-thumb { top: 50%; }
.colp-hexrow { display: flex; align-items: flex-end; gap: 12px; }
.colp-chip { flex: none; width: 44px; height: 44px; border-radius: var(--radius); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.22); }
.colp-hexlabel { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.colp-hexfield {
  display: flex; align-items: center; gap: 4px; min-height: 44px; padding: 0 12px;
  border: var(--border); border-radius: var(--radius); background: var(--paper-raised); box-shadow: var(--inset-shadow);
  font-size: 16px; font-weight: 700; color: var(--graphite);
}
.colp-hexfield:has(input:focus-visible) { outline: 2.5px solid var(--strap); outline-offset: 1px; }
.colp-hexfield input {
  flex: 1; min-width: 0; border: 0; background: none; padding: 0; margin: 0; box-shadow: none; outline: none;
  font: inherit; color: var(--ink); text-transform: uppercase; letter-spacing: 0.06em; min-height: 40px;
}
.colp-msg { margin: -4px 0 0; }
.colp-note { color: var(--strap-deep); font-weight: 700; }
.colp-recent { display: flex; flex-direction: column; gap: 2px; }
.colp-recent-row { display: flex; margin: 0 -4px; }
.colp-r { width: 44px; height: 44px; padding: 0; border: 0; background: none; display: grid; place-items: center; border-radius: 50%; cursor: pointer; }
.colp-r span { width: 28px; height: 28px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.22); transition: transform var(--dur-fast) var(--ease-out); }
.colp-r:hover span { transform: scale(1.08); }
.colp-r:focus-visible { outline: 2.5px solid var(--strap); outline-offset: 0; }
.colp-actions { margin-top: 2px; }
@media (prefers-reduced-motion: reduce) { .colp-r span { transition: none; } }
</style>
