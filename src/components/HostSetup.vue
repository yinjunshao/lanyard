<script setup>
// Host sign-in and setup (F10): email -> code -> details -> Host Terms. The
// organisation step is on the dashboard. Each step is saved on the server, so
// a refresh or another device carries on where the server says; Back only
// changes which saved step is on screen. Sign out is in the page header.
import { computed, ref, watch } from "vue";
import { HostApi, hostSignOutAndReload } from "../lib/hostapi";
import { MAIN_ORIGIN } from "../lib/site";
import UiSelect from "./ui/UiSelect.vue";

const props = defineProps({
  view: { type: String, required: true }, // email | code | details | terms
  account: { type: Object, default: null },
});
const emit = defineEmits(["go", "reload"]);

const busy = ref(false);
const error = ref("");
const email = ref("");
const code = ref("");
const resent = ref(false);
const agreed = ref(false);
const det = ref({ fullName: "", useCase: "", frequency: "", size: "", referral: "" });
const FREQUENCIES = ["One-off event", "A few times a year", "About once a month", "Weekly or more"];
const SIZE_OPTIONS = [{ value: "", label: "Not sure yet" }, "Under 50 people", "50 to 200", "200 to 1,000", "Over 1,000"];
const termsUrl = `${MAIN_ORIGIN}/terms#hosts`;
const privacyUrl = `${MAIN_ORIGIN}/privacy`;

// Saved answers fill the form when someone comes back to a step.
watch(() => props.account, (a) => {
  if (!a) return;
  det.value = { fullName: a.fullName, useCase: a.useCase, frequency: a.frequency, size: a.size, referral: a.referral };
  agreed.value = a.termsAccepted;
}, { immediate: true });
watch(() => props.view, () => { error.value = ""; });

async function step(fn) {
  error.value = ""; busy.value = true;
  try { await fn(); }
  catch (e) { error.value = e?.message || "Something went wrong. Try again."; }
  finally { busy.value = false; }
}

const emailOk = computed(() => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim()));
const sendCode = (again = false) => step(async () => {
  if (!emailOk.value) throw new Error("Enter the email address you want to use.");
  await HostApi.signInStart(email.value.trim());
  code.value = ""; resent.value = again;
  emit("go", "code");
});
const signIn = () => step(async () => {
  const c = code.value.replace(/\D/g, "");
  if (c.length !== 6) throw new Error("The code has 6 digits.");
  await HostApi.signInVerify(email.value.trim(), c);
  emit("reload");
});
const saveDetails = () => step(async () => {
  const d = det.value;
  if (d.fullName.trim().length < 2) throw new Error("Add your full name.");
  if (!d.useCase.trim()) throw new Error("Tell us what you plan to use Lanyard for.");
  if (!d.frequency) throw new Error("Tell us how often you run events.");
  await HostApi.saveDetails({ fullName: d.fullName.trim(), survey: { useCase: d.useCase, frequency: d.frequency, size: d.size, referral: d.referral } });
  emit("reload");
});
const acceptTerms = () => step(async () => {
  if (!agreed.value) throw new Error("Please agree to the Host Terms and Privacy Policy first.");
  await HostApi.acceptTerms();
  emit("reload");
});
// Back from the first saved step means a different email: that is signing out.
const differentEmail = () => step(() => hostSignOutAndReload("/"));
</script>

