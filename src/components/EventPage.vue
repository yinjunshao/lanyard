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
//   form     { name, answers: {key: text}, sponsorConsent: {id: bool}, directoryConsent, collect, hasEmail }
//            `collect` holds the ticks of an event that collects names (F31), each ticked to start with.
//   event.collects  { organiser, why, items: [{ key, label }] }, present only when the host switched named
//            attendance on. The words come from the Worker (src/lib/collects.js) and are shown as text.
//   event.suggestOn  false only when the host switched suggestions off (F60); otherwise the page asks what the person
//            hopes to get from the event (optional) and shows the "Suggest me to people here" tick, on to start with.
//            form.intention and form.suggest hold them; the words are src/lib/suggest.js, which the Worker records.
//   showName ask for a name (a guest with no card yet)
//   needsAgree show the line above Check in saying that pressing it agrees to 18+ and the Terms (first-timers, F51: no tick)
import { computed, ref, watch } from "vue";
import RotatingHint from "./ui/RotatingHint.vue";
import { INTENTION_EXAMPLES } from "../lib/examples";
import { infoRows } from "../lib/eventinfo";
import { INTENTION_LABEL, INTENTION_MAX, SUGGEST_DETAIL, SUGGEST_NOTICE } from "../lib/suggest";
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
// The practical notes: dress code, food and drink (with the options), good to know. Access is not shown (F63).
const rows = computed(() => infoRows(props.event.info));

