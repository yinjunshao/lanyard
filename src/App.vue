<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import { me } from "./lib/store";
import Icon from "./components/Icon.vue";
import Lightbox from "./components/Lightbox.vue";
import TermsGate from "./components/TermsGate.vue";

const r = useRoute();
const showChrome = computed(() => r.meta.app && me.profile);
const tabs = [
  { to: "/app", key: "card", label: "My card", match: (p) => p === "/app" },
  { to: "/app/scan", key: "scan", label: "Scan", match: (p) => p.startsWith("/app/scan") },
  { to: "/app/people", key: "people", label: "People", match: (p) => p.startsWith("/app/people") },
];
</script>

<template>
  <template v-if="r.meta.app">
    <div class="strap-rail"></div>
    <header class="topbar">
      <router-link to="/" class="wordmark">lanyard<b>.</b></router-link>
      <router-link to="/app/settings" class="topbar-link">Settings</router-link>
    </header>

    <main class="app-col">
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
