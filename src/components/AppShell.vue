<script setup>
// The frame around every /app page: top bar, account banner, tab bar and the Terms pop-up.
// App.vue loads it only for /app pages (lib/shell.js), so public pages do not carry it.
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { homePath, me } from "../lib/store";
import Icon from "./Icon.vue";
import AccountBanner from "./AccountBanner.vue";
import { SessionLost } from "../lib/errors"; // F39: also sets plain words for failed requests
import TermsGate from "./TermsGate.vue";
import { live, refreshLive } from "../lib/eventlive";

const r = useRoute();
const showChrome = computed(() => r.meta.app && me.profile);
// F40: a new page fades in (only the new one; the old one is not waited for). The first page does not: it comes with
// the frame. The key is the route record, so changing a query or an id on the same page does not fade it again.
const pageKey = computed(() => r.matched[r.matched.length - 1]?.path || r.path);
const moved = ref(false);
watch(pageKey, () => { moved.value = true; });
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

// F40: one strap-coloured bar slides between the tabs (CSS, from this number) instead of each tab's own bar jumping.
const activeTab = computed(() => tabs.findIndex((t) => t.match(r.path)));

// The tab's title for each signed-in page (F37). Here and not in the router tables: those load on every
// public page, and this frame loads on none of them. A page that knows more (a card, an event) sets its own.
const TITLES = [["/app/cards", "Your cards"], ["/app/profile", "Edit profile"], ["/app/scan", "Scan"], ["/app/people", "People"],
  ["/app/events", "Events"], ["/app/settings", "Settings"], ["/app/feedback", "Feedback"], ["/app", "My card"]];
watch(
  () => r.path,
  (p) => {
    const hit = p.endsWith("/feedback") ? ["", "Feedback"] : TITLES.find(([k]) => p === k || p.startsWith(k + "/"));
    document.title = `${hit ? hit[1] : "Account"} | Lanyard`;
  },
  { immediate: true }
);

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

  <main class="app-col in-app">
    <SessionLost />
    <AccountBanner />
    <div :key="pageKey" :class="{ 'page-in': moved }"><router-view /></div>
  </main>

  <nav v-if="showChrome" class="tabbar" aria-label="Primary">
    <div class="tabbar-inner" :class="{ 'no-tab': activeTab < 0 }" :style="{ '--tab': Math.max(activeTab, 0) }">
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
