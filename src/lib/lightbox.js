// Tap a photo anywhere to see it large. One shared overlay (components/Lightbox.vue).
import { reactive } from "vue";

// `open` is what shows it; src and alt stay put while it fades out (F40), then the next photo replaces them.
export const lightbox = reactive({ src: null, alt: "", open: false });

export function openPhoto(src, alt = "") {
  if (src) { lightbox.src = src; lightbox.alt = alt; lightbox.open = true; }
}
export function closePhoto() {
  lightbox.open = false;
}
