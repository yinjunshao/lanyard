<script setup>
// Send us a privacy request or a complaint. No account needed; we email an
// acknowledgement straight away and log it until it is answered.
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { homePath, me, refreshMe } from "../lib/store";
import { Api } from "../lib/api";
import UiSelect from "../components/ui/UiSelect.vue";

const route = useRoute();
const KINDS = [
  { value: "access", label: "Get a copy of my data" },
  { value: "erasure", label: "Delete my data" },
  { value: "complaint", label: "Make a complaint" },
  { value: "other", label: "Something else" },
];
const kind = ref(KINDS.some((k) => k.value === route.query.kind) ? route.query.kind : "access");
const email = ref("");
const message = ref("");
const busy = ref(false);
const error = ref("");
const done = ref(null);

onMounted(async () => {
  try { await refreshMe(); email.value = me.user?.recoveryEmail || ""; } catch { /* not signed in */ }
});

async function submit() {
  error.value = ""; busy.value = true;
  try { done.value = await Api.privacyRequest({ kind: kind.value, email: email.value.trim(), message: message.value }); }
  catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
</script>

<template>
  <main class="app-col stack-2">
    <router-link :to="homePath()" class="wordmark">lanyard<b>.</b></router-link>
    <h1>Privacy requests and complaints</h1>

    <div v-if="done" class="panel stack">
      <strong>We've got it. Reference {{ done.id }}.</strong>
      <p class="small muted" style="margin:0">
        <template v-if="done.acknowledged">We emailed you an acknowledgement. </template>
        <template v-else>We couldn't send the acknowledgement email, but your request is logged. </template>
        We'll reply within 30 days (a month for data requests). If you're not happy with the answer you can complain to the
        Information Commissioner's Office at ico.org.uk.
      </p>
    </div>

    <form v-else class="stack" @submit.prevent="submit">
      <p class="muted">
        You can ask for a copy of your data, ask us to delete it, or complain about how we handled it. You can also do most of this yourself in
        <router-link to="/app/settings/privacy">Settings</router-link>.
      </p>
      <label class="label-top" id="kind-l">What is this about?</label>
      <UiSelect id="kind" v-model="kind" labelledby="kind-l" :options="KINDS" />
      <label class="label-top" for="email">Your email (so we can reply)</label>
      <input id="email" v-model="email" type="email" autocomplete="email" maxlength="254" />
      <label class="label-top" for="msg">Tell us what you need</label>
      <textarea id="msg" v-model="message" rows="6" maxlength="4000"></textarea>
      <button class="btn btn-primary" :disabled="busy || !email.includes('@') || message.trim().length < 5">{{ busy ? "Sending…" : "Send" }}</button>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    </form>

    <p class="small muted"><router-link to="/privacy">Privacy Policy</router-link> · <router-link to="/terms">Terms</router-link></p>
  </main>
</template>
