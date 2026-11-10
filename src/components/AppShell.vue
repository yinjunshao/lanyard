<script setup>
// The frame around every /app page: top bar, account banner, tab bar and the Terms pop-up.
// App.vue loads it only for /app pages (lib/shell.js), so public pages do not carry it.
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import { homePath, me } from "../lib/store";
import Icon from "./Icon.vue";
import AccountBanner from "./AccountBanner.vue";
import TermsGate from "./TermsGate.vue";
import { live, refreshLive } from "../lib/eventlive";

const r = useRoute();
const showChrome = computed(() => r.meta.app && me.profile);
// The Events glyph is drawn here, not in Icon.vue: Icon.vue is loaded by public pages (the card,
// privacy requests) and a glyph only the signed-in frame uses would count against their JS budget (F28).
const TICKET =
  '<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14.5 6v2.2M14.5 10.9v2.2M14.5 15.8V18"/>';
const tabs = [
  { to: "/app", key: "card", icon: "qr", label: "My card", match: (p) => p === "/app" },
  { to: "/app/scan", key: "scan", label: "Scan", match: (p) => p.startsWith("/app/scan") },
  { to: "/app/people", key: "people", label: "People", match: (p) => p.startsWith("/app/people") },
  { to: "/app/events", key: "events", label: "Events", paths: TICKET, match: (p) => p.startsWith("/app/events") },
];

// A small dot on Events while an event you checked in to is on. Asked when the frame first shows,
// again when you open an events page, and otherwise at most every two minutes.
watch(
  () => [showChrome.value, r.path],
  ([on, path]) => { if (on) refreshLive(path.startsWith("/app/events") ? 0 : 120000); },
  { immediate: true }
);
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
        <span class="tab-glyph">
          <svg v-if="t.paths" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
               stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" v-html="t.paths"></svg>
          <Icon v-else :name="t.icon || t.key" />
          <span v-if="t.key === 'events' && live.ongoing" class="tab-dot" aria-hidden="true"></span>
        </span>
        <span>{{ t.label }}</span>
        <span v-if="t.key === 'events' && live.ongoing" class="visually-hidden">, an event is on now</span>
      </router-link>
    </div>
  </nav>
  <TermsGate />
</template>
