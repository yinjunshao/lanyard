<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { me, refreshMe } from "../lib/store";
import { Api } from "../lib/api";
import Badge from "../components/Badge.vue";
import UiSelect from "../components/ui/UiSelect.vue";
import Avatar from "../components/Avatar.vue";
import RatingInput from "../components/RatingInput.vue";
import { downloadBadge } from "../lib/qr";
import { relativeDay } from "../lib/time";
import InstallGuide from "../components/InstallGuide.vue";
import { isStandalone, platform, installDismissed, dismissInstall, installedHere, relatedAppInstalled } from "../lib/install";

const router = useRouter();
const route = useRoute();

// Just made your card: a short "how it works" the first time.
const welcome = ref(route.query.welcome === "1");
function closeWelcome() {
  welcome.value = false;
  router.replace({ query: {} });
}
// On a phone only, and only once: never again after "Not now" or "I've added
// it", once this account has opened Lanyard from a home-screen icon, or when
// Android reports it's installed. (On a computer it's just in Settings.)
const showInstall = ref(false);
if (!isStandalone() && platform() !== "desktop" && !installDismissed() && !installedHere() && !me.user?.appInstalled) {
  relatedAppInstalled().then((yes) => { showInstall.value = !yes; });
}
function hideInstall() { dismissInstall(); showInstall.value = false; }

// "Finish your card": what's missing from the profile, each a tap away from
// the right field. People who scan you see these, so a bare card wastes the scan.
const STEPS = [
  { key: "photo", label: "Add a photo", why: "so people remember your face", done: (p) => !!p.photo },
  { key: "headline", label: "Say what you do", why: "one line on your badge", done: (p) => !!p.headline?.trim() },
  { key: "tags", label: "Add what people can come to you for", why: "the first thing people read", done: (p) => (p.tags || []).length > 0 },
  { key: "course", label: "Add your course and university", why: "", done: (p) => !!(p.course?.trim() && p.uni?.trim()) },
  { key: "links", label: "Add a link", why: "LinkedIn, GitHub, a portfolio", done: (p) => Object.keys(p.links || {}).length > 0 },
];
const steps = computed(() => (me.profile ? STEPS.map((s) => ({ ...s, ok: s.done(me.profile) })) : []));
const doneCount = computed(() => steps.value.filter((s) => s.ok).length);
const SNOOZE_KEY = "lanyard-finish-card-snoozed";
const snoozed = ref((() => { try { return Date.now() - Number(localStorage.getItem(SNOOZE_KEY) || 0) < 3 * 864e5; } catch { return false; } })());
const showFinish = computed(() => !welcome.value && steps.value.length && doneCount.value < steps.value.length && !snoozed.value);
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

const url = computed(() => {
  if (!card.value) return "";
  const base = `${location.origin}/c/${card.value.cardId}`;
  return personal.value.active ? `${base}?n=${personal.value.active.token}` : base;
});

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

// The card's code is permanent. Anyone can swap it for a random one (if it got
// out somewhere); Plus members can choose their own, once a week.
const isPlus = computed(() => me.plan?.tier === "plus");
const rotating = ref(false);
const confirmRotate = ref(false);
const codeMsg = ref("");
async function newCode() {
  codeMsg.value = "";
  if (!confirmRotate.value) {
    confirmRotate.value = true;
    setTimeout(() => (confirmRotate.value = false), 4000);
    return;
  }
  rotating.value = true;
  try {
    await Api.rotateCode(card.value.cardId);
    await refreshMe();
  } catch (e) {
    codeMsg.value = e.message;
  } finally {
    rotating.value = false;
    confirmRotate.value = false;
  }
}
const customOpen = ref(false);
const customDraft = ref("");
const customBusy = ref(false);
const nextChange = computed(() => card.value?.codeNextChangeAt || null);
const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
async function saveCustom() {
  codeMsg.value = "";
  customBusy.value = true;
  try {
    await Api.customCode(card.value.cardId, customDraft.value);
    await refreshMe();
    customOpen.value = false;
    customDraft.value = "";
  } catch (e) {
    codeMsg.value = e.message;
  } finally {
    customBusy.value = false;
  }
}

async function copyLink() {
  await navigator.clipboard.writeText(url.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1600);
}
function savePng() {
  if (card.value) return downloadBadge(card.value, url.value);
}
async function share() {
  if (navigator.share) {
    try { await navigator.share({ title: "My Lanyard card", url: url.value }); } catch {}
  } else {
    copyLink();
  }
}
</script>