// F31: an event that collects shows one row per item, every one ticked to start with (the owner's
// decision, D038): the person unticks what they do not want to share. The caller normally sets
// form.collect; this makes sure it exists so the real page and the host's preview start the same way.
watch(() => props.event.collects, (c) => {
  if (c && !props.form.collect) props.form.collect = { attendance: true, email: true, card: true };
}, { immediate: true });
// F60: Suggest me starts ticked (the owner's decision, D054); the person unticks to stay out of other people's lists.
watch(() => props.event.suggestOn, (on) => {
  if (on !== false && props.form.suggest === undefined) props.form.suggest = true;
  if (on !== false && props.form.intention === undefined) props.form.intention = "";
}, { immediate: true });
const [SUGGEST_HEAD, ...SUGGEST_REST] = SUGGEST_NOTICE.split(". ");
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
  <div class="checkin">
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

    <div class="notice">
      Checking in unlocks perks and the event album. If you choose to, you can also appear in the attendee room.
      {{ hostsLine(event) + ' ' }}
    </div>

    <dl v-if="rows.length" class="panel event-info">
      <template v-for="r in rows" :key="r[0]">
        <dt class="label">{{ r[0] }}</dt>
        <dd>{{ r[1] }}</dd>
      </template>
    </dl>

    <!-- Three panels, each there only when it has something to show: About you, At this event, Sharing. -->
    <section v-if="showName || event.questions?.length" class="panel checkin-panel" aria-labelledby="ci-about">
      <h2 id="ci-about" class="label">About you</h2>
      <div v-if="showName" class="field">
        <label for="name">Your name</label>
        <input id="name" v-model="form.name" type="text" autocomplete="name" />
      </div>
      <div v-for="q in event.questions" :key="q.key" class="field">
        <label :for="q.key">{{ q.label }}</label>
        <input :id="q.key" v-model="form.answers[q.key]" type="text" />
      </div>
    </section>

    <section v-if="event.directoryOn || event.suggestOn !== false" class="panel checkin-panel" aria-labelledby="ci-event">
      <h2 id="ci-event" class="label">At this event</h2>
      <label v-if="event.directoryOn" class="checkbox-row tick-row">
        <input type="checkbox" v-model="form.directoryConsent" />
        <span class="small">
          Show me in this event's attendee room to other checked-in people.
        </span>
      </label>
      <div v-if="event.suggestOn !== false" class="checkin-group" data-suggest>
        <h3 id="suggest-h" class="label">Who to meet</h3>
        <div class="field">
          <label for="ev-intention">{{ INTENTION_LABEL }} <span class="muted">(optional)</span></label>
          <RotatingHint :pool="INTENTION_EXAMPLES" :empty="!form.intention" v-slot="{ placeholder }">
            <input id="ev-intention" v-model="form.intention" type="text" :maxlength="INTENTION_MAX" autocomplete="off" :placeholder="placeholder" />
          </RotatingHint>
        </div>
        <label class="checkbox-row tick-row">
          <input type="checkbox" v-model="form.suggest" data-suggest-me />
          <span class="small"><strong>{{ SUGGEST_HEAD }}.</strong> {{ SUGGEST_REST.join(". ") }}</span>
        </label>
        <p class="small muted help">{{ SUGGEST_DETAIL }}</p>
      </div>
    </section>

    <section v-if="sponsors.length || (event.collects && form.collect)" class="panel checkin-panel" aria-labelledby="ci-share">
      <h2 id="ci-share" class="label">Sharing</h2>
      <div v-if="sponsors.length" class="checkin-group">
        <h3 class="label">Sponsors</h3>
        <label v-for="s in sponsors" :key="s.id" class="checkbox-row tick-row">
          <input type="checkbox" v-model="form.sponsorConsent[s.id]" />
          <span class="small">
            Share my name, course and tags with <strong>{{ s.name }}</strong>
            <span v-if="s.perk"> — {{ s.perk }}</span>
          </span>
        </label>
        <p class="small muted help">Each sponsor is a separate, optional choice. Never pre-ticked.</p>
      </div>

      <div v-if="event.collects && form.collect" class="checkin-group" data-collects>
        <h3 id="collects-h" class="label">This event collects details</h3>
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
        <p class="small muted help">Optional: untick it and you can still check in. Change your mind any time on this event's page.</p>

        <dialog ref="info" class="collect-dialog" aria-labelledby="collect-d-h" @click.self="infoClose" data-collect-info>
          <div class="collect-d-body">
            <div class="collect-d-head">
              <h3 id="collect-d-h">What {{ event.collects.organiser }} collects</h3>
              <button type="button" class="icon-btn collect-d-x" aria-label="Close" @click="infoClose">×</button>
            </div>
            <ul class="collect-d-list">
              <li v-for="it in event.collects.items" :key="it.key" :data-item="it.key">{{ it.label }}<span v-if="noEmail(it.key)" class="muted collect-d-note">You have no verified email on your account, so none is shared.</span></li>
            </ul>
            <p class="small collect-d-p"><span class="muted">Why:</span> {{ event.collects.why }}</p>
            <p class="small muted collect-d-p">Organisers never see who you connect with. Lanyard deletes the list 12 months after the event. See the
              <router-link to="/privacy" target="_blank">Privacy Policy</router-link>.</p>
            <button type="button" class="btn btn-primary" @click="infoClose">Got it</button>
          </div>
        </dialog>
      </div>
    </section>

    <p class="small muted">
      {{ ' ' + totalsLine(event) }}
      <template v-if="event.feedbackOn">After the event you'll be asked for quick, anonymous feedback.</template>
    </p>

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>

    <div class="thumb-bar">
      <div class="inner">
        <p v-if="needsAgree" class="consent-line">
          By pressing Check in, you confirm you're 18 or over and agree to the
          <router-link to="/terms" target="_blank">Terms</router-link> and
          <router-link to="/privacy" target="_blank">Privacy Policy</router-link>.
        </p>
        <button class="btn btn-primary" :disabled="busy" @click="$emit('checkin')">
          {{ busy ? "Checking in…" : "Check in" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* One rhythm (F67): the same gap between panels, the same gap between rows, and every tick a full-width row at least 48 px (--tap) tall. */
.checkin { --panel-gap: 24px; --row-gap: 12px; display: flex; flex-direction: column; gap: var(--panel-gap); }
.checkin > .page-head { margin: 0; }
.checkin-panel, .checkin-group { display: flex; flex-direction: column; gap: var(--row-gap); }
.checkin-panel > .label { color: var(--ink); }
.checkin-group > .label { font-weight: 400; }
.checkin-panel .field { margin: 0; }
.help { margin: calc(var(--row-gap) / -2) 0 0; }
.tick-row, .collect-row { width: 100%; min-height: var(--tap); align-items: center; padding: 6px 12px; border: var(--border); border-radius: var(--radius); background: var(--paper-raised); }
.tick-row { cursor: pointer; }
.tick-row input[type="checkbox"] { margin-top: 0; }
.collect-row { display: flex; gap: 8px; padding: 2px 4px 2px 12px; }
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
.collect-d-note { display: block; }
.collect-d-p { margin: 0; }
.event-info { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; }
.event-info dt { padding-top: 2px; }
.event-info dd { margin: 0; }
.event-brand .page-head { margin: 0; }
.event-brand .page-head h1 { margin: 0; overflow-wrap: anywhere; }
</style>
