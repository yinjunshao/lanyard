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
import { watch } from "vue";
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
const locked = (k) => (k !== "attendance" && !props.form.collect?.attendance) || noEmail(k);
function tick(k, on) { props.form.collect = { ...props.form.collect, [k]: on }; }
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
      <h2 id="collects-h" class="label">This event collects</h2>
      <p class="small" style="margin:0"><strong>{{ event.collects.organiser }}</strong> asks for this.
        <span class="muted">Why:</span> {{ event.collects.why }}</p>
      <p class="small muted" style="margin:0">Everything is ticked to start with. Untick anything you don't want to share. You can still check in.</p>
      <label v-for="it in event.collects.items" :key="it.key" class="checkbox-row collect-row" :class="{ locked: locked(it.key) }">
        <input type="checkbox" :checked="isOn(it.key)" :disabled="locked(it.key)" :data-item="it.key" @change="tick(it.key, $event.target.checked)" />
        <span class="small">{{ it.label }}
          <span v-if="noEmail(it.key)" class="muted" style="display:block">You have no verified email on your account, so there is nothing to share.</span></span>
      </label>
      <p class="small muted" style="margin:0">You can change your mind later, on this event's page or in Settings. See the
        <router-link to="/privacy" target="_blank">Privacy Policy</router-link>.</p>
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
.collect-row { width: 100%; min-height: 48px; align-items: center; padding: 10px 12px; border: var(--border); border-radius: var(--radius); background: var(--paper-raised); cursor: pointer; }
.collect-row.locked { cursor: default; opacity: .7; }
.collect-row input[type="checkbox"] { margin-top: 0; }
.event-info { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; }
.event-info dt { padding-top: 2px; }
.event-info dd { margin: 0; }
.event-brand { margin-bottom: calc(var(--space) * 3); } /* what .page-head gives the plain head; the info panel below has no margin of its own */
.event-brand .page-head { margin: 0; }
.event-brand .page-head h1 { margin: 0; overflow-wrap: anywhere; }
</style>
