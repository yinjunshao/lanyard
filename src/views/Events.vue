<script setup>
import { onMounted, ref } from "vue";
import { Api } from "../lib/api";

const events = ref([]);
const loading = ref(true);

onMounted(async () => {
  try {
    events.value = (await Api.myEvents()).events || [];
  } finally {
    loading.value = false;
  }
});

const fmt = (t) =>
  t ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
</script>

<template>
  <div class="stack-3">
    <div class="page-head">
      <span class="label">Your events</span>
      <h1>Events</h1>
    </div>

    <p v-if="loading" class="muted">Loading…</p>
    <div v-else-if="!events.length" class="empty stack">
      <span class="label">No events yet</span>
      <p>Scan an event QR to check in. The room directory, album and perks then appear here.</p>
      <router-link to="/app/scan" class="btn btn-primary" style="margin-top:8px">Scan an event QR</router-link>
    </div>

    <div v-else class="list">
      <router-link
        v-for="e in events"
        :key="e.id"
        :to="`/app/events/${e.id}`"
        class="list-row spread"
      >
        <span>
          <strong>{{ e.name }}</strong>
          <span class="small muted" style="display:block">
            {{ [e.venue, fmt(e.startsAt)].filter(Boolean).join(" · ") }}
          </span>
        </span>
        <span class="label">Open ›</span>
      </router-link>
    </div>
  </div>
</template>
