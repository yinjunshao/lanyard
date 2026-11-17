<script setup>
// Where you're signed in, and a way to sign out every other device.
import { onMounted, ref } from "vue";
import { Api } from "../lib/api";

const sessions = ref([]);
const busy = ref(false);
const note = ref("");
const error = ref("");

const when = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
async function load() {
  try { sessions.value = (await Api.sessions()).sessions; } catch { /* guest or offline */ }
}
async function signOutOthers() {
  if (!window.confirm("Sign out every other device? This one stays signed in.")) return;
  error.value = ""; note.value = ""; busy.value = true;
  try {
    const r = await Api.signOutOthers();
    note.value = r.signedOut ? `Signed out ${r.signedOut} other ${r.signedOut === 1 ? "device" : "devices"}.` : "No other devices were signed in.";
    await load();
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
onMounted(load);
</script>

<template>
  <div v-if="sessions.length" class="stack">
    <span>Signed-in devices</span>
    <ul class="small" style="margin:0;padding-left:18px">
      <li v-for="(s, i) in sessions" :key="i">{{ s.device }}, since {{ when(s.at) }}<strong v-if="s.current"> (this device)</strong></li>
    </ul>
    <button v-if="sessions.length > 1" class="btn" :disabled="busy" @click="signOutOthers">{{ busy ? "Signing out…" : "Sign out other devices" }}</button>
    <p v-if="note" class="success-text small">{{ note }}</p>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
  </div>
</template>
