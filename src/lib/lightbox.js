// Tap a photo anywhere to see it large. One shared overlay (components/Lightbox.vue).
import { reactive } from "vue";

export const lightbox = reactive({ src: null, alt: "" });

export function openPhoto(src, alt = "") {
  if (src) { lightbox.src = src; lightbox.alt = alt; }
}
export function closePhoto() {
  lightbox.src = null;
}
