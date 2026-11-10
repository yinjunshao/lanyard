<script setup>
// Development-only page for checking the custom pickers by eye. The route exists
// only in `vite dev` (see router/index.js); a production build does not contain it.
import { ref } from "vue";
import UiSelect from "../components/ui/UiSelect.vue";

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
  </div>
</template>
