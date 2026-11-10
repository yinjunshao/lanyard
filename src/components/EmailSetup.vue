<script setup>
// Add (and verify) the email that signs you in, and choose whether to hear from
// us. Marketing is its own tick box, off by default, and never required.
import { ref } from "vue";
import { me, refreshMe } from "../lib/store";
import { Api } from "../lib/api";

const email = ref("");
const code = ref("");
const marketing = ref(false);
const sent = ref(false);
const busy = ref(false);
const error = ref("");

async function send() {
  error.value = ""; busy.value = true;
  try { await Api.setEmail(email.value.trim()); sent.value = true; }
  catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
async function confirm() {
  error.value = ""; busy.value = true;
  try {
    await Api.confirmEmail(email.value.trim(), code.value, marketing.value);
    sent.value = false; code.value = "";
    await refreshMe();
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
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
    <div class="spread">
      <span>Email</span>
      <strong v-if="me.user?.emailVerified">{{ me.user.recoveryEmail }}</strong>
    </div>

    <template v-if="me.user?.emailVerified">
      <p class="small muted">You can sign in with this email from any device.</p>
      <label class="small" style="display:flex;gap:10px;align-items:flex-start">
        <input type="checkbox" :checked="me.user.eventEmails" style="margin-top:3px" @change="toggleEvents" />
        <span>Remind me to give feedback after events I went to (one email per event).</span>
      </label>
      <label class="small" style="display:flex;gap:10px;align-items:flex-start">
        <input type="checkbox" :checked="me.user.marketingOptin" style="margin-top:3px" @change="toggleMarketing" />
        <span>Send me occasional news and offers from Lanyard. You can turn this off any time.</span>
      </label>
    </template>

    <form v-else-if="!sent" class="stack" @submit.prevent="send">
      <p class="small muted">Add your email so you can always get back in, on any device. We'll send a code to check it's yours.</p>
      <input v-model="email" type="email" aria-label="Email" placeholder="you@example.com" autocomplete="email"
             autocapitalize="none" spellcheck="false" maxlength="254" />
      <button class="btn btn-primary" :disabled="busy || !email.includes('@')">{{ busy ? "Sending…" : "Send me a code" }}</button>
    </form>

    <form v-else class="stack" @submit.prevent="confirm">
      <p class="small muted">We sent a 6-digit code to <strong>{{ email }}</strong>.</p>
      <input v-model="code" aria-label="6-digit code" placeholder="123456" inputmode="numeric" autocomplete="one-time-code"
             maxlength="7" style="font-size:22px;letter-spacing:4px;text-align:center" />
      <label class="small" style="display:flex;gap:10px;align-items:flex-start">
        <input v-model="marketing" type="checkbox" style="margin-top:3px" />
        <span>Also send me occasional news and offers (optional).</span>
      </label>
      <button class="btn btn-primary" :disabled="busy || code.replace(/\D/g, '').length < 6">{{ busy ? "Checking…" : "Confirm email" }}</button>
      <button type="button" class="btn" @click="sent = false; code = ''; error = ''">Use a different email</button>
    </form>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
  </div>
</template>
