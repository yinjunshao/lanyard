<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { me } from "../lib/store";
import { Api } from "../lib/api";
import Badge from "../components/Badge.vue";
import UiSelect from "../components/ui/UiSelect.vue";
import Avatar from "../components/Avatar.vue";
import RatingInput from "../components/RatingInput.vue";
import { downloadBadge } from "../lib/qr";
import { relativeDay } from "../lib/time";
import { subtitleParts, withSource } from "../lib/profile";
import InstallGuide, { offerInstall } from "../components/InstallGuide.vue";
import { dismissInstall } from "../lib/install";

const router = useRouter();

// Still in the welcome steps (a new card, or a guest who connected first)? Carry on there, unless
// they chose Leave in this session. The page draws nothing meanwhile.
let left = false;
try { left = sessionStorage.getItem("lanyard-onboarding-left") === "1"; } catch { /* not remembered */ }
const redirecting = !!me.profile && me.profile.onboarding_step != null && !left;
if (redirecting) router.replace("/app/welcome");

// On a phone only, and only once (the rules are in offerInstall).
const showInstall = ref(false);
offerInstall(me.user).then((yes) => { showInstall.value = yes; });
function hideInstall() { dismissInstall(); showInstall.value = false; }

// "Finish your card": only what is still missing from the profile, each a tap away from its
// welcome step (F14). People who scan you see these, so a bare card wastes the scan.
const STEPS = [
  { key: "photo", step: 1, label: "Add a photo", why: "so people remember your face", done: (p) => !!p.photo },
  { key: "course", step: 2, label: "Add your course and university", why: "", done: (p) => !!(p.course?.trim() && p.uni?.trim()) },
  { key: "headline", step: 3, label: "Say what you do", why: "one line on your badge", done: (p) => !!p.headline?.trim() },
  { key: "tags", step: 3, label: "Add what people can come to you for", why: "the first thing people read", done: (p) => (p.tags || []).length > 0 },
  { key: "links", step: 4, label: "Add a link", why: "LinkedIn, GitHub, a portfolio", done: (p) => Object.keys(p.links || {}).length > 0 },
];
// In Career mode the course-and-university step asks for company and role instead.
const CAREER_STEP = { key: "company", step: 2, label: "Add your company and role", why: "", done: (p) => !!(p.company?.trim() && p.role?.trim()) };
const steps = computed(() => (me.profile
  ? STEPS.map((s) => (s.key === "course" && me.profile.mode === "career" ? CAREER_STEP : s)).map((s) => ({ ...s, ok: s.done(me.profile) }))
  : []));
const doneCount = computed(() => steps.value.filter((s) => s.ok).length);
const SNOOZE_KEY = "lanyard-finish-card-snoozed";
const snoozed = ref((() => { try { return Date.now() - Number(localStorage.getItem(SNOOZE_KEY) || 0) < 3 * 864e5; } catch { return false; } })());
// Still in the welcome steps but left them for now: one way back in, not the list.
const inSteps = computed(() => me.profile?.onboarding_step != null);
const missing = computed(() => steps.value.filter((s) => !s.ok));
const showFinish = computed(() => !inSteps.value && missing.value.length > 0 && !snoozed.value);
function snoozeFinish() {
  snoozed.value = true;
  try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch { /* not remembered */ }
}

// Things waiting for you: feedback for events you went to, people to follow up.
const home = ref({ followups: [], feedback: [] });
Api.home().then((h) => { home.value = h; }).catch(() => {});
const quick = ref(null);
watch(quick, (n) => {
  const ev = home.value.feedback[0];
  if (n && ev) router.push({ path: `/app/feedback/${ev.eventId}`, query: { overall: n } });
});
async function doneFollowup(f) {
  home.value.followups = home.value.followups.filter((x) => x !== f);
  try { await Api.connectionMeta(f.connectionId, { followedUp: true }); } catch { /* shows again next time */ }
}

const selectedId = ref(me.cards[0]?.cardId || null);
const cardOptions = computed(() => me.cards.map((c) => ({ value: c.cardId, label: `${c.name} · ${c.code}` })));
const card = computed(() =>
  me.cards.find((c) => c.cardId === selectedId.value) || me.cards[0]
);
// A note attached for the next person rides in the QR's URL as ?n=<token>.
const personal = ref({ active: null, last: null });
const draft = ref("");
const noteBusy = ref(false);
const noteError = ref("");
const NOTE_MAX = 200;

