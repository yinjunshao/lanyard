<script setup>
// Settings: a short list of categories, each on its own page (F09). Phones show the
// list, then one page with a back link; from 900 px the list stays on the left and
// the page shows on the right. Later features add rows inside the pages, not here.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { me, refreshMe, signOutAndReload } from "../lib/store";
import Icon from "../components/Icon.vue";
import { SETTINGS_ICONS } from "./settings/icons";
import { getThemePref } from "../lib/theme";

const route = useRoute();
const isIndex = computed(() => !route.meta.title);

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
  { key: "help", to: "/app/settings/all", title: "All settings (temporary)", summary: "Removed once every page is filled in" },
]);

async function logout() {
  if (!me.user?.claimed && !confirm("Your card isn't saved yet. If you log out, you can't get back into it. Log out anyway?")) return;
  await signOutAndReload("/");
}
</script>

<template>
  <div class="settings" :class="{ 'is-index': isIndex }">
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
        <h2 class="settings-title">{{ route.meta.title }}</h2>
      </template>
      <router-view />
    </section>
  </div>
</template>

<style>
.settings { display: block; }
.settings-nav > * + * { margin-top: calc(var(--space) * 2); }
.settings-nav h1 { margin-bottom: 0; }
.settings-row { min-height: 56px; padding-top: 8px; padding-bottom: 8px; color: inherit; text-decoration: none; }
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
  .app-col.is-wide, .topbar.is-wide { max-width: 960px; }
  .settings { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: calc(var(--space) * 5); align-items: start; }
  .settings-nav { position: sticky; top: 90px; }
  .settings-back { display: none; }
  .settings-pick { display: block; }
}
</style>
