<script setup>
// F31: "What this event collects", the host's side. Used in step 3 of Create event and on the
// Details tab; both hand in the form object that holds collectOn, collectEmail, collectCard and
// collectWhy. Off until the host switches it on. The items are the fixed list the code honours
// (src/lib/collects.js): there is no field for anything else.
import { EXTRA_ITEMS, WHY_MAX } from "../lib/collects";
import UiReveal from "./ui/UiReveal.vue";

defineProps({
  form: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
  // Details only: the list was already on when the page opened, so switching it off deletes it.
  wasOn: { type: Boolean, default: false },
  // F64, Create event only: the settings still as they were copied from the last event (or the one started from), and the
  // words under them. Details passes neither, so it shows no such line.
  copied: { type: Array, default: () => [] },
  notes: { type: Object, default: () => ({}) },
});
const KEYS = { email: "collectEmail", card: "collectCard" };
</script>

<template>
  <section class="panel stack-2 collects" aria-labelledby="collects-h" data-collects>
    <h3 id="collects-h" class="label">What this event collects</h3>
    <label class="checkbox-row">
      <input type="checkbox" v-model="form.collectOn" />
      <span class="small"><strong>Keep a list of who checked in</strong>
        <span class="muted" style="display:block">Names and check-in times of the people who leave it ticked. Off unless you switch it on.</span>
        <span v-if="copied.includes('collectOn')" class="collects-copied" data-copied="collectOn">{{ notes.collect }}</span></span>
    </label>
    <p v-if="wasOn && !form.collectOn" class="notice small" role="status">Saving with this off deletes the list you have so far.</p>

    <!-- F63: the options ease open and closed with the tick (UiReveal), not in and out at once. -->
    <UiReveal :open="form.collectOn">
      <div class="stack-2 collects-body">
      <div class="stack">
        <span class="label">Also ask for</span>
        <label v-for="i in EXTRA_ITEMS" :key="i.key" class="checkbox-row">
          <input type="checkbox" v-model="form[KEYS[i.key]]" />
          <span class="small">{{ i.host }}
            <span v-if="copied.includes(KEYS[i.key])" class="muted collects-line" :data-copied="KEYS[i.key]">{{ notes.line }}</span></span>
        </label>
      </div>
      <div class="field">
        <label for="collect-why">Why you collect this</label>
        <input id="collect-why" v-model="form.collectWhy" type="text" :maxlength="WHY_MAX + 40" autocomplete="off"
               placeholder="So we can keep a register for fire safety and thank people who came"
               :aria-invalid="errors.collectWhy ? 'true' : null" :aria-describedby="errors.collectWhy ? 'collect-why-e' : 'collect-why-h'" />
        <span v-if="errors.collectWhy" id="collect-why-e" class="error-text" role="alert">{{ errors.collectWhy }}</span>
        <span v-if="copied.includes('collectWhy')" class="small muted collects-line" data-copied="collectWhy">{{ notes.line }}</span>
        <span id="collect-why-h" class="small muted">Required. People read this on the check-in page, next to your name, with a tick already in each box. They can untick anything and still check in. Plain text, {{ WHY_MAX }} characters at most.</span>
      </div>
      <p class="small muted collects-care">
        You will hold these names, so you are responsible for keeping them safe and for using them only for the reason you give.
        Lanyard deletes the list 12 months after the event ends. People can take themselves off it at any time, and the list you see then shows only who is on it.
      </p>
      </div>
    </UiReveal>
  </section>
</template>

<style scoped>
.collects-care { margin: 0; }
/* F64: the line under a setting copied from the last event; the collects one is ink, not muted, so it is not missed. */
.collects-line, .collects-copied { display: block; }
.collects-copied { font-weight: 700; }
.collects-body { padding-top: 8px; }
.collects > :deep(.reveal) { margin-top: 0; }
</style>
