<script setup>
// F31: who checked in, for an event whose host switched on the list. Host pages only: it rides in the
// host event chunk with HostLive. It shows what the Worker returns and nothing else: people who left
// the attendance tick on, each with only the items they left ticked. A person who unticks is gone on
// the next load. The list is fetched when the tab opens, whenever the live count changes and on Refresh.
import { onMounted, ref, watch } from "vue";
import { HostApi } from "../lib/hostapi";
import { fmtDateTime } from "../lib/time";
import Waiting from "./Waiting.vue";

const props = defineProps({ eventId: { type: String, required: true }, checkins: { type: Number, default: 0 } });
const list = ref(null);
const error = ref("");
const busy = ref(false);

async function load() {
  busy.value = true; error.value = "";
  try { list.value = await HostApi.hostAttendees(props.eventId); }
  catch (e) { error.value = e.status === 404 ? "This event no longer keeps a list." : e.message; list.value = null; }
  finally { busy.value = false; }
}
onMounted(load);
watch(() => props.checkins, load);
</script>

<template>
  <section class="panel stack-2" aria-labelledby="att-h" data-attendees>
    <div class="spread">
      <h2 id="att-h">Who checked in</h2>
      <span v-if="list" class="small muted tnum">{{ list.count }} on the list</span>
    </div>
    <p class="small muted" style="margin:0">
      Only people who left the list tick on, and for each of them only what they left ticked. Someone who unticks later disappears from here.
      Look after these names: use them only for the reason you gave, and delete any copy you download once you are done.
    </p>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <Waiting v-else-if="!list" shape="list" :rows="3" label="Loading the list" :retry="load" />
    <template v-else>
      <p v-if="!list.attendees.length" class="empty small">Nobody is on the list yet. People appear here when they check in with the first tick left on.</p>
      <ul v-else class="list att-list">
        <li v-for="(a, i) in list.attendees" :key="i" class="list-row att-row">
          <span class="att-main">
            <strong>{{ a.name }}</strong>
            <span class="small muted tnum">{{ fmtDateTime(a.checkedInAt) }}</span>
          </span>
          <span v-if="'email' in a" class="small att-extra"><span class="label">Email</span> {{ a.email || "None on file" }}</span>
          <span v-if="a.card" class="small att-extra">
            <span class="label">Card</span>
            {{ [a.card.headline, a.card.line].filter(Boolean).join(" · ") || "Nothing on the card yet" }}
            <span v-for="l in a.card.links" :key="l.label" class="att-link muted">{{ l.label }}: {{ l.url }}</span>
          </span>
        </li>
      </ul>
      <p v-if="list.truncated" class="notice small">Showing the first {{ list.count }} people. Download the CSV for the rest.</p>
      <div class="btn-row">
        <a class="btn" :href="HostApi.hostAttendeesCsvUrl(eventId)" download>Download the list (CSV)</a>
        <button type="button" class="btn" :disabled="busy" @click="load">{{ busy ? "Refreshing…" : "Refresh" }}</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.att-list { list-style: none; padding: 0; margin: 0; }
.att-row { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.att-main { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; min-width: 0; }
.att-main strong { overflow-wrap: anywhere; }
.att-extra { overflow-wrap: anywhere; }
.att-link { display: block; }
</style>
