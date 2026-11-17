<script setup>
// /redeem/CODE — what the poster QR opens. A code needs a card and a confirmed
// email (one verified address per account keeps it fair), so this page walks
// someone through whichever of those they're missing, then claims it for them.
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Api } from "../lib/api";
import { homePath, me, refreshMe } from "../lib/store";
import { savePendingCode, clearPendingCode, pendingCode } from "../lib/redeem";
import EmailSetup from "../components/EmailSetup.vue";
document.title = "Redeem a code | Lanyard";

const route = useRoute();
const router = useRouter();

const typed = ref("");
const promo = ref(null);
const mine = ref(null);
const planUntil = ref(null);
const loading = ref(false);
const claiming = ref(false);
const error = ref("");

const code = computed(() => String(route.params.code || "").toUpperCase().replace(/[^A-Z0-9]/g, ""));
const step = computed(() => {
  if (mine.value) return "result";
  if (!promo.value) return "";
  if (!me.profile) return "card";
  if (!me.user?.emailVerified) return "email";
  return "claim";
});
const reward = computed(() => {
  const d = promo.value?.days || 0;
  const span = d >= 360 ? "a year" : d >= 28 && d % 30 === 0 ? `${d / 30} month${d === 30 ? "" : "s"}` : `${d} days`;
  return `${span} of Lanyard Plus`;
});
const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

async function load() {
  error.value = ""; promo.value = null; mine.value = null;
  if (!code.value) {
    const waiting = pendingCode();
    if (waiting) router.replace(`/redeem/${waiting}`);
    return;
  }
  loading.value = true;
  try {
    const r = await Api.promo(code.value);
    promo.value = r.promo; mine.value = r.mine;
    if (r.mine) clearPendingCode();
    else savePendingCode(code.value); // survives the trip through sign-up
  } catch (e) {
    error.value = e.message;
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
    const r = await Api.redeem(code.value);
    promo.value = r.promo; mine.value = r.mine; planUntil.value = r.planUntil ?? null;
    clearPendingCode();
    refreshMe().catch(() => {});
  } catch (e) {
    error.value = e.message;
  } finally {
    claiming.value = false;
  }
}
// Once they've got a card and a confirmed email, claim straight away — they
// already said yes by coming here.
watch(step, (s) => { if (s === "claim") claim(); }, { immediate: true });

function go(path) {
  savePendingCode(code.value);
  router.push(path);
}
function submitTyped() {
  const c = typed.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c) router.push(`/redeem/${c}`);
}
</script>

<template>
  <div class="strap-rail"></div>
  <main class="app-col stack-3 redeem">
    <header class="profile-top">
      <router-link :to="homePath()" class="wordmark">lanyard<b>.</b></router-link>
      <router-link v-if="me.profile" to="/app" class="topbar-link">My card</router-link>
    </header>

    <!-- No code in the link: type one -->
    <template v-if="!code">
      <div class="page-head">
        <span class="label">Redeem</span>
        <h1>Got a code?</h1>
        <p class="sub">From a poster, a society or a friend. Type it in.</p>
      </div>
      <form class="stack" @submit.prevent="submitTyped">
        <input v-model="typed" type="text" aria-label="Code" placeholder="e.g. ABCD1234" autocapitalize="characters" autocomplete="off"
               spellcheck="false" maxlength="24" style="text-transform:uppercase;letter-spacing:.2em;font-size:22px;text-align:center" />
        <button class="btn btn-primary" :disabled="typed.replace(/[^a-z0-9]/gi, '').length < 4">Continue</button>
      </form>
    </template>

    <div v-else-if="loading" class="sk-wrap" aria-busy="true"><b class="visually-hidden" role="status">Checking the code…</b><span class="sk sk-title"></span><span class="sk sk-line"></span><span class="sk sk-line s"></span><span class="sk sk-box"></span><a class="sk-slow" href="">Try again</a></div>

    <div v-else-if="!promo" class="stack-2">
      <h1>Hmm, that didn't work</h1>
      <p class="muted">{{ error || "That code doesn't exist." }}</p>
      <router-link to="/redeem" class="btn">Type a different code</router-link>
    </div>

    <template v-else>
      <section class="ticket" aria-label="Your code">
        <span class="label">Code {{ promo.code }}</span>
        <p class="ticket-reward">{{ reward }}</p>
        <p v-if="promo.max" class="ticket-count tnum">
          <template v-if="promo.left > 0"><strong>{{ promo.left }}</strong> of {{ promo.max }} left</template>
          <template v-else>All {{ promo.max }} have been claimed</template>
        </p>
        <p v-else class="ticket-count">For everyone who claims it<template v-if="promo.expiresAt"> before {{ fmtDate(promo.expiresAt) }}</template></p>
      </section>

      <!-- Result -->
      <section v-if="step === 'result'" class="stack-2" role="status">
        <template v-if="mine.granted">
          <h1>It's yours.</h1>
          <p>You were <strong>#{{ mine.position }}</strong><template v-if="mine.max"> of {{ mine.max }}</template>. Lanyard Plus is on<template v-if="planUntil"> until {{ fmtDate(planUntil) }}</template>.</p>
          <ul class="small plan-list">
            <li>Up to 12 cards, one for each kind of room</li>
            <li>Custom strap colours</li>
            <li>Choose your own card code, like your name</li>
          </ul>
          <router-link to="/app" class="btn btn-primary">Go to my card</router-link>
        </template>
        <template v-else>
          <h1>So close.</h1>
          <p>You were <strong>#{{ mine.position }}</strong> to try this code<template v-if="mine.max">, and the first {{ mine.max }} have gone</template>.</p>
          <p class="small muted">You're on the list to hear first when Plus opens. Your card and everything else in Lanyard is free, and stays free.</p>
          <router-link to="/app" class="btn btn-primary">Go to my card</router-link>
        </template>
      </section>

      <!-- Step: make a card -->
      <section v-else-if="step === 'card'" class="stack-2">
        <h1>Claim it in two steps</h1>
        <ol class="small redeem-steps">
          <li><strong>Make your card.</strong> About a minute: your name, course and what people can come to you for.</li>
          <li><strong>Confirm your email.</strong> One code per person, so we check it's you.</li>
        </ol>
        <p class="small muted" style="margin:0">We'll bring you back here and claim it for you.</p>
        <button class="btn btn-primary" @click="go('/app/welcome')">Make my card</button>
        <button class="btn" @click="go('/signin')">I already have a card</button>
      </section>

      <!-- Step: confirm email -->
      <section v-else-if="step === 'email'" class="stack-2">
        <h1>Last step: your email</h1>
        <p class="small muted" style="margin:0">One per person, so we check it's you. It also gets you back into your card if you lose your phone.</p>
        <div class="panel"><EmailSetup /></div>
      </section>

      <!-- Step: claiming -->
      <section v-else-if="step === 'claim'" class="stack-2">
        <p class="muted" role="status">{{ claiming ? "Claiming…" : "" }}</p>
        <button v-if="!claiming && error" class="btn btn-primary" @click="claim">Try again</button>
      </section>

      <p v-if="error && step !== 'result'" class="error-text" role="alert">{{ error }}</p>
    </template>
  </main>
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
.redeem-steps { margin: 0; padding-left: 20px; display: grid; gap: 8px; }
.redeem h1 { margin: 0; }
</style>
