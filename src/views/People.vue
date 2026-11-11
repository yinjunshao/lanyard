<script setup>
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { Api } from "../lib/api";
import { me } from "../lib/store";
import { buildIndex, search, suggest, terms } from "../lib/search";
import Icon from "../components/Icon.vue";
import Avatar from "../components/Avatar.vue";
import UiSelect from "../components/ui/UiSelect.vue";
import { relativeDay as relDay } from "../lib/time";
import { connectedShort, subtitleOf } from "../lib/profile";

const rows = ref([]);

// "Do I know someone who..." (F24): the sheet is fetched only when its row is pressed, with a plain import(), so it is in no
// page's first load.
const AskSheet = shallowRef(null);
const askOpen = ref(false);
function openAsk() {
  askOpen.value = true;
  if (!AskSheet.value) import("../components/PeopleAsk.vue").then((m) => { AskSheet.value = m.default; }).catch(() => { askOpen.value = false; });
}
function askByKeyword(words) { askOpen.value = false; filter.value = "all"; query.value = words; }
const query = ref("");
const loading = ref(true);
const loadError = ref("");
// Set when the person chose "Search instead for…" on a corrected query.
const exact = ref(false);

onMounted(async () => {
  try {
    const data = await Api.connections();
    rows.value = data.connections;
  } catch (e) {
    loadError.value = e.message || "Couldn't load your connections.";
  } finally {
    loading.value = false;
  }
});

watch(query, () => { exact.value = false; });

// Filters sit on top of search: to follow up, one of your tags, or an event.
const filter = ref("all");
const needsFollowUp = (r) => r.remindAt && !r.followedUpAt;
const myTags = computed(() => [...new Set(rows.value.flatMap((r) => r.myTags || []))].sort());
const events = computed(() => {
  const seen = new Map();
  for (const r of rows.value) if (r.eventId && r.eventName && !seen.has(r.eventId)) seen.set(r.eventId, r.eventName);
  return [...seen].map(([id, name]) => ({ id, name }));
});
const eventOptions = computed(() => [{ value: "", label: "Any event" }, ...events.value.map((e) => ({ value: "event:" + e.id, label: e.name }))]);
const followCount = computed(() => rows.value.filter(needsFollowUp).length);
const filteredRows = computed(() => {
  const f = filter.value;
  if (f === "followup") return rows.value.filter(needsFollowUp).sort((a, b) => a.remindAt - b.remindAt);
  if (f.startsWith("tag:")) return rows.value.filter((r) => (r.myTags || []).includes(f.slice(4)));
  if (f.startsWith("event:")) return rows.value.filter((r) => r.eventId === f.slice(6));
  return rows.value;
});
const index = computed(() => buildIndex(filteredRows.value));
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

// Under the name: how you met, then at most one more status line. If a selfie is waiting
// and a follow-up is due as well, those two stay and how you met is left out (F13).
const howWeMet = (r) => (r.selfieStatus === "request" && needsFollowUp(r) ? "" : connectedShort(r));

// A guest who connected before making a card is still in the welcome steps: ask them to finish it,
// by name, so the person they just met can find them again (F14).
const finishFor = computed(() => {
  if (me.profile?.onboarding_step == null || !rows.value.length) return "";
  const latest = [...rows.value].sort((a, b) => b.metAt - a.metAt)[0];
  return (latest.peer.name || "").split(/\s+/)[0] || "them";
});

const fmt = (t) =>
  new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
</script>

