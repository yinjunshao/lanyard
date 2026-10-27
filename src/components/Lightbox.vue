<script setup>
import { onBeforeUnmount, onMounted, watch } from "vue";
import { lightbox, closePhoto } from "../lib/lightbox";

function onKey(e) { if (e.key === "Escape") closePhoto(); }
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
watch(() => lightbox.src, (v) => { document.body.style.overflow = v ? "hidden" : ""; });
</script>

<template>
  <Teleport to="body">
    <div v-if="lightbox.src" class="lb" role="dialog" aria-modal="true" :aria-label="lightbox.alt || 'Photo'" @click="closePhoto">
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
  animation: lb-in 0.14s ease-out;
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
@keyframes lb-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .lb { animation: none; } }
</style>