<template>
  <div v-if="!card" class="stack-3">
    <div class="page-head">
      <span class="label">My card</span>
      <h1>Make your badge</h1>
      <p class="sub">Fill in your details once, then show your card at every event.</p>
    </div>
    <router-link to="/app/profile" class="btn btn-primary">Set up your card</router-link>
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

    <section v-if="welcome" class="panel stack-2" aria-label="Your card is ready">
      <div class="spread">
        <strong>Your card is ready</strong>
        <button type="button" class="link-btn small" @click="closeWelcome">Got it</button>
      </div>
      <ol class="small welcome-steps">
        <li><strong>Show it.</strong> At an event, open this page and hold the card to brighten it.</li>
        <li><strong>They scan, you're connected.</strong> They tap Connect, and you can take a selfie together.</li>
        <li><strong>Remember them.</strong> Everyone you meet is under People, with where you met and your notes.</li>
      </ol>
      <p class="small muted" style="margin:0">Scanning someone else? Use the Scan tab, or type the code under their QR.</p>
      <router-link v-if="doneCount < steps.length" to="/app/profile#photo" class="btn">Finish your card ({{ doneCount }} of {{ steps.length }} done)</router-link>
    </section>

    <section v-if="showFinish" class="panel stack-2 finish" aria-label="Finish your card">
      <div class="spread">
        <strong>Finish your card</strong>
        <span class="small muted tnum">{{ doneCount }} of {{ steps.length }} done</span>
      </div>
      <div class="finish-bar" role="progressbar" :aria-valuenow="doneCount" aria-valuemin="0" :aria-valuemax="steps.length">
        <span :style="{ width: `${(doneCount / steps.length) * 100}%` }"></span>
      </div>
      <ul class="finish-list">
        <li v-for="st in steps" :key="st.key" :class="{ ok: st.ok }">
          <span class="finish-tick" aria-hidden="true">{{ st.ok ? "✓" : "" }}</span>
          <router-link v-if="!st.ok" :to="`/app/profile#${st.key}`">{{ st.label }}<span v-if="st.why" class="small muted"> — {{ st.why }}</span></router-link>
          <span v-else class="muted">{{ st.label }}</span>
        </li>
      </ul>
      <button type="button" class="link-btn small" style="text-align:left" @click="snoozeFinish">Remind me later</button>
    </section>

    <section v-else-if="showInstall && !welcome" class="panel" aria-label="Add to home screen">
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
      <Badge :view="card" :url="url" />
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

    <section class="panel stack-2" aria-label="Card code">
      <div class="spread">
        <span class="label">Card code</span>
        <span v-if="card.codeCustom" class="small muted">Chosen by you</span>
      </div>
      <div class="code-glyph tnum" style="font-size:32px;letter-spacing:.3em;text-align:center">{{ card.code }}</div>
      <p class="small muted">
        If someone can't scan, they type this under Scan. It stays the same, so
        it's fine to print it or put it on a slide.
      </p>

      <template v-if="isPlus">
        <p v-if="nextChange" class="small muted" style="margin:0">You can choose a new code on {{ fmtDate(nextChange) }}.</p>
        <button v-else-if="!customOpen" class="btn" @click="customOpen = true; customDraft = ''">Choose your own code</button>
        <form v-if="customOpen && !nextChange" class="stack" @submit.prevent="saveCustom">
          <label for="custom-code" class="small">4 to 8 letters or numbers. You can change it once a week, and your old code keeps working for 30 days.</label>
          <input id="custom-code" v-model="customDraft" type="text" maxlength="8" autocapitalize="characters" autocomplete="off" spellcheck="false"
                 placeholder="ALEX24" style="text-transform:uppercase;letter-spacing:.2em" />
          <div class="btn-row">
            <button type="submit" class="btn btn-primary" :disabled="customBusy || customDraft.replace(/[^a-z0-9]/gi, '').length < 4">
              {{ customBusy ? "Saving…" : "Use this code" }}
            </button>
            <button type="button" class="btn" @click="customOpen = false">Cancel</button>
          </div>
        </form>
      </template>
      <router-link v-else to="/app/settings#plus" class="small link-btn" style="text-align:left">
        Want a code you choose, like your name? That comes with Lanyard Plus.
      </router-link>

      <button type="button" class="link-btn small" style="text-align:left" :disabled="rotating" @click="newCode">
        {{ confirmRotate ? "Tap again: your current code stops working straight away" : "Replace with a random code" }}
      </button>
      <p v-if="codeMsg" class="error-text small" role="alert">{{ codeMsg }}</p>
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
.welcome-steps { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
.finish { border-left: 4px solid var(--strap); }
.finish-bar { height: 6px; background: var(--rule); border-radius: 3px; overflow: hidden; }
.finish-bar span { display: block; height: 100%; background: var(--strap); }
.finish-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.finish-list li { display: flex; gap: 10px; align-items: baseline; }
.finish-list a { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
.finish-tick { flex: 0 0 18px; height: 18px; border: 1.5px solid var(--ink); border-radius: 4px; display: inline-grid; place-items: center; font-size: 12px; font-weight: 700; transform: translateY(3px); }
.finish-list li.ok .finish-tick { background: var(--ink); color: var(--paper); }
</style>
