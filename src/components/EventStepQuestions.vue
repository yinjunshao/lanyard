<script setup>
// F30 step 4: the check-in questions and the feedback form. (Sponsors have no field on the
// create form; a copy of an earlier event brings its sponsors, and they are shown here.)
import FeedbackEditor from "./FeedbackEditor.vue";
import CopiedFacts from "./CopiedFacts.vue";

defineProps({
  form: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
  facts: { type: Array, default: null },
  factsState: { type: String, default: "none" },
});
</script>

<template>
  <div v-if="!form.from" class="stack-2">
    <div class="field"><label for="ev-q1">Check-in question 1 (optional)</label>
      <input id="ev-q1" v-model="form.q1" type="text" placeholder="Course" /></div>
    <div class="field"><label for="ev-q2">Check-in question 2 (optional)</label>
      <input id="ev-q2" v-model="form.q2" type="text" placeholder="What are you looking for?" /></div>
    <label class="checkbox-row">
      <input type="checkbox" v-model="form.feedbackOn" />
      <span class="small">Ask attendees for anonymous feedback after the event</span>
    </label>
    <FeedbackEditor v-if="form.feedbackOn" v-model="form.feedbackQuestions" />
    <p v-for="(m, k) in errors" :key="k" class="error-text" role="alert">{{ m }}</p>
  </div>
  <CopiedFacts v-else-if="factsState !== 'none'" :facts="facts" :state="factsState" />
</template>
