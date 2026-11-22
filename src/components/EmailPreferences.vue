<script setup>
// Which emails Lanyard may send you. Each is off or on per person and changes any time. The feedback and
// news switches need a confirmed email; the follow-up reminder switch (F48) also shows for an address that
// is not confirmed yet.
import { ref } from "vue";
import { me, refreshMe } from "../lib/store";
import { Api, api } from "../lib/api";

const error = ref("");
async function toggleEvents(ev) {
  error.value = "";
  try { await Api.setEventEmails(ev.target.checked); await refreshMe(); }
  catch (e) { error.value = e.message; ev.target.checked = !ev.target.checked; }
}
async function toggleReminders(ev) {
  error.value = "";
  try { await api("/api/account/reminder-emails", "POST", { on: ev.target.checked }); await refreshMe(); }
  catch (e) { error.value = e.message; ev.target.checked = !ev.target.checked; }
}
async function toggleMarketing(ev) {
  error.value = "";
  try { await Api.setMarketing(ev.target.checked); await refreshMe(); }
  catch (e) { error.value = e.message; ev.target.checked = !ev.target.checked; }
}
</script>

<template>
  <div class="stack">
    <template v-if="me.user?.emailVerified || me.user?.pendingEmail">
      <label v-if="me.user.emailVerified" class="small" style="display:flex;gap:10px;align-items:flex-start;min-height:44px">
        <input type="checkbox" :checked="me.user.eventEmails" style="margin-top:3px" @change="toggleEvents" />
        <span>Remind me to give feedback after events I went to (one email per event).</span>
      </label>
      <label class="small" style="display:flex;gap:10px;align-items:flex-start;min-height:44px">
        <input type="checkbox" :checked="me.user.reminderEmails" style="margin-top:3px" @change="toggleReminders" />
        <span>Email me when a follow-up reminder I set is due, and to finish my card.</span>
      </label>
      <label v-if="me.user.emailVerified" class="small" style="display:flex;gap:10px;align-items:flex-start;min-height:44px">
        <input type="checkbox" :checked="me.user.marketingOptin" style="margin-top:3px" @change="toggleMarketing" />
        <span>Send me occasional news and offers from Lanyard. You can turn this off any time.</span>
      </label>
      <p v-if="me.user.emailVerified" class="small muted">Sent to {{ me.user.recoveryEmail }}. Sign-in codes and security alerts are not optional.</p>
      <p v-else class="small muted">Sent to {{ me.user.pendingEmail }}, which you haven't confirmed yet. Until you do, we send it no more than two emails.</p>
    </template>
    <p v-else class="small muted">
      Add and confirm an email first, then you can choose here which emails you get.
      <router-link to="/app/settings/account">Go to Account</router-link>
    </p>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
  </div>
</template>
