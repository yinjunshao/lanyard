<script setup>
// The end-of-event feedback form. Reached from the home screen card, the
// event page, or a link the host shares (/e/CODE/feedback).
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { Api } from "../lib/api";
import RatingInput from "../components/RatingInput.vue";
import { fmtDateTime } from "../lib/time";
import Waiting from "../components/Waiting.vue";

const route = useRoute();
const form = ref(null);
const answers = ref({});
const loading = ref(true);
const error = ref("");
const busy = ref(false);
const sent = ref(false);

async function load() {
  loading.value = true; error.value = "";
  try {
    let id = route.params.eventId;
    if (!id && route.params.code) id = (await Api.event(route.params.code)).event.id;
    form.value = await Api.feedbackForm(id);
    for (const q of form.value.questions) answers.value[q.id] = q.type === "multi" ? [] : q.type === "rating" ? null : "";
    const pre = Number(route.query.overall);
    if (Number.isInteger(pre) && pre >= 1 && pre <= 5) answers.value.overall = pre;
  } catch (e) {
    error.value = e.status === 401 ? "signed_out" : e.message;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const status = computed(() => form.value?.status);
function toggle(qid, opt) {
  const a = answers.value[qid];
  answers.value[qid] = a.includes(opt) ? a.filter((x) => x !== opt) : [...a, opt];
}
async function submit() {
  error.value = "";
  if (!answers.value.overall) { error.value = "Please give an overall rating first."; return; }
  busy.value = true;
  try {
    await Api.sendFeedback(form.value.event.id, answers.value);
    sent.value = true;
  } catch (e) {
    if (e.code === "done") sent.value = true;
    else error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="stack-3">
    <Waiting v-if="loading" shape="form" :rows="3" title label="Loading the feedback form" :retry="load" />

    <div v-else-if="error === 'signed_out'" class="empty stack">
      <span class="label">Open this where you checked in</span>
      <p>Feedback is only for people who checked in to the event. Open this link on the phone you checked in with.</p>
    </div>

    <template v-else-if="form">
      <div class="page-head">
        <span class="label">Feedback</span>
        <h1 style="margin-top:4px">How was {{ form.event.name }}?</h1>
      </div>

      <div v-if="sent || status === 'done'" class="panel stack" role="status">
        <h2>Thank you</h2>
        <p class="muted" style="margin:0">Your answers have gone to the organisers, without your name.</p>
        <router-link to="/app" class="btn">Back to my card</router-link>
      </div>

      <div v-else-if="status !== 'open'" class="empty stack">
        <span class="label">
          {{ status === "not_open" ? "Not open yet" : status === "closed" ? "Feedback has closed" : status === "off" ? "No feedback for this event" : "Check in first" }}
        </span>
        <p v-if="status === 'not_open'">Feedback opens when the event ends<template v-if="form.opensAt"> ({{ fmtDateTime(form.opensAt) }})</template>.</p>
        <p v-else-if="status === 'closed'">Feedback stays open for a week after an event.</p>
        <p v-else-if="status === 'not_checked_in'">Only people who checked in can give feedback.</p>
      </div>

      <form v-else class="stack-3" @submit.prevent="submit">
        <p class="notice small">
          Your answers go to the organisers without your name or account. They only see totals once a few people
          have answered. Please don't include personal details in written answers.
          <router-link to="/privacy" style="text-decoration:underline">Privacy Policy</router-link>
        </p>

        <fieldset v-for="q in form.questions" :key="q.id" class="fb-q">
          <legend class="fb-legend">
            {{ q.label }}<span v-if="q.required" class="muted"> (required)</span>
          </legend>

          <RatingInput v-if="q.type === 'rating'" v-model="answers[q.id]" :label="q.label" />

          <div v-else-if="q.type === 'single'" class="chip-row" role="radiogroup" :aria-label="q.label">
            <label v-for="o in q.options" :key="o" class="chip chip-toggle" :class="{ on: answers[q.id] === o }">
              <input v-model="answers[q.id]" class="visually-hidden" type="radio" :name="q.id" :value="o" />{{ o }}
            </label>
          </div>

          <div v-else-if="q.type === 'multi'" class="chip-row" role="group" :aria-label="q.label">
            <label v-for="o in q.options" :key="o" class="chip chip-toggle" :class="{ on: answers[q.id].includes(o) }">
              <input class="visually-hidden" type="checkbox" :checked="answers[q.id].includes(o)" @change="toggle(q.id, o)" />{{ o }}
            </label>
          </div>

          <div v-else class="field" style="margin:0">
            <label :for="`fb-${q.id}`" class="visually-hidden">{{ q.label }}</label>
            <textarea :id="`fb-${q.id}`" v-model="answers[q.id]" maxlength="500" placeholder="Optional"></textarea>
          </div>
        </fieldset>

        <p v-if="error" class="error-text" role="alert">{{ error }}</p>
        <button class="btn btn-primary" type="submit" :disabled="busy">{{ busy ? "Sending…" : "Send feedback" }}</button>
        <p class="small muted" style="text-align:center;margin:0">Written answers may be summarised by AI for the organiser, with names and contact details taken out.</p>
        <p class="small muted" style="text-align:center;margin:0" v-if="form.closesAt">Open until {{ fmtDateTime(form.closesAt) }}</p>
      </form>
    </template>

    <div v-else class="empty stack">
      <span class="label">Couldn't open feedback</span>
      <p>{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.fb-q { border: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.fb-legend { font-weight: 700; padding: 0; margin-bottom: 10px; }
.chip-toggle:focus-within { outline: 2.5px solid var(--strap); outline-offset: 2px; }
</style>
