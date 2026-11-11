<script setup>
// The attendee check-in page for one event (F18): everything you see, with no data fetching.
// EventJoin (the real page) and the host's live preview both draw it, so the two cannot
// drift apart. It imports no store and no API: the caller passes in what to show and owns
// the form state (`form`), the error and the check-in itself.
//
//   event    { name, venue, startsAt, info, questions, directoryOn, feedbackOn }
//   sponsors [{ id, name, perk }]
//   form     { name, answers: {key: text}, sponsorConsent: {id: bool}, directoryConsent, agreed }
//   showName ask for a name (a guest with no card yet)
//   needsAgree ask for the 18+ and Terms tick (first-timers)
const INFO_LABELS = { access: "Access", dress: "Dress code", food: "Food and drink", other: "Good to know" };
const fmtDate = (t) =>
  t ? new Date(t).toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
  }) : "";

defineProps({
  event: { type: Object, required: true },
  sponsors: { type: Array, default: () => [] },
  form: { type: Object, required: true },
  showName: { type: Boolean, default: false },
  needsAgree: { type: Boolean, default: false },
  error: { type: String, default: "" },
  busy: { type: Boolean, default: false },
});
defineEmits(["checkin"]);
</script>

<template>
  <div class="stack-3">
    <div class="page-head">
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
      Hosts see aggregate numbers only — never who connected with whom.
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

    <label v-if="needsAgree" class="checkbox-row">
      <input v-model="form.agreed" type="checkbox" />
      <span class="small">
        I'm 18 or over and I agree to the <router-link to="/terms" target="_blank">Terms</router-link> and
        <router-link to="/privacy" target="_blank">Privacy Policy</router-link>.
      </span>
    </label>
    <p class="small muted">
      The organiser only sees anonymous totals, never who you connect with.
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
.event-info { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; }
.event-info dt { padding-top: 2px; }
.event-info dd { margin: 0; }
</style>
