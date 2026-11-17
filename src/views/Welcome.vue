<script setup>
// The welcome steps (F14): one question a screen, each saved to the server
// as it is answered, so a person can close the tab and carry on from any device.
// Not an /app page: no tab bar, no Terms pop-up on top and no account banner,
// so nothing competes with the question. Steps are in src/components/welcome/.
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ensureMe, me, homePath } from "../lib/store";
import { api } from "../lib/api";
import StepYou from "../components/welcome/StepYou.vue";
import StepMode from "../components/welcome/StepMode.vue";
import StepFor from "../components/welcome/StepFor.vue";
import StepLinks from "../components/welcome/StepLinks.vue";
import StepSave from "../components/welcome/StepSave.vue";
import StepDone from "../components/welcome/StepDone.vue";
import Waiting from "../components/Waiting.vue";
document.title = "Set up your card | Lanyard";

const route = useRoute();
const router = useRouter();

const LAST = 6;
const STEPS = [
  { id: 1, title: "Your name and photo", comp: StepYou },
  { id: 2, title: "Student or working", comp: StepMode },
  { id: 3, title: "What you can help with", comp: StepFor },
  { id: 4, title: "Your links", comp: StepLinks },
  { id: 5, title: "Save your card", comp: StepSave },
  { id: 6, title: "Your card is ready", comp: StepDone },
];
// Steps 2 to 5 can be skipped. Step 1 needs a name, and step 6 is the end. (Step 5 cannot be
// skipped while a promo code is waiting: the email is what lets them claim it.)
const SKIPPABLE = [2, 3, 4, 5];

const ready = ref(false);
const busy = ref(false);
const error = ref("");
const stepEl = ref(null);
const stepBox = ref(null);
const from = ref(""); // a guest who connected first: who they met, for step 1

const profile = computed(() => me.profile);
// In the steps when the server says so (a new card, or a guest who connected first).
// Anyone else arriving here (from "Finish your card") is just adding to a card.
const inProgress = computed(() => profile.value?.onboarding_step != null);

// Where to start: the step the server has, else the first thing still missing.
function firstMissing(p) {
  if (!p) return 1;
  if (!p.photo) return 1;
  if (p.mode === "career" ? !(p.company?.trim() && p.role?.trim()) : !(p.course?.trim() && p.uni?.trim())) return 2;
  if (!p.headline?.trim() || !(p.tags || []).length) return 3;
  if (!Object.keys(p.links || {}).length) return 4;
  return LAST;
}
const clamp = (n) => Math.min(Math.max(Math.trunc(n) || 1, 1), LAST);
const startStep = () => (!profile.value ? 1 : inProgress.value ? clamp(profile.value.onboarding_step) : firstMissing(profile.value));

// The step is in the address (?step=3), so refreshing, and the browser's own Back,
// stay on the right step. Nobody without a card can be past step 1.
const stepNo = computed(() => {
  const asked = Number(route.query.step);
  if (!profile.value) return 1;
  return Number.isInteger(asked) && asked >= 1 ? clamp(asked) : startStep();
});
const step = computed(() => STEPS[stepNo.value - 1]);

onMounted(async () => {
  await ensureMe();
  if (!route.query.step) router.replace({ query: { ...route.query, step: String(startStep()) } });
  ready.value = true;
  remember(stepNo.value); // a guest who connected first is now at step 1: count it
  if (inProgress.value && stepNo.value === 1) {
    api("/api/connections").then((r) => {
      const latest = [...(r.connections || [])].sort((a, b) => b.metAt - a.metAt)[0];
      from.value = (latest?.peer?.name || "").split(/\s+/)[0] || "";
    }).catch(() => { /* the line is only a nicety */ });
  }
});

// Moving to a new step puts the reader at its heading (for a screen reader and the keyboard).
// The server follows the address too, so the browser's own Back button keeps the saved place right.
watch(stepNo, async (n) => {
  remember(n);
  await nextTick();
  const h = stepBox.value?.querySelector("h1");
  if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  window.scrollTo(0, 0);
});

// Tell the server where they are, so any device resumes here. Only for people who
// are in the steps; the server ignores everyone else and the funnel is not counted twice.
function remember(to) {
  if (!inProgress.value) return;
  // The done screen is the end: finish it on the server as soon as it shows, so a closed tab
  // there does not bring the steps back.
  if (to === LAST) {
    me.profile.onboarding_step = null;
    me.profile.onboarding_max = LAST + 1;
    api("/api/onboarding", "PUT", { done: true }).catch(() => { /* My card would ask once more */ });
    return;
  }
  if (me.profile.onboarding_step === to && (me.profile.onboarding_max || 0) >= to) return; // the server has it
  me.profile.onboarding_step = to;
  me.profile.onboarding_max = Math.max(me.profile.onboarding_max || 0, to);
  api("/api/onboarding", "PUT", { step: to }).catch(() => { /* the next step saves it again */ });
}
function go(to) {
  error.value = "";
  router.push({ query: { ...route.query, step: String(to) } });
}
function back() {
  if (stepNo.value > 1) return go(stepNo.value - 1);
  leave();
}
function skip() { go(stepNo.value + 1); }
function leave() {
  // Not a way out of the steps for good: My card asks again next time they are signed in,
  // unless they leave from step 1 with nothing made.
  if (profile.value) { try { sessionStorage.setItem("lanyard-onboarding-left", "1"); } catch { /* not remembered */ } router.push("/app"); }
  else router.push(homePath());
}

async function next() {
  if (busy.value) return;
  error.value = ""; busy.value = true;
  try {
    const ok = stepEl.value?.save ? await stepEl.value.save() : true;
    if (ok !== false) go(stepNo.value + 1);
  } catch (e) {
    error.value = e?.message || "That didn't save. Try again.";
  } finally { busy.value = false; }
}
</script>

<template>
  <div class="strap-rail"></div>
  <main class="app-col welcome">
    <Waiting v-if="!ready" shape="form" :rows="2" title label="Getting your card ready" />
    <template v-else>
      <header class="welcome-top">
        <button type="button" class="link-btn welcome-nav" @click="back">‹ {{ stepNo === 1 ? "Leave" : "Back" }}</button>
        <span class="label tnum" aria-live="polite">Step {{ stepNo }} of {{ LAST }}</span>
        <button v-if="SKIPPABLE.includes(stepNo) && !stepEl?.noSkip" type="button" class="link-btn welcome-nav" @click="skip">Skip</button>
        <span v-else class="welcome-nav" aria-hidden="true"></span>
      </header>
      <div class="welcome-bar" role="progressbar" aria-label="Your progress" :aria-valuenow="stepNo" aria-valuemin="1" :aria-valuemax="LAST"
           :aria-valuetext="`Step ${stepNo} of ${LAST}: ${step.title}`">
        <span :style="{ width: `${(stepNo / LAST) * 100}%` }"></span>
      </div>

      <section class="welcome-step stack-2" :aria-label="step.title">
        <div ref="stepBox">
          <component :is="step.comp" v-if="step.comp" :key="stepNo" ref="stepEl" v-bind="stepNo === 1 ? { from } : {}" />
          <p v-else class="muted">{{ step.title }}</p>
        </div>
        <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      </section>

      <div v-if="stepNo < LAST && !stepEl?.hideContinue" class="thumb-bar">
        <div class="inner">
          <button type="button" class="btn btn-primary" :disabled="busy || stepEl?.ready === false" @click="next">{{ busy ? "Saving…" : "Continue" }}</button>
        </div>
      </div>
    </template>
  </main>
</template>
