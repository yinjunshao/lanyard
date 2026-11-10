<script setup>
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { me } from "./lib/store";
import { shell } from "./lib/shell";
import { Api } from "./lib/api";
import { isStandalone, markInstalledHere } from "./lib/install";
import Lightbox from "./components/Lightbox.vue";

const r = useRoute();
// Until the first page is ready (app pages wait for your account), show the
// wordmark instead of a blank screen.
const ready = ref(false);
useRouter().isReady().then(() => { ready.value = true; });

// Opened from the home-screen icon: remember that on this device and on the
// account (on iPhone the browser keeps separate storage, so only the account
// tells Safari to stop suggesting it).
if (isStandalone()) {
  markInstalledHere();
  let told = false;
  watch(() => me.user, (u) => {
    if (!u || told) return;
    told = true;
    if (!u.appInstalled) Api.markInstalled().catch(() => {});
  }, { immediate: true });
}
</script>

<template>
  <div v-if="!ready" class="boot-splash" aria-busy="true"><span>lanyard<b>.</b></span><span class="visually-hidden">Loading</span></div>
  <component :is="shell" v-else-if="r.meta.app && shell" />
  <router-view v-else />
  <Lightbox />
</template>

<style>
.boot-splash {
  min-height: 100vh; display: grid; place-items: center;
  font-weight: 700; font-size: 28px; line-height: 1; letter-spacing: -.02em; color: var(--ink);
  border-top: 6px solid var(--strap); box-sizing: border-box;
}
.boot-splash b { color: var(--strap); }
</style>
