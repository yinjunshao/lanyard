<script setup>
// A calendar for one day. v-model is "YYYY-MM-DD" (the value the old date input used),
// or "" for no date. min and max are "YYYY-MM-DD" too. Weeks start on Monday.
// Follows the WAI-ARIA date picker dialog: a button opens a dialog with a month
// grid; arrow keys move by day and week, Home/End by week, Page Up/Down by month
// (with Shift, by year), Enter or Space chooses, Esc closes, Today jumps to today.
import { computed, nextTick, onMounted, ref, watch } from "vue";
import Icon from "../Icon.vue";
import UiSheet from "./UiSheet.vue";
import { nextUid } from "./uid.js";
import {
  addDays, addMonths, clampDay, cmpDay, formatDay, formatDayLong, formatMonth, isoOf, monthGrid, parseIso, sameDay, todayLocal, weekday, weekdayNames,
} from "../../lib/dates.js";

const props = defineProps({
  modelValue: { type: String, default: "" },
  min: { type: String, default: "" },
  max: { type: String, default: "" },
  openAt: { type: String, default: "" },      // where the calendar opens when there is no value yet
  id: { type: String, default: undefined },
  label: { type: String, default: "" },
  labelledby: { type: String, default: "" },
  placeholder: { type: String, default: "Choose a date" },
  clearable: Boolean,
  disabled: Boolean,
  minToday: Boolean,                           // earliest day is today, in the viewer's zone
  // "Bare" mode has no button of its own: the parent shows a control, passes it as
  // `anchor`, and drives `open` with v-model:open. PublicCard uses this so the
  // calendar code is only fetched once someone asks to pick a date.
  bare: Boolean,
  open: Boolean,
  anchor: { type: Object, default: null },
});
const emit = defineEmits(["update:modelValue", "change", "update:open"]);

const uid = nextUid();
const titleId = `${uid}-title`;
const openLocal = ref(false);
const isOpen = computed(() => (props.bare ? props.open : openLocal.value));
const trigger = ref(null);
const cal = ref(null);

const value = computed(() => parseIso(props.modelValue));
const minDay = computed(() => (props.minToday ? todayLocal() : parseIso(props.min)));
const maxDay = computed(() => parseIso(props.max));
const names = weekdayNames();
const longNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const cursor = ref(todayLocal()); // the day that has keyboard focus
const view = computed(() => ({ y: cursor.value.y, m: cursor.value.m }));
const grid = computed(() => monthGrid(view.value.y, view.value.m));
const today = computed(() => todayLocal());
const outOfRange = (d) => (minDay.value && cmpDay(d, minDay.value) < 0) || (maxDay.value && cmpDay(d, maxDay.value) > 0);

// the month buttons are off when the whole neighbouring month is out of range
const prevOff = computed(() => !!minDay.value && cmpDay(addDays({ y: view.value.y, m: view.value.m, d: 1 }, -1), minDay.value) < 0);
const nextOff = computed(() => !!maxDay.value && cmpDay(addMonths({ y: view.value.y, m: view.value.m, d: 1 }, 1), maxDay.value) > 0);

function start() {
  cursor.value = clampDay(value.value || parseIso(props.openAt) || todayLocal(), minDay.value, maxDay.value);
}
function show() {
  if (props.disabled) return;
  start();
  openLocal.value = true;
}
function hide() { openLocal.value = false; emit("update:open", false); }
onMounted(() => { if (props.bare && props.open) start(); });
watch(() => props.open, (v) => { if (v && props.bare) start(); });

function pick(day) {
  if (outOfRange(day)) return;
  hide();
  const iso = isoOf(day);
  if (iso !== props.modelValue) { emit("update:modelValue", iso); emit("change", iso); }
}
function clear() {
  hide();
  if (props.modelValue) { emit("update:modelValue", ""); emit("change", ""); }
}

function go(day, focus = true) {
  cursor.value = clampDay(day, minDay.value, maxDay.value);
  if (focus) nextTick(focusCursor);
}
function focusCursor() {
  cal.value?.querySelector(`[data-iso="${isoOf(cursor.value)}"]`)?.focus({ preventScroll: true });
}
function onGridKey(e) {
  const c = cursor.value;
  const k = e.key;
  let next = null;
  if (k === "ArrowLeft") next = addDays(c, -1);
  else if (k === "ArrowRight") next = addDays(c, 1);
  else if (k === "ArrowUp") next = addDays(c, -7);
  else if (k === "ArrowDown") next = addDays(c, 7);
  else if (k === "Home") next = addDays(c, -weekday(c.y, c.m, c.d));
  else if (k === "End") next = addDays(c, 6 - weekday(c.y, c.m, c.d));
  else if (k === "PageUp") next = addMonths(c, e.shiftKey ? -12 : -1);
  else if (k === "PageDown") next = addMonths(c, e.shiftKey ? 12 : 1);
  if (next) { e.preventDefault(); go(next); }
}
function month(n) { go(addMonths({ ...cursor.value, d: 1 }, n), false); }
function goToday() {
  const t = todayLocal();
  if (outOfRange(t)) return;
  pick(t);
}

