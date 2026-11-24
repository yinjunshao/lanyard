<script setup>
// Decides whether a tutorial is due on this page (F59, D055) and, if so, fetches and shows it. It is in the signed-in frame
// and in a connection's panel, both of which only signed-in people ever load, and the tutorial itself is a chunk fetched
// with a plain import() only when one is due. It waits, rather than interrupts: until the first control is on the page
// and still, and while any sheet or form is open or a field has focus.
import { onBeforeUnmount, shallowRef, watch } from "vue";
import { me } from "../lib/store";
import { dueStage } from "../lib/stages";
import { loadStages, markSeen } from "../lib/stagesState";

const props = defineProps({
  page: { type: String, default: "" },
  ctx: { type: Object, default: () => ({}) },
});

const Tour = shallowRef(null);
const active = shallowRef(null);
let run = 0;
let timer = 0;

// A sheet, a dialog or a photo viewer is open, an editor is open, or a field has focus: not a moment to interrupt.
function busy() {
  // The photo viewer (.lb) is always in the page and is a dialog only while it has .open.
  if (document.querySelector('[role="dialog"]:not(.lb), [aria-modal="true"]:not(.lb), .lb.open, .sheet-backdrop, .crop-backdrop, .reveal.open')) return true;
  const a = document.activeElement;
  return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || !!a?.isContentEditable;
}
const there = (tip) => {
  const el = document.querySelector(`[data-tip="${tip}"]`);
  const r = el?.getBoundingClientRect();
  return !!r && (r.width > 0 || r.height > 0);
};
const sleep = (ms) => new Promise((ok) => { timer = setTimeout(ok, ms); });

// The first control has to be there, and the page still, for two looks in a row; waits up to about 15 seconds.
async function ready(stage, mine) {
  let still = 0;
  for (let n = 0; n < 38 && mine(); n++) {
    if (document.visibilityState === "visible" && !busy() && there(stage.steps[0].tip)) { if (++still >= 2) return true; }
    else still = 0;
    await sleep(400);
  }
  return false;
}

async function consider() {
  const mine = ++run;
  clearTimeout(timer);
  active.value = null;
  if (!props.page || !me.profile) return;
  let state;
  try { state = await loadStages(); } catch { return; }
  if (mine !== run) return;
  const stage = dueStage(state, props.page, props.ctx);
  if (!stage || !(await ready(stage, () => mine === run))) return;
  try {
    const m = await import("./StageTour.vue"); // fetched before it is recorded, so a failed download loses nothing
    if (mine !== run) return;
    await markSeen(stage.id);
    if (mine !== run) return;
    Tour.value = m.default;
    active.value = stage;
  } catch { /* one a day, or not ready: it waits for another day or another visit */ }
}

watch(() => [props.page, props.ctx?.metAtEvent, !!me.profile], consider, { immediate: true });
onBeforeUnmount(() => { run++; clearTimeout(timer); });
</script>

<template>
  <component :is="Tour" v-if="Tour && active" :key="active.id" :stage="active" @done="active = null" />
</template>
