<script setup>
// A short tutorial (F59, D055): the page is dimmed, a ring sits round the real control, and a small card says what it is
// for, with Back, Next and Skip. Loaded only when a tutorial is due, with a plain import() from StageHost.vue, and only
// from signed-in pages, so it is in no public page's first load (D045).
//
// Rules this keeps: focus moves into the card when it opens and goes back to where it was when it ends; Escape skips;
// everything works from the keyboard (Tab stays inside the card); the last step can press the real control ("Try it",
// or a press on the control itself); if the control is no longer there the card simply sits without a ring; motion is the
// tokens only (a slide becomes a fade under reduced motion); nothing runs longer than 300 ms.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { endStage } from "../lib/stagesState";

const props = defineProps({ stage: { type: Object, required: true } });
const emit = defineEmits(["done"]);

const EXIT_MS = 220; // a little over the slowest exit (--dur-sheet-out is 200 ms); the CSS decides how fast it really goes
const PAD = 6;

const i = ref(0);
const step = computed(() => props.stage.steps[i.value]);
const last = computed(() => i.value === props.stage.steps.length - 1);
const rect = ref(null);      // the control, in screen pixels, with a little room round it
const card = ref(null);
const cardPos = ref({});
const leaving = ref(false);
const phone = ref(typeof matchMedia === "function" && matchMedia("(max-width: 599px)").matches);
const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

let opener = null;
let target = null;
let timer = 0;
let frame = 0;

const targetEl = () => document.querySelector(`[data-tip="${step.value.tip}"]`);

function place() {
  target = targetEl();
  const r = target?.getBoundingClientRect();
  if (!r || (!r.width && !r.height)) { rect.value = null; cardPos.value = {}; return; }
  rect.value = { x: Math.max(r.left - PAD, 0), y: Math.max(r.top - PAD, 0), w: r.width + PAD * 2, h: r.height + PAD * 2 };
  if (phone.value) { cardPos.value = {}; return; }
  const c = card.value;
  const cw = c?.offsetWidth || 340;
  const ch = c?.offsetHeight || 160;
  const below = rect.value.y + rect.value.h + 12;
  const top = below + ch + 12 <= innerHeight ? below : Math.max(rect.value.y - ch - 12, 12);
  const left = Math.min(Math.max(rect.value.x, 12), Math.max(innerWidth - cw - 12, 12));
  cardPos.value = { top: `${top}px`, left: `${left}px` };
}

// Bring the control into the part of the screen the card does not cover, then follow it while the page moves.
function reveal() {
  const el = targetEl();
  if (!el) return place();
  const r = el.getBoundingClientRect();
  const room = phone.value ? innerHeight - (card.value?.offsetHeight || 200) - 24 : innerHeight - 16;
  if (r.top < 64 || r.bottom > room) {
    const to = r.height > room - 64 ? r.top - 72 : r.top - Math.max((room - r.height) / 2, 72);
    window.scrollBy({ top: to, behavior: calm() ? "auto" : "smooth" });
  }
  place();
}
const follow = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };

function pressedTarget() { if (last.value && props.stage.steps[i.value].try) finish("finished", false); }
function listen() {
  target?.removeEventListener("click", pressedTarget, true);
  target = targetEl();
  if (last.value && step.value.try) target?.addEventListener("click", pressedTarget, true);
}
async function show() {
  await nextTick();
  reveal();
  listen();
  setTimeout(follow, 400); // after a smooth scroll has settled
}
function go(d) {
  const n = i.value + d;
  if (n < 0 || n >= props.stage.steps.length) return;
  i.value = n;
  show();
}

function finish(outcome, restore = true) {
  if (leaving.value) return;
  leaving.value = true;
  endStage(props.stage.id, outcome);
  target?.removeEventListener("click", pressedTarget, true);
  if (restore && opener && opener.isConnected) opener.focus({ preventScroll: true });
  timer = setTimeout(() => emit("done"), EXIT_MS);
}
// "Try it": the tutorial ends, then the real control is pressed (so a sheet opens, or a field takes focus).
function tryIt() {
  const el = targetEl();
  finish("finished", false);
  if (el) { el.scrollIntoView?.({ block: "center", behavior: "auto" }); el.focus?.({ preventScroll: true }); el.click?.(); }
}

function focusables() {
  return [...(card.value?.querySelectorAll("button:not([disabled])") || [])];
}
function onKey(e) {
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish("skipped"); return; }
  if (e.key !== "Tab") return;
  const f = focusables();
  if (!f.length) return;
  const at = f.indexOf(document.activeElement);
  // Tab stays inside the card, wherever focus has got to.
  if (e.shiftKey && at <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && (at === -1 || at === f.length - 1)) { e.preventDefault(); f[0].focus(); }
}

