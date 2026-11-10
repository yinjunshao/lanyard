<script setup>
// "Come to me for": the tags field with suggestion chips by mode, shared by Edit
// profile and the welcome steps (F14). `form.tags` is a comma separated string, as
// it always was on Edit profile; the first 4 show on the badge.
import { computed } from "vue";

const props = defineProps({
  form: { type: Object, required: true },
  label: { type: String, default: "Come to me for — comma separated" },
});

const SUGGESTED_STUDENT = ["CV reviews", "internships", "hackathons", "startups", "coding help", "design", "finding a team", "research"];
const SUGGESTED_CAREER = ["Hiring", "Referrals", "Industry advice", "Mentoring", "Side projects"];
const SUGGESTED = computed(() => (props.form.mode === "career" ? SUGGESTED_CAREER : SUGGESTED_STUDENT));
const tagList = computed(() => (props.form.tags || "").split(",").map((t) => t.trim()).filter(Boolean));
function toggleTag(t) {
  const have = tagList.value;
  const i = have.findIndex((x) => x.toLowerCase() === t.toLowerCase());
  props.form.tags = (i >= 0 ? have.filter((_, j) => j !== i) : [...have, t]).join(", ");
}
const hasTag = (t) => tagList.value.some((x) => x.toLowerCase() === t.toLowerCase());
</script>

<template>
  <div class="field"><label for="tags">{{ label }}</label>
    <input id="tags" v-model="form.tags" type="text" placeholder="hackathons, CV reviews, CAD" />
    <div class="chip-row" role="group" aria-label="Suggestions" style="margin-top:6px">
      <button v-for="t in SUGGESTED" :key="t" type="button" class="chip chip-toggle"
              :aria-pressed="hasTag(t)" :class="{ on: hasTag(t) }" @click="toggleTag(t)">{{ hasTag(t) ? "✓ " : "+ " }}{{ t }}</button>
    </div>
    <span class="small muted">The first 4 show on your badge — keep each one short, e.g. "CV reviews"</span></div>
</template>
