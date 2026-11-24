<script setup>
// F52: an example that sits inside an empty field and swaps for the next one every few seconds, the old line
// sliding up and fading out as the new one rises in (CSS tokens only, D045; no Vue transition component, no library).
// The overlay is decoration: aria-hidden, takes no clicks, and goes at the first keystroke. The input keeps a
// real, static placeholder ("e.g. " plus the first example) which is what a screen reader reads; the slot gets
// it as `placeholder`. Ticks pause while the tab is hidden. Starts at a random example.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps({
  pool: { type: Array, required: true },
  empty: { type: Boolean, default: true },   // the field has nothing in it
  off: { type: Boolean, default: false },    // show no overlay at all (the field has a real value to suggest)
  prefix: { type: String, default: "e.g. " },
  every: { type: Number, default: 3500 },
});

const n = computed(() => props.pool.length);
const at = ref(0);
const prev = ref(-1);
const tick = ref(0);
let timer = 0;

const placeholder = computed(() => (n.value ? props.prefix + props.pool[0] : ""));
const text = (i) => props.prefix + (props.pool[i] ?? "");
const live = computed(() => !props.off && props.empty && n.value > 1);

function step() {
  if (document.hidden || !live.value) return;
  prev.value = at.value;
  at.value = (at.value + 1) % n.value;
  tick.value++;
}
onMounted(() => {
  at.value = Math.floor(Math.random() * n.value);
  timer = window.setInterval(step, props.every);
});
onBeforeUnmount(() => window.clearInterval(timer));
</script>

<template>
  <div class="rot-hint" :class="{ 'rot-on': !off && empty && n > 0 }">
    <slot :placeholder="placeholder"></slot>
    <div v-if="!off && empty && n" class="rot-hint-text" aria-hidden="true">
      <span v-if="tick > 0 && prev >= 0" :key="'o' + tick" class="rot-hint-line rot-out">{{ text(prev) }}</span>
      <span :key="'i' + tick" class="rot-hint-line" :class="{ 'rot-in': tick > 0 }">{{ text(at) }}</span>
    </div>
  </div>
</template>
