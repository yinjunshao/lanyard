<script setup>
// F31: your choices about an event's list of who checked in, changeable any time. Used on the event hub
// (in "Your choices at this event") and in Settings, Privacy and data. Each change takes effect at
// once: unticking the first row takes you off the organisers' list, so their next look no longer shows you.
// The words come from the Worker (the same words the check-in page showed). Rows are 44 px or taller.
import { onMounted, ref, watch } from "vue";
import { api } from "../lib/api";

const props = defineProps({
  eventId: { type: String, required: true },
  // Settings passes the event's name as the heading; on the hub the sheet already names the event.
  title: { type: String, default: "" },
});
const st = ref(null); // { on, organiser, why, attendance, label, items: [{ key, label, on }] }
const busy = ref(false);
const error = ref("");
const saved = ref("");

async function load() {
  st.value = null; error.value = ""; saved.value = "";
  try { const r = await api(`/api/e/${encodeURIComponent(props.eventId)}/attendance`); st.value = r.on ? r : null; } catch { st.value = null; }
}
onMounted(load);
watch(() => props.eventId, load);

async function save(change) {
  if (busy.value || !st.value) return;
  busy.value = true; error.value = ""; saved.value = "";
  const next = { attendance: st.value.attendance, ...Object.fromEntries(st.value.items.map((i) => [i.key, i.on])), ...change };
  try {
    const r = await api(`/api/e/${encodeURIComponent(props.eventId)}/attendance`, "PUT", next);
    st.value = { ...st.value, attendance: r.attendance, items: r.items };
    saved.value = r.attendance ? "Saved." : "You are off the list. The organisers no longer see you there.";
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
const setAttendance = (on) => save({ attendance: on });
const setItem = (key, on) => save({ [key]: on });
</script>

<template>
  <section v-if="st" class="stack-2 att-choices" :aria-label="title || 'The organisers\' list'">
    <h3 v-if="title" class="label" style="margin:0">{{ title }}</h3>
    <p class="small" style="margin:0"><strong>{{ st.organiser }}</strong> keeps a list of who checked in. <span class="muted">Why:</span> {{ st.why }}</p>
    <label class="checkbox-row att-row">
      <input type="checkbox" :checked="st.attendance" :disabled="busy" data-item="attendance" @change="setAttendance($event.target.checked)" />
      <span class="small">{{ st.label }}</span>
    </label>
    <label v-for="i in st.items" :key="i.key" class="checkbox-row att-row" :class="{ locked: !st.attendance }">
      <input type="checkbox" :checked="st.attendance && i.on" :disabled="busy || !st.attendance" :data-item="i.key" @change="setItem(i.key, $event.target.checked)" />
      <span class="small">{{ i.label }}</span>
    </label>
    <p v-if="saved" class="success-text small" role="status">{{ saved }}</p>
    <p v-if="error" class="error-text small" role="alert">{{ error }}</p>
    <p class="small muted" style="margin:0">Unticking takes effect at once. Details already given to the organisers are theirs to look after: see the <router-link to="/privacy" target="_blank">Privacy Policy</router-link>.</p>
  </section>
</template>

<style scoped>
.att-row { width: 100%; min-height: 48px; align-items: center; padding: 10px 12px; border: var(--border); border-radius: var(--radius); background: var(--paper-raised); cursor: pointer; }
.att-row.locked { cursor: default; opacity: .7; }
.att-row input[type="checkbox"] { margin-top: 0; }
</style>
