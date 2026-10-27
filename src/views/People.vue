<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { Api } from "../lib/api";
import { buildIndex, search, suggest, terms } from "../lib/search";
import Icon from "../components/Icon.vue";
import Avatar from "../components/Avatar.vue";

const rows = ref([]);
const query = ref("");
const loading = ref(true);
// Set when the person chose "Search instead for…" on a corrected query.
const exact = ref(false);

onMounted(async () => {
  try {
    const data = await Api.connections();
    rows.value = data.connections;
  } finally {
    loading.value = false;
  }
});

watch(query, () => { exact.value = false; });

const index = computed(() => buildIndex(rows.value));
const typed = computed(() => terms(query.value));
const typedResults = computed(() => search(index.value, typed.value));

// No match for what was typed, but a close spelling has some: show those
// instead and say so, like a search engine does.
const correction = computed(() => {
  if (exact.value || !typed.value.length || typedResults.value.length) return null;
  const fixed = suggest(index.value, typed.value);
  if (!fixed) return null;
  const results = search(index.value, fixed);
  return results.length ? { text: fixed.join(" "), results } : null;
});

const results = computed(() => correction.value?.results || typedResults.value);

function searchInstead() { exact.value = true; }

const fmt = (t) =>
  new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
</script>

<template>
  <div class="stack-2">
    <h1>People</h1>
    <div class="search-field">
      <Icon name="search" :size="17" />
      <input v-model="query" type="search" placeholder="Search names, skills, courses, notes…"
             aria-label="Search people" autocomplete="off" spellcheck="false" />
    </div>

    <p v-if="correction" class="small search-fix" role="status">
      Showing results for <button type="button" class="link-btn search-term" @click="query = correction.text">{{ correction.text }}</button>.
      <span class="muted">Search instead for&nbsp;</span><button type="button" class="link-btn" @click="searchInstead">{{ query.trim() }}</button>
    </p>

    <p v-if="loading" class="muted">Loading…</p>
    <div v-else-if="!rows.length" class="empty stack">
      <span class="label">No connections yet</span>
      <p>Scan someone's card at an event and they'll be remembered here, with the selfie and where you met.</p>
      <router-link to="/app/scan" class="btn btn-primary" style="margin-top:8px">Scan a card</router-link>
    </div>
    <div v-else-if="!results.length" class="empty stack" role="status">
      <span class="label">No one matches “{{ query.trim() }}”</span>
      <p>Try a name, a course, or something they can help with.</p>
    </div>

    <div v-else class="list">
      <router-link
        v-for="{ row: r, hint } in results"
        :key="r.id"
        :to="r.cardId ? `/c/${r.cardId}` : `/app/people/${r.id}`"
        class="list-row"
      >
        <Avatar class="avatar" :src="r.selfie || r.peer.photo" :alt="r.peer.name" />
        <span style="flex:1;min-width:0">
          <strong>{{ r.peer.name }}</strong>
          <span class="small muted" style="display:block">
            {{ [r.peer.course, r.peer.uni].filter(Boolean).join(" · ") || r.peer.headline }}
          </span>
          <span v-if="hint" class="small search-hint">
            <span class="label">{{ hint.label }}</span>
            <template v-for="(p, i) in hint.parts" :key="i"><mark v-if="p.hit">{{ p.text }}</mark><template v-else>{{ p.text }}</template></template>
          </span>
        </span>
        <span class="label tnum">{{ fmt(r.metAt) }}</span>
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.search-fix { margin: -4px 0 0; }
.search-fix .link-btn { padding: 0; font-size: inherit; }
.search-term { color: var(--ink); font-style: italic; }
.search-hint {
  display: block; margin-top: 4px; color: var(--graphite);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.search-hint .label { margin-right: 6px; }
.search-hint mark { background: color-mix(in srgb, var(--strap) 18%, transparent); color: var(--ink); border-radius: 2px; padding: 0 1px; }
</style>
