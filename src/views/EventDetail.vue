<script setup>
// The event hub (F15): where check-in lands. Back arrow, the event and where it stands, your
// figures, the people you met here, then the room, album and perks. One request for this event
// only, not the whole list.
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, Api } from "../lib/api";
import Avatar from "../components/Avatar.vue";
import EventChoices from "../components/EventChoices.vue";
import EventAttendanceChoices from "../components/EventAttendanceChoices.vue";
import EventPresence from "../components/EventPresence.vue";
import Icon from "../components/Icon.vue";
import UiSheet from "../components/ui/UiSheet.vue";
import { connectedShort, subtitleOf } from "../lib/profile";
import { setLive, useEventClock } from "../lib/eventlive";
import { connectionsText, dateOf, statusText, timeOfDay } from "../lib/eventtext";

const route = useRoute();
const router = useRouter();
const eventId = computed(() => route.params.id);
const tab = ref("room");
const room = ref([]);
const album = ref([]);
const loading = ref(true);
const error = ref("");
const gone = ref(false);

const hub = ref(null); // { event, status, checkedInAt, connectionCount, roomCount, connections }
const feedback = ref(null); // { status, opensAt }
const { setServerNow, statusOf } = useEventClock();

// Loads when the page opens and again if the address changes to another event.
watch(eventId, load, { immediate: true });
async function load(id) {
  if (!id) return; // the route is changing to another page
  loading.value = true; gone.value = false; error.value = ""; hub.value = null; feedback.value = null; room.value = []; album.value = []; tab.value = "room";
  try {
    const data = await api(`/api/my/events/${encodeURIComponent(id)}`);
    setServerNow(data.now);
    hub.value = data;
    // This event is the one the tab dot cares about if it is on; the rest of the list is not needed here.
    if (data.status === "ongoing") setLive([{ ...data.event, checkedInAt: data.checkedInAt }], data.now);
    loadRoom();
    Api.feedbackForm(id).then((f) => { feedback.value = f; }).catch(() => {});
  } catch (e) {
    // 404: you did not check in, or the event has been removed (a host reset deletes events).
    if (e.status === 404) gone.value = true;
    else error.value = e.message || "Couldn't load this event.";
  } finally {
    loading.value = false;
  }
}

async function loadRoom() {
  try { room.value = (await Api.room(eventId.value)).people || []; } catch { /* the Room tab says nobody yet */ }
}
async function loadAlbum() {
  try { album.value = (await Api.album(eventId.value)).photos || []; } catch { /* the Album tab says none yet */ }
}
function switchTab(t) {
  tab.value = t;
  if (t === "album") loadAlbum();
}

const event = computed(() => hub.value?.event || null);
const status = computed(() => (hub.value ? statusOf({ ...hub.value.event, checkedInAt: hub.value.checkedInAt }) : ""));
const checkedToday = computed(() => hub.value && new Date(hub.value.checkedInAt).toDateString() === new Date().toDateString());
const people = computed(() => hub.value?.connections || []);

// Back goes to My card, the page people check in from. Only if you came from the Events list
// does it go back there, so a check-in from the Scan page does not drop you back on Scan.
function back() {
  if (window.history.state?.back === "/app/events") router.back();
  else router.push("/app");
}
const backLabel = () => (window.history.state?.back === "/app/events" ? "Back to Events" : "Back to My card");

const choicesOpen = ref(false);
const choicesTrigger = ref(null);
</script>

