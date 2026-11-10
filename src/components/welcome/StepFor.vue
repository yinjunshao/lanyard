<script setup>
// Step 3: what people can come to you for, and the one line under it. No AI writes
// this for you: it is your own line, with an example to start from.
import { ref } from "vue";
import { Api } from "../../lib/api";
import { me, refreshMe } from "../../lib/store";
import TagFields from "../TagFields.vue";

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
      <input id="headline" v-model="f.headline" type="text" maxlength="80" placeholder="e.g. Building robots and Roblox games" />
      <span class="small muted" style="align-self:flex-end">{{ f.headline.length }}/80</span></div>
  </div>
</template>
