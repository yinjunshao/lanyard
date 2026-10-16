<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Api } from "../lib/api";
import { getToken, me, refreshMe } from "../lib/store";

const route = useRoute();
const router = useRouter();
const connections = ref([]);
const loading = ref(true);
const q = ref("");
const justId = ref(route.query.just || "");
const lightbox = ref(null);

const filtered = computed(() => {
  const t = q.value.trim().toLowerCase();
  let list = connections.value;
  if (t) {
    list = list.filter((c) => {
      const hay = [
        c.peerSnapshot?.name,
        c.peerSnapshot?.course,
        c.peerSnapshot?.helloNote,
        c.myNote,
        ...(c.peerSnapshot?.specialties || []),
      ].join(" ").toLowerCase();
      return hay.includes(t);
    });
  }
  return [...list].sort((a, b) => (b.metAt || 0) - (a.metAt || 0));
});

const fmt = (ts) =>
  new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

onMounted(async () => {
  if (!me.loaded) await refreshMe();
  if (!me.id) return (loading.value = false);
  const data = await Api.connections(me.id);
  connections.value = data.connections || [];
  loading.value = false;
});

async function remove(c) {
  if (!confirm(`Remove ${c.peerSnapshot?.name} from your network?`)) return;
  await Api.removeConnection(me.id, c.peerId, getToken());
  connections.value = connections.value.filter((x) => x.peerId !== c.peerId);
  if (justId.value === c.peerId) justId.value = "";
}
</script>

<template>
  <div class="container network-page">
    <header class="network-header">
      <div>
        <span class="eyebrow">Remembered people</span>
        <h1 class="page-title">Your network</h1>
        <p class="muted">{{ connections.length }} {{ connections.length === 1 ? "connection" : "connections" }}, sorted by who you met most recently.</p>
      </div>
      <div class="network-actions">
        <input v-model="q" type="text" placeholder="Search name, note, specialty…" />
        <router-link to="/qr" class="btn btn-primary">Show QR</router-link>
      </div>
    </header>

    <div v-if="loading" class="loading">Loading your network…</div>

    <section v-else-if="!me.id" class="card empty-state">
      <h2 class="section-title">Nothing saved yet.</h2>
      <p class="muted">Make your profile first, then scan someone’s card at your next lecture.</p>
      <button class="btn btn-primary" @click="router.push('/onboard')">Make my Lanyard</button>
    </section>

    <section v-else-if="filtered.length === 0" class="card empty-state">
      <h2 class="section-title">{{ q ? "No match." : "Your network is empty." }}</h2>
      <p class="muted">{{ q ? "Try a different name, note or specialty." : "Show your QR at the next event." }}</p>
    </section>

    <section v-else class="connection-list">
      <article v-for="c in filtered" :key="c.peerId" class="card connection-card" :class="{ fresh: justId === c.peerId }">
        <button v-if="c.photoId" class="connection-photo" @click="lightbox = c">
          <img :src="Api.photoUrl(c.photoId)" :alt="`Together with ${c.peerSnapshot?.name}`" loading="lazy" />
        </button>
        <div v-else class="connection-avatar">{{ (c.peerSnapshot?.name || "?").trim().slice(0, 1).toUpperCase() }}</div>

        <div class="connection-main">
          <div class="connection-top">
            <h3>{{ c.peerSnapshot?.name || "Student" }}</h3>
            <span>{{ fmt(c.metAt) }}</span>
          </div>
          <p>{{ c.peerSnapshot?.course || "Student" }}<span v-if="c.peerSnapshot?.uni"> · {{ c.peerSnapshot.uni }}</span></p>
          <div v-if="c.peerSnapshot?.specialties?.length" class="specialty-line">
            {{ c.peerSnapshot.specialties.slice(0, 3).join(" · ") }}
          </div>
          <div v-if="c.myNote" class="meeting-note">“{{ c.myNote }}”</div>
          <div v-else-if="c.ownerHelloAtSave" class="meeting-note">“{{ c.ownerHelloAtSave }}”</div>
        </div>
        <div class="connection-actions">
          <router-link :to="`/p/${c.peerId}`" class="btn btn-ghost">Open</router-link>
          <button class="btn btn-danger" @click="remove(c)">Remove</button>
        </div>
      </article>
    </section>

    <div v-if="lightbox" class="lightbox" @click.self="lightbox = null">
      <button class="lightbox-close" @click="lightbox = null" aria-label="Close">×</button>
      <img :src="Api.photoUrl(lightbox.photoId)" :alt="`Together with ${lightbox.peerSnapshot?.name}`" />
      <div class="lightbox-cap">{{ lightbox.peerSnapshot?.name }} · {{ fmt(lightbox.metAt) }}</div>
    </div>
  </div>
</template>

<style scoped>
.network-page { max-width: 860px; }
.network-header { display:flex; justify-content:space-between; gap:24px; align-items:flex-end; margin-bottom:24px; }
.network-header p { margin:8px 0 0; }
.network-actions { display:flex; gap:10px; min-width:min(380px,100%); }
.network-actions input { min-width:240px; }
.empty-state { text-align:center; padding:48px 24px; }
.empty-state .btn { margin-top:14px; }
.connection-list { display:grid; gap:12px; }
.connection-card { display:grid; grid-template-columns:58px 1fr auto; gap:16px; align-items:center; padding:18px; }
.connection-card.fresh { border-color:var(--accent); box-shadow: 8px 8px 0 rgba(14,17,16,.14), var(--shadow); }
.connection-avatar { width:58px; height:58px; border-radius:18px; display:flex; align-items:center; justify-content:center; background:var(--ink); color:var(--volt); font-family:var(--font-mono); font-size:22px; font-weight:700; }
.connection-photo { width:58px; height:58px; padding:0; border:1.5px solid var(--line-strong); border-radius:18px; overflow:hidden; cursor:zoom-in; background:var(--paper); }
.connection-photo img { width:100%; height:100%; object-fit:cover; display:block; }
.connection-top { display:flex; justify-content:space-between; gap:14px; align-items:baseline; }
.connection-top h3 { margin:0; font-size:18px; letter-spacing:-.01em; }
.connection-top span { color:var(--muted); font-size:12px; white-space:nowrap; }
.connection-main p { margin:2px 0; color:var(--muted); font-size:14px; }
.specialty-line { color:var(--ink-soft); font-size:13px; margin-top:5px; }
.meeting-note { margin-top:7px; font-family:var(--font-display); font-size:19px; line-height:1.2; color:var(--accent-dark); }
.connection-actions { display:flex; gap:8px; }

.lightbox { position:fixed; inset:0; z-index:100; background:rgba(20,17,12,.86); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; padding:28px; }
.lightbox img { max-width:min(92vw,720px); max-height:78vh; border-radius:18px; border:2px solid var(--paper); object-fit:contain; }
.lightbox-cap { color:var(--paper); font-weight:700; letter-spacing:.01em; }
.lightbox-close { position:absolute; top:18px; right:22px; width:44px; height:44px; border-radius:50%; border:1px solid rgba(255,255,255,.4); background:transparent; color:#fff; font-size:28px; line-height:1; cursor:pointer; }

@media (max-width: 700px) {
  .network-header { display:block; }
  .network-actions { margin-top:18px; }
  .connection-card { grid-template-columns:56px 1fr; }
  .connection-actions { grid-column:1 / -1; display:grid; grid-template-columns:1fr 1fr; }
  .connection-avatar, .connection-photo { width:56px; height:56px; }
}
</style>
