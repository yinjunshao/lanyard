<script setup>
// F65 (D060): how an event looks, for the host: the theme grid and the Advanced part. Step 2 of Create event and the Details tab
// hand in the form object that holds theme, strapColor and strapInk; `prefix` ("ev" or "d") keeps the ids apart.
//
// The themes are a radio group of small check-in page heads (src/lib/eventthemes.js, the list the Worker keeps too): one tab stop,
// the arrow keys move and choose, the chosen one is ringed. The preview beside the form follows.
// Advanced (UiReveal) is folded away until it is wanted, and starts open when the form already has a brand colour or a text colour:
//   - the brand colour: the card colour swatches and the colour panel (F55), free for hosts (plus-gate off);
//   - the text colour on the strap: Automatic (white or black, whichever reads better), White or Dark, and only a choice that reads
//     (4.5:1) is offered; one that stops reading when the colour or theme changes goes back to Automatic, with a line saying so;
//   - "Use our company branding": off and disabled until F66.
import { computed, ref, nextTick, watch } from "vue";
import UiReveal from "./ui/UiReveal.vue";
import CardSwatches from "./CardSwatches.vue";
import { EVENT_THEMES, themeOf } from "../lib/eventthemes";
import { INK_CHOICES, inkReads, strapIn } from "../lib/eventlook";

const props = defineProps({
  form: { type: Object, required: true },
  prefix: { type: String, default: "ev" },
  // F64: the event was started from another one, which keeps its own look (the Create form shows nothing to choose).
});
const t = computed(() => themeOf(props.form.theme));
const open = ref(!!props.form.strapColor || !!props.form.strapInk);
const id = (s) => `${props.prefix}-${s}`;

