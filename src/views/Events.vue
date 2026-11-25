<script setup>
// The Events tab (F15): what is on now, then the events you went to, with the date you attended.
import { computed, onMounted, ref } from "vue";
import { Api } from "../lib/api";
import { setLive, useEventClock } from "../lib/eventlive";
import { connectionsText, dateOf, groupByStatus, statusText, timeOfDay } from "../lib/eventtext";
import EventStatusChip from "../components/EventStatusChip.vue";
import Waiting from "../components/Waiting.vue";

const events = ref([]);
const loading = ref(true);
const loadError = ref("");
const { setServerNow, statusOf } = useEventClock();

async function load() {
  loading.value = true; loadError.value = "";
  try {
    const data = await Api.myEvents();
    setServerNow(data.now);
    events.value = data.events || [];
    setLive(events.value, data.now);
  } catch (e) {
    loadError.value = e.message || "Couldn't load your events.";
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const rows = computed(() => events.value.map((e) => ({ e, status: statusOf(e) })));
// In progress first, then upcoming (soonest first), then past events (newest attended first).
const groups = computed(() => groupByStatus(rows.value, (e) => e.checkedInAt));
const live = computed(() => [{ id: "now", title: "In progress", list: groups.value.ongoing }, { id: "soon", title: "Upcoming", list: groups.value.upcoming }].filter((g) => g.list.length));
</script>

<template>
  <div class="stack-3">
    <div class="page-head">
      <h1 style="margin-top:0">Events</h1>
    </div>

    <Waiting v-if="loading" shape="list" :rows="4" label="Loading your events" :retry="load" />
    <div v-else-if="loadError" class="empty stack" role="alert">
      <span class="label">Couldn't load your events</span>
      <p>{{ loadError }}</p>
      <button type="button" class="btn" @click="load">Try again</button>
    </div>
    <div v-else-if="!events.length" class="empty stack">
      <span class="label">No events yet</span>
      <p>Scan an event QR to check in. The room directory, album and perks then appear here.</p>
      <router-link to="/app/scan" class="btn btn-primary" style="margin-top:8px">Scan an event QR</router-link>
    </div>

    <template v-else>
      <section v-for="g in live" :key="g.id" class="stack" :aria-labelledby="`events-${g.id}`">
        <h2 :id="`events-${g.id}`" class="label">{{ g.title }}</h2>
        <router-link v-for="{ e, status } in g.list" :key="e.id" :to="`/app/events/${e.id}`" class="panel event-card">
          <span class="event-status"><EventStatusChip :status="status" /><span v-if="status === 'upcoming'" class="small muted">{{ statusText(status, e) }}</span></span>
          <strong class="event-name">{{ e.name }}</strong>
          <span v-if="e.venue" class="small muted">{{ e.venue }}</span>
          <span class="small muted">Checked in {{ timeOfDay(e.checkedInAt) }} · {{ connectionsText(e.connectionCount) }}</span>
        </router-link>
      </section>

      <section v-if="groups.ended.length" class="stack" aria-labelledby="events-past">
        <h2 id="events-past" class="label">Past events</h2>
        <div class="list">
          <router-link v-for="{ e, status } in groups.ended" :key="e.id" :to="`/app/events/${e.id}`" class="list-row spread">
            <span style="min-width:0">
              <strong>{{ e.name }}</strong>
              <span class="small muted" style="display:block">Attended {{ dateOf(e.checkedInAt) }}</span>
              <span class="small muted" style="display:block">{{ connectionsText(e.connectionCount) }}</span>
            </span>
            <EventStatusChip :status="status" />
          </router-link>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.event-card { display: flex; flex-direction: column; gap: 4px; color: inherit; }
.event-name { font-size: 18px; }
.event-status { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
</style>
