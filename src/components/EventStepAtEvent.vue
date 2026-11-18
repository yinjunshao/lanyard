<script setup>
// F30 step 3: what people find at the event. Perks, notes, sign-ups and the attendee room.
import CopiedFacts from "./CopiedFacts.vue";
import EventCollects from "./EventCollects.vue";

defineProps({
  form: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
  facts: { type: Array, default: null },
  factsState: { type: String, default: "none" },
});
</script>

<template>
  <div class="stack-2">
  <div v-if="!form.from" class="stack-2">
    <div class="field"><label for="ev-perks">Perks — one per line</label>
      <textarea id="ev-perks" v-model="form.perksText" placeholder="Free coffee (Show this at the bar before 11am)&#10;Raffle entry"
                :aria-invalid="errors.perksText ? 'true' : null" :aria-describedby="errors.perksText ? 'ev-perks-e' : 'ev-perks-h'"></textarea>
      <span id="ev-perks-h" class="small muted">Put details in brackets and attendees get a button for the perk that opens them: Free lunch (Collect it from the foyer at 1pm).</span>
      <span v-if="errors.perksText" id="ev-perks-e" class="error-text" role="alert">{{ errors.perksText }}</span></div>
    <div class="field"><label for="ev-access">Access info for attendees (optional)</label>
      <input id="ev-access" v-model="form.access" type="text" maxlength="200" placeholder="Step-free entrance at the side door" /></div>
    <div class="field"><label for="ev-food">Food and drink (optional)</label>
      <input id="ev-food" v-model="form.food" type="text" maxlength="200" /></div>
    <div class="field"><label for="ev-rsvp">Sign-ups so far (optional)</label>
      <input id="ev-rsvp" v-model="form.rsvpCount" type="number" min="0" inputmode="numeric"
             :aria-invalid="errors.rsvpCount ? 'true' : null" :aria-describedby="errors.rsvpCount ? 'ev-rsvp-e' : 'ev-rsvp-h'" />
      <span v-if="errors.rsvpCount" id="ev-rsvp-e" class="error-text" role="alert">{{ errors.rsvpCount }}</span>
      <span id="ev-rsvp-h" class="small muted">From Luma or the Union site. A number only; the report shows turnout.</span></div>
    <label class="checkbox-row">
      <input type="checkbox" v-model="form.directoryOn" />
      <span class="small">Show the live attendee room to checked-in people</span>
    </label>
  </div>
  <CopiedFacts v-else-if="factsState !== 'none'" :facts="facts" :state="factsState" />
  <!-- F31: "What this event collects" (the attendance list, the items people can tick on the
       check-in page and the "why" line). Outside the copy branch: a copy chooses again, the
       earlier event's list is never carried over (D038). Its fields live in the same `form`, so the draft keeps them. -->
  <div data-slot="f31-collects"><EventCollects :form="form" :errors="errors" /></div>
  </div>
</template>
