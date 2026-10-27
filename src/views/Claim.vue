<script setup>
// Save the account: a passkey if the device has one, plus a recovery key so a
// lost phone is never the end of the card. No email needed.
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { me, refreshMe } from "../lib/store";
import { registerPasskey, passkeysSupported } from "../lib/passkeys";
import { Api } from "../lib/api";

const router = useRouter();
const error = ref("");
const busy = ref(false);
const recoveryKey = ref("");
const saved = ref(false);
const canPasskey = passkeysSupported();

onMounted(refreshMe);
const claimed = computed(() => me.user?.claimed);

async function passkey() {
  error.value = ""; busy.value = true;
  try {
    await registerPasskey();
    await refreshMe();
    await makeKey();
  } catch (e) {
    error.value = e?.name === "NotAllowedError" ? "Passkey setup was cancelled. You can try again, or use a recovery key instead." : e?.message || "Passkey setup failed.";
  } finally { busy.value = false; }
}
async function makeKey() {
  error.value = ""; busy.value = true;
  try {
    recoveryKey.value = (await Api.recoveryCreate()).key;
    await refreshMe();
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
function download() {
  const blob = new Blob([`Lanyard recovery key\n${recoveryKey.value}\n\nSign in at ${location.origin}/signin and choose "Lost your device?".\n`], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "lanyard-recovery-key.txt"; a.click();
  URL.revokeObjectURL(a.href);
  saved.value = true;
}
async function copy() {
  try { await navigator.clipboard.writeText(recoveryKey.value); saved.value = true; } catch { /* manual copy */ }
}
</script>

<template>
  <main class="app-col stack-2">
    <router-link to="/app" class="wordmark">lanyard<b>.</b></router-link>

    <template v-if="!recoveryKey">
      <h1>{{ claimed ? "Account saved" : "Save your card" }}</h1>
      <p class="muted">
        Right now your card only lives in this browser. If you clear it or change
        phone, it's gone. Saving takes one tap and needs no password or email.
      </p>

      <section class="panel stack">
        <span class="label">Recommended</span>
        <p class="small muted">A passkey uses Face ID, a fingerprint or your screen lock, and usually syncs to your other devices.</p>
        <button class="btn btn-primary" :disabled="busy || !canPasskey" @click="passkey">
          {{ busy ? "Working…" : me.user?.hasPasskey ? "Passkey saved" : "Save with passkey" }}
        </button>
        <p v-if="!canPasskey" class="small muted">This browser doesn't support passkeys. Use a recovery key.</p>
      </section>

      <section class="panel stack">
        <span class="label">Works on any device</span>
        <p class="small muted">A recovery key is a 16-character code you keep somewhere safe. It signs you in anywhere if you lose your phone.</p>
        <button class="btn" :disabled="busy" @click="makeKey">
          {{ me.user?.hasRecovery ? "Make a new recovery key" : "Get a recovery key" }}
        </button>
      </section>

      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <router-link to="/app" class="small muted">Not now</router-link>
    </template>

    <template v-else>
      <h1>Keep this key safe</h1>
      <p class="muted">We only show it once. Anyone with it can open your account, so don't post it anywhere public.</p>
      <div class="panel" style="text-align:center">
        <p class="tnum" style="font-size:24px;font-weight:800;letter-spacing:2px;margin:0;word-break:break-all">{{ recoveryKey }}</p>
      </div>
      <div class="btn-row">
        <button class="btn" @click="copy">Copy</button>
        <button class="btn" @click="download">Download</button>
      </div>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <button class="btn btn-primary" @click="router.push('/app')">
        {{ saved ? "Done" : "I've saved it" }}
      </button>
    </template>
  </main>
</template>
