<script setup>
// F60: Settings, Privacy and data. Every event where you have a Suggest me choice (they go 48 hours after each event
// ends), each with the same tick and words as the check-in page and the event hub. Untick to come out of everyone's
// Who to meet at that event at once. Shows nothing at all if there are none.
import { onMounted, ref } from "vue";
import { api } from "../../lib/api";
import { SUGGEST_NOTICE } from "../../lib/suggest";

const events = ref([]);
const busy = ref("");
const error = ref("");
const note = ref("");
onMounted(async () => {
  try { events.value = (await api("/api/account/suggest")).events || []; } catch { /* signed out, or no signal */ }
});
async function toggle(ev, e) {
  const on = e.target.checked;
  busy.value = ev.id; error.value = ""; note.value = "";
  try {
    const r = await api(`/api/e/${encodeURIComponent(ev.id)}/suggest`, "PUT", { suggest: on, from: "settings" });
    ev.suggest = !!r.suggest;
    note.value = on ? `You're suggested to people at ${ev.name} again.` : `Done. You're not suggested to anyone at ${ev.name} now.`;
  } catch (err) { error.value = err.message; e.target.checked = !on; }
  finally { busy.value = ""; }
}
</script>

<template>
  <div v-if="events.length" class="list stack-2" style="padding:16px" data-suggest-setting>
    <span class="label">Suggestions at events</span>
    <p class="small muted" style="margin:0">{{ SUGGEST_NOTICE }} Untick to stay out of everyone's Who to meet at that event, at once.</p>
    <label v-for="ev in events" :key="ev.id" class="checkbox-row" style="min-height:44px">
      <input type="checkbox" :checked="ev.suggest" :disabled="busy === ev.id" @change="toggle(ev, $event)" />
      <span class="small"><strong>{{ ev.name }}</strong><span v-if="ev.intention" class="muted" style="display:block">Hoping to: {{ ev.intention }}</span></span>
    </label>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <p v-if="note" class="success-text" role="status">{{ note }}</p>
  </div>
</template>
