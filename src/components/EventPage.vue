<script setup>
// The attendee check-in page for one event (F18): everything you see, with no data fetching.
// EventJoin (the real page) and the host's live preview both draw it, so the two cannot
// drift apart. It imports no store and no API: the caller passes in what to show and owns
// the form state (`form`), the error and the check-in itself.
//
//   event    { name, venue, startsAt, info, questions, directoryOn, feedbackOn, theme, strapColor }
//            The theme (formal, night) and the host's strap colour show on the head of the page
//            like a card's strap. An event with the default theme and no colour looks as it always did.
//   sponsors [{ id, name, perk }]
//   form     { name, answers: {key: text}, sponsorConsent: {id: bool}, directoryConsent, agreed, collect, hasEmail }
//            `collect` holds the ticks of an event that collects names (F31), each ticked to start with.
//   event.collects  { organiser, why, items: [{ key, label }] }, present only when the host switched named
//            attendance on. The words come from the Worker (src/lib/collects.js) and are shown as text.
//   showName ask for a name (a guest with no card yet)
//   needsAgree ask for the 18+ and Terms tick (first-timers)
import { computed, ref, watch } from "vue";
const INFO_LABELS = { access: "Access", dress: "Dress code", food: "Food and drink", other: "Good to know" };
const branded = (e) => (e.theme && e.theme !== "default") || !!e.strapColor;
const fmtDate = (t) =>
  t ? new Date(t).toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
  }) : "";

const props = defineProps({
  event: { type: Object, required: true },
  sponsors: { type: Array, default: () => [] },
  form: { type: Object, required: true },
  showName: { type: Boolean, default: false },
  needsAgree: { type: Boolean, default: false },
  error: { type: String, default: "" },
  busy: { type: Boolean, default: false },
});
defineEmits(["checkin"]);

// F31: an event that collects shows one row per item, every one ticked to start with (the owner's
// decision, D038): the person unticks what they do not want to share. The caller normally sets
// form.collect; this makes sure it exists so the real page and the host's preview start the same way.
watch(() => props.event.collects, (c) => {
  if (c && !props.form.collect) props.form.collect = { attendance: true, email: true, card: true };
}, { immediate: true });
const noEmail = (k) => k === "email" && props.form.hasEmail === false; // no verified email: nothing to share
const isOn = (k) => !!props.form.collect?.[k] && (k === "attendance" || (!!props.form.collect.attendance && !noEmail(k)));
// One tick covers everything the host asks for (the owner's request, F40): on shares every item, off shares nothing.
function tickAll(on) {
  props.form.collect = Object.fromEntries((props.event.collects?.items || []).map((i) => [i.key, on && !noEmail(i.key)]));
}
const shareWhat = computed(() => {
  const keys = (props.event.collects?.items || []).map((i) => i.key);
  const extra = [keys.includes("email") && "email", keys.includes("card") && "card"].filter(Boolean);
  return extra.length ? `my name, check-in time, ${extra.join(" and ")}` : "my name and check-in time";
});
// The full list opens in a native dialog: no extra code on this public page.
const info = ref(null);
const infoOpen = () => info.value?.showModal?.();
const infoClose = () => info.value?.close?.();
// What the page says about hosts depends on whether this event keeps a list.
const hostsLine = (e) => (e.collects ? "The organisers see only what you leave ticked below, and never who you connect with." : "Hosts see aggregate numbers only — never who connected with whom.");
const totalsLine = (e) => (e.collects ? "The organisers never see who you connect with." : "The organiser only sees anonymous totals, never who you connect with.");
</script>

