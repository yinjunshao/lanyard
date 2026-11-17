<script setup>
// Authenticator-app sign-in (Authy, Google Authenticator, 1Password...): a passkey
// backup that needs no email. Sign-in uses the account ID plus the 6-digit code.
import { nextTick, ref } from "vue";
import { me, refreshMe } from "../lib/store";
import { api } from "../lib/api";
import { drawQR } from "../lib/qr";

const setup = ref(null); // { accountId, secret, uri }
const canvas = ref(null);
const code = ref("");
const busy = ref(false);
const error = ref("");

async function start() {
  error.value = ""; busy.value = true;
  try {
    setup.value = await api("/api/auth/totp/setup", "POST");
    await nextTick();
    if (canvas.value) await drawQR(canvas.value, setup.value.uri, 360);
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
async function confirm() {
  error.value = ""; busy.value = true;
  try {
    await api("/api/auth/totp/confirm", "POST", { code: code.value });
    setup.value = null; code.value = "";
    await refreshMe();
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
async function turnOff() {
  if (!window.confirm("Turn off authenticator sign-in? Your authenticator entry will stop working.")) return;
  error.value = ""; busy.value = true;
  try { await api("/api/auth/totp", "DELETE"); await refreshMe(); }
  catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); } catch { /* manual copy */ }
}
</script>

<template>
  <div class="stack">
    <div class="spread">
      <span>Authenticator app</span>
      <strong v-if="me.user?.hasTotp && !setup">On</strong>
    </div>

    <template v-if="!setup">
      <p class="small muted">
        A backup for your passkey. Add Lanyard to Authy, Google Authenticator or
        1Password, then sign in with a 6-digit code from any device.
      </p>
      <p v-if="me.user?.hasTotp" class="small muted">Your account ID: <strong class="tnum">{{ me.user.id }}</strong> (use it to sign in if you have no email)</p>
      <button v-if="!me.user?.hasTotp" class="btn" :disabled="busy" @click="start">Set up authenticator app</button>
      <button v-else class="btn" :disabled="busy" @click="turnOff">Turn off</button>
    </template>

    <form v-else class="stack" @submit.prevent="confirm">
      <p class="small muted">Scan this with your authenticator app, or enter the key by hand.</p>
      <canvas ref="canvas" width="360" height="360" style="width:180px;height:180px;align-self:center" aria-label="Authenticator QR code"></canvas>
      <p class="tnum small" style="word-break:break-all;margin:0">{{ setup.secret }}</p>
      <button type="button" class="btn" @click="copy(setup.secret)">Copy key</button>
      <p class="small muted">Sign in with your email (or account ID <strong class="tnum">{{ setup.accountId }}</strong> if you have no email) and the code.</p>
      <input v-model="code" aria-label="6-digit code" placeholder="123456" inputmode="numeric" autocomplete="one-time-code"
             maxlength="7" style="font-size:22px;letter-spacing:4px;text-align:center" />
      <button class="btn btn-primary" :disabled="busy || code.replace(/\D/g, '').length < 6">
        {{ busy ? "Checking…" : "Confirm and turn on" }}
      </button>
      <button type="button" class="btn" @click="setup = null">Cancel</button>
    </form>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
  </div>
</template>
