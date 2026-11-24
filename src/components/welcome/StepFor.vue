<script setup>
// Step 3: what people can come to you for, and the one line under it. No AI writes
// this for you: it is your own line, with an example to start from.
import { ref } from "vue";
import { Api } from "../../lib/api";
import { me, refreshMe } from "../../lib/store";
import TagFields from "../TagFields.vue";
import RotatingHint from "../ui/RotatingHint.vue";
import { headlineExamples, HEADLINE_MAX } from "../../lib/examples";

const p = me.profile || {};
const f = ref({ mode: p.mode === "career" ? "career" : "student", tags: (p.tags || []).join(", "), headline: p.headline || "" });

async function save() {
  await Api.updateProfile({
    tags: f.value.tags.split(",").map((s) => s.trim().slice(0, 24)).filter(Boolean).slice(0, 12),
    headline: f.value.headline,
  });
  await refreshMe();
}
defineExpose({ ready: true, save });
</script>

<template>
  <div class="stack-2">
    <h1>What can people come to you for?</h1>
    <p class="muted" style="margin:0">Pick a few, or add your own.</p>
    <TagFields :form="f" label="Add your own, separated by commas" />
    <div class="field"><label for="headline">What you do, in one line</label>
      <RotatingHint :pool="headlineExamples(f.mode)" :empty="!f.headline" v-slot="{ placeholder }">
        <input id="headline" v-model="f.headline" type="text" :maxlength="HEADLINE_MAX" :placeholder="placeholder" />
      </RotatingHint>
      <span class="small muted" style="align-self:flex-end">{{ f.headline.length }}/{{ HEADLINE_MAX }}</span></div>
  </div>
</template>
