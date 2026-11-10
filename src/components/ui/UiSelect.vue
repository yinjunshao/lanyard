<script setup>
// A single choice from a short list. WAI-ARIA "select-only combobox": the button
// has role="combobox" and keeps focus on desktop, the list is a listbox driven by
// aria-activedescendant. Under 600 px the list is a bottom sheet, and focus moves
// onto the listbox inside it (the page behind is inert).
//
// v-model is the option's value (string, number, boolean or null). Options are
// [{ value, label, disabled? }] or plain strings.
import { computed, nextTick, ref, watch } from "vue";
import Icon from "../Icon.vue";
import UiSheet from "./UiSheet.vue";
import { nextUid } from "./uid.js";

const props = defineProps({
  modelValue: { default: "" },
  options: { type: Array, required: true },
  id: { type: String, default: undefined },
  label: { type: String, default: "" },        // accessible name when there is no visible label
  labelledby: { type: String, default: "" },   // id of a visible label
  placeholder: { type: String, default: "Choose" },
  disabled: Boolean,
});
const emit = defineEmits(["update:modelValue", "change"]);

const uid = nextUid();
const listId = `${uid}-list`;
const items = computed(() => props.options.map((o) => (typeof o === "object" && o !== null ? o : { value: o, label: String(o) })));
const selectedIndex = computed(() => items.value.findIndex((o) => o.value === props.modelValue));
const shown = computed(() => (selectedIndex.value >= 0 ? items.value[selectedIndex.value].label : ""));

const open = ref(false);
const active = ref(-1);
const trigger = ref(null);
const list = ref(null);
const sheetMode = ref(false);
const sheet = ref(null);

const enabled = (i) => i >= 0 && i < items.value.length && !items.value[i].disabled;
function step(from, dir) {
  let i = from;
  for (let n = 0; n < items.value.length; n++) {
    i += dir;
    if (i < 0 || i >= items.value.length) return from;
    if (enabled(i)) return i;
  }
  return from;
}
const firstEnabled = () => items.value.findIndex((_, i) => enabled(i));
const lastEnabled = () => { for (let i = items.value.length - 1; i >= 0; i--) if (enabled(i)) return i; return -1; };

function show(at) {
  if (props.disabled) return;
  active.value = at != null ? at : enabled(selectedIndex.value) ? selectedIndex.value : firstEnabled();
  open.value = true;
  nextTick(reveal);
}
function hide() { open.value = false; }
function reveal() {
  document.getElementById(`${uid}-o${active.value}`)?.scrollIntoView({ block: "nearest" });
}
function pick(i) {
  if (!enabled(i)) return;
  const v = items.value[i].value;
  hide();
  if (v !== props.modelValue) { emit("update:modelValue", v); emit("change", v); }
}
function move(i) { if (enabled(i)) { active.value = i; nextTick(reveal); } }

// type-ahead: typed letters jump to the next label starting with them
let buffer = "";
let bufferTimer = 0;
function typeAhead(ch, base) {
  clearTimeout(bufferTimer);
  bufferTimer = setTimeout(() => (buffer = ""), 700);
  buffer += ch.toLowerCase();
  const n = items.value.length;
  const cycling = buffer.length > 1 && [...buffer].every((c) => c === buffer[0]);
  const needle = cycling ? buffer[0] : buffer;
  const start = base < 0 ? 0 : needle.length === 1 ? base + 1 : base;
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (enabled(i) && items.value[i].label.toLowerCase().startsWith(needle)) return i;
  }
  return -1;
}

function onKey(e) {
  if (props.disabled || e.ctrlKey || e.metaKey) return;
  const k = e.key;
  if (!open.value) {
    if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") { e.preventDefault(); show(); }
    else if (k === "Home") { e.preventDefault(); show(firstEnabled()); }
    else if (k === "End") { e.preventDefault(); show(lastEnabled()); }
    else if (k.length === 1 && !e.altKey) {
      const i = typeAhead(k, selectedIndex.value);
      if (i >= 0) { e.preventDefault(); show(i); }
    }
    return;
  }
  if (k === "ArrowDown") { e.preventDefault(); if (e.altKey) return; move(step(active.value, 1)); }
  else if (k === "ArrowUp") { e.preventDefault(); if (e.altKey) { pick(active.value); return; } move(step(active.value, -1)); }
  else if (k === "Home") { e.preventDefault(); move(firstEnabled()); }
  else if (k === "End") { e.preventDefault(); move(lastEnabled()); }
  else if (k === "PageDown") { e.preventDefault(); let i = active.value; for (let n = 0; n < 10; n++) i = step(i, 1); move(i); }
  else if (k === "PageUp") { e.preventDefault(); let i = active.value; for (let n = 0; n < 10; n++) i = step(i, -1); move(i); }
  else if (k === "Enter" || k === " ") { e.preventDefault(); pick(active.value); }
  else if (k === "Tab" && !sheetMode.value) { if (enabled(active.value)) pick(active.value); else hide(); }
  else if (k === "Escape") { e.preventDefault(); e.stopPropagation(); hide(); }
  else if (k.length === 1 && !e.altKey) {
    const i = typeAhead(k, active.value);
    if (i >= 0) { e.preventDefault(); move(i); }
  }
}

const activeId = computed(() => (open.value && active.value >= 0 ? `${uid}-o${active.value}` : undefined));
watch(() => props.options, () => { if (open.value && !enabled(active.value)) active.value = firstEnabled(); });
</script>

<template>
  <div class="ui-field">
  <button ref="trigger" type="button" class="ui-trigger ui-select" role="combobox"
          :id="id" :disabled="disabled"
          aria-haspopup="listbox" :aria-expanded="open ? 'true' : 'false'" :aria-controls="listId"
          :aria-label="labelledby ? undefined : label || undefined"
          :aria-labelledby="labelledby ? `${labelledby} ${id || ''}`.trim() : undefined"
          :aria-activedescendant="sheetMode ? undefined : activeId"
          @click="open ? hide() : show()" @keydown="onKey">
    <span class="ui-value" :class="{ 'ui-placeholder': !shown }">{{ shown || placeholder }}</span>
    <span class="ui-chevron" aria-hidden="true"></span>
  </button>

  <UiSheet ref="sheet" :open="open" :anchor="trigger" :label="label || placeholder" :trap="false" fit
           focus='[role="listbox"]' @close="hide">
    <template #default="{ sheet: isSheet }">
      <ul :id="listId" ref="list" class="ui-list" role="listbox"
          :tabindex="isSheet ? 0 : -1"
          :aria-label="label || undefined" :aria-labelledby="!label && labelledby ? labelledby : undefined"
          :aria-activedescendant="isSheet ? activeId : undefined"
          @keydown="isSheet && onKey($event)"
          @vue:mounted="sheetMode = isSheet" @vue:unmounted="sheetMode = false">
        <li v-for="(o, i) in items" :id="`${uid}-o${i}`" :key="i" role="option"
            class="ui-option" :class="{ 'is-active': i === active }"
            :aria-selected="i === selectedIndex ? 'true' : 'false'"
            :aria-disabled="o.disabled ? 'true' : undefined"
            @mousedown.prevent @click="pick(i)">
          <span>{{ o.label }}</span>
          <Icon v-if="i === selectedIndex" name="check" :size="18" />
        </li>
      </ul>
    </template>
  </UiSheet>
  </div>
</template>

<style>
.ui-field { position: relative; min-width: 0; }
</style>
