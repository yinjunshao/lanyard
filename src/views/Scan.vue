<script setup>
// Scan a badge or an event poster with the camera, or type a code.
// Both paths accept: a card QR, an event QR, a card's 4-character code and an
// event's 5-character code (case, spaces and dashes don't matter).
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { startScanner, resolveScanned } from "../lib/scanner";

const router = useRouter();
const video = ref(null);
const manual = ref("");
const error = ref("");
const hint = ref("");
const busy = ref(false);
const looking = ref(false);
let stop = null;
let handled = false;
let hintTimer = null;

function flashHint(text) {
  hint.value = text;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => (hint.value = ""), 2600);
}

function go(res) {
  if (res.kind === "card") {
    handled = true;
    router.push(`/c/${res.cardId}${res.search || ""}`);
    return true;
  }
  if (res.kind === "event") {
    handled = true;
    router.push(`/e/${res.eventCode}${res.search || ""}`);
    return true;
  }
  return false;
}

onMounted(() => {
  stop = startScanner(video.value, {
    onResult: handle,
    onError: (e) => {
      error.value = "Camera unavailable. Type a code instead.";
      console.warn(e);
    },
  });
});
onBeforeUnmount(() => { stop?.(); clearTimeout(hintTimer); });

async function handle(raw) {
  if (handled || busy.value) return;
  busy.value = true;
  try {
    const res = await resolveScanned(raw, { camera: true });
    if (!go(res)) flashHint("That QR isn't a Lanyard badge or event.");
  } catch {
    flashHint("Couldn't read that one. Try again.");
  } finally {
    setTimeout(() => (busy.value = false), 900);
  }
}

async function submitManual() {
  error.value = "";
  const text = manual.value.trim();
  if (!text) return;
  looking.value = true;
  try {
    const res = await resolveScanned(text);
    if (!go(res)) error.value = "Enter the 4-character code on their badge, or the 5-character event code.";
  } catch (e) {
    error.value = e.message || "Code not found.";
  } finally {
    looking.value = false;
  }
}
</script>

<template>
  <div class="stack-2">
    <h1>Scan</h1>
    <div class="scan-frame">
      <video ref="video" muted playsinline aria-label="Camera view for scanning a QR code. You can type a code below instead."></video>
      <div class="scan-reticle" aria-hidden="true"></div>
    </div>
    <p class="small muted" style="margin:0">Point at a badge or an event poster.</p>
    <p v-if="hint" class="small" role="status">{{ hint }}</p>

    <form class="stack" @submit.prevent="submitManual">
      <div class="field">
        <label for="code-input">Or type a code</label>
        <div class="row">
          <input id="code-input" v-model="manual" type="text" placeholder="AB3D"
                 maxlength="24" autocapitalize="characters" autocomplete="off" autocorrect="off"
                 spellcheck="false" style="text-transform:uppercase;letter-spacing:.2em" />
          <button class="btn btn-primary" style="width:auto;flex:none" type="submit" :disabled="looking">
            {{ looking ? "…" : "Go" }}
          </button>
        </div>
      </div>
      <p class="small muted" style="margin:0">
        The 4-character code under their QR, or an event's 5-character code.
        Badge codes change every few days, so ask for their current one.
      </p>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    </form>
  </div>
</template>
