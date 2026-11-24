<script setup>
// F63: "Food or drinks provided", on Create event (step 3) and the Details tab of a saved event. A tick; when it is on a
// block eases open (UiReveal) with what there is and a row of option ticks. It edits `foodOn`, `food` and `diet` on the
// form it is given. `prefix` is "ev" on Create and "d" on Details, so each field keeps its own id.
import UiReveal from "./ui/UiReveal.vue";
import { DIET_IDS, dietLabel } from "../lib/eventinfo";

const props = defineProps({ form: { type: Object, required: true }, prefix: { type: String, default: "ev" } });
const id = (s) => `${props.prefix}-${s}`;
</script>

<template>
  <div class="food" data-food>
    <label class="checkbox-row">
      <input :id="id('food-on')" type="checkbox" v-model="form.foodOn" :aria-controls="id('food-more')" />
      <span class="small"><strong>Food or drinks provided</strong>
        <span class="muted" style="display:block">Tick this to say what there is and who it suits.</span></span>
    </label>
    <UiReveal :open="!!form.foodOn">
      <div :id="id('food-more')" class="food-more">
        <div class="field"><label :for="id('food')">What there is</label>
          <input :id="id('food')" v-model="form.food" type="text" maxlength="200" placeholder="Pizza and soft drinks" :aria-describedby="id('food-h')" />
          <span :id="id('food-h')" class="small muted">A short line. People see it on the check-in page.</span></div>
        <fieldset class="diet">
          <legend class="label">Options covered</legend>
          <div class="diet-row">
            <label v-for="value in DIET_IDS" :key="value" class="checkbox-row">
              <input type="checkbox" v-model="form.diet" :value="value" />
              <span class="small">{{ dietLabel(value) }}</span>
            </label>
          </div>
        </fieldset>
      </div>
    </UiReveal>
  </div>
</template>

<style scoped>
.food-more { padding-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.diet { border: 0; margin: 0; padding: 0; min-width: 0; }
.diet legend { padding: 0; margin-bottom: 4px; }
.diet-row { display: flex; flex-wrap: wrap; gap: 0 20px; }
.diet-row .checkbox-row { width: auto; }
</style>
