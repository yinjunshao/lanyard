<script setup>
// Reposition and zoom a picked photo inside a square frame, then export the
// framed square. Drag to move, pinch / wheel / slider to zoom.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps({
  file: { type: [File, Blob], required: true },
  outSize: { type: Number, default: 800 },
});
const emit = defineEmits(["done", "cancel"]);

const VP = Math.min(320, Math.max(220, window.innerWidth - 64)); // frame size in px
const img = ref(null);
const nat = ref({ w: 0, h: 0 });
const zoom = ref(1);
const pos = ref({ x: 0, y: 0 }); // image centre offset from frame centre
const failed = ref(false);
let objectUrl = "";
const src = ref("");

const base = computed(() => (nat.value.w ? Math.max(VP / nat.value.w, VP / nat.value.h) : 1));
const scale = computed(() => base.value * zoom.value);

function clamp() {
  const maxX = Math.max(0, (nat.value.w * scale.value - VP) / 2);
  const maxY = Math.max(0, (nat.value.h * scale.value - VP) / 2);
  pos.value = {
    x: Math.min(maxX, Math.max(-maxX, pos.value.x)),
    y: Math.min(maxY, Math.max(-maxY, pos.value.y)),
  };
}

onMounted(() => {
  objectUrl = URL.createObjectURL(props.file);
  const probe = new Image();
  probe.onload = () => { nat.value = { w: probe.naturalWidth, h: probe.naturalHeight }; src.value = objectUrl; };
  probe.onerror = () => { failed.value = true; };
  probe.src = objectUrl;
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  window.removeEventListener("keydown", onKey);
});
function onKey(e) {
  if (e.key === "Escape") emit("cancel");
}

// --- pointer handling: one pointer drags, two pointers pinch ---
const pointers = new Map();
let startDist = 0, startZoom = 1;
function down(e) {
  e.currentTarget.setPointerCapture?.(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    startDist = Math.hypot(a.x - b.x, a.y - b.y);
    startZoom = zoom.value;
  }
}
function move(e) {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const cur = { x: e.clientX, y: e.clientY };
  pointers.set(e.pointerId, cur);
  if (pointers.size === 2 && startDist) {
    const [a, b] = [...pointers.values()];
    setZoom(startZoom * (Math.hypot(a.x - b.x, a.y - b.y) / startDist));
  } else if (pointers.size === 1) {
    pos.value = { x: pos.value.x + cur.x - prev.x, y: pos.value.y + cur.y - prev.y };
    clamp();
  }
}
function up(e) { pointers.delete(e.pointerId); startDist = 0; }
function setZoom(z) {
  zoom.value = Math.min(4, Math.max(1, z));
  clamp();
}
function wheel(e) { setZoom(zoom.value * (e.deltaY < 0 ? 1.08 : 0.92)); }

const imgStyle = computed(() => ({
  width: `${nat.value.w}px`,
  height: `${nat.value.h}px`,
  transform: `translate(-50%, -50%) translate(${pos.value.x}px, ${pos.value.y}px) scale(${scale.value})`,
}));

function confirm() {
  const out = props.outSize;
  const canvas = document.createElement("canvas");
  canvas.width = out; canvas.height = out;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  const sz = VP / scale.value; // source square, in image pixels
  const sx = nat.value.w / 2 - pos.value.x / scale.value - sz / 2;
  const sy = nat.value.h / 2 - pos.value.y / scale.value - sz / 2;
  ctx.drawImage(img.value, sx, sy, sz, sz, 0, 0, out, out);
  let url = canvas.toDataURL("image/webp", 0.85);
  if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", 0.85);
  emit("done", url);
}
</script>

<template>
  <Teleport to="body">
    <div class="crop-backdrop" role="dialog" aria-modal="true" aria-label="Crop photo">
      <div class="crop-sheet">
        <h2>Adjust your photo</h2>
        <p v-if="failed" class="error-text">Couldn't read that image. Try a JPG or PNG.</p>
        <template v-else>
          <p class="small muted">Drag to move. Pinch or use the slider to zoom.</p>
          <div
            class="crop-frame" :style="{ width: VP + 'px', height: VP + 'px' }"
            @pointerdown.prevent="down" @pointermove.prevent="move" @pointerup="up" @pointercancel="up" @wheel.prevent="wheel"
          >
            <img v-if="src" ref="img" :src="src" alt="" draggable="false" :style="imgStyle" />
            <span class="crop-grid" aria-hidden="true"></span>
          </div>
          <input
            type="range" min="1" max="4" step="0.01" :value="zoom" aria-label="Zoom"
            class="crop-zoom" @input="setZoom(+$event.target.value)"
          />
        </template>
        <div class="crop-actions">
          <button class="btn" type="button" @click="emit('cancel')">Cancel</button>
          <button class="btn btn-primary" type="button" :disabled="failed || !src" @click="confirm">Use photo</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.crop-backdrop {
  position: fixed; inset: 0; z-index: 210;
  display: flex; align-items: center; justify-content: center;
  background: rgba(20, 19, 17, 0.7); padding: 16px;
}
.crop-sheet {
  width: 100%; max-width: 400px;
  background: var(--paper-raised, #fffdf8); color: var(--ink, #1b1a17);
  border: var(--border-ink, 1.5px solid #1b1a17); border-radius: 8px;
  padding: 18px; display: flex; flex-direction: column; align-items: center; gap: 12px;
}
.crop-frame {
  position: relative; overflow: hidden; touch-action: none; cursor: grab;
  border-radius: 6px; background: #1f1d1a;
}
.crop-frame:active { cursor: grabbing; }
.crop-frame img {
  position: absolute; left: 50%; top: 50%; max-width: none;
  transform-origin: center; user-select: none; -webkit-user-drag: none; pointer-events: none;
}
.crop-grid {
  position: absolute; inset: 0; pointer-events: none;
  border: 2px solid rgba(255, 255, 255, 0.85); border-radius: 6px;
  background:
    linear-gradient(to right, transparent 33.2%, rgba(255,255,255,.35) 33.3%, rgba(255,255,255,.35) 33.6%, transparent 33.7%, transparent 66.2%, rgba(255,255,255,.35) 66.3%, rgba(255,255,255,.35) 66.6%, transparent 66.7%),
    linear-gradient(to bottom, transparent 33.2%, rgba(255,255,255,.35) 33.3%, rgba(255,255,255,.35) 33.6%, transparent 33.7%, transparent 66.2%, rgba(255,255,255,.35) 66.3%, rgba(255,255,255,.35) 66.6%, transparent 66.7%);
}
.crop-zoom { width: 100%; accent-color: var(--strap, #d9502b); }
.crop-actions { display: flex; gap: 10px; width: 100%; }
.crop-actions .btn { flex: 1; }
</style>
