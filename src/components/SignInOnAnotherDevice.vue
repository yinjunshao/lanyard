<script setup>
// Sign in on another device: a short-lived one-time code, also as a QR.
import { nextTick, onBeforeUnmount, ref } from "vue";
import { Api } from "../lib/api";
import { drawQR } from "../lib/qr";

const host = location.host;
const error = ref("");
const link = ref(null); // { code, expiresAt, url }
const linkCanvas = ref(null);
const secondsLeft = ref(0);
const linkBusy = ref(false);
let tick = null;
async function showLink() {
  error.value = ""; linkBusy.value = true;
  try {
    const r = await Api.authLink();
    link.value = { ...r, url: `${location.origin}/signin?code=${r.code}` };
    clearInterval(tick);
    const update = () => {
      secondsLeft.value = Math.max(0, Math.round((r.expiresAt - Date.now()) / 1000));
      if (!secondsLeft.value) { clearInterval(tick); link.value = null; }
    };
    update();
    tick = setInterval(update, 1000);
    await nextTick();
    if (linkCanvas.value) await drawQR(linkCanvas.value, link.value.url, 360);
  } catch (e) { error.value = e.message; }
  finally { linkBusy.value = false; }
}
onBeforeUnmount(() => clearInterval(tick));
const mmss = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
</script>

<template>
  <div class="stack">
    <template v-if="!link">
      <p class="small muted">Get a one-time code to type in, or a QR to scan, on a phone or laptop you want to sign in on.</p>
      <button class="btn" :disabled="linkBusy" @click="showLink">Sign in on another device</button>
    </template>
    <div v-else class="stack" style="align-items:center;text-align:center">
      <p class="small muted">On the other device open <strong>{{ host }}/signin</strong> and enter this code, or scan the QR.</p>
      <p class="tnum" style="font-size:36px;font-weight:800;letter-spacing:4px;margin:0">{{ link.code }}</p>
      <canvas ref="linkCanvas" width="360" height="360" style="width:180px;height:180px" aria-label="Sign-in QR code"></canvas>
      <p class="small muted">One use, expires in {{ mmss(secondsLeft) }}.</p>
    </div>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
  </div>
</template>