const subtitle = computed(() => subtitleParts(card.value?.profile, { year: true }).join("  ·  "));
const url = computed(() => {
  if (!card.value) return "";
  const base = `${location.origin}/c/${card.value.cardId}`;
  return personal.value.active ? `${base}?n=${personal.value.active.token}` : base;
});
// The QR carries ?s=q and a copied or shared link ?s=l, so the person who opens it
// can see how you met (F13). The address bar drops it again after it is read.
const qrUrl = computed(() => (url.value ? withSource(url.value, "q") : ""));
const linkUrl = computed(() => (url.value ? withSource(url.value, "l") : ""));

let timer = null;
async function loadPersonal() {
  if (!card.value) return;
  try { personal.value = await Api.personalNote(card.value.cardId); } catch { /* offline */ }
  // While a note is waiting, watch for it being picked up so the QR resets
  // itself to a plain one the moment someone has scanned it.
  clearTimeout(timer);
  if (personal.value.active) timer = setTimeout(loadPersonal, 5000);
}
watch(() => card.value?.cardId, () => { draft.value = ""; loadPersonal(); }, { immediate: true });
onBeforeUnmount(() => clearTimeout(timer));

async function attachNote() {
  noteError.value = "";
  if (!draft.value.trim()) return;
  noteBusy.value = true;
  try {
    await Api.setPersonalNote(card.value.cardId, draft.value.trim());
    draft.value = "";
    await loadPersonal();
  } catch (e) {
    noteError.value = e.message;
  } finally {
    noteBusy.value = false;
  }
}
async function removeNote() {
  await Api.clearPersonalNote(card.value.cardId);
  await loadPersonal();
}
const fmtAt = (t) => new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const copied = ref(false);
const bright = ref(false);

async function copyLink() {
  await navigator.clipboard.writeText(linkUrl.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1600);
}
function savePng() {
  if (card.value) return downloadBadge({ ...card.value, subtitle: subtitle.value }, qrUrl.value);
}
async function share() {
  if (navigator.share) {
    try { await navigator.share({ title: "My Lanyard card", url: linkUrl.value }); } catch {}
  } else {
    copyLink();
  }
}
</script>

