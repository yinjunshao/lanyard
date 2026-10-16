<script setup>
import { ref, onBeforeUnmount, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Api } from "../lib/api";

// jsQR is ~80 kB; load it only when someone actually opens the scanner.
let jsQR = null;

const router = useRouter();
const route = useRoute();

const video = ref(null);
const canvas = ref(null);

const mode = ref("idle"); // idle | starting | scanning | error
const errorMsg = ref("");
const manualCode = ref("");
const resolving = ref(false);
const manualError = ref("");

let stream = null;
let raf = 0;
let navigating = false;

const canStart = computed(() =>
  typeof navigator !== "undefined" && navigator.mediaDevices && navigator.mediaDevices.getUserMedia
);

function stopCamera() {
  cancelAnimationFrame(raf);
  raf = 0;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (video.value) video.value.srcObject = null;
}

async function startCamera() {
  manualError.value = "";
  errorMsg.value = "";
  if (!canStart) {
    mode.value = "error";
    errorMsg.value = "This browser can’t open the camera here. Enter the 4-character code instead.";
    return;
  }
  mode.value = "starting";
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    video.value.srcObject = stream;
    await video.value.play();
    if (!jsQR) jsQR = (await import("jsqr")).default;
    mode.value = "scanning";
    raf = requestAnimationFrame(tick);
  } catch (e) {
    mode.value = "error";
    if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
      errorMsg.value = "Camera permission was blocked. Allow it in the address bar, or just type the 4-character code.";
    } else if (e && e.name === "NotFoundError") {
      errorMsg.value = "No camera found on this device. Enter the 4-character code instead.";
    } else {
      errorMsg.value = "Couldn’t start the camera. Enter the 4-character code instead.";
    }
  }
}

function tick() {
  if (!video.value || mode.value !== "scanning") return;
  const v = video.value;
  if (v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth > 0) {
    const c = canvas.value;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const found = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
    if (found && found.data) handleScanned(found.data);
  }
  raf = requestAnimationFrame(tick);
}

