<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { me, refreshMe } from "../lib/store";
import { Api } from "../lib/api";
import Badge from "../components/Badge.vue";
import { downloadBadge } from "../lib/qr";

const selectedId = ref(me.cards[0]?.cardId || null);
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

// The 4-character code rotates; show when, and let the owner replace it now.
const codeIn = computed(() => {
  const t = card.value?.codeRotatesAt;
  if (!t) return "";
  const ms = t - Date.now();
  if (ms <= 0) return "soon";
  const h = Math.round(ms / 36e5);
  if (h < 24) return `in ${Math.max(1, h)} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `in ${d} day${d === 1 ? "" : "s"}`;
});
const rotating = ref(false);
const confirmRotate = ref(false);
async function newCode() {
  if (!confirmRotate.value) {
    confirmRotate.value = true;
    setTimeout(() => (confirmRotate.value = false), 4000);
    return;
  }
  rotating.value = true;
  try {
    await Api.rotateCode(card.value.cardId);
    await refreshMe();
  } finally {
    rotating.value = false;
    confirmRotate.value = false;
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
    <div class="spread">
      <div>
        <span class="label">My card</span>
        <h1 style="margin-top:4px">Your badge</h1>
      </div>
      <router-link to="/app/cards" class="topbar-link">Manage</router-link>
    </div>

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

    <section class="panel stack-2">
      <div class="spread">
        <span class="label">Backup code</span>
        <span v-if="codeIn" class="small muted">changes {{ codeIn }}</span>
      </div>
      <div class="code-glyph tnum" style="font-size:32px;letter-spacing:.3em;text-align:center">{{ card.code }}</div>
      <p class="small muted">
        If someone can't scan, they type this under Scan. It changes every few
        days, so an old screenshot of your badge stops working.
      </p>
      <button class="btn" :disabled="rotating" @click="newCode">
        {{ confirmRotate ? "Tap again to replace it now" : "Get a new code now" }}
      </button>
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

    <div class="select-wrap">
      <select v-model="selectedId" aria-label="Switch card" class="small">
        <option v-for="c in me.cards" :key="c.cardId" :value="c.cardId">
          {{ c.name }} · {{ c.code }}
        </option>
      </select>
    </div>
  </div>
</template>
