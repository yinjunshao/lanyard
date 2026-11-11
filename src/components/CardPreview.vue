<script setup>
// F18: a live preview of a card while it is edited, in Edit profile and My cards.
// "Badge" is what you hold up (the real Badge, as My card draws it); "What they see" is what a
// scan opens (the real CardView, as the card page draws it). It saves nothing and calls
// nothing, the page inside is inert, and the card is not reachable by anyone until it is saved.
//
// `profile` and `card` are built by lib/cardpreview.js from the form. Below 1260 px it sits at
// the top of the editor, closed until you press Preview; from 1260 px it stays open beside the
// editor, clear of the app column.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import Badge from "./Badge.vue";
import CardView from "./CardView.vue";
import { subtitleParts } from "../lib/profile";
import { viewOf } from "../lib/cardpreview";

const props = defineProps({
  profile: { type: Object, required: true },
  card: { type: Object, required: true },
  // The address the badge's QR draws. A card that is not saved yet gets a placeholder that opens nothing.
  url: { type: String, required: true },
});

// Typing updates the preview a moment later, not on every key.
const shown = ref({ profile: props.profile, card: props.card });
let timer = null;
watch([() => props.profile, () => props.card], ([profile, card]) => {
  clearTimeout(timer);
  timer = setTimeout(() => { shown.value = { profile, card }; }, 150);
});
onBeforeUnmount(() => clearTimeout(timer));

const view = computed(() => viewOf(shown.value.profile, shown.value.card));
// The line under the name on a badge, as My card builds it.
const subtitle = computed(() => subtitleParts(view.value.profile, { year: true }).join("  ·  "));

const mode = ref("badge");
const open = ref(false);
</script>

<template>
  <section class="cp" :class="{ open }" aria-label="Preview of this card">
    <div class="cp-top">
      <button type="button" class="btn cp-toggle" :aria-expanded="open" aria-controls="cp-body" @click="open = !open">
        {{ open ? "Hide preview" : "Preview this card" }}
      </button>
      <span class="label cp-label">Preview</span>
    </div>
    <div id="cp-body" class="cp-body">
      <div class="seg" role="group" aria-label="What to preview">
        <button type="button" class="seg-btn" :class="{ on: mode === 'badge' }" :aria-pressed="mode === 'badge'" @click="mode = 'badge'">Badge</button>
        <button type="button" class="seg-btn" :class="{ on: mode === 'public' }" :aria-pressed="mode === 'public'" @click="mode = 'public'">What they see</button>
      </div>
      <p class="small muted cp-hint">{{ mode === "badge" ? "What you hold up for people to scan." : "What opens when someone scans your badge." }}</p>
      <div class="cp-frame" data-preview-frame>
        <div class="cp-page" inert aria-hidden="true">
          <Badge v-if="mode === 'badge'" :view="view" :url="url" :subtitle="subtitle" />
          <CardView v-else :view="view" />
        </div>
      </div>
      <p class="small muted cp-note">Preview only. Nothing is saved or sent until you press Save.</p>
    </div>
  </section>
</template>

<style scoped>
.cp { margin-bottom: 16px; }
.cp-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.cp-toggle { width: auto; }
.cp-label { display: none; }
.cp-body { display: none; margin-top: 12px; }
.cp.open .cp-body { display: block; }
.cp-hint { margin: 8px 0 10px; }
.cp-note { margin: 8px 0 0; }
/* A fixed height, so what you type never moves the form. */
.cp-frame {
  height: 520px; overflow: auto; overscroll-behavior: contain;
  border: var(--border); border-radius: var(--radius); background: var(--paper);
}
.cp-page { padding: 10px; min-height: 100%; }

@media (min-width: 1260px) {
  .cp { position: fixed; top: 88px; left: calc(50% + 264px); width: 360px; margin: 0; z-index: 5; }
  .cp-toggle { display: none; }
  .cp-label { display: inline; }
  .cp-body { display: block; margin-top: 6px; }
  .cp-frame { height: max(300px, min(640px, calc(100vh - 330px))); }
}
</style>
