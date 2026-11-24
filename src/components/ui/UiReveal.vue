<script setup>
// A block that eases open and closed (F57): its height goes from nothing to its own size (a grid row, 0fr to 1fr,
// the height ease D045 allows beside a details panel), and what is inside fades in. While it is closing it takes
// no clicks and no keys (inert), and what is inside stays in the page until the closing is over, then it is taken
// out and "closed" is emitted (the F40 pattern for a thing that leaves). No Vue transition component, no library; the
// timing is the tokens in main.css, and under reduced motion the height does not move and the block only fades.
//
// open: shown or not. keep: the content stays in the page when closed (a summary that is only folded away, hidden
// from the keyboard and screen readers while it is). The first open of a block that starts open is not animated
// when keep is set (the page just loaded), and is when it is not (a card opened from the address).
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps({ open: Boolean, keep: Boolean });
const emit = defineEmits(["opened", "closed"]);

// A little longer than the slowest step in the CSS (--dur-reveal 200 ms to open, --dur-reveal-out 140 ms to close;
// under reduced motion a 100 ms fade, then the fold). The CSS decides how fast it really goes.
const OPEN_MS = 240;
const CLOSE_MS = 220;

const root = ref(null);
const mounted = ref(props.open || props.keep);
const shown = ref(props.keep && props.open);   // the .open class: the height and the fade run when it changes
const settled = ref(props.keep && props.open); // open and finished: overflow can show a focus ring again
let timer = 0;

function show() {
  clearTimeout(timer);
  mounted.value = true;
  nextTick(() => {
    void root.value?.offsetHeight; // draw the closed state once, so the change below is a transition
    shown.value = true;
    timer = setTimeout(() => { settled.value = true; emit("opened"); }, OPEN_MS);
  });
}
function hide() {
  clearTimeout(timer);
  settled.value = false;
  shown.value = false;
  timer = setTimeout(() => {
    if (!props.keep) mounted.value = false;
    emit("closed");
  }, CLOSE_MS);
}

watch(() => props.open, (now) => (now ? show() : hide()));
onMounted(() => { if (props.open && !props.keep) show(); });
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <div ref="root" class="reveal" :class="{ open: shown, settled }" :inert="shown ? null : ''">
    <div class="reveal-in"><slot v-if="mounted" /></div>
  </div>
</template>
