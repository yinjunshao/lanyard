<script setup>
// A searchable list that can also take free text. A button shows the choice; it
// opens a popover (from 600 px) or bottom sheet (phones) with a search box above
// the list. The search box is a WAI-ARIA combobox with list autocomplete: focus
// stays in the box and the list is driven by aria-activedescendant.
//
//   options     [{ value, label, aliases?: [] }]
//   v-model     the chosen option's value, or null when the text is custom or empty
//   v-model:text  what the field shows: the option's label, or the custom text
//   @select     { value, label, custom } whenever something is chosen
//   @open       when the list opens (a page can load a big option list then)
//   allow-custom  adds a last option that keeps what was typed
//   custom-label  (text) => the words for that option (default: Use "text")
// Matching ignores case and accents, looks at aliases, and highlights the match.
import { computed, nextTick, ref, watch } from "vue";
import Icon from "../Icon.vue";
import UiSheet from "./UiSheet.vue";
import { nextUid } from "./uid.js";
import { fold, highlight, rankOptions } from "../../lib/match.js";

const props = defineProps({
  modelValue: { default: null },
  text: { type: String, default: "" },
  options: { type: Array, required: true },
  id: { type: String, default: undefined },
  label: { type: String, default: "" },
  labelledby: { type: String, default: "" },
  placeholder: { type: String, default: "Choose" },
  searchPlaceholder: { type: String, default: "Type to search" },
  allowCustom: Boolean,
  customLabel: { type: Function, default: (t) => `Use “${t}”` },
  clearable: Boolean,
  limit: { type: Number, default: 60 },
  disabled: Boolean,
});
const emit = defineEmits(["update:modelValue", "update:text", "select", "open"]);

const uid = nextUid();
const listId = `${uid}-list`;
const open = ref(false);
const trigger = ref(null);
const input = ref(null);
const query = ref("");
const active = ref(0);

const chosen = computed(() => props.options.find((o) => o.value === props.modelValue && props.modelValue != null));
const shown = computed(() => props.text || chosen.value?.label || "");

const ranked = computed(() => rankOptions(props.options, query.value));
const results = computed(() => ranked.value.slice(0, props.limit));
const typed = computed(() => query.value.trim());
const showCustom = computed(() => props.allowCustom && !!typed.value && !props.options.some((o) => fold(o.label) === fold(typed.value)));
// one flat list of rows: the matches, then the custom row
const rows = computed(() => [
  ...results.value.map((r) => ({ kind: "option", ...r })),
  ...(showCustom.value ? [{ kind: "custom", option: { label: typed.value } }] : []),
]);
const statusText = computed(() => {
  const n = results.value.length;
  if (!n && !showCustom.value) return "No matches";
  return `${n} ${n === 1 ? "result" : "results"}${ranked.value.length > n ? ", keep typing to narrow them" : ""}`;
});

function show(first = "") {
  if (props.disabled) return;
  query.value = first;
  open.value = true;
  emit("open");
  settle(true);
  nextTick(() => { input.value?.focus(); if (!first) input.value?.select(); });
}
function hide() { open.value = false; }

/** Put the active row on the chosen option when nothing is typed, else on the best match. */
function settle(initial) {
  const sel = initial && !query.value ? results.value.findIndex((r) => r.option.value === props.modelValue && props.modelValue != null) : -1;
  active.value = sel >= 0 ? sel : 0;
  nextTick(reveal);
}
function reveal() { document.getElementById(`${uid}-o${active.value}`)?.scrollIntoView({ block: "nearest" }); }

function choose(i) {
  const row = rows.value[i];
  if (!row) return;
  hide();
  if (row.kind === "custom") {
    emit("update:modelValue", null);
    emit("update:text", typed.value);
    emit("select", { value: null, label: typed.value, custom: true });
  } else {
    emit("update:modelValue", row.option.value);
    emit("update:text", row.option.label);
    emit("select", { value: row.option.value, label: row.option.label, custom: false });
  }
}
function clear() {
  hide();
  emit("update:modelValue", null);
  emit("update:text", "");
  emit("select", { value: null, label: "", custom: false });
}