<template>
  <div v-if="redirecting" aria-busy="true"></div>
  <div v-else-if="!card" class="stack-3">
    <div class="page-head">
      <span class="label">My card</span>
      <h1>Make your badge</h1>
      <p class="sub">Fill in your details once, then show your card at every event.</p>
    </div>
    <router-link to="/app/welcome" class="btn btn-primary">Set up your card</router-link>
  </div>

  <div v-else class="stack-3">
    <div class="card-head">
      <div>
        <span class="label">My card</span>
        <h1 style="margin-top:4px">Your badge</h1>
      </div>
      <div class="card-actions">
        <router-link to="/app/profile" class="btn-quiet">Edit profile</router-link>
        <router-link to="/app/cards" class="btn-quiet">Cards</router-link>
      </div>
    </div>

    <section v-if="inSteps" class="panel stack-2 finish" aria-label="Finish your card">
      <strong>Your card isn't finished</strong>
      <p class="small muted" style="margin:0">A few quick questions, one at a time. You can skip any of them.</p>
      <router-link to="/app/welcome" class="btn">Pick up where you left off</router-link>
    </section>

    <section v-else-if="showFinish" class="panel stack-2 finish" aria-label="Finish your card">
      <div class="spread">
        <strong>Finish your card</strong>
        <span class="small muted tnum">{{ doneCount }} of {{ steps.length }} done</span>
      </div>
      <div class="finish-bar" role="progressbar" :aria-valuenow="doneCount" aria-valuemin="0" :aria-valuemax="steps.length">
        <span :style="{ width: `${(doneCount / steps.length) * 100}%` }"></span>
      </div>
      <ul class="finish-list">
        <li v-for="st in missing" :key="st.key">
          <span class="finish-tick" aria-hidden="true"></span>
          <router-link :to="`/app/welcome?step=${st.step}`">{{ st.label }}<span v-if="st.why" class="small muted"> — {{ st.why }}</span></router-link>
        </li>
      </ul>
      <button type="button" class="link-btn small" style="text-align:left" @click="snoozeFinish">Remind me later</button>
    </section>

    <section v-else-if="showInstall" class="panel" aria-label="Add to home screen">
      <InstallGuide heading="Open Lanyard in one tap" @done="hideInstall" />
      <button type="button" class="link-btn small" style="margin-top:8px" @click="hideInstall">Not now</button>
    </section>

    <router-link v-if="!me.user?.claimed" to="/claim" class="panel spread" style="text-decoration:none;color:inherit">
      <span><strong>Save your card</strong><br /><span class="small muted">It only lives in this browser. One tap keeps it safe.</span></span>
      <span class="btn btn-primary" style="width:auto">Save</span>
    </router-link>

    <div
      :style="bright ? 'filter:brightness(1.18) saturate(1.05)' : ''"
      style="transition:none"
      @pointerdown="bright = true"
      @pointerup="bright = false"
      @pointerleave="bright = false"
      @pointercancel="bright = false"
    >
      <Badge :view="card" :url="qrUrl":subtitle="subtitle" />
    </div>

    <p class="small muted" style="text-align:center;margin-top:40px">
      Hold the card to show it at full brightness
    </p>

    <section v-if="home.feedback.length" class="panel stack" aria-label="Feedback">
      <span class="label">How was {{ home.feedback[0].name }}?</span>
      <p class="small muted" style="margin:0">Tap a rating. It's anonymous and takes a minute.</p>
      <RatingInput v-model="quick" :label="`Rate ${home.feedback[0].name}`" size="sm" />
      <router-link v-for="f in home.feedback.slice(1)" :key="f.eventId" :to="`/app/feedback/${f.eventId}`" class="link-btn">
        Give feedback for {{ f.name }}
      </router-link>
    </section>

    <section v-if="home.followups.length" class="panel stack" aria-label="Follow up">
      <span class="label">Follow up</span>
      <div class="list">
        <div v-for="f in home.followups" :key="f.connectionId" class="list-row spread">
          <router-link :to="`/c/${f.cardId}`" class="row" style="flex:1;min-width:0">
            <Avatar class="avatar" :src="f.photo" :alt="f.name" />
            <span style="min-width:0">
              <strong>{{ f.name }}</strong>
              <span class="small muted" style="display:block">Reminder {{ relativeDay(f.remindAt) }}</span>
            </span>
          </router-link>
          <button type="button" class="btn" style="width:auto" :aria-label="`Mark ${f.name} as followed up`" @click="doneFollowup(f)">Done</button>
        </div>
      </div>
    </section>

    <section class="panel stack">
      <span class="label">Note for the next person</span>
      <template v-if="personal.active">
        <p class="profile-quote" style="margin:0">“{{ personal.active.text }}”</p>
        <p class="small muted">
          It's built into the QR above. The next person who connects gets it,
          then the QR goes back to normal.
        </p>
        <button class="btn" @click="removeNote">Remove note</button>
      </template>
      <template v-else>
        <p class="small muted">
          Write something just for the person you're about to meet. It travels
          inside the QR and lands on their account when they connect.
        </p>
        <textarea v-model="draft" :maxlength="NOTE_MAX" aria-label="Note for the next person"
                  placeholder="Great chatting — my CV is on my profile, shout if you want a review."></textarea>
        <div class="spread">
          <span class="small muted">{{ draft.length }}/{{ NOTE_MAX }}</span>
          <button class="btn btn-primary" style="width:auto" :disabled="noteBusy || !draft.trim()" @click="attachNote">
            Attach to QR
          </button>
        </div>
        <p v-if="noteError" class="error-text">{{ noteError }}</p>
        <p v-if="personal.last" class="small muted">
          Last one delivered{{ personal.last.by ? ` to ${personal.last.by}` : "" }} · {{ fmtAt(personal.last.at) }}
        </p>
      </template>
    </section>

    <div class="btn-row">
      <button class="btn" @click="share">{{ copied ? "Link copied" : "Share link" }}</button>
      <button class="btn" @click="savePng">Download PNG</button>
    </div>

    <UiSelect v-model="selectedId" label="Switch card" :options="cardOptions" />
  </div>
</template>

<style scoped>
/* Edit profile and Cards: one row under the heading; beside it from 600px wide. */
.card-head { display: grid; gap: var(--space); }
.card-actions { display: flex; gap: var(--space); }
.card-actions .btn-quiet { flex: 1; }
@media (min-width: 600px) {
  .card-head { grid-template-columns: 1fr auto; align-items: end; }
  .card-actions .btn-quiet { flex: 0 0 auto; min-width: 128px; }
}
.finish { border-left: 4px solid var(--strap); }
.finish-bar { height: 6px; background: var(--rule); border-radius: 3px; overflow: hidden; }
.finish-bar span { display: block; height: 100%; background: var(--strap); }
.finish-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.finish-list li { display: flex; gap: 10px; align-items: baseline; }
.finish-list a { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
.finish-tick { flex: 0 0 18px; height: 18px; border: 1.5px solid var(--ink); border-radius: 4px; display: inline-grid; place-items: center; font-size: 12px; font-weight: 700; transform: translateY(3px); }
</style>