const shown = computed(() => (value.value ? formatDay(value.value) : ""));
watch(() => props.modelValue, () => { if (isOpen.value && value.value) cursor.value = value.value; });
</script>

<template>
  <div class="ui-field">
    <button v-if="!bare" ref="trigger" type="button" class="ui-trigger ui-date" :id="id" :disabled="disabled"
            aria-haspopup="dialog" :aria-expanded="isOpen ? 'true' : 'false'"
            :aria-label="labelledby ? undefined : label || undefined"
            :aria-labelledby="labelledby ? `${labelledby} ${id || ''}`.trim() : undefined"
            @click="isOpen ? hide() : show()">
      <span class="ui-value" :class="{ 'ui-placeholder': !shown }">{{ shown || placeholder }}</span>
      <span class="ui-chevron" aria-hidden="true"></span>
    </button>

    <UiSheet :open="isOpen" :anchor="bare ? anchor : trigger" :label="label || 'Choose a date'" focus='.ui-day[tabindex="0"]' @close="hide">
      <div class="ui-cal" ref="cal">
        <div class="ui-cal-head">
          <button type="button" class="icon-btn ui-cal-nav" aria-label="Previous month" :disabled="prevOff" @click="month(-1)">
            <Icon name="chevron" :size="20" style="transform:rotate(180deg)" />
          </button>
          <div :id="titleId" class="ui-cal-title" aria-live="polite">{{ formatMonth(view.y, view.m) }}</div>
          <button type="button" class="icon-btn ui-cal-nav" aria-label="Next month" :disabled="nextOff" @click="month(1)">
            <Icon name="chevron" :size="20" />
          </button>
        </div>
        <table class="ui-cal-grid" role="grid" :aria-labelledby="titleId" @keydown="onGridKey">
          <thead>
            <tr>
              <th v-for="(n, i) in names" :key="n" scope="col"><abbr :title="longNames[i]">{{ n }}</abbr></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, r) in grid" :key="r">
              <td v-for="c in row" :key="c.d + '-' + c.m" role="gridcell" :aria-selected="sameDay(c, value) ? 'true' : 'false'">
                <button type="button" class="ui-day"
                        :class="{ out: !c.inMonth, sel: sameDay(c, value), now: sameDay(c, today) }"
                        :data-iso="isoOf(c)"
                        :tabindex="sameDay(c, cursor) ? 0 : -1"
                        :disabled="outOfRange(c)"
                        :aria-label="formatDayLong(c) + (sameDay(c, today) ? ', today' : '')"
                        :aria-current="sameDay(c, today) ? 'date' : undefined"
                        @click="pick(c)">{{ c.d }}</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="ui-cal-foot">
          <button type="button" class="btn-quiet" :disabled="outOfRange(today)" @click="goToday">Today</button>
          <button v-if="clearable && modelValue" type="button" class="btn-quiet" @click="clear">Clear</button>
        </div>
      </div>
    </UiSheet>
  </div>
</template>

<style>
.ui-cal { min-width: 0; }
.ui-cal-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 6px 4px; }
.ui-cal-title { font-weight: 700; font-size: 16px; text-align: center; flex: 1; }
.ui-cal-nav { width: 44px; height: 44px; }
.ui-cal-nav:focus-visible, .ui-day:focus-visible { outline: 2.5px solid var(--strap); outline-offset: -2px; }
.ui-cal-nav[disabled] { opacity: 0.35; cursor: default; }
.ui-cal-grid { border-collapse: collapse; width: 100%; table-layout: fixed; }
.ui-cal-grid th {
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--graphite); padding: 4px 0; text-align: center;
}
.ui-cal-grid abbr { text-decoration: none; }
.ui-cal-grid td { padding: 0; text-align: center; }
.ui-day {
  width: 100%; min-width: 44px; min-height: 44px; padding: 0;
  background: transparent; border: 1px solid transparent; border-radius: 4px;
  font: inherit; font-size: 16px; font-variant-numeric: tabular-nums; color: var(--ink); cursor: pointer;
}
.ui-day.out { color: var(--graphite); }
.ui-day.now { border-color: var(--graphite); }
.ui-day.sel { background: var(--ink); color: var(--paper); border-color: var(--ink); font-weight: 700; }
.ui-day[disabled] { opacity: 0.3; cursor: default; }
.ui-cal-foot { display: flex; justify-content: space-between; gap: 8px; padding: 8px 6px 4px; min-height: 48px; }
.ui-cal-foot .btn-quiet[disabled] { opacity: 0.4; cursor: default; }
@media (min-width: 600px) { .ui-cal { width: 322px; } }
</style>
