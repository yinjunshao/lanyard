<script setup>
// F63: perks as rows, one row a perk: a narrow "Perk" box and a wide "Details (optional)" box, with Remove, and
// "Add a perk" under them (ten at most). Used on Create event (step 3) and the Details tab; it edits `form.perks`, a list
// of { name, details } (lib/perkrows.js turns each into "Name (Details)", the string the Worker and the attendee's perk
// button already use). `errors` come from perkProblems(): "perk0-name", "perk0-details", "perks". `prefix` keeps ids apart.
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { DETAILS_MAX, NAME_MAX, PERK_MAX, blankPerk } from "../lib/perkrows";

const props = defineProps({
  form: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
  prefix: { type: String, default: "ev" },
});
const root = ref(null);
const addBtn = ref(null);
const fresh = ref(-1);   // the row just added: it eases in
const leaving = ref(-1); // the row being taken away: it fades out first, then goes
let timer = 0;
const list = computed(() => props.form.perks || []);
const mine = () => (props.form.perks ||= []); // for changes: a form from an older draft may not have the list yet
const focusName = (i) => nextTick(() => root.value?.querySelector(`#${props.prefix}-perk${i}-name`)?.focus());

function add() {
  if (mine().length >= PERK_MAX) return;
  mine().push(blankPerk());
  fresh.value = mine().length - 1;
  focusName(fresh.value);
}
function remove(i) {
  if (leaving.value >= 0) return;
  leaving.value = i;
  timer = setTimeout(() => {
    mine().splice(i, 1);
    leaving.value = -1;
    fresh.value = -1;
    // Focus stays in the list: the row that took its place, the one before, or the Add button.
    if (mine().length) focusName(Math.min(i, mine().length - 1));
    else nextTick(() => addBtn.value?.focus());
  }, 140);
}
onBeforeUnmount(() => clearTimeout(timer));
const nameOf = (p, i) => p.name.trim() || `perk ${i + 1}`;
</script>

<template>
  <div ref="root" class="perks" data-perk-rows>
    <p v-if="!list.length" :id="`${prefix}-perks-h`" class="small muted perks-empty">No perks yet. A perk with details gets a button on the event page that opens them.</p>
    <ul v-else class="perk-rows" :aria-describedby="`${prefix}-perks-h`">
      <li v-for="(p, i) in list" :key="i" class="perk-row" :class="{ fresh: fresh === i, gone: leaving === i }" :inert="leaving === i ? '' : null">
        <div class="field perk-name"><label :for="`${prefix}-perk${i}-name`">Perk</label>
          <input :id="`${prefix}-perk${i}-name`" v-model="p.name" type="text" autocomplete="off" :maxlength="NAME_MAX + 20" placeholder="Free coffee"
                 :aria-invalid="errors[`perk${i}-name`] ? 'true' : null" :aria-describedby="errors[`perk${i}-name`] ? `${prefix}-perk${i}-name-e` : null" />
          <span v-if="errors[`perk${i}-name`]" :id="`${prefix}-perk${i}-name-e`" class="error-text" role="alert">{{ errors[`perk${i}-name`] }}</span></div>
        <div class="field perk-details"><label :for="`${prefix}-perk${i}-details`">Details (optional)</label>
          <input :id="`${prefix}-perk${i}-details`" v-model="p.details" type="text" autocomplete="off" :maxlength="DETAILS_MAX + 20" placeholder="Show this at the bar before 11am"
                 :aria-invalid="errors[`perk${i}-details`] ? 'true' : null" :aria-describedby="errors[`perk${i}-details`] ? `${prefix}-perk${i}-details-e` : null" />
          <span v-if="errors[`perk${i}-details`]" :id="`${prefix}-perk${i}-details-e`" class="error-text" role="alert">{{ errors[`perk${i}-details`] }}</span></div>
        <button type="button" class="link-btn perk-remove" :aria-label="`Remove ${nameOf(p, i)}`" @click="remove(i)">Remove</button>
      </li>
    </ul>
    <span v-if="list.length" :id="`${prefix}-perks-h`" class="small muted">The details open when someone taps the perk on the event page. Leave them empty for a plain line.</span>
    <p v-if="errors.perks" class="error-text" role="alert" :id="`${prefix}-perks-e`">{{ errors.perks }}</p>
    <button ref="addBtn" type="button" class="btn perk-add" :disabled="list.length >= PERK_MAX" @click="add">{{ list.length >= PERK_MAX ? "Ten perks is the most" : "Add a perk" }}</button>
  </div>
</template>

<style scoped>
.perks { container-type: inline-size; display: flex; flex-direction: column; gap: 8px; }
.perks-empty { margin: 0; }
.perk-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.perk-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0 8px; align-items: start; padding-bottom: 8px; }
.perk-row .field { margin-bottom: 8px; }
.perk-row.fresh { animation: m-rise var(--dur) var(--ease-out) backwards; }
.perk-row.gone { animation: m-fade-out var(--dur-out) var(--ease-in) forwards; pointer-events: none; }
.perk-remove { justify-self: start; min-height: 44px; padding: 0 4px; }
.perk-add { width: auto; align-self: flex-start; }
/* Side by side once the form column is wide enough: the name is the narrow box, the details the wide one. */
@container (min-width: 480px) {
  .perk-row { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) auto; }
  .perk-remove { justify-self: end; align-self: end; margin-bottom: 8px; }
}
</style>
