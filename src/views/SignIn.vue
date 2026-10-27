<script setup>
// One page, three ways in. Passkey is the one-tap path; a code from a device
// that is already signed in and a recovery key work anywhere, with no email.
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { me, refreshMe } from "../lib/store";
import { Api } from "../lib/api";
import { loginPasskey, passkeysSupported } from "../lib/passkeys";

const route = useRoute();
const router = useRouter();
const onHost = route.path.startsWith("/host");
const canPasskey = passkeysSupported();

const busy = ref("");
const error = ref("");
const code = ref(typeof route.query.code === "string" ? route.query.code : "");
const key = ref("");
const showKey = ref(false);

async function done() {
  await refreshMe();
  router.replace(onHost ? "/host" : me.profile ? "/app" : "/app/profile");
}

async function withPasskey() {
  error.value = ""; busy.value = "passkey";
  try {
    await loginPasskey();
    await done();
  } catch (e) {
    error.value = e?.name === "NotAllowedError" || /unknown passkey/.test(e?.message || "")
      ? "No passkey found for Lanyard here. Use a code from your other device, or your recovery key."
      : e?.message || "Passkey sign-in failed.";
  } finally { busy.value = ""; }
}

async function withCode() {
  error.value = ""; busy.value = "code";
  try { await Api.authRedeem(code.value); await done(); }
  catch (e) { error.value = e.message; }
  finally { busy.value = ""; }
}

async function withKey() {
  error.value = ""; busy.value = "key";
  try { await Api.recoveryRedeem(key.value); await done(); }
  catch (e) { error.value = e.message; }
  finally { busy.value = ""; }
}

onMounted(async () => {
  try { await refreshMe(); } catch { /* guest */ }
  // A scanned sign-in QR carries ?code=, so it signs in with no typing.
  if (code.value) withCode();
});
</script>

<template>
  <main class="app-col stack-2">
    <router-link :to="onHost ? '/host' : '/'" class="wordmark">lanyard<b>.</b></router-link>
    <div>
      <h1>{{ onHost ? "Host sign in" : "Sign in" }}</h1>
      <p class="muted">Pick whichever is easiest. They all open the same account.</p>
    </div>

    <section class="panel stack">
      <span class="label">Passkey</span>
      <p class="small muted">
        Face ID, fingerprint or screen lock. If your passkey is on your phone,
        choose "use a phone or tablet" and scan the QR your browser shows.
      </p>
      <button class="btn btn-primary" :disabled="!!busy || !canPasskey" @click="withPasskey">
        {{ busy === "passkey" ? "Waiting for passkey…" : "Sign in with passkey" }}
      </button>
      <p v-if="!canPasskey" class="small muted">This browser can't use passkeys. Use one of the options below.</p>
    </section>

    <section class="panel stack">
      <span class="label">Code from your other device</span>
      <p class="small muted">
        On a device where you're signed in: Settings, then "Sign in on another
        device". It shows a short code and a QR.
      </p>
      <form class="stack" @submit.prevent="withCode">
        <input v-model="code" aria-label="Sign-in code" placeholder="ABCD-EFGH" autocomplete="one-time-code"
               autocapitalize="characters" spellcheck="false" inputmode="text" maxlength="12"
               style="font-size:22px;letter-spacing:3px;text-transform:uppercase;text-align:center" />
        <button class="btn" :disabled="!!busy || code.replace(/[^a-z0-9]/gi, '').length < 8">
          {{ busy === "code" ? "Checking…" : "Sign in with code" }}
        </button>
      </form>
    </section>

    <section class="panel stack">
      <button type="button" class="label" style="background:none;border:none;padding:0;text-align:left;cursor:pointer"
              :aria-expanded="showKey" @click="showKey = !showKey">
        Lost your device? Use your recovery key {{ showKey ? "–" : "+" }}
      </button>
      <form v-if="showKey" class="stack" @submit.prevent="withKey">
        <p class="small muted">The 16-character key you saved when you set up your account.</p>
        <input v-model="key" aria-label="Recovery key" placeholder="XXXX-XXXX-XXXX-XXXX" autocapitalize="characters"
               spellcheck="false" maxlength="24"
               style="font-size:18px;letter-spacing:2px;text-transform:uppercase;text-align:center" />
        <button class="btn" :disabled="!!busy || key.replace(/[^a-z0-9]/gi, '').length < 16">
          {{ busy === "key" ? "Checking…" : "Sign in with recovery key" }}
        </button>
      </form>
    </section>

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>

    <p class="small muted"><router-link to="/terms">Terms</router-link> · <router-link to="/privacy">Privacy</router-link></p>
    <p v-if="!onHost" class="small muted">
      New here? <router-link to="/app/profile">Make your card</router-link> and save it to this device later.
    </p>
  </main>
</template>
