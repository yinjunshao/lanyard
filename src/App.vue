<script setup>
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { me, refreshMe } from "./lib/store";

const route = useRoute();
onMounted(async () => {
  try { await refreshMe(); } catch (e) { console.error(e); }
});

const tabs = computed(() => [
  { to: "/qr", key: "qr", label: "My card", icon: "qr" },
  { to: "/scan", key: "scan", label: "Scan", icon: "scan" },
  { to: "/connections", key: "connections", label: "People", icon: "people" },
]);
const active = (key) => {
  if (key === "qr") return route.path === "/qr";
  if (key === "scan") return route.path === "/scan" || route.path === "/swap";
  if (key === "connections") return route.path.startsWith("/connections") || route.path.startsWith("/p/");
  return route.path.startsWith("/" + key);
};
</script>

<template>
  <span class="strap"></span>

  <nav class="nav topnav">
    <div class="inner">
      <router-link to="/" class="logo">lanyard<b>.</b></router-link>

      <!-- Desktop / tablet links -->
      <div v-if="me.id" class="desktop-links">
        <router-link
          v-for="t in tabs"
          :key="t.key"
          :to="t.to"
          class="desktop-link"
          :class="{ on: active(t.key) }"
        >{{ t.label }}</router-link>
      </div>
      <div v-else class="desktop-links">
        <router-link to="/scan" class="desktop-link" :class="{ on: route.path === '/scan' }">Scan</router-link>
      </div>

      <div class="spacer"></div>
      <router-link v-if="!me.id" to="/login" class="btn btn-ghost top-cta">Log in</router-link>
      <router-link v-if="!me.id" to="/onboard" class="btn btn-primary top-cta">Get my card</router-link>
      <template v-else>
        <span class="top-name small muted">{{ me.profile?.code }}</span>
        <router-link to="/onboard" class="btn btn-ghost top-cta">Edit</router-link>
      </template>
    </div>
  </nav>

  <main class="app-main">
    <router-view />
  </main>

  <!-- Mobile bottom tab bar (shown once the user has a profile) -->
  <nav v-if="me.id" class="tabbar" aria-label="Primary">
    <div class="tabbar-inner">
      <router-link
        v-for="t in tabs"
        :key="t.key"
        :to="t.to"
        class="tab"
        :class="{ 'tab-qr': t.key === 'qr', on: active(t.key) }"
      >
        <template v-if="t.icon === 'qr'">
          <span class="qr-fab">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/>
              <path d="M14 14h3v3M21 14v.01M14 21h.01M17 21h4v-4"/>
            </svg>
          </span>
          <span class="tab-label">My card</span>
        </template>

        <template v-else-if="t.icon === 'scan'">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/>
            <path d="M4 12h16"/>
          </svg>
          <span class="tab-label">Scan</span>
        </template>

        <template v-else-if="t.icon === 'people'">
          <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/>
            <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 15.2c2 .6 3.3 2.2 3.7 4.8"/>
          </svg>
          <span class="tab-label">People</span>
        </template>
      </router-link>
    </div>
  </nav>
</template>

<style scoped>
.app-main { min-height: 100vh; }
.top-name { white-space: nowrap; }

/* Desktop / tablet links in the top bar */
.desktop-links {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 26px;
}
.desktop-link {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--muted);
  padding: 8px 13px;
  border-radius: 999px;
}
.desktop-link:hover { color: var(--ink); background: var(--paper-2); }
.desktop-link.on { color: var(--ink); background: var(--volt); border: 1px solid var(--ink); }

/* Bottom tab bar: only on phones/tablets */
.tabbar { display: none; }
@media (max-width: 820px) {
  .desktop-links { display: none; }
  .topnav .inner { padding: 10px 0; }
  .top-name { display: none; }
  .top-cta { min-height: 36px; padding: 7px 13px; }

  .app-main { padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px)); }

  .tabbar {
    display: block;
    position: fixed;
    left: 0; right: 0; bottom: 0;
    z-index: 60;
    padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px));
    background: rgba(238,240,231,.92);
    backdrop-filter: blur(16px);
    border-top: 1px solid var(--line);
  }
  .tabbar-inner {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    align-items: end;
  }
  .tab {
    display: flex; flex-direction: column; align-items: center; justify-content:flex-end;
    gap: 3px;
    padding: 6px 2px 2px;
    min-height: 58px;
    border-radius: 16px;
    color: var(--muted);
    font-weight: 700;
  }
  .tab .tab-label { font-size: 11px; letter-spacing: .01em; }
  .tab.on { color: var(--ink); }
  .tab.on .tab-label { color: var(--accent-dark); }

  /* The colored, rounded, raised card action */
  .tab-qr { position: relative; }
  .qr-fab {
    width: 56px; height: 56px;
    margin-top: -22px;
    border-radius: 20px;
    background: var(--volt);
    color: var(--ink);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 10px 22px -8px rgba(14,17,16,.55), 0 2px 0 rgba(0,0,0,.12);
    border: 2px solid var(--paper);
    transition: transform .12s ease;
  }
  .tab-qr:active .qr-fab { transform: translateY(1px) scale(.97); }
  .tab-qr.on .qr-fab { background: var(--ink); color: var(--volt); }
}
</style>
