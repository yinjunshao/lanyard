<script setup>
// A time of day in 15-minute steps. v-model is "HH:mm" (24 hour) or "". A button
// opens a small dialog with a text box and a scrolling list. Typing works as well
// as picking: "18:30", "1830", "6.30pm", "6pm". The text box is a WAI-ARIA combobox
// (list autocomplete off) whose list is the steps; Up and Down move through them,
// Enter takes what is in the box, Esc closes.
import { computed, nextTick, ref } from "vue";
import UiSheet from "./UiSheet.vue";
import { nextUid } from "./uid.js";
import { parseHm, parseTime, timeSteps } from "../../lib/dates.js";

const props = defineProps({
  modelValue: { type: String, default: "" },
  step: { type: Number, default: 15 },
  openAt: { type: String, default: "09:00" }, // where the list opens when there is no value yet
  id: { type: String, default: undefined },
  label: { type: String, default: "" },
  labelledby: { type: String, default: "" },
  placeholder: { type: String, default: "Choose a time" },
  disabled: Boolean,
});
const emit = defineEmits(["update:modelValue", "change"]);

const uid = nextUid();
const listId = `${uid}-list`;
const steps = computed(() => timeSteps(props.step));
const open = ref(false);
const trigger = ref(null);
const list = ref(null);
const input = ref(null);
const text = ref("");
const active = ref(-1);
const error = ref("");

const toMin = (hm) => { const t = parseHm(hm); return t ? t.h * 60 + t.min : -1; };
/** Index of the first step at or after a time ("18:07" -> the 18:15 row). */
const nearest = (hm) => {
  const m = toMin(hm);
  if (m < 0) return -1;
  const i = steps.value.findIndex((s) => toMin(s) >= m);
  return i < 0 ? steps.value.length - 1 : i;
};

function show() {
  if (props.disabled) return;
  text.value = props.modelValue;
  error.value = "";
  active.value = props.modelValue ? nearest(props.modelValue) : nearest(props.openAt);
  open.value = true;
  nextTick(() => { reveal(true); input.value?.select(); });
}
function hide() { open.value = false; }

function reveal(center) {
  const li = document.getElementById(`${uid}-o${active.value}`);
  const ul = list.value;
  if (!li || !ul) return;
  if (center) ul.scrollTop = li.offsetTop - ul.clientHeight / 2 + li.offsetHeight / 2;
  else li.scrollIntoView({ block: "nearest" });
}
function commit(hm) {
  hide();
  if (hm !== props.modelValue) { emit("update:modelValue", hm); emit("change", hm); }
}
function onInput() {
  error.value = "";
  const hm = parseTime(text.value);
  if (hm) { active.value = nearest(hm); nextTick(() => reveal(false)); }
}
function accept() {
  const hm = parseTime(text.value);
  if (!hm) { error.value = "Try a time like 18:30 or 6.30pm."; return; }
  commit(hm);
}
function move(i) {
  active.value = Math.min(steps.value.length - 1, Math.max(0, i));
  text.value = steps.value[active.value];
  error.value = "";
  nextTick(() => reveal(false));
}
function onKey(e) {
  const k = e.key;
  if (k === "ArrowDown") { e.preventDefault(); move(active.value + 1); }
  else if (k === "ArrowUp") { e.preventDefault(); move(active.value - 1); }
  else if (k === "PageDown") { e.preventDefault(); move(active.value + 8); }
  else if (k === "PageUp") { e.preventDefault(); move(active.value - 8); }
  else if (k === "Enter") { e.preventDefault(); accept(); }
}
const activeId = computed(() => (active.value >= 0 ? `${uid}-o${active.value}` : undefined));
</script>

<template>
  <div class="ui-field">
    <button ref="trigger" type="button" class="ui-trigger ui-time-btn" :id="id" :disabled="disabled"
            aria-haspopup="dialog" :aria-expanded="open ? 'true' : 'false'"
            :aria-label="labelledby ? undefined : label || undefined"
            :aria-labelledby="labelledby ? `${labelledby} ${id || ''}`.trim() : undefined"
            @click="open ? hide() : show()">
      <span class="ui-value tnum" :class="{ 'ui-placeholder': !modelValue }">{{ modelValue || placeholder }}</span>
      <span class="ui-chevron" aria-hidden="true"></span>
    </button>

    <UiSheet :open="open" :anchor="trigger" :label="label || 'Choose a time'" fit focus=".ui-time-input" @close="hide">
      <div class="ui-time">
        <input ref="input" v-model="text" class="ui-time-input" type="text" role="combobox" autocomplete="off"
               aria-autocomplete="none" aria-expanded="true" :aria-controls="listId" :aria-activedescendant="activeId"
               aria-label="Type a time, for example 18:30 or 6.30pm" placeholder="e.g. 18:30 or 6.30pm"
               @input="onInput" @keydown="onKey" />
        <p class="ui-time-msg small" :class="{ 'error-text': error }" role="status">{{ error || "Press Enter to use the time in the box." }}</p>
        <ul :id="listId" ref="list" class="ui-list ui-time-list" role="listbox" tabindex="-1" aria-label="Times">
          <li v-for="(s, i) in steps" :id="`${uid}-o${i}`" :key="s" role="option" class="ui-option tnum"
              :class="{ 'is-active': i === active }" :aria-selected="s === modelValue ? 'true' : 'false'"
              @mousedown.prevent @click="commit(s)">{{ s }}</li>
        </ul>
      </div>
    </UiSheet>
  </div>
</template>

<style>
.ui-time { min-width: 0; }
.ui-time-input {
  width: 100%; min-height: 48px; padding: 10px 14px;
  border: var(--border); border-radius: var(--radius);
  background: var(--paper-raised); color: var(--ink); font-size: 16px;
}
.ui-time-msg { margin: 6px 2px; color: var(--graphite); }
.ui-time-msg.error-text { color: var(--strap-deep); }
.ui-time-list { max-height: 240px; overflow-y: auto; position: relative; }
@media (max-width: 599px) { .ui-time-list { max-height: 38vh; } }
</style>
