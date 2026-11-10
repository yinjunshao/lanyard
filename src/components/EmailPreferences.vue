<script setup>
// Which emails Lanyard may send you. Both are off or on per person, change any time,
// and only appear once an email is saved and confirmed.
import { ref } from "vue";
import { me, refreshMe } from "../lib/store";
import { Api } from "../lib/api";

const error = ref("");
async function toggleEvents(ev) {
  error.value = "";
  try { await Api.setEventEmails(ev.target.checked); await refreshMe(); }
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
    <template v-if="me.user?.emailVerified">
      <label class="small" style="display:flex;gap:10px;align-items:flex-start;min-height:44px">
        <input type="checkbox" :checked="me.user.eventEmails" style="margin-top:3px" @change="toggleEvents" />
        <span>Remind me to give feedback after events I went to (one email per event).</span>
      </label>
      <label class="small" style="display:flex;gap:10px;align-items:flex-start;min-height:44px">
        <input type="checkbox" :checked="me.user.marketingOptin" style="margin-top:3px" @change="toggleMarketing" />
        <span>Send me occasional news and offers from Lanyard. You can turn this off any time.</span>
      </label>
      <p class="small muted">Sent to {{ me.user.recoveryEmail }}. Sign-in codes and security alerts are not optional.</p>
    </template>
    <p v-else class="small muted">
      Add and confirm an email first, then you can choose here which emails you get.
      <router-link to="/app/settings/account">Go to Account</router-link>
    </p>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
  </div>
</template>