<template>
  <div class="stack-3">
    <div v-if="branded(event)" class="profile event-brand" :class="event.theme">
      <div class="profile-strap" :style="event.strapColor ? { background: event.strapColor } : null">
        <span class="profile-strap-word">lanyard</span>
        <span class="profile-strap-card">Event check-in</span>
      </div>
      <div class="profile-body">
        <div class="page-head">
          <h1>{{ event.name }}</h1>
          <p class="sub">
            <span v-if="event.venue">{{ event.venue }} · </span>{{ fmtDate(event.startsAt) }}
          </p>
        </div>
      </div>
    </div>
    <div v-else class="page-head">
      <span class="label">Event check-in</span>
      <h1>{{ event.name }}</h1>
      <p class="sub">
        <span v-if="event.venue">{{ event.venue }} · </span>{{ fmtDate(event.startsAt) }}
      </p>
    </div>

    <dl v-if="event.info && Object.keys(event.info).length" class="panel event-info">
      <template v-for="(v, k) in event.info" :key="k">
        <dt class="label">{{ INFO_LABELS[k] || k }}</dt>
        <dd>{{ v }}</dd>
      </template>
    </dl>

    <div class="notice">
      Checking in unlocks perks and the event album. If you choose to, you can also appear in the attendee room.
      {{ hostsLine(event) + ' ' }}
    </div>

    <label v-if="event.directoryOn" class="checkbox-row" style="margin:4px 0">
      <input type="checkbox" v-model="form.directoryConsent" />
      <span class="small">
        Show me in this event's attendee room to other checked-in people.
      </span>
    </label>

    <div v-if="showName" class="field">
      <label for="name">Your name</label>
      <input id="name" v-model="form.name" type="text" autocomplete="name" />
    </div>

    <div v-for="q in event.questions" :key="q.key" class="field">
      <label :for="q.key">{{ q.label }}</label>
      <input :id="q.key" v-model="form.answers[q.key]" type="text" />
    </div>

    <div v-if="sponsors.length" class="panel stack-2">
      <span class="label">Sponsors</span>
      <label v-for="s in sponsors" :key="s.id" class="checkbox-row">
        <input type="checkbox" v-model="form.sponsorConsent[s.id]" />
        <span class="small">
          Share my name, course and tags with <strong>{{ s.name }}</strong>
          <span v-if="s.perk"> — {{ s.perk }}</span>
        </span>
      </label>
      <p class="small muted">Each sponsor is a separate, optional choice. Never pre-ticked.</p>
    </div>

    <section v-if="event.collects && form.collect" class="panel stack-2" aria-labelledby="collects-h" data-collects>
      <h2 id="collects-h" class="label">This event collects details</h2>
      <!-- One tick for everything the host asks for; the button beside it opens exactly what that is. -->
      <div class="collect-row">
        <label class="checkbox-row collect-tick">
          <input type="checkbox" :checked="isOn('attendance')" data-item="all" @change="tickAll($event.target.checked)" />
          <span class="small">I agree to share {{ shareWhat }} with <strong>{{ event.collects.organiser }}</strong>.</span>
        </label>
        <button type="button" class="collect-info" aria-haspopup="dialog" :aria-label="`What ${event.collects.organiser} collects`" @click="infoOpen">
          <span aria-hidden="true">i</span>
        </button>
      </div>
      <p class="small muted" style="margin:0">Optional: untick it and you can still check in. Change your mind any time on this event's page.</p>

      <dialog ref="info" class="collect-dialog" aria-labelledby="collect-d-h" @click.self="infoClose" data-collect-info>
        <div class="collect-d-body">
          <div class="collect-d-head">
            <h3 id="collect-d-h">What {{ event.collects.organiser }} collects</h3>
            <button type="button" class="icon-btn collect-d-x" aria-label="Close" @click="infoClose">×</button>
          </div>
          <ul class="collect-d-list">
            <li v-for="it in event.collects.items" :key="it.key" :data-item="it.key">{{ it.label }}<span v-if="noEmail(it.key)" class="muted" style="display:block">You have no verified email on your account, so none is shared.</span></li>
          </ul>
          <p class="small" style="margin:0"><span class="muted">Why:</span> {{ event.collects.why }}</p>
          <p class="small muted" style="margin:0">Organisers never see who you connect with. Lanyard deletes the list 12 months after the event. See the
            <router-link to="/privacy" target="_blank">Privacy Policy</router-link>.</p>
          <button type="button" class="btn btn-primary" @click="infoClose">Got it</button>
        </div>
      </dialog>
    </section>

    <label v-if="needsAgree" class="checkbox-row">
      <input v-model="form.agreed" type="checkbox" />
      <span class="small">
        I'm 18 or over and I agree to the <router-link to="/terms" target="_blank">Terms</router-link> and
        <router-link to="/privacy" target="_blank">Privacy Policy</router-link>.
      </span>
    </label>
    <p class="small muted">
      {{ ' ' + totalsLine(event) }}
      <template v-if="event.feedbackOn">After the event you'll be asked for quick, anonymous feedback.</template>
    </p>

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>

    <div class="thumb-bar">
      <div class="inner">
        <button class="btn btn-primary" :disabled="busy" @click="$emit('checkin')">
          {{ busy ? "Checking in…" : "Check in" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.collect-row { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 52px; padding: 6px 6px 6px 12px; border: var(--border); border-radius: var(--radius); background: var(--paper-raised); }
.collect-tick { flex: 1; min-width: 0; align-items: center; cursor: pointer; padding: 6px 0; }
.collect-tick input[type="checkbox"] { margin-top: 0; }
.collect-info {
  flex: none; width: 44px; height: 44px; display: grid; place-items: center; cursor: pointer;
  background: none; border: 0; color: var(--ink); padding: 0;
}
.collect-info span {
  width: 24px; height: 24px; border-radius: 50%; border: 1.5px solid currentColor; display: grid; place-items: center;
  font: italic 700 14px/1 Georgia, serif;
}
.collect-info:focus-visible { outline: 2.5px solid var(--strap); outline-offset: -2px; border-radius: var(--radius); }
.collect-dialog {
  position: fixed; inset: 0; margin: auto; height: fit-content;
  width: min(440px, calc(100% - 32px)); max-height: 85dvh; padding: 0; border: var(--border-ink); border-radius: 14px;
  background: var(--paper); color: var(--ink); box-shadow: var(--shadow-2);
}
.collect-dialog::backdrop { background: rgba(20, 19, 17, 0.55); }
.collect-d-body { display: flex; flex-direction: column; gap: 14px; padding: 18px 22px 22px; }
.collect-d-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.collect-d-head h3 { margin: 6px 0 0; font-size: 20px; line-height: 1.25; }
.collect-d-x { flex: none; width: 44px; height: 44px; margin: -4px -10px 0 0; font-size: 28px; line-height: 1; background: none; border: 0; color: var(--ink); cursor: pointer; }
.collect-d-list { margin: 0; padding-left: 20px; display: grid; gap: 8px; }
.event-info { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; }
.event-info dt { padding-top: 2px; }
.event-info dd { margin: 0; }
.event-brand { margin-bottom: calc(var(--space) * 3); } /* what .page-head gives the plain head; the info panel below has no margin of its own */
.event-brand .page-head { margin: 0; }
.event-brand .page-head h1 { margin: 0; overflow-wrap: anywhere; }
</style>
