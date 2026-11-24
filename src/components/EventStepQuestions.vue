<script setup>
// F30 step 4: the check-in questions and the feedback form. (Sponsors have no field on the
// create form; a copy of an earlier event brings its sponsors, and they are shown here.)
import FeedbackEditor from "./FeedbackEditor.vue";
import CopiedFacts from "./CopiedFacts.vue";
import UiReveal from "./ui/UiReveal.vue";

defineProps({
  form: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
  facts: { type: Array, default: null },
  factsState: { type: String, default: "none" },
  // F64: the settings still as they were copied, and the words under them.
  copied: { type: Array, default: () => [] },
  notes: { type: Object, default: () => ({}) },
});
</script>

<template>
  <div v-if="!form.from" class="ev-groups">
    <section class="ev-group" aria-labelledby="ev-g-q">
      <h3 id="ev-g-q" class="label ev-group-h">Check-in questions</h3>
      <div class="field"><label for="ev-q1">Question 1 (optional)</label>
        <input id="ev-q1" v-model="form.q1" type="text" placeholder="Course" aria-describedby="ev-q-h" /></div>
      <div class="field"><label for="ev-q2">Question 2 (optional)</label>
        <input id="ev-q2" v-model="form.q2" type="text" placeholder="What are you looking for?" aria-describedby="ev-q-h" />
        <span id="ev-q-h" class="small muted">People type a short answer for each when they check in.</span></div>
    </section>
    <section class="ev-group" aria-labelledby="ev-g-fb">
      <h3 id="ev-g-fb" class="label ev-group-h">Feedback</h3>
      <label class="checkbox-row">
        <input type="checkbox" v-model="form.feedbackOn" />
        <span class="small">Ask attendees for anonymous feedback after the event
          <span v-if="copied.includes('feedbackOn')" class="muted ev-copied" data-copied="feedbackOn">{{ notes.line }}</span></span>
      </label>
      <UiReveal :open="form.feedbackOn"><div class="ev-reveal-pad"><FeedbackEditor v-model="form.feedbackQuestions" /></div></UiReveal>
      <p v-for="(m, k) in errors" :key="k" class="error-text" role="alert">{{ m }}</p>
    </section>
  </div>
  <CopiedFacts v-else-if="factsState !== 'none'" :facts="facts" :state="factsState" />
</template>
