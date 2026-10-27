<script setup>
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { Api } from "../lib/api";
import Avatar from "../components/Avatar.vue";

const route = useRoute();
const tab = ref("room");
const room = ref([]);
const album = ref([]);
const name = ref("");
const loading = ref(true);
const error = ref("");

const event = ref(null);

onMounted(async () => {
  // Event meta comes from my-events; refetch room/album.
  try {
    const mine = await Api.myEvents();
    event.value = mine.events.find((e) => e.id === route.params.id);
    if (!event.value) throw new Error("You haven't checked in to this event.");
    await loadRoom();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

async function loadRoom() {
  try { room.value = (await Api.room(route.params.id)).people || []; } catch {}
}
async function loadAlbum() {
  try { album.value = (await Api.album(route.params.id)).photos || []; } catch {}
}
function switchTab(t) {
  tab.value = t;
  if (t === "album") loadAlbum();
}
</script>

<template>
  <div class="stack-3">
    <div class="page-head">
      <router-link to="/app/events" class="small muted">‹ Events</router-link>
      <h1 style="margin-top:8px">{{ event?.name || "Event" }}</h1>
      <p v-if="event?.venue" class="sub">{{ event.venue }}</p>
    </div>

    <p v-if="loading" class="muted">Loading…</p>
    <p v-else-if="error" class="error-text">{{ error }}</p>

    <template v-else>
      <div class="btn-row" role="tablist" style="margin-bottom:8px">
        <button class="btn" :class="{ 'btn-primary': tab === 'room' }" @click="switchTab('room')">Room</button>
        <button class="btn" :class="{ 'btn-primary': tab === 'album' }" @click="switchTab('album')">Album</button>
        <button class="btn" :class="{ 'btn-primary': tab === 'perks' }" @click="switchTab('perks')">Perks</button>
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
            v-bind="p.cardId ? { to: { path: `/c/${p.cardId}`, query: { event: route.params.id } } } : {}"
          >
            <Avatar class="avatar" :src="p.photo" :alt="p.name" />
            <span style="flex:1;min-width:0">
              <strong>{{ p.name }}</strong>
              <span class="small muted" style="display:block">
                {{ [p.course, p.uni].filter(Boolean).join(" · ") || p.headline }}
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
          <p>Any host perks — drinks, raffles, slides or job links — show here.</p>
        </div>
        <ul v-else class="list" style="list-style:none;padding:0">
          <li v-for="(perk, i) in event.perks" :key="i" class="list-row">{{ perk }}</li>
        </ul>
      </template>
    </template>
  </div>
</template>

<style scoped>
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