// Accepts a full Lanyard pass URL (any origin) or a raw profile link.
function targetFromQR(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  const m = t.match(/\/p\/([a-z0-9]+)(?:\?[^#]*)?/i);
  if (m) {
    const id = m[1];
    const note = (() => {
      try { return new URL(t, window.location.origin).searchParams.get("n") || ""; }
      catch { return ""; }
    })();
    return { id, note };
  }
  return null;
}

function handleScanned(text) {
  if (navigating) return;
  const target = targetFromQR(text);
  if (!target) return; // ignore unrelated QR codes silently
  navigating = true;
  stopCamera();
  mode.value = "idle";
  router.push(target.note ? `/p/${target.id}?n=${encodeURIComponent(target.note)}` : `/p/${target.id}`);
}

async function submitCode() {
  const code = manualCode.value.trim().toUpperCase();
  manualError.value = "";
  if (!/^[A-Z2-9]{4}$/.test(code)) {
    manualError.value = "Codes are 4 characters (letters and 2–9, no 0/1).";
    return;
  }
  resolving.value = true;
  try {
    const r = await Api.resolveCode(code);
    if (!navigating && r.id) {
      navigating = true;
      stopCamera();
      router.push(`/p/${r.id}`);
    }
  } catch (e) {
    manualError.value = "No card found for that code — double-check it with the person.";
  } finally {
    resolving.value = false;
  }
}

// Auto-open the camera on a phone-like viewport; desktop users press to start.
onBeforeUnmount(stopCamera);
</script>

<template>
  <div class="container scan-page">
    <header class="scan-header center">
      <span class="eyebrow">Add someone</span>
      <h1 class="page-title">Scan their card.</h1>
      <p class="muted">Point your camera at their Lanyard QR, or type the 4-character code on their pass.</p>
    </header>

    <div class="scan-card card">
      <div class="camera-stage" :class="mode">
        <video ref="video" playsinline muted></video>
        <canvas ref="canvas" hidden></canvas>

        <!-- viewfinder -->
        <div v-if="mode === 'scanning'" class="reticle" aria-hidden="true">
          <span class="corner tl"></span><span class="corner tr"></span>
          <span class="corner bl"></span><span class="corner br"></span>
          <span class="scan-line"></span>
        </div>

        <!-- idle / starting / error overlays -->
        <div v-if="mode !== 'scanning'" class="camera-overlay">
          <template v-if="mode === 'idle'">
            <div class="overlay-mark">▣</div>
            <button class="btn btn-primary" @click="startCamera">Open camera</button>
            <p class="small muted">Camera stays on your phone — frames are only read to find the QR.</p>
          </template>
          <template v-else-if="mode === 'starting'">
            <div class="spinner"></div>
            <p class="muted">Starting camera…</p>
          </template>
          <template v-else>
            <div class="overlay-mark">!</div>
            <p class="cam-error">{{ errorMsg }}</p>
            <button class="btn btn-ghost" @click="startCamera">Try again</button>
          </template>
        </div>
      </div>

      <button v-if="mode === 'scanning'" class="btn btn-ghost stop-btn" @click="() => { stopCamera(); mode = 'idle'; }">
        Cancel scan
      </button>

      <div class="manual">
        <div class="divider"><span>or enter a code</span></div>
        <form class="code-form" @submit.prevent="submitCode">
          <input
            v-model="manualCode"
            class="code-input"
            type="text"
            inputmode="latin"
            maxlength="4"
            autocomplete="off"
            spellcheck="false"
            placeholder="ABCD"
            @input="manualCode = manualCode.toUpperCase()"
          />
          <button class="btn btn-primary" type="submit" :disabled="resolving">
            {{ resolving ? "Checking…" : "Open card" }}
          </button>
        </form>
        <p v-if="manualError" class="small code-error">{{ manualError }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scan-page { max-width: 560px; }
.scan-header { max-width: 480px; margin: 0 auto 22px; }
.scan-header p { font-size: 16px; }

.scan-card { padding: 16px; display: grid; gap: 16px; }

.camera-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 18px;
  overflow: hidden;
  background: var(--ink);
  border: 1.5px solid var(--ink);
  box-shadow: 8px 8px 0 rgba(14,17,16,.9);
}
.camera-stage video { width: 100%; height: 100%; object-fit: cover; display: block; }
.camera-stage:not(.scanning) video { display: none; }

.camera-overlay {
  position: absolute; inset: 0;
  display: grid; place-content: center; justify-items: center; gap: 12px;
  background: var(--ink); color: var(--paper);
  text-align: center; padding: 24px;
}
.overlay-mark {
  font-family: var(--font-mono);
  font-size: 40px;
  color: var(--volt);
  width: 72px; height: 72px;
  display: grid; place-items: center;
  border: 2px solid var(--volt);
  border-radius: 16px;
}
.cam-error { color: var(--paper); max-width: 320px; margin: 0; font-size: 15px; }

/* reticle */
.reticle { position: absolute; inset: 0; pointer-events: none; }
.corner { position: absolute; width: 34px; height: 34px; border: 4px solid var(--volt); }
.corner.tl { top: 14%; left: 14%; border-right: 0; border-bottom: 0; border-radius: 8px 0 0 0; }
.corner.tr { top: 14%; right: 14%; border-left: 0; border-bottom: 0; border-radius: 0 8px 0 0; }
.corner.bl { bottom: 14%; left: 14%; border-right: 0; border-top: 0; border-radius: 0 0 0 8px; }
.corner.br { bottom: 14%; right: 14%; border-left: 0; border-top: 0; border-radius: 0 0 8px 0; }
.scan-line {
  position: absolute; left: 16%; right: 16%; top: 50%; height: 3px;
  background: var(--volt); border-radius: 2px;
  box-shadow: 0 0 14px rgba(200,242,56,.9);
  animation: sweep 2s ease-in-out infinite;
}
@keyframes sweep {
  0%, 100% { transform: translateY(-88px); opacity: .5; }
  50% { transform: translateY(88px); opacity: 1; }
}

.stop-btn { justify-self: center; }

.divider { display: flex; align-items: center; gap: 12px; color: var(--muted); }
.divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.divider span { font-family: var(--font-mono); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; }

.code-form { display: flex; gap: 10px; }
.code-input {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: .4em;
  text-align: center;
  text-transform: uppercase;
  padding: 10px 12px;
}
.code-error { color: var(--red, #b3261e); margin: 6px 0 0; }

.spinner {
  width: 44px; height: 44px; border-radius: 50%;
  border: 4px solid rgba(238,240,231,.25);
  border-top-color: var(--volt);
  animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 560px) {
  .camera-stage { box-shadow: 6px 6px 0 rgba(14,17,16,.9); }
  .code-form { flex-direction: column; }
  .code-form .btn { width: 100%; }
}
</style>
