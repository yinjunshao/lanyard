<script setup>
// Step 5: save the card. An email is what gets someone back in on a new phone, and (F45) it is now
// required: this step cannot be skipped until one is on file, confirmed or not. A typed email is kept
// unconfirmed ("pending") and our first email to it carries a confirm link; until then it cannot sign
// anyone in. "Confirm now with a code" is the existing code flow (EmailSetup). A passkey on top is
// one-tap sign-in, offered once the email is confirmed.
import { explain } from "../../lib/errors";
import { api } from "../../lib/api";
import { computed, ref } from "vue";
import { me, refreshMe } from "../../lib/store";
import { pendingCode } from "../../lib/redeem";
import { registerPasskey, passkeysSupported } from "../../lib/passkeys";
import EmailSetup from "../EmailSetup.vue";

const verified = computed(() => !!me.user?.emailVerified);
const pending = computed(() => (!verified.value && me.user?.pendingEmail) || "");
const canPasskey = passkeysSupported();
const busy = ref(false);
const error = ref("");
const email = ref("");
const changing = ref(false); // typing a different email over a pending one
const byCode = ref(false);   // "Confirm now with a code" opened

async function addPasskey() {
  error.value = ""; busy.value = true;
  try { await registerPasskey(); await refreshMe(); }
  catch (e) { error.value = e?.name === "NotAllowedError" ? "Passkey setup was cancelled. You can add one later in Settings." : explain(e, "Passkey setup failed. Try again, or use another way to sign in."); }
  finally { busy.value = false; }
}

async function savePending() {
  if (busy.value) return;
  error.value = "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) { error.value = "Add your email to save your card. Only we see it."; return; }
  busy.value = true;
  try {
    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } })();
    await api("/api/account/pending-email", "POST", { email: email.value.trim(), tz });
    await refreshMe();
    changing.value = false; byCode.value = false; email.value = "";
  } catch (e) { error.value = explain(e, "That didn't save. Try again."); }
  finally { busy.value = false; }
}

// Asked here, so the account banner does not ask again the moment they open My card. It is the
// banner's own "Not now" (same key as AccountBanner.vue), and the passkey stays in Settings.
function save() {
  if (!verified.value || !canPasskey || me.user?.hasPasskey) return;
  try {
    const KEY = "lanyard_banner_dismissed";
    localStorage.setItem(KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(KEY) || "{}"), passkey: Date.now() }));
  } catch { /* not remembered: the banner may ask once */ }
}

// With a code waiting (from a poster), only a confirmed email lets them claim it, so no skipping until then.
const promo = computed(() => !!pendingCode() && !verified.value);
const hasEmail = computed(() => verified.value || !!pending.value);
// No skipping without an email (F45). Continue appears once one is on file (or confirmed, with a code waiting).
const noSkip = computed(() => !hasEmail.value || promo.value);
defineExpose({ ready: true, save, hideContinue: computed(() => (promo.value ? !verified.value : !hasEmail.value)), noSkip });
</script>

<template>
  <div class="stack-2">
    <h1>Save your card</h1>
    <p class="muted" style="margin:0">
      Your email is how you get back to your card on a new phone. We never show it on your card or to the people you meet.
    </p>
    <p v-if="promo" class="notice small">You need a confirmed email to claim your code.</p>

    <div v-if="pending && !changing" class="panel stack" aria-label="Your email">
      <div class="spread"><span>Email</span><strong>{{ pending }}</strong></div>
      <p class="small muted" style="margin:0">We'll send you a link to confirm it. Until then it can't be used to sign in.</p>
      <div class="quiet-row">
        <button v-if="!byCode" type="button" class="btn-quiet" @click="byCode = true">Confirm now with a code</button>
        <button type="button" class="btn-quiet" @click="changing = true; byCode = false; error = ''">Use a different email</button>
      </div>
    </div>

    <form v-if="!verified && (!pending || changing)" class="panel stack" novalidate @submit.prevent="savePending">
      <div class="field">
        <label for="save-email">Your email</label>
        <input id="save-email" v-model="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false"
               maxlength="254" required aria-describedby="save-email-hint" placeholder="you@example.com" />
        <span id="save-email-hint" class="small muted">Only we see this. We'll send you a link to confirm it.</span>
      </div>
      <button class="btn btn-primary" :disabled="busy">{{ busy ? "Saving…" : "Save email" }}</button>
      <button v-if="changing" type="button" class="btn-quiet" @click="changing = false; error = ''">Keep {{ pending }}</button>
    </form>

    <div v-if="verified || (pending && byCode && !changing)" class="panel"><EmailSetup /></div>

    <section v-if="verified && canPasskey && !me.user?.hasPasskey" class="stack" aria-label="Passkey">
      <strong>Also add a passkey for one-tap sign-in</strong>
      <p class="small muted" style="margin:0">So you can get back in on a new phone, with Face ID or a fingerprint. It takes a few seconds.</p>
      <button type="button" class="btn" :disabled="busy" @click="addPasskey">{{ busy ? "Working…" : "Add a passkey" }}</button>
    </section>
    <p v-else-if="verified && me.user?.hasPasskey" class="success-text small" role="status">Passkey saved.</p>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>

    <p class="small muted" style="margin:0">
      Prefer a recovery key?
      <router-link to="/claim" target="_blank">See the other ways to save your card</router-link>.
    </p>
  </div>
</template>

<style scoped>
.quiet-row { display: flex; flex-wrap: wrap; gap: 4px 16px; }
</style>
