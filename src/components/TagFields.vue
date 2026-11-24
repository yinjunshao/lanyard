<script setup>
// "Come to me for": tag boxes (press Enter after each) with five suggestions by mode, shared by Edit profile
// and the welcome steps (F14, F53). `form.tags` is still one string, tags with commas between them, as it
// always was, so what the forms save does not change; the first 4 show on the badge.
import { computed } from "vue";
import UiTagInput from "./ui/UiTagInput.vue";
import { PROFILE_TAGS, addTags, hasTag, joinTags, parseTags, suggestionsFor } from "../lib/tags";

const props = defineProps({
  form: { type: Object, required: true },
  label: { type: String, default: "Come to me for" },
});

const tags = computed({ get: () => parseTags(props.form.tags), set: (v) => { props.form.tags = joinTags(v); } });
const SUGGESTED = computed(() => suggestionsFor(props.form.mode));
const left = computed(() => SUGGESTED.value.filter((t) => !hasTag(tags.value, t)));
const full = computed(() => tags.value.length >= PROFILE_TAGS.max);
function add(t) { tags.value = addTags(tags.value, t, PROFILE_TAGS).tags; }
</script>

<template>
  <div class="field"><label for="tags">{{ label }}</label>
    <UiTagInput id="tags" v-model="tags" :max="PROFILE_TAGS.max" :max-length="PROFILE_TAGS.maxLength" />
    <div v-if="left.length && !full" class="chip-row" role="group" aria-label="Suggestions" style="margin-top:6px">
      <button v-for="t in left" :key="t" type="button" class="chip chip-toggle" @click="add(t)">+ {{ t }}</button>
    </div>
    <span class="small muted">Press Enter after each one. The first 4 show on your badge, so keep them short.</span></div>
</template>
