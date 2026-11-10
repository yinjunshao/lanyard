<script setup>
// Settings, Plan: what the AI features allow on Free and on Plus (F21). The numbers come from the Worker
// (AI_LIMITS in worker/plans.js), so this page never carries its own copy.
import { onMounted, ref } from "vue";
import { api } from "../../lib/api";

const rows = ref([]);
const aiOn = ref(false);
const NAMES = { followup: "Follow-up message drafts", people_search: "Do I know someone who...", who_to_meet: "People to meet at an event" };

const say = (l) => {
  if (!l) return "Not included";
  if (l.perScope !== undefined) return `${l.perScope} per event`;
  return [l.day !== undefined ? `${l.day} a day` : "", l.month !== undefined ? `${l.month} a month` : ""].filter(Boolean).join(", ");
};

onMounted(async () => {
  try {
    const s = await api("/api/ai/status");
    rows.value = s.allowances;
    aiOn.value = s.on;
  } catch { /* nothing to show */ }
});
</script>

<template>
  <section v-if="rows.length" class="panel stack" aria-labelledby="ai-allow-h">
    <span id="ai-allow-h" class="label">AI allowances</span>
    <p class="small muted" style="margin:0">
      AI features start only when you tap, you read the result before anything is sent, and each has a version without AI. These are the most you can use.
      <template v-if="!aiOn">AI features are not switched on yet.</template>
    </p>
    <div class="list">
      <div v-for="r in rows" :key="r.key" class="list-row" style="flex-direction:column;align-items:stretch;gap:4px">
        <strong>{{ NAMES[r.key] || r.label }}</strong>
        <span class="small"><span class="muted">Free:</span> {{ say(r.free) }}</span>
        <span class="small"><span class="muted">Plus:</span> {{ say(r.plus) }}</span>
      </div>
    </div>
    <p class="small muted" style="margin:0">Allowances reset at midnight UTC. Hosts have their own.</p>
  </section>
</template>
