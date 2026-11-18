<script setup>
import { onBeforeUnmount, onMounted, watch } from "vue";
import { lightbox, closePhoto } from "../lib/lightbox";

function onKey(e) { if (e.key === "Escape") closePhoto(); }
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
// F40: it stays in the page and fades out (CSS), so the page behind scrolls again only when that is over.
let unlock = 0;
watch(() => lightbox.open, (v) => {
  clearTimeout(unlock);
  if (v) document.body.style.overflow = "hidden";
  else unlock = setTimeout(() => { document.body.style.overflow = ""; }, 160);
});
</script>

<template>
  <Teleport to="body">
    <div class="lb" :class="{ open: lightbox.open }" role="dialog" aria-modal="true" :aria-label="lightbox.alt || 'Photo'" @click="closePhoto">
      <img :src="lightbox.src" :alt="lightbox.alt" @click.stop />
      <button class="lb-close" type="button" aria-label="Close photo" @click.stop="closePhoto">×</button>
      <p v-if="lightbox.alt" class="lb-cap">{{ lightbox.alt }}</p>
    </div>
  </Teleport>
</template>

<style>
.zoomable { cursor: zoom-in; }
.lb {
  position: fixed; inset: 0; z-index: 200;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  background: rgba(20, 19, 17, 0.88);
  padding: 24px;
  /* Closed it is invisible, takes no clicks and is out of the tab order and the reading order (visibility), and
     becomes so only when the fade has finished. F40, tokens in main.css. */
  opacity: 0; visibility: hidden; pointer-events: none;
  transition: opacity var(--dur-out) var(--ease-in), visibility 0s linear var(--dur-out);
}
.lb.open {
  opacity: 1; visibility: visible; pointer-events: auto;
  transition: opacity var(--dur) var(--ease-out), visibility 0s;
}
.lb img {
  max-width: min(92vw, 720px); max-height: 78vh;
  object-fit: contain;
  border-radius: 6px;
  background: #1f1d1a;
}
.lb-close {
  position: absolute; top: calc(12px + env(safe-area-inset-top, 0px)); right: 16px;
  width: 44px; height: 44px; border-radius: 50%;
  border: none; background: rgba(255, 255, 255, 0.14); color: #fff;
  font-size: 28px; line-height: 1; cursor: pointer;
}
.lb-cap { color: #f4f1ea; font-weight: 700; margin: 0; }
</style>
