<script setup>
import { computed, onMounted, ref } from "vue";
import { Api } from "../lib/api";
import Icon from "../components/Icon.vue";
import Avatar from "../components/Avatar.vue";
import { openPhoto } from "../lib/lightbox";

const rows = ref([]);
const query = ref("");
const loading = ref(true);

onMounted(async () => {
  try {
    const data = await Api.connections();
    rows.value = data.connections;
  } finally {
    loading.value = false;
  }
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return rows.value;
  return rows.value.filter((r) =>
    [r.peer.name, r.peer.course, r.peer.uni, r.peer.headline]
      .filter(Boolean).some((s) => s.toLowerCase().includes(q))
  );
});

const fmt = (t) =>
  new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
</script>

<template>
  <div class="stack-2">
    <h1>People</h1>
    <div class="search-field">
      <Icon name="search" :size="17" />
      <input v-model="query" type="search" placeholder="Search by name, course…" aria-label="Search people" />
    </div>

    <p v-if="loading" class="muted">Loading…</p>
    <div v-else-if="!filtered.length" class="empty stack">
      <span class="label">No connections yet</span>
      <p>Scan someone's card at an event and they'll be remembered here, with the selfie and where you met.</p>
      <router-link to="/app/scan" class="btn btn-primary" style="margin-top:8px">Scan a card</router-link>
    </div>

    <div v-else class="list">
      <router-link
        v-for="r in filtered"
        :key="r.id"
        :to="r.cardId ? `/c/${r.cardId}` : `/app/people/${r.id}`"
        class="list-row"
      >
        <Avatar class="avatar" :class="{ zoomable: r.selfie || r.peer.photo }" :src="r.selfie || r.peer.photo" :alt="r.peer.name"
                @click.prevent.stop="openPhoto(r.selfie || r.peer.photo, r.peer.name)" />
        <span style="flex:1;min-width:0">
          <strong>{{ r.peer.name }}</strong>
          <span class="small muted" style="display:block">
            {{ [r.peer.course, r.peer.uni].filter(Boolean).join(" · ") || r.peer.headline }}
          </span>
        </span>
        <span class="label tnum">{{ fmt(r.metAt) }}</span>
      </router-link>
    </div>
  </div>
</template>
