<script setup>
// F55.3: a card's text colour (Plus). Two round choices: Auto (the theme's usual text) and Custom, which opens the same
// colour panel as the strap, told what the words sit on so it can say "Hard to read" under 4.5:1 and refuse under 3:1.
// A free account sees a line that points to Plus. A lapsed Plus account sees what it kept and can set it back to Auto.
// The letter A in each round shows the card's paper on the text colour, which is exactly how the card will read.
// v-model is "#RRGGBB" or "" for Auto. The server decides what may be saved (worker/cardcolour.js).
import { computed, ref, shallowRef } from "vue";
import { me } from "../lib/store";
import { autoInk, cardPaper, strictHex, textVerdict } from "../lib/cardcolour";

const model = defineModel({ type: String, default: "" });
const props = defineProps({ theme: { type: String, default: "default" } });

// The colour panel is the same lazy chunk as the strap's, fetched by hand on the first press.
const Panel = shallowRef(null);
const panelOpen = ref(false);
const customBtn = ref(null);
const own = computed(() => strictHex(model.value));
const paper = computed(() => cardPaper(props.theme));
const verdict = computed(() => (own.value ? textVerdict(own.value, props.theme) : null));
const caption = computed(() => (own.value ? `Custom ${own.value}` : "Auto: the card's usual text"));
async function openPanel() {
  if (!Panel.value) Panel.value = (await import("./CardColourPanel.vue")).default;
  panelOpen.value = true;
}
</script>

<template>
  <div class="tc">
    <template v-if="me.plan.customStrap">
      <div class="tc-row">
        <button type="button" class="tc-opt" :class="{ on: !own }" :aria-pressed="!own" aria-label="Auto text colour" title="Auto" @click="model = ''">
          <span class="tc-dot" :style="{ background: autoInk(theme), color: paper }">A</span><span class="tc-ring" aria-hidden="true"></span>
        </button>
        <button ref="customBtn" type="button" class="tc-opt" :class="{ on: !!own }" :aria-pressed="!!own" aria-haspopup="dialog" :aria-expanded="panelOpen"
                :aria-label="own ? `Custom text colour ${own}, change it` : 'Custom text colour'" title="Custom" @click="openPanel">
          <span class="tc-dot" :class="{ 'tc-wheel': !own }" :style="own ? { background: own, color: paper } : null">
            <template v-if="own">A</template>
          </span><span class="tc-ring" aria-hidden="true"></span>
        </button>
      </div>
      <p class="small muted tc-caption" aria-live="polite">{{ caption }}</p>
      <p v-if="verdict?.level === 'hard'" class="small tc-warn" role="status">Hard to read ({{ verdict.ratio.toFixed(1) }} to 1 on this card)</p>
      <p v-else-if="verdict?.level === 'no'" class="error-text tc-no" role="alert">Too hard to read on this card. Choose another before you save.</p>
      <component :is="Panel" v-if="Panel" v-model="model" :open="panelOpen" :anchor="customBtn" :fallback="own || autoInk(theme)" :against="paper"
                 label="Text colour" @done="panelOpen = false" @close="panelOpen = false" />
    </template>
    <template v-else>
      <p class="small muted tc-free">
        <template v-if="own">
          Kept from Plus: {{ own }}.
          <button type="button" class="link-btn" @click="model = ''">Set it back to Auto</button>
        </template>
        <template v-else>
          Your own text colour is part of
          <router-link to="/app/settings/plan" style="text-decoration:underline">Lanyard Plus</router-link>.
        </template>
      </p>
      <p v-if="own && verdict?.level === 'no'" class="error-text tc-no" role="alert">Too hard to read on this card. Set it back to Auto before you save.</p>
    </template>
  </div>
</template>

<style scoped>
.tc-row { display: flex; margin-left: -8px; }
.tc-opt {
  position: relative; flex: none; width: 44px; height: 44px; padding: 0; margin: 0;
  display: inline-grid; place-items: center; background: none; border: 0; border-radius: 50%; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.tc-dot {
  width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center;
  font-size: 14px; font-weight: 700; line-height: 1;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18);
  transition: transform var(--dur-fast) var(--ease-out);
}
.tc-wheel { background: conic-gradient(#e5483b, #f0b429, #5fbf4a, #2cb5c9, #3b5bdb, #b648c9, #e5483b); }
.tc-opt:hover .tc-dot { transform: scale(1.08); }
.tc-opt:active .tc-dot { transform: scale(0.94); }
.tc-ring {
  position: absolute; inset: 3px; border-radius: 50%; border: 2px solid var(--ink);
  opacity: 0; transform: scale(0.82); pointer-events: none;
  transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.tc-opt.on .tc-ring { opacity: 1; transform: scale(1); }
.tc-opt:focus-visible { outline: 2.5px solid var(--strap); outline-offset: 0; }
.tc-caption, .tc-free { margin: 2px 0 0; }
.tc-warn { margin: 4px 0 0; color: var(--strap-deep); font-weight: 700; }
.tc-no { margin: 4px 0 0; }
@media (prefers-reduced-motion: reduce) { .tc-dot, .tc-ring { transition: none; } }
</style>