<template>
  <div class="stack-2">
    <h1>People</h1>
    <section v-if="finishFor" class="notice stack" aria-label="Finish your card">
      <strong>Finish your card so {{ finishFor }} can find you again.</strong>
      <p class="small muted" style="margin:0">It takes about a minute, and you can skip any step.</p>
      <router-link to="/app/welcome" class="btn">Finish your card</router-link>
    </section>
    <div class="search-field">
      <Icon name="search" :size="17" />
      <input v-model="query" type="search" placeholder="Search names, skills, courses, notes…"
             aria-label="Search people" autocomplete="off" spellcheck="false" />
    </div>

    <button v-if="rows.length" type="button" class="ask-row" @click="openAsk">
      <Icon name="people" :size="18" />
      <span style="flex:1;min-width:0">
        <strong>Do I know someone who…</strong>
        <span class="small muted" style="display:block">Say who you need, in your own words.</span>
      </span>
      <Icon name="chevron" :size="16" />
    </button>
    <component :is="AskSheet" v-if="askOpen && AskSheet" :rows="rows" @close="askOpen = false" @keyword="askByKeyword" />

    <div v-if="rows.length && (followCount || myTags.length || events.length)" class="chip-row" role="group" aria-label="Filter people">
      <button type="button" class="chip chip-toggle" :class="{ on: filter === 'all' }" :aria-pressed="filter === 'all'" @click="filter = 'all'">All</button>
      <button v-if="followCount" type="button" class="chip chip-toggle" :class="{ on: filter === 'followup' }"
              :aria-pressed="filter === 'followup'" @click="filter = 'followup'">To follow up · {{ followCount }}</button>
      <button v-for="t in myTags" :key="t" type="button" class="chip chip-toggle" :class="{ on: filter === 'tag:' + t }"
              :aria-pressed="filter === 'tag:' + t" @click="filter = 'tag:' + t">{{ t }}</button>
      <UiSelect v-if="events.length" style="min-width:160px" label="Filter by event" :model-value="filter.startsWith('event:') ? filter : ''"
                :options="eventOptions" @update:model-value="filter = $event || 'all'" />
    </div>

    <p v-if="correction" class="small search-fix" role="status">
      Showing results for <button type="button" class="link-btn search-term" @click="query = correction.text">{{ correction.text }}</button>.
      <span class="muted">Search instead for&nbsp;</span><button type="button" class="link-btn" @click="searchInstead">{{ query.trim() }}</button>
    </p>

    <p v-if="loading" class="muted">Loading…</p>
    <div v-else-if="loadError" class="empty stack" role="alert">
      <span class="label">Couldn't load your connections</span>
      <p>{{ loadError }}</p>
      <p class="small muted">Your connections are safe. This is a loading problem, not missing data.</p>
    </div>
    <div v-else-if="!rows.length" class="empty stack">
      <span class="label">No connections yet</span>
      <p>Scan someone's card at an event and they'll be remembered here, with the selfie and where you met.</p>
      <router-link to="/app/scan" class="btn btn-primary" style="margin-top:8px">Scan a card</router-link>
    </div>
    <div v-else-if="!results.length && !query.trim()" class="empty stack" role="status">
      <span class="label">No one here</span>
      <p>Nobody matches this filter. <button type="button" class="link-btn" @click="filter = 'all'">Show everyone</button></p>
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
            {{ subtitleOf(r.peer) || r.peer.headline }}
          </span>
          <span v-if="howWeMet(r)" class="small muted" style="display:block">{{ howWeMet(r) }}</span>
          <span v-if="r.selfieStatus === 'request'" class="small" style="display:block;color:var(--strap-deep);font-weight:700">Selfie waiting for you</span>
          <span v-if="needsFollowUp(r)" class="small" style="display:block;color:var(--strap-deep);font-weight:700">Follow up {{ relDay(r.remindAt) }}</span>
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
.ask-row {
  display: flex; align-items: center; gap: 12px; width: 100%; min-height: var(--tap);
  padding: 10px 14px; text-align: left; font: inherit; color: var(--ink); cursor: pointer;
  border: var(--border); border-radius: var(--radius); background: var(--paper-raised);
}
.ask-row:active { background: var(--paper); }
.ask-row:focus-visible { outline: 2.5px solid var(--strap); outline-offset: 1px; }
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
