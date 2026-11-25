<script setup>
// F30 step 2: the theme and, under Advanced, the brand colour and the text on the strap (F65, EventLook). The preview beside the form shows them as they change.
import CopiedFacts from "./CopiedFacts.vue";
import EventLook from "./EventLook.vue";

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
    <EventLook :form="form" prefix="ev" />
   </section>
  </div>
  <CopiedFacts v-else-if="factsState !== 'none'" :facts="facts" :state="factsState" />
</template>