function onInput() { settle(false); }
function onKey(e) {
  const k = e.key;
  const n = rows.value.length;
  if (k === "ArrowDown") { e.preventDefault(); if (n) { active.value = Math.min(n - 1, active.value + 1); nextTick(reveal); } }
  else if (k === "ArrowUp") { e.preventDefault(); if (n) { active.value = Math.max(0, active.value - 1); nextTick(reveal); } }
  else if (k === "PageDown") { e.preventDefault(); if (n) { active.value = Math.min(n - 1, active.value + 8); nextTick(reveal); } }
  else if (k === "PageUp") { e.preventDefault(); if (n) { active.value = Math.max(0, active.value - 8); nextTick(reveal); } }
  else if (k === "Enter") { e.preventDefault(); if (n) choose(active.value); }
}
// On the button: Down, Enter or Space opens; a letter opens with that letter typed.
function onTriggerKey(e) {
  if (props.disabled || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") { e.preventDefault(); show(); }
  else if (e.key.length === 1) { e.preventDefault(); show(e.key); }
}

const activeId = computed(() => (rows.value.length ? `${uid}-o${active.value}` : undefined));
watch(() => props.options, () => { if (open.value) settle(false); });
</script>

<template>
  <div class="ui-field">
    <button ref="trigger" type="button" class="ui-trigger ui-combo" :id="id" :disabled="disabled"
            aria-haspopup="dialog" :aria-expanded="open ? 'true' : 'false'"
            :aria-label="labelledby ? undefined : label || undefined"
            :aria-labelledby="labelledby ? `${labelledby} ${id || ''}`.trim() : undefined"
            @click="open ? hide() : show()" @keydown="onTriggerKey">
      <span class="ui-value" :class="{ 'ui-placeholder': !shown }">{{ shown || placeholder }}</span>
      <span class="ui-chevron" aria-hidden="true"></span>
    </button>

    <UiSheet :open="open" :anchor="trigger" :label="label || placeholder" fit focus=".ui-combo-input" @close="hide">
      <div class="ui-combo-pop">
        <div class="search-field ui-combo-search">
          <Icon name="search" :size="18" />
          <input ref="input" v-model="query" class="ui-combo-input" type="text" role="combobox" autocomplete="off"
                 autocapitalize="off" spellcheck="false"
                 aria-autocomplete="list" aria-expanded="true" :aria-controls="listId" :aria-activedescendant="activeId"
                 :aria-label="(label || placeholder) + ': type to search'" :placeholder="searchPlaceholder"
                 @input="onInput" @keydown="onKey" />
        </div>
        <ul :id="listId" class="ui-list ui-combo-list" role="listbox" tabindex="-1" :aria-label="label || placeholder">
          <li v-for="(r, i) in rows" :id="`${uid}-o${i}`" :key="r.kind + i + (r.option.value ?? '')" role="option"
              class="ui-option" :class="{ 'is-active': i === active, 'is-custom': r.kind === 'custom' }"
              :aria-selected="r.kind === 'option' && r.option.value === modelValue && modelValue != null ? 'true' : 'false'"
              @mousedown.prevent @click="choose(i)">
            <span class="ui-opt-text">
              <template v-if="r.kind === 'custom'">{{ customLabel(typed) }}</template>
              <template v-else>
                <template v-for="(p, j) in highlight(r.option.label, r.ranges)" :key="j"><mark v-if="p.hit">{{ p.text }}</mark><template v-else>{{ p.text }}</template></template>
                <small v-if="r.via" class="muted ui-opt-via">{{ r.via }}</small>
              </template>
            </span>
            <Icon v-if="r.kind === 'option' && r.option.value === modelValue && modelValue != null" name="check" :size="18" />
          </li>
        </ul>
        <p class="ui-empty" :class="{ 'visually-hidden': rows.length }" role="status" aria-live="polite">{{ statusText }}</p>
        <div v-if="clearable && shown" class="ui-combo-foot">
          <button type="button" class="btn-quiet" @click="clear">Clear</button>
        </div>
      </div>
    </UiSheet>
  </div>
</template>

<style>
.ui-combo-pop { min-width: 0; }
.ui-combo-search { margin: 4px 4px 4px; }
.search-field .ui-combo-input { border: none; padding: 12px 0; min-height: auto; box-shadow: none; background: transparent; }
.search-field .ui-combo-input:focus { outline: none; }
.ui-combo-list { max-height: 280px; overflow-y: auto; position: relative; }
@media (max-width: 599px) { .ui-combo-list { max-height: 42vh; } }
.ui-opt-text { min-width: 0; overflow-wrap: anywhere; }
.ui-opt-via { display: block; font-size: 13px; }
.ui-option.is-custom { border-top: 1px solid var(--rule); border-radius: 0 0 4px 4px; font-weight: 700; }
.ui-combo-foot { padding: 4px; }
</style>