onMounted(async () => {
  opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", follow, { passive: true });
  window.addEventListener("resize", follow);
  await show();
  (card.value?.querySelector("[data-primary]") || card.value)?.focus({ preventScroll: true });
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  cancelAnimationFrame(frame);
  target?.removeEventListener("click", pressedTarget, true);
  document.removeEventListener("keydown", onKey, true);
  window.removeEventListener("scroll", follow);
  window.removeEventListener("resize", follow);
});

// Four dim blocks round a hole, so the control stays visible and (on the last step) pressable.
const blocks = computed(() => {
  const r = rect.value;
  if (!r) return [{ inset: "0" }];
  const px = (n) => `${Math.round(n)}px`;
  return [
    { top: 0, left: 0, right: 0, height: px(r.y) },
    { top: px(r.y + r.h), left: 0, right: 0, bottom: 0 },
    { top: px(r.y), left: 0, width: px(r.x), height: px(r.h) },
    { top: px(r.y), left: px(r.x + r.w), right: 0, height: px(r.h) },
  ];
});
const boxOf = (r) => ({ left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
const canPress = computed(() => last.value && !!step.value.try);
</script>

<template>
  <div class="tour" :class="{ 'is-leaving': leaving }" data-stage-tour :data-stage="stage.id">
    <div v-for="(b, n) in blocks" :key="n" class="tour-dim" :style="b" aria-hidden="true" @pointerdown.prevent></div>
    <div v-if="rect" class="tour-hole" :class="{ open: canPress }" :style="boxOf(rect)" aria-hidden="true" @pointerdown.prevent></div>
    <div v-if="rect" class="tour-ring" :style="boxOf(rect)" aria-hidden="true"></div>
    <section ref="card" class="tour-card" :class="{ phone }" :style="cardPos" role="dialog" aria-modal="true"
             aria-labelledby="tour-title" aria-describedby="tour-text" tabindex="-1">
      <p class="small muted tour-count" style="margin:0">Tip {{ i + 1 }} of {{ stage.steps.length }}</p>
      <h2 id="tour-title" class="tour-title">{{ step.title }}</h2>
      <p id="tour-text" class="tour-text" aria-live="polite">{{ step.text }}</p>
      <div class="tour-actions">
        <button type="button" class="btn-quiet" @click="finish('skipped')">Skip</button>
        <span class="tour-gap"></span>
        <button v-if="i > 0" type="button" class="btn" @click="go(-1)">Back</button>
        <button v-if="canPress" type="button" class="btn" @click="tryIt">Try it</button>
        <button v-if="!last" type="button" class="btn btn-primary" data-primary @click="go(1)">Next</button>
        <button v-else type="button" class="btn btn-primary" data-primary @click="finish('finished')">Got it</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tour { position: fixed; inset: 0; z-index: 110; pointer-events: none; } /* only its parts take presses, so the control in the hole can be pressed */
.tour > * { pointer-events: auto; }
.tour-dim { position: fixed; background: rgba(20, 19, 17, 0.6); animation: m-fade var(--dur) var(--ease-out); }
.tour-hole { position: fixed; border-radius: 10px; }
.tour > .tour-hole.open, .tour > .tour-ring { pointer-events: none; }
.tour-ring {
  position: fixed; border-radius: 10px; pointer-events: none;
  border: 2.5px solid var(--strap);
  animation: m-fade var(--dur) var(--ease-out);
}
.tour-card {
  position: fixed; z-index: 1;
  width: min(340px, calc(100vw - 24px));
  background: var(--paper); color: var(--ink);
  border: var(--border-ink); border-radius: 12px;
  padding: 14px 16px 16px;
  box-shadow: var(--shadow-2);
  display: flex; flex-direction: column; gap: 6px;
  animation: m-rise var(--dur) var(--ease-out);
}
.tour-card:focus { outline: none; }
.tour-card.phone {
  left: 0; right: 0; bottom: 0; width: auto; border-bottom: none; border-radius: 14px 14px 0 0;
  padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  animation: m-sheet-in var(--dur-sheet) var(--ease-out);
}
.tour-title { margin: 0; font-size: 18px; }
.tour-text { margin: 0; }
.tour-actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.tour-actions .btn { width: auto; padding-inline: 14px; }
.tour-gap { flex: 1; }
.tour.is-leaving > * { pointer-events: none; }
.tour.is-leaving .tour-dim, .tour.is-leaving .tour-ring { animation: m-fade-out var(--dur-out) var(--ease-in) forwards; }
.tour.is-leaving .tour-card { animation: m-fade-out var(--dur-out) var(--ease-in) forwards; }
.tour.is-leaving .tour-card.phone { animation: m-sheet-out var(--dur-sheet-out) var(--ease-in) forwards; }
</style>
