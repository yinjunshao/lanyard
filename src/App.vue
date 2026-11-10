<script setup>
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { homePath, me } from "./lib/store";
import { Api } from "./lib/api";
import { isStandalone, markInstalledHere } from "./lib/install";
import Icon from "./components/Icon.vue";
import Lightbox from "./components/Lightbox.vue";
import AccountBanner from "./components/AccountBanner.vue";
import TermsGate from "./components/TermsGate.vue";

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
const showChrome = computed(() => r.meta.app && me.profile);
const tabs = [
  { to: "/app", key: "card", label: "My card", match: (p) => p === "/app" },
  { to: "/app/scan", key: "scan", label: "Scan", match: (p) => p.startsWith("/app/scan") },
  { to: "/app/people", key: "people", label: "People", match: (p) => p.startsWith("/app/people") },
];
</script>

<template>
  <div v-if="!ready" class="boot-splash" aria-busy="true"><span>lanyard<b>.</b></span><span class="visually-hidden">Loading</span></div>
  <template v-else-if="r.meta.app">
    <div class="strap-rail"></div>
    <header class="topbar">
      <router-link :to="homePath()" class="wordmark">lanyard<b>.</b></router-link>
      <router-link to="/app/settings" class="topbar-link">Settings</router-link>
    </header>

    <main class="app-col">
      <AccountBanner />
      <router-view />
    </main>

    <nav v-if="showChrome" class="tabbar" aria-label="Primary">
      <div class="tabbar-inner">
        <router-link
          v-for="t in tabs"
          :key="t.key"
          :to="t.to"
          class="tab"
          :class="{ on: t.match(r.path) }"
        >
          <span class="tab-glyph"><Icon :name="t.key" /></span>
          <span>{{ t.label }}</span>
        </router-link>
      </div>
    </nav>
  </template>

  <router-view v-else />
  <Lightbox />
  <TermsGate v-if="r.meta.app" />
</template>

<style>
.boot-splash {
  min-height: 100vh; display: grid; place-items: center;
  font-weight: 700; font-size: 28px; line-height: 1; letter-spacing: -.02em; color: var(--ink);
  border-top: 6px solid var(--strap); box-sizing: border-box;
}
.boot-splash b { color: var(--strap); }
</style>
