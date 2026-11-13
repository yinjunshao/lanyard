<script setup>
// F30: Create event, one stage per screen. The host dashboard owns the form, the address
// (?step=N), the draft and the request; this draws the step, checks only that step's fields
// when Next is pressed, and moves focus to the step heading on each change.
// Nothing is saved to the server until Create (the last step).
import { computed, nextTick, onMounted, ref, watch } from "vue";
import EventStepBasics from "./EventStepBasics.vue";
import EventStepLook from "./EventStepLook.vue";
import EventStepAtEvent from "./EventStepAtEvent.vue";
import EventStepQuestions from "./EventStepQuestions.vue";
import { LAST, STEPS, reviewGroups, validateStep } from "../lib/eventsteps";

const props = defineProps({
  form: { type: Object, required: true },
  step: { type: Number, required: true },
  fromOptions: { type: Array, default: () => [] },
  hasEvents: { type: Boolean, default: false },
  // What a copy of an earlier event brings (lib/eventsteps.js: copyFacts), and how reading it went.
  facts: { type: Object, default: null },
  factsState: { type: String, default: "ok" },
  busy: { type: Boolean, default: false },
  // A message from Create that no step owns (no credits, the network): shown on Review.
  error: { type: String, default: "" },
  // The server refused one field: { step, field, message }. It is shown next to that field.
  serverError: { type: Object, default: null },
  createLabel: { type: String, default: "Create event" },
  needsCredits: { type: Boolean, default: false },
});
const emit = defineEmits(["go", "create", "cancel"]);

const current = computed(() => STEPS[props.step - 1]);
const errors = ref({});
const root = ref(null);
const heading = ref(null);
const sf = (k) => props.facts?.[k] || null;
const groups = computed(() => reviewGroups(props.form, props.facts));

// A problem stays up until it is fixed, then goes; nothing is shown before Next is pressed.
watch(() => props.form, () => {
  const keys = Object.keys(errors.value);
  if (!keys.length) return;
  const now = validateStep(props.step, props.form);
  errors.value = Object.fromEntries(keys.filter((k) => k in now).map((k) => [k, now[k]]));
}, { deep: true });

async function focusFirstProblem() {
  await nextTick();
  const el = root.value?.querySelector('[aria-invalid="true"]') || root.value?.querySelector(".error-text");
  if (el) { if (!el.matches("input, textarea, button, select, [tabindex]")) el.tabIndex = -1; el.focus(); }
}
watch([() => props.step, () => props.serverError], async ([, se]) => {
  errors.value = se && se.step === props.step ? { [se.field]: se.message } : {};
  await nextTick();
  if (errors.value && Object.keys(errors.value).length) focusFirstProblem();
  else heading.value?.focus();
}, { flush: "post" });

// Opening Create event (or refreshing on a step) puts focus on the step heading too.
onMounted(() => heading.value?.focus());

function onSubmit() {
  if (props.busy) return;
  const e = validateStep(props.step, props.form);
  errors.value = e;
  if (Object.keys(e).length) { focusFirstProblem(); return; }
  if (props.step < LAST) emit("go", props.step + 1);
  else emit("create");
}
const back = () => emit("go", props.step - 1);
defineExpose({ heading });
</script>

<template>
  <form ref="root" class="panel stack-2 ev-steps" novalidate :aria-labelledby="'ev-step-h'" @submit.prevent="onSubmit">
    <div class="spread">
      <span class="label" aria-hidden="true">Step {{ step }} of {{ LAST }}</span>
      <button type="button" class="link-btn small" style="min-height:44px" @click="emit('cancel')">Cancel</button>
    </div>
    <ol class="ev-names" aria-label="Steps">
      <li v-for="s in STEPS" :key="s.n" :aria-current="s.n === step ? 'step' : null"
          :class="{ on: s.n === step, done: s.n < step }">
        <button v-if="s.n < step" type="button" class="link-btn" @click="emit('go', s.n)">{{ s.name }}</button>
        <span v-else>{{ s.name }}</span>
      </li>
    </ol>
    <h2 id="ev-step-h" ref="heading" tabindex="-1" class="ev-h"><span class="visually-hidden">Step {{ step }} of {{ LAST }}: </span>{{ current.lead }}</h2>

    <EventStepBasics v-if="step === 1" :form="form" :errors="errors" :from-options="fromOptions" :has-events="hasEvents"
                     :facts="sf('basics')" :facts-state="form.from ? factsState : 'none'" />
    <EventStepLook v-else-if="step === 2" :form="form" :facts="sf('look')" :facts-state="factsState" />
    <EventStepAtEvent v-else-if="step === 3" :form="form" :errors="errors" :facts="sf('event')" :facts-state="factsState" />
    <EventStepQuestions v-else-if="step === 4" :form="form" :errors="errors" :facts="sf('questions')" :facts-state="factsState" />

    <div v-else class="stack-2">
      <p class="muted small" style="margin:0">Nothing is saved until you press the button below. The preview shows the check-in page as people will see it.</p>
      <section v-for="g in groups" :key="g.step" class="ev-review" :aria-labelledby="`ev-rv-${g.step}`">
        <div class="spread">
          <h3 :id="`ev-rv-${g.step}`" class="label">{{ g.title }}</h3>
          <button type="button" class="link-btn small" style="min-height:44px" @click="emit('go', g.step)">Change<span class="visually-hidden"> {{ g.title.toLowerCase() }}</span></button>
        </div>
        <p v-for="r in g.rows" :key="r[0]" class="small" style="margin:2px 0"><span class="muted">{{ r[0] }}:</span> {{ r[1] }}</p>
      </section>
      <p v-if="needsCredits" class="small muted" style="margin:0">This uses 1 event credit.</p>
      <p v-if="error" class="error-text" role="alert">
        {{ error }}
        <slot name="error-extra" />
      </p>
    </div>

    <div class="ev-bar">
      <button v-if="step > 1" type="button" class="btn ev-back" @click="back">Back</button>
      <button type="submit" class="btn btn-primary" :disabled="busy">
        <template v-if="step < LAST">Next: {{ STEPS[step].name }}</template>
        <template v-else>{{ busy ? "Creating…" : createLabel }}</template>
      </button>
    </div>
  </form>
</template>

<style scoped>
.ev-names { display: flex; flex-wrap: wrap; gap: 4px 14px; list-style: none; margin: 0; padding: 0; font-size: 13px; color: var(--graphite); }
.ev-names li { display: flex; align-items: center; min-height: 28px; }
.ev-names li.on { color: var(--ink); font-weight: 700; border-bottom: 2px solid var(--strap); }
.ev-names .link-btn { font-size: 13px; padding: 0; min-height: 28px; font-weight: 400; }
.ev-h { margin: 0; }
.ev-h:focus { outline: none; }
.ev-h:focus-visible { outline: 2.5px solid var(--strap); outline-offset: 3px; }
.ev-review { border-top: var(--border); padding-top: 4px; }
.ev-review :deep(.label) { margin: 0; }
.ev-bar {
  position: sticky; bottom: 0; z-index: 3;
  display: flex; gap: var(--space);
  margin: 24px -20px -20px; padding: 12px 20px calc(12px + env(safe-area-inset-bottom, 0px));
  background: var(--paper-raised); border-top: var(--border); border-radius: 0 0 var(--radius) var(--radius);
}
.ev-bar .btn { width: auto; }
.ev-back { flex: none; min-width: 96px; }
.ev-bar .btn-primary { flex: 1; }
</style>
