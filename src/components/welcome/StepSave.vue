<script setup>
// Step 5: save the card. A verified email (by code) is what gets someone back in on
// a new phone; a passkey on top is one-tap sign-in. Email is the way in that is
// becoming compulsory, so it is the main thing here and the passkey is an extra.
import { explain } from "../../lib/errors";
import { computed, ref } from "vue";
import { me, refreshMe } from "../../lib/store";
import { pendingCode } from "../../lib/redeem";
import { registerPasskey, passkeysSupported } from "../../lib/passkeys";
import EmailSetup from "../EmailSetup.vue";

const verified = computed(() => !!me.user?.emailVerified);
const canPasskey = passkeysSupported();
const busy = ref(false);
const error = ref("");

async function addPasskey() {
  error.value = ""; busy.value = true;
  try { await registerPasskey(); await refreshMe(); }
  catch (e) { error.value = e?.name === "NotAllowedError" ? "Passkey setup was cancelled. You can add one later in Settings." : explain(e, "Passkey setup failed. Try again, or use another way to sign in."); }
  finally { busy.value = false; }
}

// Asked here, so the account banner does not ask again the moment they open My card. It is the
// banner's own "Not now" (same key as AccountBanner.vue), and the passkey stays in Settings.
function save() {
  if (!verified.value || !canPasskey || me.user?.hasPasskey) return;
  try {
    const KEY = "lanyard_banner_dismissed";
    localStorage.setItem(KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(KEY) || "{}"), passkey: Date.now() }));
  } catch { /* not remembered: the banner may ask once */ }
}

// With a code waiting (from a poster), the email is what lets them claim it, so no skipping.
const noSkip = computed(() => !!pendingCode() && !verified.value);
// The email form has its own button; Continue only appears once the email is saved.
defineExpose({ ready: true, save, hideContinue: computed(() => !verified.value), noSkip });
</script>

<template>
  <div class="stack-2">
    <h1>Save your card</h1>
    <p class="muted" style="margin:0">
      Without an email, your card only lives in this browser. We never show your email on your card.
    </p>
    <p v-if="noSkip" class="notice small">You need a confirmed email to claim your code.</p>

    <div class="panel"><EmailSetup /></div>

    <section v-if="verified && canPasskey && !me.user?.hasPasskey" class="stack" aria-label="Passkey">
      <strong>Also add a passkey for one-tap sign-in</strong>
      <p class="small muted" style="margin:0">So you can get back in on a new phone, with Face ID or a fingerprint. It takes a few seconds.</p>
      <button type="button" class="btn" :disabled="busy" @click="addPasskey">{{ busy ? "Working…" : "Add a passkey" }}</button>
    </section>
    <p v-else-if="verified && me.user?.hasPasskey" class="success-text small" role="status">Passkey saved.</p>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>

    <p class="small muted" style="margin:0">
      Prefer a recovery key?
      <router-link to="/claim" target="_blank">See the other ways to save your card</router-link>.
    </p>
  </div>
</template>
