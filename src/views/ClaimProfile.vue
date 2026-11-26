<script setup>
// F74 (D063): /claim/p/<token>, a card someone at Lanyard made for this person. It shows the card as it will look and
// where the details came from (UK GDPR Article 14), with two choices: claim it (email, then a 6-digit code, with the
// Terms and 18+ line by the button, as at sign-up) or delete it at once. The token goes to the Worker only in POST
// bodies, never in a query string.
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import CardView from "../components/CardView.vue";
import Waiting from "../components/Waiting.vue";
import { refreshMe } from "../lib/store";
import { fix } from "../lib/errors";
document.title = "Claim your card | Lanyard";

const route = useRoute();
const router = useRouter();
const token = String(route.params.token || "");
const state = ref("loading"); // loading | gone | show | email | code | has_account | deleted
const data = ref(null);
const email = ref("");
const code = ref("");
const error = ref("");
const busy = ref(false);
let photoUrl = null;

async function post(path, body) {
  let res, json = {};
  try {
    res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, ...body }), signal: AbortSignal.timeout?.(9e4) });
    json = await res.json().catch(() => ({}));
  } catch (e) { res = { status: 0 }; json = { code: "offline", e }; }
  if (!res.ok) throw fix(Object.assign(new Error(json.error || ""), { status: res.status, code: json.code || null }), json, res);
  return json;
}
const gone = (e) => { if (e.code === "link_gone") { state.value = "gone"; return true; } return false; };

onMounted(async () => {
  try {
    data.value = await post("/api/claim/look");
    state.value = "show";
    if (data.value.hasPhoto) {
      const res = await fetch("/api/claim/photo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
      if (res?.ok) {
        photoUrl = URL.createObjectURL(await res.blob());
        data.value = { ...data.value, card: { ...data.value.card, profile: { ...data.value.card.profile, photo: photoUrl } } };
      }
    }
  } catch (e) { if (!gone(e)) { state.value = "gone"; error.value = e.message; } }
});
onBeforeUnmount(() => { if (photoUrl) URL.revokeObjectURL(photoUrl); });

async function run(fn) {
  if (busy.value) return;
  error.value = ""; busy.value = true;
  try { await fn(); } catch (e) { if (!gone(e)) error.value = e.message; } finally { busy.value = false; }
}
const notMe = () => run(async () => {
  if (!window.confirm("Delete this card? Everything on it, and its photo, is deleted now and cannot be brought back.")) return;
  await post("/api/claim/delete");
  state.value = "deleted";
});
const sendCode = () => run(async () => {
  if (!email.value.trim()) { error.value = "Type your email address."; return; }
  await post("/api/claim/start", { email: email.value });
  code.value = "";
  state.value = "code";
});
const claim = () => run(async () => {
  try {
    const r = await post("/api/claim/finish", { email: email.value, code: code.value, acceptTerms: true, over18: true });
    await refreshMe().catch(() => {});
    router.replace(r.next || "/app/profile?claimed=1");
  } catch (e) {
    if (e.code === "has_account") { state.value = "has_account"; error.value = ""; return; }
    throw e;
  }
});
</script>

<template>
  <div class="wide-col stack-3" style="max-width:560px">
    <Waiting v-if="state === 'loading'" shape="panel" :rows="2" label="Opening the card" />

    <template v-else-if="state === 'gone'">
      <h1>This link has expired or was already used.</h1>
      <p class="muted">If you were sent it by someone at Lanyard, ask them for a new one. You can also <router-link to="/" style="text-decoration:underline">make your own card</router-link>.</p>
    </template>

    <template v-else-if="state === 'deleted'">
      <h1>Deleted</h1>
      <p class="muted" role="status">The card and everything on it are gone. Nothing about you is kept, and the link no longer works.</p>
    </template>

    <template v-else>
      <p class="claim-lede">Someone at Lanyard made this card for you from details on {{ data.source }}. Nobody can see it until you claim it.</p>
      <CardView :view="data.card" />
      <p class="small muted">If you don't claim it, it is deleted 30 days after it was made. See <router-link to="/privacy#made-for-you" style="text-decoration:underline">If we made a card for you</router-link> in the Privacy Policy.</p>

      <p v-if="error" class="error-text" role="alert">{{ error }}</p>

      <div v-if="state === 'show'" class="stack">
        <button class="btn btn-primary" @click="state = 'email'">Claim it</button>
        <button class="btn btn-danger" :disabled="busy" @click="notMe">This isn't me / delete it</button>
      </div>

      <form v-else-if="state === 'email'" class="panel stack" @submit.prevent="sendCode">
        <label for="claim-email">Your email</label>
        <input id="claim-email" v-model="email" type="email" autocomplete="email" inputmode="email" />
        <span class="small muted">We send a 6-digit code to it. It becomes how you sign in.</span>
        <button class="btn btn-primary" :disabled="busy">{{ busy ? "Sending…" : "Send code" }}</button>
        <button type="button" class="btn" @click="state = 'show'">Back</button>
      </form>

      <form v-else-if="state === 'code'" class="panel stack" @submit.prevent="claim">
        <label for="claim-code">The code we sent to {{ email.trim() }}</label>
        <input id="claim-code" v-model="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" />
        <p v-if="state === 'code'" class="consent-line">
          By pressing Claim it, you confirm you're 18 or over and agree to the
          <router-link to="/terms" target="_blank">Terms</router-link> and
          <router-link to="/privacy" target="_blank">Privacy Policy</router-link>.
        </p>
        <button class="btn btn-primary" :disabled="busy || code.trim().length !== 6">{{ busy ? "Claiming…" : "Claim it" }}</button>
        <button type="button" class="btn" :disabled="busy" @click="sendCode">Send a new code</button>
      </form>

      <div v-else-if="state === 'has_account'" class="panel stack" role="status">
        <p style="margin:0">You already have a Lanyard account with this email. Sign in, and we'll offer these details to you instead.</p>
        <router-link to="/signin" class="btn btn-primary">Sign in</router-link>
      </div>
    </template>
  </div>
</template>

<style scoped>
.claim-lede { font-size: 17px; line-height: 1.5; margin: 0; }
</style>
