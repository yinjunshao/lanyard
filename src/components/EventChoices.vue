<script setup>
// Your directory and sponsor choices for one event, shown in a sheet on the event hub (F15).
// Changing your mind is as easy as ticking.
import { onMounted, ref } from "vue";
import { Api } from "../lib/api";

const props = defineProps({ eventId: { type: String, required: true } });
const choices = ref(null);
const error = ref("");
const saved = ref("");

onMounted(async () => {
  try { choices.value = await Api.eventChoices(props.eventId); } catch { /* nothing to show */ }
});

async function save() {
  error.value = ""; saved.value = "";
  try {
    await Api.setEventChoices(props.eventId, {
      directory: choices.value.directory,
      sponsors: choices.value.sponsors.filter((s) => s.optedIn).map((s) => s.id),
    });
    saved.value = "Saved.";
  } catch (e) { error.value = e.message; }
}
</script>

<template>
  <div v-if="choices && (choices.directoryOn || choices.sponsors.length)" class="stack">
    <p class="small muted">Change these any time. Each one takes effect at once.</p>
    <label v-if="choices.directoryOn" class="checkbox-row">
      <input v-model="choices.directory" type="checkbox" @change="save" />
      <span class="small">Show me in the room, to other people who checked in.</span>
    </label>
    <label v-for="s in choices.sponsors" :key="s.id" class="checkbox-row">
      <input v-model="s.optedIn" type="checkbox" @change="save" />
      <span class="small">Share my details with {{ s.name }}.</span>
    </label>
    <p v-if="saved" class="success-text small">{{ saved }}</p>
    <p v-if="error" class="error-text small" role="alert">{{ error }}</p>
  </div>
</template>