<template>
  <!-- Sign in: email -->
  <section v-if="view === 'email'" class="panel stack-2" aria-labelledby="hs-email-h">
    <h2 id="hs-email-h">Sign in to the host portal</h2>
    <p class="muted">Enter your email and we'll send you a 6-digit code. New to hosting? The same code sets up your host account.</p>
    <form class="stack-2" @submit.prevent="sendCode()">
      <div class="field"><label for="hs-email">Email</label>
        <input id="hs-email" v-model="email" type="email" autocomplete="email" inputmode="email" maxlength="120" />
        <span class="small muted">Use your university or work email if you want society, institution or company prices.</span></div>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <button class="btn btn-primary" type="submit" :disabled="busy">{{ busy ? "Sending…" : "Send code" }}</button>
    </form>
    <p class="small muted" style="margin:0">Your host account is separate from any Lanyard card you have.</p>
  </section>

  <!-- Sign in: code -->
  <section v-else-if="view === 'code'" class="panel stack-2" aria-labelledby="hs-code-h">
    <button type="button" class="link-btn small host-back" @click="emit('go', 'email')">‹ Back</button>
    <h2 id="hs-code-h">Check your email</h2>
    <p class="muted">We sent a 6-digit code to <strong>{{ email }}</strong>. It works for 10 minutes. If it doesn't arrive, check your spam folder.</p>
    <form class="stack-2" @submit.prevent="signIn">
      <div class="field"><label for="hs-code">Code</label>
        <input id="hs-code" v-model="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="7"
               style="font-size:24px;letter-spacing:6px" class="tnum" /></div>
      <p v-if="resent" class="small muted" role="status">A new code is on its way. Only the newest one works.</p>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <button class="btn btn-primary" type="submit" :disabled="busy">{{ busy ? "Checking…" : "Sign in" }}</button>
    </form>
    <button type="button" class="btn" :disabled="busy" @click="sendCode(true)">Send a new code</button>
  </section>

  <!-- Setup 1 of 3: details -->
  <section v-else-if="view === 'details'" class="panel stack-2" aria-labelledby="hs-det-h">
    <button type="button" class="link-btn small host-back" :disabled="busy" @click="differentEmail">‹ Use a different email</button>
    <span class="label" style="display:block">Step 1 of 3</span>
    <h2 id="hs-det-h">About you</h2>
    <p class="muted">Signed in as <strong>{{ account?.email }}</strong>. Organisations can be handed to your host account by this email, and invoices go to it.</p>
    <div class="field"><label for="hs-name">Full name</label>
      <input id="hs-name" v-model="det.fullName" type="text" maxlength="80" autocomplete="name" /></div>
    <div class="field"><label for="hs-use">What do you plan to use Lanyard for?</label>
      <textarea id="hs-use" v-model="det.useCase" maxlength="600"
                placeholder="For example: helping members meet each other at our weekly socials"></textarea></div>
    <div class="field"><label id="hs-freq-l">How often do you run events?</label>
      <UiSelect id="hs-freq" v-model="det.frequency" labelledby="hs-freq-l" placeholder="Choose one" :options="FREQUENCIES" /></div>
    <div class="field"><label id="hs-size-l">How many people usually come? (optional)</label>
      <UiSelect id="hs-size" v-model="det.size" labelledby="hs-size-l" :options="SIZE_OPTIONS" /></div>
    <div class="field"><label for="hs-ref">How did you hear about Lanyard? (optional)</label>
      <input id="hs-ref" v-model="det.referral" type="text" maxlength="200" /></div>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <button class="btn btn-primary" :disabled="busy" @click="saveDetails">{{ busy ? "Saving…" : "Continue" }}</button>
  </section>

  <!-- Setup 2 of 3: Host Terms -->
  <section v-else-if="view === 'terms'" class="panel stack-2" aria-labelledby="hs-terms-h">
    <button type="button" class="link-btn small host-back" @click="emit('go', 'details')">‹ Back</button>
    <span class="label" style="display:block">Step 2 of 3</span>
    <h2 id="hs-terms-h">Host Terms</h2>
    <p class="muted">Hosts see totals about their events, never who connected with whom. The Host Terms say what you and we each agree to.</p>
    <label class="checkbox-row field">
      <input v-model="agreed" type="checkbox" />
      <span class="small">
        I'm 18 or over, I'm authorised to act for the organisation I set up, and I agree to the
        <a :href="termsUrl" target="_blank" rel="noopener">Host Terms</a> and
        <a :href="privacyUrl" target="_blank" rel="noopener">Privacy Policy</a>.
      </span>
    </label>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <button class="btn btn-primary" :disabled="busy" @click="acceptTerms">{{ busy ? "Saving…" : "Agree and continue" }}</button>
  </section>
</template>

<style scoped>
.host-back { display: block; min-height: 44px; text-align: left; }
</style>
