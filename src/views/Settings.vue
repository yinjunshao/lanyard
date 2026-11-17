<script setup>
// Settings: a short list of categories, each on its own page (F09). Phones show the
// list, then one page with a back link; from 900 px the list stays on the left and
// the page shows on the right. Later features add rows inside the pages, not here.
//
// One route (/app/settings/:page?) serves the list and every page. The pages are
// loaded here, not in the router, so they add nothing to the entry file that every
// public page loads (D018).
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { me, refreshMe, signOutAndReload } from "../lib/store";
import Icon from "../components/Icon.vue";
import { SETTINGS_ICONS } from "./settings/icons";
import { getThemePref } from "../lib/theme";
import { settingsRedirect } from "../router/settingsRedirect";
import Waiting from "../components/Waiting.vue";

const PAGES = {
  account: { title: "Account", load: () => import("./settings/SettingsAccount.vue") },
  security: { title: "Sign-in and devices", load: () => import("./settings/SettingsSecurity.vue") },
  notifications: { title: "Email and notifications", load: () => import("./settings/SettingsNotifications.vue") },
  privacy: { title: "Privacy and data", load: () => import("./settings/SettingsPrivacy.vue") },
  plan: { title: "Plan", load: () => import("./settings/SettingsPlan.vue") },
  appearance: { title: "Appearance and app", load: () => import("./settings/SettingsAppearance.vue") },
  help: { title: "Help and legal", load: () => import("./settings/SettingsHelp.vue") },
};

const route = useRoute();
const router = useRouter();

// Old #plus, #signin and #install links land on the page that holds them.
const moved = computed(() => settingsRedirect(route));
watch(moved, (m) => { if (m) router.replace(m); }, { immediate: true });
const key = computed(() => (Object.hasOwn(PAGES, route.params.page) ? route.params.page : ""));
const isIndex = computed(() => !key.value);
// An address we don't have (/app/settings/nope) shows the list.
watch(() => route.params.page, (p) => { if (p && !Object.hasOwn(PAGES, p)) router.replace("/app/settings"); }, { immediate: true });

// The open page's component is kept outside Vue's reactivity; `loaded` says when to redraw.
const components = {};
const loaded = ref(0);
async function loadPage(k) {
  if (!k || components[k]) return;
  try { components[k] = (await PAGES[k].load()).default; loaded.value++; } catch { /* the page keeps waiting and offers Try again */ }
}
watch(key, loadPage, { immediate: true });
const Page = computed(() => (loaded.value, components[key.value] || null));

// The Appearance page announces a change, so the summary here stays right on wide screens.
const themePref = ref(getThemePref());
const onTheme = () => { themePref.value = getThemePref(); };
onMounted(() => { refreshMe(); window.addEventListener("lanyard:theme", onTheme); });
onBeforeUnmount(() => window.removeEventListener("lanyard:theme", onTheme));

const u = computed(() => me.user);
const signInSummary = computed(() => (u.value?.hasPasskey ? "Passkey saved" : u.value?.emailVerified ? "Email saved" : u.value?.hasRecovery ? "Recovery key saved" : u.value?.hasTotp ? "Authenticator app on" : "Not saved yet"));
const rows = computed(() => [
  { key: "account", to: "/app/settings/account", title: "Account", summary: u.value?.emailVerified ? u.value.recoveryEmail : "No email saved" },
  { key: "security", to: "/app/settings/security", title: "Sign-in and devices", summary: signInSummary.value },
  { key: "notifications", to: "/app/settings/notifications", title: "Email and notifications",
    summary: u.value?.emailVerified ? `Feedback reminders ${u.value.eventEmails ? "on" : "off"}, news ${u.value.marketingOptin ? "on" : "off"}` : "Add an email first" },
  { key: "privacy", to: "/app/settings/privacy", title: "Privacy and data", summary: "Your data, consents, delete account" },
  { key: "plan", to: "/app/settings/plan", title: "Plan", summary: me.plan.label },
  { key: "appearance", to: "/app/settings/appearance", title: "Appearance and app", summary: `Theme: ${{ auto: "auto", light: "light", dark: "dark" }[themePref.value] || "auto"}` },
  { key: "help", to: "/app/settings/help", title: "Help and legal", summary: "Contact, terms, about Lanyard" },
]);

async function logout() {
  if (!me.user?.claimed && !confirm("Your card isn't saved yet. If you log out, you can't get back into it. Log out anyway?")) return;
  await signOutAndReload("/");
}
</script>

<template>
  <div v-if="!moved" class="settings" :class="{ 'is-index': isIndex }">
    <nav class="settings-nav" aria-label="Settings">
      <h1>Settings</h1>
      <div class="list">
        <router-link v-for="r in rows" :key="r.key" :to="r.to" class="list-row settings-row">
          <svg class="settings-ico" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="SETTINGS_ICONS[r.key]"></svg>
          <span class="settings-row-text"><strong>{{ r.title }}</strong><span class="small muted">{{ r.summary }}</span></span>
          <span class="muted settings-chev"><Icon name="chevron" :size="18" /></span>
        </router-link>
      </div>
      <div class="list">
        <button type="button" class="list-row settings-row" @click="logout">
          <svg class="settings-ico" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="SETTINGS_ICONS.logout"></svg>
          <span class="settings-row-text"><strong>Log out of this device</strong></span>
        </button>
      </div>
    </nav>

    <section class="settings-pane">
      <template v-if="!isIndex">
        <router-link to="/app/settings" class="settings-back link-btn">‹ Settings</router-link>
        <h2 class="settings-title">{{ PAGES[key].title }}</h2>
      </template>
      <component :is="Page" v-if="Page" />
      <Waiting v-else-if="!isIndex" shape="panel" :rows="2" label="Loading this page" :retry="() => loadPage(key)" />
      <p v-else-if="isIndex" class="muted settings-pick">Choose a setting from the list.</p>
    </section>
  </div>
</template>

<style>
.settings { display: block; }
.settings-nav > * + * { margin-top: calc(var(--space) * 2); }
.settings-nav h1 { margin: 0; }
.settings-row { min-height: 52px; padding-top: 5px; padding-bottom: 5px; color: inherit; text-decoration: none; }
button.settings-row { border: 0; color: inherit; }
.settings-ico { flex: none; color: var(--graphite); }
.settings-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.settings-row-text .small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.settings-chev { display: inline-flex; flex: none; }
.settings-row[aria-current="page"] { box-shadow: inset 3px 0 0 var(--strap); background: var(--paper); }
.settings-row[aria-current="page"] .settings-ico { color: var(--strap); }
.settings-back { min-height: 44px; display: inline-flex; align-items: center; text-align: left; }
.settings-title { font-size: 26px; margin: 0 0 calc(var(--space) * 2); }
.settings-pane > * + * { margin-top: 0; }
.settings-pick { display: none; }

/* Phones: the list, or one page. */
@media (max-width: 899px) {
  .settings:not(.is-index) .settings-nav { display: none; }
  .settings.is-index .settings-pane { display: none; }
}
/* From 900 px: the list on the left, the page on the right. */
@media (min-width: 900px) {
  .app-col:has(> .settings), .topbar:has(+ .app-col > .settings) { max-width: 960px; }
  .settings { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: calc(var(--space) * 5); align-items: start; }
  .settings-nav { position: sticky; top: 90px; }
  .settings-back { display: none; }
  .settings-pick { display: block; }
}
</style>
