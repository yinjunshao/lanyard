<script setup>
// F56: a Plus card's strap material, a row of small swatches below the colours: None, then Gold, Silver, Rose gold, Copper,
// Pearl and Carbon, each drawn with the same CSS as the strap. Plus chooses one. A free account sees the row with a small
// "Plus" mark and pressing a material takes it to the Plus page (nothing is saved); a lapsed Plus account keeps the one it
// saved and can set it to None. The Worker decides what an account may save (worker/cardcolour.js); this only shows it.
// v-model is a material id (see src/lib/cardmaterial.js) or "" for none.
import { computed, nextTick, ref } from "vue";
import { me } from "../lib/store";
import { MATERIALS, materialOf } from "../lib/cardmaterial";

const model = defineModel({ type: String, default: "" });
const plus = computed(() => me.plan.customStrap);
const chosen = computed(() => materialOf(model.value));
const caption = computed(() => (chosen.value ? chosen.value.name : "None: the strap colour shows"));
// Radio group with arrow keys (Plus): one tab stop, the arrows move and choose. None is the first option.
const OPTIONS = [{ id: "", name: "None" }, ...MATERIALS];
const group = ref(null);
const tabbable = (o, i) => (chosen.value ? chosen.value.id === o.id : i === 0);
function onKey(e, i) {
  const n = OPTIONS.length;
  const to = { ArrowRight: (i + 1) % n, ArrowDown: (i + 1) % n, ArrowLeft: (i + n - 1) % n, ArrowUp: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  model.value = OPTIONS[to].id;
  nextTick(() => group.value?.children[to]?.focus());
}
// A free account: None, and the material it kept if it has one, are choices; the rest are links to the Plus page.
const locked = (o) => !plus.value && o.id !== "" && o.id !== model.value;
</script>

<template>
  <div class="mats">
    <div ref="group" class="mat-row" role="radiogroup" aria-label="Strap material">
      <template v-for="(o, i) in OPTIONS" :key="o.id">
        <router-link v-if="locked(o)" class="mat-opt" to="/app/settings/plan" :aria-label="`${o.name}, part of Lanyard Plus`" :title="`${o.name}: part of Lanyard Plus`">
          <span class="mat-dot" :class="'mat-' + o.id"></span>
        </router-link>
        <button v-else type="button" role="radio" class="mat-opt" :aria-checked="(chosen?.id || '') === o.id" :aria-label="o.name" :title="o.name"
                :tabindex="tabbable(o, i) ? 0 : -1" @click="model = o.id" @keydown="onKey($event, i)">
          <span class="mat-dot" :class="o.id ? 'mat-' + o.id : 'mat-none'"></span>
          <span class="mat-ring" aria-hidden="true"></span>
        </button>
      </template>
      <span v-if="!plus" class="mat-plus">Plus</span>
    </div>
    <p class="small muted mat-name" aria-live="polite">
      {{ caption }}<template v-if="!plus && !chosen"> · <router-link to="/app/settings/plan" style="text-decoration:underline">Materials are part of Lanyard Plus</router-link></template>
    </p>
  </div>
</template>

<style scoped>
.mat-row { display: flex; flex-wrap: wrap; align-items: center; margin-left: -8px; } /* the first dot lines up with the label above it */
.mat-opt {
  position: relative; flex: none;
  width: 44px; height: 44px; padding: 0; margin: 0;
  display: inline-grid; place-items: center;
  background: none; border: 0; border-radius: 50%; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.mat-dot {
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--card-strap);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.4);
  transition: transform var(--dur-fast) var(--ease-out);
}
/* None: an empty dot with a line through it, in the card's own ink so it reads on every app theme. */
.mat-none { background: linear-gradient(135deg, transparent calc(50% - 1px), var(--graphite) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)); box-shadow: inset 0 0 0 1.5px var(--graphite); }
.mat-opt:hover .mat-dot { transform: scale(1.08); }
.mat-opt:active .mat-dot { transform: scale(0.94); }
.mat-ring {
  position: absolute; inset: 3px; border-radius: 50%;
  border: 2px solid var(--ink);
  opacity: 0; transform: scale(0.82);
  transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
  pointer-events: none;
}
.mat-opt[aria-checked="true"] .mat-ring { opacity: 1; transform: scale(1); }
.mat-opt:focus-visible { outline: 2.5px solid var(--strap); outline-offset: 0; }
.mat-plus {
  margin-left: 6px; font-size: 10px; font-weight: 700; line-height: 1; letter-spacing: 0.04em;
  padding: 2px 4px; border-radius: 3px; background: var(--ink); color: var(--paper);
}
.mat-name { margin: 2px 0 0; }
@media (prefers-reduced-motion: reduce) {
  .mat-dot, .mat-ring { transition: none; }
}
</style>
