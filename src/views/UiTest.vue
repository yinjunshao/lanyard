<script setup>
// Development-only page for checking the custom pickers by eye. The route exists
// only in `vite dev` (see router/index.js); a production build does not contain it.
import { ref, shallowRef } from "vue";
import UiSelect from "../components/ui/UiSelect.vue";
import UiCombobox from "../components/ui/UiCombobox.vue";
import UiDatePicker from "../components/ui/UiDatePicker.vue";
import UiTimePicker from "../components/ui/UiTimePicker.vue";
import UiDateTimePicker from "../components/ui/UiDateTimePicker.vue";
import { defaultEnd } from "../lib/dates.js";

const freq = ref("weekly");
const freqOptions = [
  { value: "once", label: "Once" },
  { value: "weekly", label: "Every week" },
  { value: "fortnight", label: "Every two weeks" },
  { value: "monthly", label: "Every month" },
  { value: "gone", label: "Not offered", disabled: true },
  { value: "term", label: "Every term" },
];
const none = ref("");
const many = ref(12);
const manyOptions = Array.from({ length: 40 }, (_, i) => ({ value: i + 1, label: `Option ${i + 1}` }));
const off = ref("a");
const inst = ref(null);
const instText = ref("");
const instOptions = [
  { value: "northfield", label: "Northfield College London", aliases: ["NCL", "Northfield"] },
  { value: "eut", label: "Example University of Technology", aliases: ["EUT"] },
  { value: "zurich", label: "Zürich Example Institute" },
  { value: "exemple", label: "Université Exemple" },
  { value: "old", label: "Old Example College" },
  ...Array.from({ length: 30 }, (_, i) => ({ value: "s" + i, label: `Sample Institute number ${i + 1}` })),
];
const day = ref("");
const limited = ref("2026-11-10");
const time = ref("");
const start = ref(null);
const end = ref(null);
// The same lazy "bare" use as PublicCard's reminder
const DatePicker = shallowRef(null);
const picking = ref(false);
const chip = ref(null);
const reminder = ref("");
async function pick() {
  picking.value = true;
  if (!DatePicker.value) DatePicker.value = (await import("../components/ui/UiDatePicker.vue")).default;
}
</script>

<template>
  <div class="wide-col" style="max-width:640px">
    <div class="page-head">
      <span class="label">Development only</span>
      <h1>Picker test page</h1>
      <p class="sub">Not part of the production build.</p>
    </div>

    <h2>UiSelect</h2>
    <div class="field">
      <label id="t-freq-l">How often</label>
      <UiSelect id="t-freq" v-model="freq" labelledby="t-freq-l" :options="freqOptions" />
      <span class="small muted">Value: {{ freq }}</span>
    </div>
    <div class="field">
      <label id="t-none-l">Nothing chosen yet</label>
      <UiSelect id="t-none" v-model="none" labelledby="t-none-l" placeholder="Choose one" :options="freqOptions" />
      <span class="small muted">Value: {{ none === "" ? "(empty)" : none }}</span>
    </div>
    <div class="field">
      <label id="t-many-l">A long list (numbers)</label>
      <UiSelect id="t-many" v-model="many" labelledby="t-many-l" :options="manyOptions" />
      <span class="small muted">Value: {{ many }} ({{ typeof many }})</span>
    </div>
    <div class="field">
      <label id="t-off-l">Disabled</label>
      <UiSelect id="t-off" v-model="off" labelledby="t-off-l" disabled :options="['a', 'b']" />
    </div>
    <div class="field">
      <label for="t-plain">A button after it, to check focus returns here</label>
      <button id="t-plain" class="btn-quiet" type="button">Next control</button>
    </div>

    <h2>Bare date picker (as on a public card)</h2>
    <div class="chip-row">
      <button ref="chip" type="button" class="chip chip-toggle" aria-haspopup="dialog" :aria-expanded="picking ? 'true' : 'false'" @click="pick">Pick a date</button>
      <component :is="DatePicker" v-if="DatePicker" bare v-model:open="picking" min-today label="Remind me on" model-value="" :anchor="chip" @update:model-value="reminder = $event" />
    </div>
    <p class="small muted">Chosen: {{ reminder || "(none)" }}</p>

    <h2>UiCombobox</h2>
    <div class="field">
      <label id="t-inst-l">Where do you study (free text allowed)</label>
      <UiCombobox id="t-inst" v-model="inst" v-model:text="instText" labelledby="t-inst-l" :options="instOptions"
                  allow-custom clearable placeholder="Search" :custom-label="(t) => `Not listed? Use ‘${t}’`" />
      <span class="small muted">Value: {{ inst ?? "(none)" }} · Text: {{ instText || "(empty)" }}</span>
    </div>

    <h2>UiDatePicker</h2>
    <div class="field">
      <label id="t-day-l">Remind me on</label>
      <UiDatePicker id="t-day" v-model="day" labelledby="t-day-l" clearable />
      <span class="small muted">Value: {{ day || "(empty)" }}</span>
    </div>
    <div class="field">
      <label id="t-lim-l">Only 5 Nov to 20 Dec 2026</label>
      <UiDatePicker id="t-lim" v-model="limited" labelledby="t-lim-l" min="2026-11-05" max="2026-12-20" />
      <span class="small muted">Value: {{ limited || "(empty)" }}</span>
    </div>

    <h2>UiTimePicker</h2>
    <div class="field">
      <label id="t-time-l">Doors open</label>
      <UiTimePicker id="t-time" v-model="time" labelledby="t-time-l" />
      <span class="small muted">Value: {{ time || "(empty)" }}</span>
    </div>

    <h2>UiDateTimePicker</h2>
    <div class="field">
      <label id="t-start-l">Starts (optional)</label>
      <UiDateTimePicker id="t-start" v-model="start" labelledby="t-start-l" clearable />
      <span class="small muted">Value: {{ start ?? "(empty)" }}</span>
    </div>
    <div class="field">
      <label id="t-end-l">Ends (optional)</label>
      <UiDateTimePicker id="t-end" v-model="end" labelledby="t-end-l" clearable :min="start" :suggest="start ? defaultEnd(start) : null" />
      <span class="small muted">Value: {{ end ?? "(empty)" }}</span>
    </div>
  </div>
</template>
