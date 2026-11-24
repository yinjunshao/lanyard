<script setup>
// F30 step 2: theme and brand colour. The preview beside the form shows both as they change.
import UiSelect from "./ui/UiSelect.vue";
import CopiedFacts from "./CopiedFacts.vue";
import { THEME_OPTIONS } from "../lib/eventform";

defineProps({
  form: { type: Object, required: true },
  facts: { type: Array, default: null },
  factsState: { type: String, default: "none" },
});
</script>

<template>
  <div v-if="!form.from" class="ev-groups">
   <section class="ev-group" aria-labelledby="ev-g-look">
    <h3 id="ev-g-look" class="label ev-group-h">Check-in page</h3>
    <div class="field"><label id="ev-theme-l">Theme</label>
      <UiSelect id="ev-theme" v-model="form.theme" labelledby="ev-theme-l" :options="THEME_OPTIONS" />
      <span class="small muted">Changes how the check-in page looks. The preview shows it.</span>
    </div>
    <div class="field"><label for="ev-strap">Brand colour (optional)</label>
      <div class="row">
        <input id="ev-strap" type="color" :value="form.strapColor || '#c4441e'" style="width:56px;height:44px;padding:2px;flex:none" @input="form.strapColor = $event.target.value" />
        <span class="small muted" style="flex:1">{{ form.strapColor || "Using the theme colour" }}</span>
        <button v-if="form.strapColor" class="btn" style="width:auto;flex:none" type="button" @click="form.strapColor = ''">Reset</button>
      </div>
      <span class="small muted">Colours the strap at the top of the check-in page.</span></div>
   </section>
  </div>
  <CopiedFacts v-else-if="factsState !== 'none'" :facts="facts" :state="factsState" />
</template>
