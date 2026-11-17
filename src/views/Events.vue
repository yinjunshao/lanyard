<script setup>
// The Events tab (F15): what is on now, then the events you went to, with the date you attended.
import { computed, onMounted, ref } from "vue";
import { Api } from "../lib/api";
import { setLive, useEventClock } from "../lib/eventlive";
import { connectionsText, dateOf, statusText, timeOfDay } from "../lib/eventtext";
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
// Ongoing first, then the ones that start later (soonest first); past events newest attended first.
const now = computed(() => rows.value
  .filter((r) => r.status !== "ended")
  .sort((a, b) => (a.status === b.status ? (a.status === "upcoming" ? a.e.startsAt - b.e.startsAt : b.e.checkedInAt - a.e.checkedInAt) : a.status === "ongoing" ? -1 : 1)));
const past = computed(() => rows.value.filter((r) => r.status === "ended").sort((a, b) => b.e.checkedInAt - a.e.checkedInAt));
</script>

<template>
  <div class="stack-3">
    <div class="page-head">
      <span class="label">Your events</span>
      <h1>Events</h1>
    </div>

    <Waiting v-if="loading" shape="list" :rows="4" label="Loading your events" :retry="load" />
    <div v-else-if="loadError" class="empty stack" role="alert">
      <span class="label">Couldn't load your events</span>
      <p>{{ loadError }}</p>
    </div>
    <div v-else-if="!events.length" class="empty stack">
      <span class="label">No events yet</span>
      <p>Scan an event QR to check in. The room directory, album and perks then appear here.</p>
      <router-link to="/app/scan" class="btn btn-primary" style="margin-top:8px">Scan an event QR</router-link>
    </div>

    <template v-else>
      <section v-if="now.length" class="stack" aria-labelledby="events-now">
        <h2 id="events-now" class="label">Happening now</h2>
        <router-link v-for="{ e, status } in now" :key="e.id" :to="`/app/events/${e.id}`" class="panel event-card">
          <span class="event-status label" :class="status">{{ statusText(status, e) }}</span>
          <strong class="event-name">{{ e.name }}</strong>
          <span v-if="e.venue" class="small muted">{{ e.venue }}</span>
          <span class="small muted">Checked in {{ timeOfDay(e.checkedInAt) }} · {{ connectionsText(e.connectionCount) }}</span>
        </router-link>
      </section>

      <section v-if="past.length" class="stack" aria-labelledby="events-past">
        <h2 id="events-past" class="label">Past events</h2>
        <div class="list">
          <router-link v-for="{ e } in past" :key="e.id" :to="`/app/events/${e.id}`" class="list-row spread">
            <span style="min-width:0">
              <strong>{{ e.name }}</strong>
              <span class="small muted" style="display:block">Attended {{ dateOf(e.checkedInAt) }}</span>
              <span class="small muted" style="display:block">{{ connectionsText(e.connectionCount) }}</span>
            </span>
            <span class="event-status label ended">Ended</span>
          </router-link>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.event-card { display: flex; flex-direction: column; gap: 4px; color: inherit; }
.event-name { font-size: 18px; }
.event-status.ongoing, .event-status.upcoming { color: var(--strap-deep); }
.event-status.ended { color: var(--graphite); }
</style>
