<script setup>
// One nudge at a time, most important first:
//  1. on the old workers.dev address: move the account to the new domain
//     (cookies and passkeys don't travel between domains);
//  2. no verified email: add one, right here (we're moving to email being
//     required, so "Later" only snoozes it for a few days);
//  3. no passkey: it's the fastest way to sign in next time.
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import EmailSetup from "./EmailSetup.vue";
import { me } from "../lib/store";
import { Api } from "../lib/api";
import { registerPasskey, passkeysSupported } from "../lib/passkeys";

const NEW_ORIGIN = import.meta.env.VITE_NEW_ORIGIN || "https://lanyd.fyi";
const KEY = "lanyard_banner_dismissed";
const router = useRouter();
const route = useRoute();
const EMAIL_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
const emailOpen = ref(false);
const busy = ref(false);
const error = ref("");
const dismissed = ref(read());

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function dismiss(kind) {
  dismissed.value = { ...dismissed.value, [kind]: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(dismissed.value)); } catch { /* not remembered */ }
}

const oldAddress = location.origin !== NEW_ORIGIN && /\.workers\.dev$/.test(location.hostname);
const kind = computed(() => {
  const u = me.user;
  if (!u || !me.profile) return "";
  if (oldAddress) return "move"; // can't be dismissed: the account is stranded here
  if (route.query.welcome === "1") return ""; // let the "your card is ready" moment breathe
  if (!u.emailVerified && !(dismissed.value.email && Date.now() - dismissed.value.email < EMAIL_SNOOZE_MS)) return "email";
  if (!u.hasPasskey && passkeysSupported() && !dismissed.value.passkey) return "passkey";
  return "";
});

async function move() {
  error.value = ""; busy.value = true;
  try {
    const { code } = await Api.authLink();
    location.href = `${NEW_ORIGIN}/signin?code=${encodeURIComponent(code)}`;
  } catch (e) { error.value = e.message; busy.value = false; }
}
async function addPasskey() {
  error.value = ""; busy.value = true;
  try { await registerPasskey(); dismiss("passkey"); location.reload(); }
  catch (e) { error.value = e?.name === "NotAllowedError" ? "Passkey setup was cancelled." : e?.message || "Passkey setup failed."; }
  finally { busy.value = false; }
}
</script>

<template>
  <aside v-if="kind" class="panel stack" role="status" style="margin-bottom:12px">
    <template v-if="kind === 'move'">
      <strong>Lanyard has moved to lanyd.fyi</strong>
      <p class="small muted" style="margin:0">Move your card across in one tap. Nothing is lost. After this, use lanyd.fyi from now on.</p>
      <button class="btn btn-primary" :disabled="busy" @click="move">{{ busy ? "Moving…" : "Move my account" }}</button>
    </template>
    <template v-else-if="kind === 'email'">
      <strong>Add your email to keep your card</strong>
      <p v-if="!me.user?.claimed" class="small muted" style="margin:0">Your card only lives in this browser until you do. Lose the phone or clear the browser and it's gone. Your email gets you back in, and we never show it on your card.</p>
      <p v-else class="small muted" style="margin:0">Sign in from any device with a code we email you, even if you lose your passkey. We never show your email on your card.</p>
      <EmailSetup v-if="emailOpen" />
      <div v-else class="btn-row">
        <button class="btn btn-primary" @click="emailOpen = true">Add email</button>
        <button class="btn" @click="dismiss('email')">Later</button>
      </div>
    </template>
    <template v-else>
      <strong>Sign in faster with a passkey</strong>
      <p class="small muted" style="margin:0">Face ID or a fingerprint instead of typing a code. Takes a few seconds.</p>
      <div class="btn-row">
        <button class="btn btn-primary" :disabled="busy" @click="addPasskey">{{ busy ? "Working…" : "Set up passkey" }}</button>
        <button class="btn" @click="dismiss('passkey')">Not now</button>
      </div>
    </template>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
  </aside>
</template>
