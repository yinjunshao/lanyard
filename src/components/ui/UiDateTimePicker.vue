<script setup>
// A date and a time together. v-model is a unix-ms number (or null for "not set"),
// the same value fromLocalInput gave, read and written in the viewer's own time zone.
// Picking a day with no time yet uses `defaultTime`; picking a time with no day yet
// uses today. `suggest` (ms) is for an optional end: it shows a one-tap "2 hours after
// the start" button, and is where the calendar opens.
import { computed, nextTick, ref } from "vue";
import UiDatePicker from "./UiDatePicker.vue";
import UiTimePicker from "./UiTimePicker.vue";
import { formatDay, isoOf, msOf, parseIso, splitMs, todayLocal } from "../../lib/dates.js";

const props = defineProps({
  modelValue: { type: Number, default: null },
  id: { type: String, default: undefined },
  label: { type: String, default: "" },
  labelledby: { type: String, default: "" },
  min: { type: Number, default: null },        // earliest day (ms); the time is not enforced
  suggest: { type: Number, default: null },
  suggestLabel: { type: String, default: "Set to 2 hours after the start" },
  defaultTime: { type: String, default: "18:00" },
  clearable: Boolean,
  disabled: Boolean,
});
const emit = defineEmits(["update:modelValue", "change"]);

const parts = computed(() => (props.modelValue ? splitMs(props.modelValue) : null));
const dayIso = computed(() => (parts.value ? isoOf(parts.value.day) : ""));
const time = computed(() => parts.value?.time || "");
const minIso = computed(() => (props.min ? isoOf(splitMs(props.min).day) : ""));
const suggestParts = computed(() => (props.suggest ? splitMs(props.suggest) : null));

const root = ref(null);
// A button that vanishes after use would drop keyboard focus, so move it to the date button.
function setAndFocus(ms) { set(ms); nextTick(() => root.value?.querySelector(".ui-date")?.focus()); }
function set(ms) { emit("update:modelValue", ms); emit("change", ms); }
function onDay(iso) {
  const day = parseIso(iso);
  if (!day) return set(null);
  set(msOf(day, time.value || suggestParts.value?.time || props.defaultTime));
}
function onTime(hm) {
  const day = parts.value?.day || suggestParts.value?.day || todayLocal();
  set(hm ? msOf(day, hm) : null);
}
const ids = computed(() => ({ date: props.id, time: props.id ? `${props.id}-time` : undefined }));
</script>

<template>
  <div ref="root" class="ui-dt">
    <div class="ui-dt-row">
      <UiDatePicker :id="ids.date" :model-value="dayIso" :open-at="suggestParts ? isoOf(suggestParts.day) : ''"
                    :labelledby="labelledby" :label="label ? label + ' date' : ''" :min="minIso" :disabled="disabled"
                    placeholder="Choose a date" @update:model-value="onDay" />
      <UiTimePicker :id="ids.time" :model-value="time" :labelledby="labelledby" :label="label ? label + ' time' : ''"
                    :disabled="disabled" :open-at="suggestParts?.time || defaultTime" placeholder="Time" @update:model-value="onTime" />
    </div>
    <div v-if="(clearable && modelValue) || (suggest && !modelValue)" class="ui-dt-actions">
      <button v-if="suggest && !modelValue" type="button" class="btn-quiet" @click="setAndFocus(suggest)">
        {{ suggestLabel }}
      </button>
      <span v-if="suggest && !modelValue" class="small muted tnum ui-dt-hint">{{ formatDay(suggestParts.day) }}, {{ suggestParts.time }}</span>
      <button v-if="clearable && modelValue" type="button" class="btn-quiet" @click="setAndFocus(null)">Clear</button>
    </div>
  </div>
</template>

<style>
.ui-dt-row { display: grid; grid-template-columns: minmax(0, 1fr) 100px; gap: 8px; }
.ui-dt .ui-trigger { padding-left: 12px; padding-right: 10px; }
.ui-dt-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin-top: 8px; }
.ui-dt-actions .btn-quiet { height: auto; min-height: 36px; padding: 6px 14px; text-align: center; }
</style>
