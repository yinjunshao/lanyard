<script setup>
// F55: a card's strap colour. Ten preset swatches for everyone (round, 44 px to press, a ring on the chosen one),
// then "Custom" at the end: Plus has the colour wheel there (F55.2), a free account is taken to the Plus page and
// nothing is saved. The server decides what an account may save (worker/cardcolour.js); this only decides what to
// show. v-model is "#RRGGBB" or "" for the theme's own colour.
import { computed, nextTick, ref } from "vue";
import { me } from "../lib/store";
import { STRAP_PRESETS, presetOf, strictHex } from "../lib/cardcolour";

const model = defineModel({ type: String, default: "" });
const props = defineProps({ theme: { type: String, default: "default" } });

// What the strap is when nothing is chosen: Formal is graphite, every other theme is the brand orange.
const themeHex = computed(() => (props.theme === "formal" ? "#2B3138" : "#C4441E"));
const shown = computed(() => strictHex(model.value) || themeHex.value);
const chosen = computed(() => presetOf(shown.value));
const caption = computed(() => {
  if (!model.value) return `Theme colour: ${presetOf(themeHex.value).name}`;
  return chosen.value ? chosen.value.name : `Custom ${shown.value}`;
});

function pick(p) {
  // The preset that is the theme's own colour clears the choice, so the card follows its theme.
  model.value = p.hex === themeHex.value ? "" : p.hex;
}

// Radio group with arrow keys: one tab stop (the chosen swatch), the arrows move and choose.
const group = ref(null);
function onKey(e, i) {
  const n = STRAP_PRESETS.length;
  const to = { ArrowRight: (i + 1) % n, ArrowDown: (i + 1) % n, ArrowLeft: (i + n - 1) % n, ArrowUp: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  pick(STRAP_PRESETS[to]);
  nextTick(() => group.value?.children[to]?.focus());
}
const tabbable = (p, i) => (chosen.value ? chosen.value.hex === p.hex : i === 0);
</script>

<template>
  <div class="swatches-wrap">
    <div class="swatch-row">
      <div ref="group" class="swatch-group" role="radiogroup" aria-label="Strap colour">
        <button v-for="(p, i) in STRAP_PRESETS" :key="p.hex" type="button" role="radio" class="swatch"
                :aria-checked="chosen?.hex === p.hex" :aria-label="p.name" :title="p.name"
                :tabindex="tabbable(p, i) ? 0 : -1" @click="pick(p)" @keydown="onKey($event, i)">
          <span class="sw-dot" :style="{ background: p.hex }"></span>
          <span class="sw-ring" aria-hidden="true"></span>
        </button>
      </div>
      <!-- Free: the Plus page, nothing is saved. Plus: the wheel (F55.2). -->
      <router-link v-if="!me.plan.customStrap" class="swatch swatch-custom" to="/app/settings/plan"
                   aria-label="Custom colour, part of Lanyard Plus" title="Custom colours are part of Lanyard Plus">
        <span class="sw-dot sw-wheel"></span>
        <span class="sw-plus" aria-hidden="true">Plus</span>
      </router-link>
    </div>
    <p class="small muted swatch-name" aria-live="polite">{{ caption }}</p>
  </div>
</template>

<style scoped>
.swatch-row { display: flex; flex-wrap: wrap; align-items: center; }
.swatch-group { display: contents; }
.swatch {
  position: relative; flex: none;
  width: 44px; height: 44px; padding: 0; margin: 0;
  display: inline-grid; place-items: center;
  background: none; border: 0; border-radius: 50%; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.sw-dot {
  width: 28px; height: 28px; border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18);
  transition: transform var(--dur-fast) var(--ease-out);
}
.swatch:hover .sw-dot { transform: scale(1.08); }
.swatch:active .sw-dot { transform: scale(0.94); }
/* The ring on the chosen one: ink, with a gap of paper between it and the colour. It fades and grows in. */
.sw-ring {
  position: absolute; inset: 3px; border-radius: 50%;
  border: 2px solid var(--ink);
  opacity: 0; transform: scale(0.82);
  transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
  pointer-events: none;
}
.swatch[aria-checked="true"] .sw-ring { opacity: 1; transform: scale(1); }
.swatch:focus-visible { outline: 2.5px solid var(--strap); outline-offset: 0; }
.sw-wheel { background: conic-gradient(#e5483b, #f0b429, #5fbf4a, #2cb5c9, #3b5bdb, #b648c9, #e5483b); }
.sw-plus {
  position: absolute; right: -2px; bottom: 1px;
  font-size: 10px; font-weight: 700; line-height: 1; letter-spacing: 0.04em;
  padding: 2px 4px; border-radius: 3px;
  background: var(--ink); color: var(--paper);
}
.swatch-name { margin: 2px 0 0; }
@media (prefers-reduced-motion: reduce) {
  .sw-dot, .sw-ring { transition: none; }
}
</style>