<template>
  <div class="stack-3">
    <div class="hub-head">
      <button type="button" class="hub-back" :aria-label="backLabel()" @click="back">
        <span aria-hidden="true">‹</span>
      </button>
      <div v-if="event" class="hub-title">
        <span class="label hub-status" :class="status">{{ statusText(status, event) }}</span>
        <h1>{{ event.name }}</h1>
        <p v-if="event.venue" class="sub">{{ event.venue }}</p>
      </div>
      <h1 v-else-if="!loading" class="hub-title">Event</h1>
    </div>

    <p v-if="loading" class="muted">Loading…</p>
    <div v-else-if="gone" class="empty stack">
      <span class="label">Not available</span>
      <p>This event isn't in your list, or it has been removed.</p>
      <router-link to="/app/events" class="btn btn-primary" style="margin-top:8px">See your events</router-link>
    </div>
    <p v-else-if="error" class="error-text" role="alert">{{ error }}</p>

    <template v-else>
      <dl class="hub-stats" aria-label="Your figures for this event">
        <div>
          <dt class="label">Connections</dt>
          <dd>{{ hub.connectionCount }}</dd>
        </div>
        <div>
          <dt class="label">Checked in</dt>
          <dd>{{ timeOfDay(hub.checkedInAt) }}<span v-if="!checkedToday" class="small muted stat-sub">{{ dateOf(hub.checkedInAt) }}</span></dd>
        </div>
        <div v-if="hub.roomCount !== null">
          <dt class="label">{{ status === "ended" ? "In the room" : "People here" }}</dt>
          <dd>{{ hub.roomCount }}</dd>
        </div>
      </dl>

      <router-link v-if="feedback?.status === 'open'" :to="`/app/feedback/${eventId}`" class="panel spread" style="color:inherit">
        <span><strong>How was it?</strong><br /><span class="small muted">Anonymous feedback for the organisers. One minute.</span></span>
        <span class="btn btn-primary" style="width:auto">Give feedback</span>
      </router-link>
      <p v-else-if="feedback?.status === 'done'" class="small muted">Thanks for your feedback on this event.</p>

      <section class="stack" aria-labelledby="hub-people">
        <h2 id="hub-people" class="label">People you met here</h2>
        <div v-if="!people.length" class="empty">
          <p v-if="status === 'ended'">You didn't connect with anyone at this event.</p>
          <p v-else>No connections at this event yet. Scan someone's badge to connect.</p>
        </div>
        <div v-else class="list">
          <router-link
            v-for="c in people"
            :key="c.id"
            :to="c.cardId ? `/c/${c.cardId}` : `/app/people/${c.id}`"
            class="list-row"
          >
            <Avatar class="avatar" :src="c.selfie || c.peer.photo" :alt="c.peer.name" />
            <span style="flex:1;min-width:0">
              <strong>{{ c.peer.name }}</strong>
              <span class="small muted" style="display:block">{{ subtitleOf(c.peer) || c.peer.headline }}</span>
              <span v-if="connectedShort({ via: c.via })" class="small muted" style="display:block">{{ connectedShort({ via: c.via }) }}</span>
            </span>
          </router-link>
        </div>
      </section>

      <!-- Be easy to find and who to meet (F17): only while the event is on, and only if the host has the room on. -->
      <EventPresence v-if="event.directoryOn && status !== 'upcoming'" :event-id="eventId" :status="status" />

      <div class="btn-row" role="tablist" aria-label="Event" style="margin-bottom:8px">
        <button class="btn" role="tab" :aria-selected="tab === 'room'" :class="{ 'btn-primary': tab === 'room' }" @click="switchTab('room')">Room</button>
        <button class="btn" role="tab" :aria-selected="tab === 'album'" :class="{ 'btn-primary': tab === 'album' }" @click="switchTab('album')">Album</button>
        <button class="btn" role="tab" :aria-selected="tab === 'perks'" :class="{ 'btn-primary': tab === 'perks' }" @click="switchTab('perks')">Perks</button>
      </div>

      <template v-if="tab === 'room'">
        <div v-if="!room.length" class="empty">
          <span class="label">No one else yet</span>
          <p>Checked-in people with public cards show up here.</p>
        </div>
        <div v-else class="list">
          <component
            :is="p.cardId ? 'router-link' : 'div'"
            v-for="p in room"
            :key="p.id"
            class="list-row"
            v-bind="p.cardId ? { to: { path: `/c/${p.cardId}`, query: { event: eventId } } } : {}"
          >
            <Avatar class="avatar" :src="p.photo" :alt="p.name" />
            <span style="flex:1;min-width:0">
              <strong>{{ p.name }}</strong>
              <span class="small muted" style="display:block">
                {{ subtitleOf(p) || p.headline }}
              </span>
              <span v-if="p.tags?.length" class="chip-row" style="margin-top:6px">
                <span v-for="t in p.tags.slice(0,3)" :key="t" class="chip muted">{{ t }}</span>
              </span>
            </span>
          </component>
        </div>
      </template>

      <template v-else-if="tab === 'album'">
        <div v-if="!album.length" class="empty">
          <span class="label">No selfies yet</span>
          <p>Connection selfies from this event appear here automatically.</p>
        </div>
        <div v-else class="album-grid">
          <figure v-for="ph in album" :key="ph.id">
            <img :src="ph.src" :alt="`Selfie with ${ph.peer}`" />
            <figcaption class="small muted">with {{ ph.peer }}</figcaption>
          </figure>
        </div>
      </template>

      <template v-else-if="tab === 'perks'">
        <div v-if="!event.perks?.length" class="empty">
          <span class="label">No perks listed</span>
          <p>Any host perks, such as drinks, raffles, slides or job links, show here.</p>
        </div>
        <ul v-else class="list" style="list-style:none;padding:0">
          <li v-for="(perk, i) in event.perks" :key="i" class="list-row">{{ perk }}</li>
        </ul>
      </template>

      <div v-if="event.hasChoices" class="list">
        <button ref="choicesTrigger" type="button" class="list-row spread" aria-haspopup="dialog" @click="choicesOpen = true">
          <span><strong>Your choices at this event</strong>
            <span class="small muted" style="display:block">{{ event.namedAttendance ? "The room, sponsors and the organisers' list of who came" : "The room and what you share with sponsors" }}</span></span>
          <span class="muted" style="display:inline-flex"><Icon name="chevron" :size="18" /></span>
        </button>
      </div>
    </template>

    <UiSheet v-if="event?.hasChoices" :open="choicesOpen" :anchor="choicesTrigger" label="Your choices at this event" fit @close="choicesOpen = false">
      <div v-if="choicesOpen" class="stack-3">
        <EventChoices :event-id="eventId" />
        <EventAttendanceChoices v-if="event.namedAttendance" :event-id="eventId" />
      </div>
    </UiSheet>
  </div>
