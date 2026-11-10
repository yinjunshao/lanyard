<script setup>
// The frame around every /app page: top bar, account banner, tab bar and the Terms pop-up.
// App.vue loads it only for /app pages (lib/shell.js), so public pages do not carry it.
import { computed } from "vue";
import { useRoute } from "vue-router";
import { homePath, me } from "../lib/store";
import Icon from "./Icon.vue";
import AccountBanner from "./AccountBanner.vue";
import TermsGate from "./TermsGate.vue";

const r = useRoute();
const showChrome = computed(() => r.meta.app && me.profile);
const tabs = [
  { to: "/app", key: "card", icon: "qr", label: "My card", match: (p) => p === "/app" },
  { to: "/app/scan", key: "scan", label: "Scan", match: (p) => p.startsWith("/app/scan") },
  { to: "/app/people", key: "people", label: "People", match: (p) => p.startsWith("/app/people") },
];
</script>

<template>
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
        <span class="tab-glyph"><Icon :name="t.icon || t.key" /></span>
        <span>{{ t.label }}</span>
      </router-link>
    </div>
  </nav>
  <TermsGate />
</template>
