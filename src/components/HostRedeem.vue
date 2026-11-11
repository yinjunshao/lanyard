<script setup>
// Promo codes for hosts (F20): host.<domain>/redeem and /redeem/CODE. The same ticket look as
// the attendee page, but for event credits, and in the host portal only. A code is never named
// on this page: the box shows a format hint, and what a code gives comes from the server.
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { HostApi } from "../lib/hostapi";
import { MAIN_ORIGIN } from "../lib/site";
import { cleanHostCode, savePendingHostCode, clearPendingHostCode } from "../lib/hostredeem";

const route = useRoute();
const router = useRouter();

const typed = ref("");
const promo = ref(null);
const mine = ref(null);
const org = ref(null);
const remaining = ref(null);
const loading = ref(false);
const claiming = ref(false);
const error = ref("");
const failure = ref(""); // bad_code | account | throttled | other
const already = ref(false);

const code = computed(() => cleanHostCode(route.params.code));
const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
const events = (n) => `${n} free event${n === 1 ? "" : "s"}`;
const span = (d) => (d >= 360 ? "a year" : d >= 28 && d % 30 === 0 ? `${d / 30} month${d === 30 ? "" : "s"}` : `${d} days`);

async function load() {
  error.value = ""; failure.value = ""; promo.value = null; mine.value = null; org.value = null; already.value = false;
  if (!code.value) return;
  loading.value = true;
  try {
    const r = await HostApi.hostPromo(code.value);
    promo.value = r.promo; mine.value = r.mine; org.value = r.org;
    already.value = !!r.mine; // you are looking at a claim that was made before
    if (r.mine) clearPendingHostCode();
  } catch (e) {
    error.value = e.message;
    if (e.code === "signed_out") { failure.value = "signedout"; savePendingHostCode(code.value); }
    else if (["details_required", "terms_required", "no_org"].includes(e.code)) { failure.value = "account"; savePendingHostCode(code.value); }
    else failure.value = e.code === "bad_code" ? "bad_code" : "other";
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(() => route.params.code, load);

async function claim() {
  if (claiming.value || mine.value) return;
  error.value = ""; claiming.value = true;
  try {
    const r = await HostApi.hostRedeem(code.value);
    promo.value = r.promo; mine.value = r.mine; org.value = r.org; remaining.value = r.credits?.remaining ?? null;
    already.value = !!r.already;
    clearPendingHostCode();
  } catch (e) {
    error.value = e.message;
    if (e.code === "bad_code") { failure.value = "bad_code"; promo.value = null; }
  } finally {
    claiming.value = false;
  }
}

function submitTyped() {
  const c = cleanHostCode(typed.value);
  if (c) router.push(`/redeem/${c}`);
}
</script>

<template>
  <div class="wide-col stack-3 host-redeem" style="max-width:560px">
    <div class="page-head">
      <router-link to="/billing" class="small muted">‹ Billing</router-link>
      <h1 style="margin-top:8px">Promo code</h1>
      <p class="sub">A code gives your organisation free events.</p>
    </div>

    <!-- No code in the link: type one -->
    <form v-if="!code" class="stack" @submit.prevent="submitTyped">
      <label class="label" for="hp-code">Your code</label>
      <input id="hp-code" v-model="typed" type="text" placeholder="e.g. ABCD1234" autocapitalize="characters" autocomplete="off"
             spellcheck="false" maxlength="24" style="text-transform:uppercase;letter-spacing:.2em;font-size:22px;text-align:center" />
      <button class="btn btn-primary" :disabled="cleanHostCode(typed).length < 4">Continue</button>
      <p class="small muted" style="margin:0">Codes that give a person Lanyard Plus are redeemed on
        <a :href="MAIN_ORIGIN + '/redeem'" style="text-decoration:underline">the main site</a>, not here.</p>
    </form>

    <p v-else-if="loading" class="muted">Checking the code…</p>

    <!-- Not signed in, or setup not finished -->
    <div v-else-if="failure === 'signedout'" class="stack-2" role="status">
      <h2>Sign in first</h2>
      <p class="muted">Sign in to the host portal, and we'll bring you back to add this code to your organisation.</p>
      <router-link to="/" class="btn btn-primary">Sign in</router-link>
    </div>
    <div v-else-if="failure === 'account'" class="stack-2" role="status">
      <h2>Finish setting up first</h2>
      <p class="muted">{{ error }} Then we'll bring you back to this code.</p>
      <router-link to="/" class="btn btn-primary">Go to the host portal</router-link>
    </div>

    <!-- A code that cannot be used: one answer for every reason -->
    <div v-else-if="!promo" class="stack-2">
      <h2>That didn't work</h2>
      <p class="muted" role="alert">{{ error || "That code can't be used." }}</p>
      <p class="small muted" style="margin:0">Codes that give a person Lanyard Plus are redeemed on
        <a :href="MAIN_ORIGIN + '/redeem'" style="text-decoration:underline">the main site</a>, not here.</p>
      <router-link to="/redeem" class="btn">Type a different code</router-link>
    </div>

    <template v-else>
      <section class="ticket" aria-label="Your code">
        <span class="label">Code {{ promo.code }}</span>
        <p class="ticket-reward">Add {{ events(promo.credits) }}<template v-if="org"> to {{ org.name }}</template></p>
        <p class="ticket-count">They last {{ span(promo.days) }} from the day they are added.</p>
        <p v-if="promo.left != null && !mine" class="ticket-count tnum"><strong>{{ promo.left }}</strong> left</p>
        <p v-if="promo.expiresAt && !mine" class="ticket-count small">Claim it before {{ fmtDate(promo.expiresAt) }}.</p>
      </section>

      <!-- Result -->
      <section v-if="mine" class="stack-2" role="status">
        <template v-if="mine.held">
          <h2>{{ already ? "You already used this code" : "Held until your organisation is approved" }}</h2>
          <p>Your application is still being reviewed. We're keeping <strong>{{ events(mine.credits) }}</strong> for you,
            and they are added as soon as an admin approves {{ org?.name || "your organisation" }}. You don't need to do anything.</p>
        </template>
        <template v-else>
          <h2>{{ already ? "Your organisation already used this code" : "Added." }}</h2>
          <p><strong>{{ events(mine.credits) }}</strong> {{ already ? "were added to" : "are now on" }} {{ org ? org.name : "your organisation" }}.
            <template v-if="remaining != null">You have {{ remaining }} event credit{{ remaining === 1 ? "" : "s" }} in all.</template></p>
          <p v-if="mine.grantedAt" class="small muted" style="margin:0">Added on {{ fmtDate(mine.grantedAt) }}. A code can be used once for each organisation.</p>
        </template>
        <div class="btn-row">
          <router-link to="/" class="btn btn-primary">My events</router-link>
          <router-link to="/billing" class="btn">Billing</router-link>
        </div>
      </section>

      <!-- Not yet claimed: ask first, because credits are money -->
      <section v-else class="stack-2">
        <p v-if="org && org.status === 'pending'" class="notice small" role="status">
          Your application is still being reviewed. You can use this code now: we hold the events and add them as soon as you're approved.
        </p>
        <p v-if="error" class="error-text" role="alert">{{ error }}</p>
        <button class="btn btn-primary" :disabled="claiming" @click="claim">
          {{ claiming ? "Adding…" : org && org.status === 'pending' ? `Hold ${events(promo.credits)}` : `Add ${events(promo.credits)}` }}
        </button>
        <p class="small muted" style="margin:0">A code can be used once for each organisation, and once for each host account.</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.ticket {
  border: 1.5px solid var(--ink); border-radius: var(--radius); padding: 18px 20px;
  background: var(--paper-raised); position: relative;
  border-left: 10px solid var(--strap);
}
.ticket-reward { font-size: 26px; font-weight: 700; line-height: 1.15; margin: 6px 0 4px; letter-spacing: -.01em; }
.ticket-count { margin: 0; color: var(--graphite); }
.ticket-count strong { color: var(--ink); font-size: 20px; }
.host-redeem h2 { margin: 0; }
</style>
