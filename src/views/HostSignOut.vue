<script setup>
// /host/signout: a page a stuck host can type into the address bar. Ends the
// session here, clears the offline copy of who you are, and starts again at the
// host home.
import { onMounted, ref } from "vue";
import { signOutAndReload } from "../lib/store";
import { ON_HOST_SITE } from "../lib/site";

const error = ref("");
const home = ON_HOST_SITE ? "/host" : "/hosts";

async function run() {
  error.value = "";
  try { await signOutAndReload(home); }
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
