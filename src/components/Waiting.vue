<script>
// One press at a time (F38.6). `once(fn)` returns fn wrapped so that a second press while it is still waiting does
// nothing. `working` is the wrapped function that is running (or null): every button of the page can disable
// itself with !!working, and the one that was pressed can say "Saving…" with working === thatFunction.
// It lives here, not in its own file, so it adds no new chunk name to the entry that every public page loads.
// Signed-in, host and admin pages only.
import { shallowRef } from "vue";
export function useBusy() {
  const working = shallowRef(null);
  const once = (fn) => {
    const run = async (...args) => {
      if (working.value) return;
      working.value = run;
      try { return await fn(...args); } finally { working.value = null; }
    };
    return run;
  };
  return { working, once };
}
</script>

<script setup>
// F38: what a signed-in, host or admin page shows while its content loads. Grey blocks in the shape of
// the content (the .sk classes in main.css, no motion under prefers-reduced-motion), one polite message
// for a screen reader (not one per block), and after about 8 seconds a note that it is taking longer
// than usual with Try again. Public pages do not import this file: they use the same classes with no
// script, because of the first-load budget (D043, F28).
//
//   <Waiting v-if="loading" shape="list" :rows="4" :retry="load" />
//
// shape: "list" (rows with a photo), "panel" (boxes), "form" (labels and inputs) or "lines" (text).
// title and stats put a heading block and three figure tiles above the body. retry is what Try again
// calls; without one the page is loaded again.
import { onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps({
  shape: { type: String, default: "lines" },
  rows: { type: Number, default: 3 },
  title: { type: Boolean, default: false },
  stats: { type: Boolean, default: false },
  label: { type: String, default: "Loading" },
  retry: { type: Function, default: null },
  slowMs: { type: Number, default: 8000 },
});

const slow = ref(false);
let timer = 0;
function arm() {
  slow.value = false;
  clearTimeout(timer);
  timer = setTimeout(() => { slow.value = true; }, props.slowMs);
}
onMounted(arm);
onBeforeUnmount(() => clearTimeout(timer));
function again() {
  arm();
  if (props.retry) props.retry();
  else location.reload();
}
</script>

<template>
  <div class="sk-wrap" aria-busy="true">
    <p class="visually-hidden" role="status">{{ slow ? "This is taking longer than usual." : `${label}…` }}</p>
    <div class="sk-body" aria-hidden="true">
      <span v-if="title" class="sk sk-title"></span>
      <div v-if="stats" class="sk-stats"><span v-for="n in 3" :key="n" class="sk sk-stat"></span></div>
      <div v-if="shape === 'list'" class="list">
        <div v-for="n in rows" :key="n" class="list-row">
          <span class="sk sk-photo"></span>
          <span style="flex:1;min-width:0"><span class="sk sk-line"></span><span class="sk sk-line s"></span></span>
        </div>
      </div>
      <template v-else-if="shape === 'panel'">
        <div v-for="n in rows" :key="n" class="panel sk-panel">
          <span class="sk sk-line s"></span><span class="sk sk-line"></span><span class="sk sk-line"></span>
        </div>
      </template>
      <template v-else-if="shape === 'form'">
        <div v-for="n in rows" :key="n"><span class="sk sk-line s"></span><span class="sk sk-box"></span></div>
      </template>
      <template v-else>
        <span v-for="n in rows" :key="n" class="sk sk-line" :class="{ s: n === rows }"></span>
      </template>
    </div>
    <p v-if="slow" class="sk-note">
      <span class="small muted">This is taking longer than usual.</span>
      <button type="button" class="btn" @click="again">Try again</button>
    </p>
  </div>
</template>
