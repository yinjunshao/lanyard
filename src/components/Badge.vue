<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { drawQR } from "../lib/qr";
import Avatar from "./Avatar.vue";

const props = defineProps({
  view: { type: Object, required: true },
  url: { type: String, required: true },
});

const qrCanvas = ref(null);
const meta = computed(() =>
  [props.view?.profile?.course, props.view?.profile?.uni, props.view?.profile?.year]
    .filter(Boolean).join("  ·  ")
);
// Capped so the badge never grows with the data — a long tag list or
// headline is cut (with CSS ellipsis / line-clamp), never pushed past the
// card's edge or stretched into a wall of chips.
const tags = computed(() => (props.view?.profile?.tags || []).slice(0, 4));
const headline = computed(() => (props.view?.profile?.headline || "").slice(0, 80));
const note = computed(() => (props.view?.note || "").slice(0, 160));

onMounted(render);
watch(() => props.url, render);
async function render() {
  if (qrCanvas.value) await drawQR(qrCanvas.value, props.url, 272) // drawn at 2x, shown at 136px, so it stays sharp;
}
</script>

<template>
  <div class="badge-stage">
    <div class="badge" :class="view.theme" @contextmenu.prevent>
      <div class="badge-strap">
        <div class="badge-slot"></div>
        <span class="badge-strap-word">lanyard</span>
        <span class="badge-strap-event">{{ view.name || "General" }}</span>
      </div>

      <div class="badge-body">
        <div class="badge-head">
          <Avatar class="badge-photo" :src="view.profile.photo" />
          <div class="badge-head-text">
            <h2 class="badge-name" :title="view.profile.name">{{ view.profile.name }}</h2>
            <p v-if="meta" class="badge-meta" :title="meta">{{ meta }}</p>
          </div>
        </div>

        <div v-if="headline" class="badge-field">
          <span class="label">What I do</span>
          <div class="small badge-line-clamp-1" :title="headline">{{ headline }}</div>
        </div>

        <div v-if="tags.length" class="badge-field badge-tags">
          <span class="label" style="display:block;margin-bottom:7px">Come to me for</span>
          <div class="chip-row">
            <span v-for="t in tags" :key="t" class="chip muted badge-tag" :title="t">
              <span class="badge-tag-text">{{ t }}</span>
            </span>
          </div>
        </div>

        <div v-if="note" class="badge-note" :title="view.note">“{{ note }}”</div>

        <div class="badge-qr">
          <canvas ref="qrCanvas" role="img" aria-label="QR code for this card. Scan it to open the card."></canvas>
        </div>
        <div class="badge-foot">
          <div class="label">Scan to connect</div>
          <div v-if="view.code" class="code-glyph">{{ view.code }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* The card is a thing you hold up, not text to copy: no selection handles,
   callouts or image drag when pressing and holding (e.g. full brightness). */
.badge, .badge * {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}
.badge img, .badge canvas { -webkit-user-drag: none; }
</style>