// ---- the theme grid ----
const grid = ref(null);
const pick = (th) => { props.form.theme = th.id; };
const tabbable = (th, i) => (EVENT_THEMES.some((x) => x.id === props.form.theme) ? props.form.theme === th.id : i === 0);
function onKey(e, i) {
  const n = EVENT_THEMES.length;
  const to = { ArrowRight: (i + 1) % n, ArrowDown: (i + 1) % n, ArrowLeft: (i + n - 1) % n, ArrowUp: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  pick(EVENT_THEMES[to]);
  nextTick(() => grid.value?.children[to]?.focus());
}

// ---- the text colour ----
const strap = computed(() => strapIn(props.form.theme, props.form.strapColor));
const OPTIONS = [{ value: "", name: "Automatic" }, ...INK_CHOICES];
const reads = (o) => !o.value || inkReads(o.value, strap.value);
const hard = computed(() => INK_CHOICES.filter((c) => !inkReads(c.value, strap.value)).map((c) => c.name));
const reset = ref(false);
watch([() => props.form.theme, () => props.form.strapColor, () => props.form.strapInk], () => {
  if (props.form.strapInk && !inkReads(props.form.strapInk, strap.value)) { props.form.strapInk = ""; reset.value = true; }
  else if (props.form.strapInk === "" || !props.form.strapInk) reset.value = reset.value && false;
});
const inkGroup = ref(null);
function onInkKey(e, i) {
  const list = OPTIONS.filter(reads);
  const at = list.findIndex((o) => o.value === (props.form.strapInk || ""));
  const to = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: list.length - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  const o = list[(to + list.length) % list.length];
  props.form.strapInk = o.value;
  reset.value = false;
  nextTick(() => inkGroup.value?.querySelector('[aria-checked="true"]')?.focus());
}
function pickInk(o) { props.form.strapInk = o.value; reset.value = false; }
</script>

<template>
  <div class="el">
    <div class="field">
      <span :id="id('theme-l')" class="label">Theme</span>
      <div :id="id('theme')" ref="grid" class="el-grid" role="radiogroup" :aria-labelledby="id('theme-l')">
        <button v-for="(th, i) in EVENT_THEMES" :key="th.id" type="button" role="radio" class="el-card" :data-pick="th.id"
                :aria-checked="form.theme === th.id" :tabindex="tabbable(th, i) ? 0 : -1" @click="pick(th)" @keydown="onKey($event, i)">
          <span class="el-mini" :class="{ dark: th.dark }" :style="{ '--th-strap': th.strap, '--th-ink': th.ink, '--th-tint': th.tint }" aria-hidden="true">
            <span class="el-strap"><span>lanyard</span><span>Check-in</span></span>
            <span class="el-lines"><i></i><i></i></span>
          </span>
          <span class="el-name">{{ th.name }}</span>
          <span class="el-ring" aria-hidden="true"></span>
        </button>
      </div>
      <span class="small muted">Changes how the check-in page, the Present page and the printed poster look. The preview shows it.</span>
    </div>

    <div class="el-adv">
      <button type="button" class="link-btn el-toggle" :aria-expanded="open" :aria-controls="id('adv')" @click="open = !open">
        <span class="el-chev" :class="{ on: open }" aria-hidden="true"></span>Advanced
      </button>
      <UiReveal :open="open" keep>
        <div :id="id('adv')" class="el-adv-body">
          <div :id="id('strap')" class="field">
            <span :id="id('strap-l')" class="label">Brand colour (optional)</span>
            <CardSwatches v-model="form.strapColor" :theme="form.theme" :plus-gate="false" :theme-colour="t.strap" :theme-name="t.name" />
            <span class="small muted">Colours the strap at the top of the check-in page. Any colour is free for events.</span>
            <button v-if="form.strapColor" type="button" class="link-btn el-reset" @click="form.strapColor = ''">Use the {{ t.name }} colour</button>
          </div>

          <div class="field">
            <span :id="id('ink-l')" class="label">Text on the strap</span>
            <div ref="inkGroup" class="el-ink" role="radiogroup" :aria-labelledby="id('ink-l')">
              <button v-for="(o, i) in OPTIONS" :key="o.name" type="button" role="radio" class="chip chip-toggle" :class="{ on: (form.strapInk || '') === o.value }"
                      :aria-checked="(form.strapInk || '') === o.value" :disabled="!reads(o)" :tabindex="(form.strapInk || '') === o.value ? 0 : -1"
                      @click="pickInk(o)" @keydown="onInkKey($event, i)">{{ o.name }}</button>
            </div>
            <span class="small muted">Automatic picks white or black, whichever reads better on the strap.</span>
            <span v-if="hard.length" class="small muted" data-ink-hard>{{ hard.join(" and ") }} would be hard to read on this strap, so {{ hard.length > 1 ? "they are" : "it is" }} not offered.</span>
            <span v-if="reset" class="small el-note" role="status">The text colour went back to Automatic, because the one you chose would be hard to read on this strap.</span>
          </div>

          <label class="checkbox-row el-brand" aria-disabled="true">
            <input type="checkbox" disabled />
            <span class="small"><strong>Use our company branding</strong>
              <span class="muted" style="display:block">Coming soon: your company name and logo on the check-in page, the Present page and the poster, for paid events.</span></span>
          </label>
        </div>
      </UiReveal>
    </div>
  </div>
</template>

<style scoped>
.el { display: flex; flex-direction: column; gap: 20px; }
.el-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 4px 0; }
@media (min-width: 560px) { .el-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.el-card {
  position: relative; display: flex; flex-direction: column; gap: 8px; align-items: stretch; text-align: left;
  min-height: 44px; padding: 8px; margin: 0; background: var(--paper-raised); border: var(--border); border-radius: var(--radius);
  color: var(--ink); font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.el-card:focus-visible { outline: 2.5px solid var(--strap); outline-offset: 2px; }
/* A small check-in page head: the strap, the words on it and the paper under it, in this theme's own colours (fixed, like a card). */
.el-mini { display: flex; flex-direction: column; background: var(--th-tint); border: 1px solid var(--th-line, #d8d2c5); border-radius: 4px; overflow: hidden; }
.el-mini.dark { --th-line: #38352f; }
.el-strap { display: flex; justify-content: space-between; align-items: flex-end; gap: 4px; height: 26px; padding: 0 6px 4px; background: var(--th-strap); color: var(--th-ink); font-size: 9px; font-weight: 700; letter-spacing: 0.02em; line-height: 1; }
.el-lines { display: flex; flex-direction: column; gap: 4px; padding: 8px 6px; }
.el-lines i { display: block; height: 5px; border-radius: 2px; background: #1b1a17; opacity: 0.75; }
.el-lines i + i { width: 60%; opacity: 0.3; }
.el-mini.dark .el-lines i { background: #f4f1ea; }
.el-name { font-size: 14px; font-weight: 700; }
/* The ring on the chosen one: ink, fading and growing in (opacity and transform only). */
.el-ring { position: absolute; inset: -2px; border-radius: calc(var(--radius) + 2px); border: 2.5px solid var(--ink); opacity: 0; transform: scale(0.97); transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out); pointer-events: none; }
.el-card[aria-checked="true"] .el-ring { opacity: 1; transform: scale(1); }
.el-toggle { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; font-weight: 700; }
.el-chev { width: 8px; height: 8px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(-45deg); transition: transform var(--dur-fast) var(--ease-out); }
.el-chev.on { transform: rotate(45deg); }
.el-adv-body { display: flex; flex-direction: column; gap: 20px; padding: 8px 0 4px; }
.el-reset { align-self: flex-start; min-height: 44px; display: inline-flex; align-items: center; }
.el-ink { display: flex; flex-wrap: wrap; gap: 8px; }
.el-ink .chip { min-height: 44px; }
.el-ink .chip:disabled { opacity: 0.5; cursor: not-allowed; }
.el-note { color: var(--strap-deep); font-weight: 700; }
.el-brand { opacity: 0.7; }
@media (prefers-reduced-motion: reduce) { .el-ring, .el-chev { transition: none; } }
</style>
