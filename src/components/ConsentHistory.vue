<script setup>
// What you've agreed to and withdrawn, with dates, plus the way to ask us anything.
import { onMounted, ref } from "vue";
import { Api } from "../lib/api";

const rows = ref([]);
const NAMES = {
  marketing: "News and offers by email",
  selfie: "Taking a shared selfie",
  selfie_accept: "Appearing in someone's shared selfie",
  account: "Your account",
};
function name(scope) {
  if (scope.startsWith("terms:")) return `Terms and Privacy Policy (${scope.slice(6)})`;
  if (scope.startsWith("host_terms:")) return `Host Terms (${scope.slice(11)})`;
  if (scope.startsWith("event_directory:")) return "Showing me in an event's room";
  if (scope.startsWith("event_sponsor:")) return "Sharing my details with an event sponsor";
  return NAMES[scope] || scope;
}
const verb = (a, scope) => (scope === "account" ? "Deleted" : a === "granted" ? "Agreed" : "Withdrawn");
const when = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

onMounted(async () => {
  try { rows.value = (await Api.consentHistory()).history; } catch { /* not signed in */ }
});
</script>

<template>
  <details class="list" style="padding:16px">
    <summary style="cursor:pointer;font-weight:700">My consents and privacy requests</summary>
    <ul v-if="rows.length" class="small" style="margin:12px 0;padding-left:18px">
      <li v-for="(r, i) in rows" :key="i">{{ when(r.at) }}: {{ verb(r.action, r.scope) }}, {{ name(r.scope) }}</li>
    </ul>
    <p v-else class="small muted" style="margin:12px 0">Nothing recorded yet.</p>
    <p class="small muted">
      You can switch the email options above on or off whenever you like, and remove a shared selfie from its person's page.
      <router-link to="/privacy-request">Ask for your data, ask us to delete it, or make a complaint.</router-link>
    </p>
  </details>
</template>
