<script setup>
// Your directory and sponsor choices for one event, shown in a sheet on the event hub (F15).
// Changing your mind is as easy as ticking.
import { onMounted, ref } from "vue";
import { api } from "../lib/api";

const props = defineProps({ eventId: { type: String, required: true } });
const choices = ref(null);
const error = ref("");
const saved = ref("");

onMounted(async () => {
  try { choices.value = await api(`/api/e/${props.eventId}/choices`); } catch { /* nothing to show */ }
});

async function save() {
  error.value = ""; saved.value = "";
  try {
    await api(`/api/e/${props.eventId}/choices`, "PUT", {
      directory: choices.value.directory,
      sponsors: choices.value.sponsors.filter((s) => s.optedIn).map((s) => s.id),
    });
    saved.value = "Saved.";
  } catch (e) { error.value = e.message; }
}
</script>

<template>
  <div v-if="choices && (choices.directoryOn || choices.sponsors.length)" class="stack-2">
    <p class="small muted" style="margin:0">Change these any time. Each one takes effect at once.</p>
    <template v-if="choices.directoryOn">
      <span class="label">The room</span>
      <label class="checkbox-row choice-row">
        <input v-model="choices.directory" type="checkbox" @change="save" />
        <span class="small">Show me in the room, to other people who checked in.</span>
      </label>
    </template>
    <template v-if="choices.sponsors.length">
      <span class="label">Sponsors</span>
      <label v-for="s in choices.sponsors" :key="s.id" class="checkbox-row choice-row">
        <input v-model="s.optedIn" type="checkbox" @change="save" />
        <span class="small">Share my details with <strong>{{ s.name }}</strong>.</span>
      </label>
    </template>
    <p v-if="saved" class="success-text small">{{ saved }}</p>
    <p v-if="error" class="error-text small" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.choice-row { width: 100%; min-height: 52px; align-items: center; padding: 10px 12px; border: var(--border); border-radius: var(--radius); background: var(--paper-raised); cursor: pointer; }
.choice-row input[type="checkbox"] { margin-top: 0; }
.choice-row span { overflow-wrap: anywhere; }
</style>
