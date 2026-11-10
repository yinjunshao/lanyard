<script setup>
// /signout on the host site: a page a stuck host can type into the address
// bar. Ends the host session and starts again at the host home.
import { onMounted, ref } from "vue";
import { hostSignOutAndReload } from "../lib/hostapi";

const error = ref("");

async function run() {
  error.value = "";
  try { await hostSignOutAndReload("/"); }
  catch (e) { error.value = e?.message || "Couldn't sign out. Check your connection and try again."; }
}
onMounted(run);
</script>

<template>
  <main class="app-col stack-2" style="text-align:center;margin-top:80px">
    <template v-if="!error">
      <h1>Signing you out</h1>
      <p class="muted">One moment.</p>
    </template>
    <template v-else>
      <h1>Couldn't sign you out</h1>
      <p class="error-text" role="alert">{{ error }}</p>
      <button type="button" class="btn btn-primary" style="margin-top:16px" @click="run">Try again</button>
    </template>
  </main>
</template>
