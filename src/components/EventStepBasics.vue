<script setup>
// F30 step 1: the name, the times, the venue, and whether to start from an earlier event.
import UiSelect from "./ui/UiSelect.vue";
import UiDateTimePicker from "./ui/UiDateTimePicker.vue";
import CopiedFacts from "./CopiedFacts.vue";
import { defaultEnd } from "../lib/dates";

defineProps({
  form: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
  fromOptions: { type: Array, default: () => [] },
  hasEvents: { type: Boolean, default: false },
  facts: { type: Array, default: null },
  factsState: { type: String, default: "none" },
});
</script>

<template>
  <div class="ev-groups">
    <section class="ev-group" aria-labelledby="ev-g-event">
      <h3 id="ev-g-event" class="label ev-group-h">The event</h3>
      <div v-if="hasEvents" class="field"><label id="ev-from-l">Start from</label>
        <UiSelect id="ev-from" v-model="form.from" labelledby="ev-from-l" :options="fromOptions" />
        <span v-if="form.from" class="small muted">Copies the venue, perks, questions, feedback form and sponsors. The next steps show what comes with it.</span>
        <span v-else class="small muted">Pick an earlier event to copy it, or leave it blank to start fresh.</span>
      </div>
      <div class="field"><label for="ev-name">Event name</label>
        <input id="ev-name" v-model="form.name" type="text" :placeholder="form.from ? 'Same name as before' : 'Spring networking night'"
               :aria-invalid="errors.name ? 'true' : null" :aria-describedby="errors.name ? 'ev-name-e' : 'ev-name-h'" />
        <span v-if="errors.name" id="ev-name-e" class="error-text" role="alert">{{ errors.name }}</span>
        <span v-else id="ev-name-h" class="small muted">The heading people see when they check in.</span></div>
      <div v-if="!form.from" class="field"><label for="ev-venue">Venue</label>
        <input id="ev-venue" v-model="form.venue" type="text" aria-describedby="ev-venue-h" />
        <span id="ev-venue-h" class="small muted">Shown under the name. Leave it empty if there is no fixed place.</span></div>
      <CopiedFacts v-else-if="factsState !== 'none'" :facts="facts" :state="factsState" />
    </section>
    <section class="ev-group" aria-labelledby="ev-g-when">
      <h3 id="ev-g-when" class="label ev-group-h">When</h3>
      <div class="field"><label id="ev-start-l">Starts (optional)</label>
        <UiDateTimePicker id="ev-start" v-model="form.startsAt" labelledby="ev-start-l" clearable /></div>
      <div class="field"><label id="ev-end-l">Ends (optional)</label>
        <UiDateTimePicker id="ev-end" v-model="form.endsAt" labelledby="ev-end-l" clearable :min="form.startsAt" :suggest="form.startsAt ? defaultEnd(form.startsAt) : null" />
        <span v-if="errors.endsAt" class="error-text" role="alert">{{ errors.endsAt }}</span>
        <span class="small muted">Feedback opens when the event ends. Without an end time it opens 3 hours after the start, or when you press End event.</span></div>
    </section>
  </div>
</template>
