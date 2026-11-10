<script setup>
// The welcome steps (F14): one question a screen, each saved to the server
// as it is answered, so a person can close the tab and carry on from any device.
// Not an /app page: no tab bar, no Terms pop-up on top and no account banner,
// so nothing competes with the question. Steps are in src/components/welcome/.
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ensureMe, me, homePath } from "../lib/store";
import { api } from "../lib/api";

const route = useRoute();
const router = useRouter();

const LAST = 6;
const STEPS = [
  { id: 1, title: "You" },
  { id: 2, title: "Student or working" },
  { id: 3, title: "What you do" },
  { id: 4, title: "Links" },
  { id: 5, title: "Save your card" },
  { id: 6, title: "Done" },
];
// Steps 2 to 5 can be skipped. Step 1 needs a name, and step 6 is the end.
const SKIPPABLE = [2, 3, 4, 5];

const ready = ref(false);
const busy = ref(false);
const error = ref("");
const stepEl = ref(null);

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
});

// Tell the server where they are, so any device resumes here. Only for people who
// are in the steps; the server ignores everyone else and the funnel is not counted twice.
function remember(to) {
  if (!inProgress.value) return;
  me.profile.onboarding_step = to;
  me.profile.onboarding_max = Math.max(me.profile.onboarding_max || 0, to);
  api("/api/onboarding", "PUT", { step: to }).catch(() => { /* the next step saves it again */ });
}
function go(to) {
  error.value = "";
  router.push({ query: { ...route.query, step: String(to) } });
  remember(to);
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
    <p v-if="!ready" class="muted" role="status">Loading…</p>
    <template v-else>
      <header class="welcome-top">
        <button type="button" class="link-btn welcome-nav" @click="back">‹ {{ stepNo === 1 ? "Leave" : "Back" }}</button>
        <span class="label tnum" aria-live="polite">Step {{ stepNo }} of {{ LAST }}</span>
        <button v-if="SKIPPABLE.includes(stepNo)" type="button" class="link-btn welcome-nav" @click="skip">Skip</button>
        <span v-else class="welcome-nav" aria-hidden="true"></span>
      </header>
      <div class="welcome-bar" role="progressbar" aria-label="Your progress" :aria-valuenow="stepNo" aria-valuemin="1" :aria-valuemax="LAST"
           :aria-valuetext="`Step ${stepNo} of ${LAST}: ${step.title}`">
        <span :style="{ width: `${(stepNo / LAST) * 100}%` }"></span>
      </div>

      <section class="welcome-step stack-2" :aria-label="step.title">
        <component :is="'div'" ref="stepEl">
          <p class="muted">{{ step.title }}</p>
        </component>
        <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      </section>

      <div v-if="stepNo < LAST" class="thumb-bar">
        <div class="inner">
          <button type="button" class="btn btn-primary" :disabled="busy" @click="next">{{ busy ? "Saving…" : "Continue" }}</button>
        </div>
      </div>
    </template>
  </main>
</template>

<style scoped>
.welcome { padding-bottom: calc(110px + env(safe-area-inset-bottom, 0px)); }
.welcome-top { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; min-height: 44px; }
.welcome-nav { min-height: 44px; display: inline-flex; align-items: center; padding: 0; }
.welcome-top > :last-child { justify-self: end; }
.welcome-bar { height: 6px; background: var(--rule); border-radius: 3px; overflow: hidden; margin: 4px 0 24px; }
.welcome-bar span { display: block; height: 100%; background: var(--strap); }
</style>