</template>

<style scoped>
.hub-head { display: flex; align-items: flex-start; gap: 6px; margin-bottom: calc(var(--space) * 1); }
.hub-back {
  flex: none; width: 44px; height: 44px; margin-left: -10px;
  display: inline-flex; align-items: center; justify-content: center;
  background: none; border: 0; color: var(--ink); cursor: pointer;
  font-size: 34px; line-height: 1; padding: 0 0 4px;
}
.hub-back:focus-visible { outline: 2.5px solid var(--strap); outline-offset: 0; }
.hub-title { min-width: 0; padding-top: 2px; }
.hub-title h1 { margin-top: 4px; overflow-wrap: anywhere; }
.hub-title .sub { margin-top: 6px; color: var(--graphite); font-size: 15px; }
.hub-status.ongoing, .hub-status.upcoming { color: var(--strap-deep); }
.hub-status.ended { color: var(--graphite); }

.hub-stats {
  display: grid; grid-auto-flow: column; grid-auto-columns: 1fr;
  margin: 0; border: var(--border); border-radius: var(--radius);
}
.hub-stats > div { padding: 12px; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; gap: 4px; }
.hub-stats > div + div { border-left: var(--border); }
.hub-stats dd {
  margin: 0; font-size: 26px; font-weight: 700; line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.stat-sub { display: block; font-size: 12.5px; font-weight: 400; margin-top: 2px; }

.list button.list-row { border: 0; color: inherit; }
.album-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.album-grid figure { margin: 0; }
.album-grid img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border: var(--border-ink);
  border-radius: var(--radius);
}
.album-grid figcaption { margin-top: 4px; }
</style>
