<script setup>
import { homePath } from "../lib/store";
// What a scan opens: a real profile page, not the badge again.
// Shows only what this card permits (its chosen links and tags), the shared
// selfie if the viewer has already connected, and a note the owner left for
// this specific person (?n=…). Arriving here pops the connect sheet.
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Api } from "../lib/api";
import Avatar from "../components/Avatar.vue";
import { openPhoto } from "../lib/lightbox";
import ConnectSheet from "../components/ConnectSheet.vue";
import Icon from "../components/Icon.vue";
import { connectedVia, metStamp, subtitleOf, viaOfS } from "../lib/profile";

const route = useRoute();
const router = useRouter();
const view = ref(null);
const error = ref("");
const loading = ref(true);
const sheetOpen = ref(false);

const noteToken = computed(() => (typeof route.query.n === "string" ? route.query.n : null));
const eventId = computed(() => {
  const e = route.query.event;
  return typeof e === "string" && /^[0-9a-f]{10}$/.test(e) ? e : null;
});

// How this card was opened (F13): ?s=q QR code, c typed code, l shared link. Read
// once, then taken out of the address bar so it isn't copied on to someone else.
const via = viaOfS(route.query.s);
if ("s" in route.query) {
  const { s, ...rest } = route.query;
  router.replace({ path: route.path, query: rest, hash: route.hash });
}

async function load() {
  view.value = await Api.getCard(route.params.cardId, noteToken.value);
}

onMounted(async () => {
  try {
    await load();
    const v = view.value.viewer;
    // Land on someone's card → offer to connect straight away. Skip it for
    // your own card, and for people you've already met (unless there's a
    // fresh note waiting for you).
    if (!v.isOwner && (!v.connection || view.value.incomingNote)) sheetOpen.value = true;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

async function onConnected() {
  try { await load(); } catch { /* keep what we have */ }
}

const p = computed(() => view.value?.profile || {});
const first = computed(() => (p.value.name || "").split(/\s+/)[0]);
const meta = computed(() => subtitleOf(p.value, { year: true }));
const links = computed(() => Object.entries(p.value.links || {}));
// Nothing to show beyond a name: say so, rather than a page that looks broken.
const isBare = computed(() => !view.value?.limited && !p.value.headline && !p.value.about && !meta.value && !view.value?.note
  && !(p.value.tags || []).length && !(p.value.projects || []).length && !links.value.length);
const connection = computed(() => view.value?.viewer?.connection || null);
const metOn = computed(() =>
  connection.value
    ? new Date(connection.value.metAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
    : ""
);
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

// The "Your connection" panel is its own chunk, fetched once the card says you are connected.
// A plain dynamic import: defineAsyncComponent would add its code to the Vue chunk every public page loads.
const ConnectionPanel = shallowRef(null);
watch(connection, (cn) => {
  if (cn && !ConnectionPanel.value) import("../components/CardConnection.vue").then((m) => { ConnectionPanel.value = m.default; });
}, { immediate: true });

const selfieBusy = ref(false);
async function selfieAction(fn) {
  selfieBusy.value = true;
  try { await fn(connection.value.id); await load(); } catch (e) { alert(e.message); }
  finally { selfieBusy.value = false; }
}
const acceptSelfie = () => selfieAction(Api.selfieAccept);
const removeSelfie = () => { if (confirm("Delete this selfie for both of you? The connection stays.")) selfieAction(Api.selfieRemove); };

</script>

<template>
  <div class="strap-rail"></div>
  <main class="app-col profile-page">
    <header class="profile-top" style="justify-content:space-between">
      <router-link :to="homePath()" class="wordmark">lanyard<b>.</b></router-link>
      <router-link v-if="connection" to="/app/people" class="topbar-link">‹ People</router-link>
    </header>

    <p v-if="loading" class="muted">Loading…</p>
    <div v-else-if="error" class="empty stack">
      <span class="label">Card not found</span>
      <p>This card doesn't exist, or its owner has made it private.</p>
    </div>

    <template v-else-if="view">
      <p v-if="view.viewer.isOwner" class="notice small">
        This is how others see your <strong>{{ view.name }}</strong> card.
        <router-link to="/app/cards" style="text-decoration:underline">Edit card</router-link>
      </p>

      <p v-if="view.limited" class="notice small">
        {{ first }} keeps their profile private. You can see what they chose to share
        with people at the same event.
      </p>

      <!-- A note left for this person, via the QR they scanned -->
      <aside v-if="view.incomingNote" class="note-callout">
        <span class="label">A note from {{ first }}</span>
        <p>“{{ view.incomingNote.text }}”</p>
        <p class="small muted">Tap Connect to keep it with this connection.</p>
      </aside>

      <article class="profile" :class="view.theme">
        <div class="profile-strap" :style="view.strapColor ? { background: view.strapColor } : null">
          <span class="profile-strap-word">lanyard</span>
          <span class="profile-strap-card">{{ view.name }}</span>
        </div>

        <div class="profile-body">
          <div class="profile-id">
            <Avatar class="profile-photo" :class="{ zoomable: p.photo }" :src="p.photo" :alt="p.name" @click="openPhoto(p.photo, p.name)" />
            <div class="profile-id-text">
              <h1>{{ p.name }}</h1>
              <p v-if="meta" class="muted">{{ meta }}</p>
            </div>
          </div>

          <p v-if="p.headline" class="profile-headline">{{ p.headline }}</p>

          <!-- The selfie you took together -->
          <figure v-if="connection?.selfie" class="profile-selfie">
            <img :src="connection.selfie" :alt="`Selfie of you and ${first}, taken when you met`" class="zoomable" tabindex="0" role="button" @click="openPhoto(connection.selfie, `You and ${first}`)" @keydown.enter="openPhoto(connection.selfie, `You and ${first}`)" />
            <figcaption class="label">You met on {{ metOn }}</figcaption>
          </figure>
          <p v-else-if="connection && !connection.selfieRequest" class="profile-met label">Connected · {{ metOn }}</p>
          <div v-if="connection?.selfieStatus === 'request'" class="panel stack" role="status">
            <strong>{{ first }} took a selfie with you</strong>
            <img :src="connection.selfieRequest" :alt="`Selfie of you and ${first}`" style="max-width:100%;border-radius:8px" />
            <p class="small muted" style="margin:0">It is only kept if you accept. If you don't answer it is deleted after 7 days.</p>
            <div class="btn-row">
              <button class="btn btn-primary" :disabled="selfieBusy" @click="acceptSelfie">Keep it</button>
              <button class="btn" :disabled="selfieBusy" @click="removeSelfie">Delete it</button>
            </div>
          </div>
          <p v-else-if="connection?.selfieStatus === 'pending'" class="small muted">
            Waiting for {{ first }} to accept this selfie. If they don't, it is deleted after 7 days.
            <button type="button" class="link-btn" :disabled="selfieBusy" @click="removeSelfie">Delete it now</button>
          </p>
          <button v-else-if="connection?.selfieStatus === 'accepted'" type="button" class="link-btn small" :disabled="selfieBusy" @click="removeSelfie">Remove this selfie</button>

          <blockquote v-if="view.note" class="profile-quote">“{{ view.note }}”</blockquote>

          <p v-if="isBare" class="profile-section small muted" role="status">
            {{ view.viewer.isOwner ? "Your card only shows your name so far." : `${first} hasn't filled in their card yet, so there's only their name for now.` }}
            <router-link v-if="view.viewer.isOwner" to="/app/profile" class="link-btn">Add what you can help with</router-link>
          </p>

          <section v-if="p.tags?.length" class="profile-section">
            <span class="label">Come to me for</span>
            <div class="chip-row">
              <span v-for="t in p.tags" :key="t" class="chip">{{ t }}</span>
            </div>
          </section>

          <section v-if="p.about" class="profile-section">
            <span class="label">About</span>
            <p class="profile-about">{{ p.about }}</p>
          </section>

          <section v-if="p.projects?.length" class="profile-section">
            <span class="label">Projects</span>
            <div class="stack">
              <component
                :is="pr.url ? 'a' : 'div'"
                v-for="(pr, i) in p.projects"
                :key="i"
                class="project"
                :href="pr.url || undefined" target="_blank" rel="noopener"
              >
                <img v-if="pr.image" :src="pr.image" :alt="pr.title ? `Image for ${pr.title}` : 'Project image'" class="project-img" />
                <span class="project-text">
                  <strong>{{ pr.title }}</strong>
                  <span v-if="pr.line" class="small muted">{{ pr.line }}</span>
                </span>
                <span v-if="pr.url" class="muted" style="display:inline-flex"><Icon name="external" :size="16" /></span>
              </component>
            </div>
          </section>

          <section v-if="links.length" class="profile-section">
            <span class="label">Find {{ first }} online</span>
            <div class="list">
              <a v-for="[label, url] in links" :key="label" class="list-row spread"
                 :href="url" target="_blank" rel="noopener">
                <span class="link-label">
                  <strong>{{ label }}</strong>
                  <span class="small muted">{{ host(url) }}</span>
                </span>
                <span class="muted" style="display:inline-flex"><Icon name="external" :size="16" /></span>
              </a>
            </div>
          </section>
        </div>
      </article>

      <component :is="ConnectionPanel" v-if="connection && ConnectionPanel" :connection="connection" :profile="p" :first="first" />

      <p v-if="connection" class="small muted connected-foot">
        {{ connectedVia({ via: connection.via, eventName: connection.event?.name }) }} · <time :datetime="new Date(connection.metAt).toISOString()">{{ metStamp(connection.metAt) }}</time>
      </p>

      <div v-if="!view.viewer.isOwner && (!connection || view.incomingNote)" class="thumb-bar">
        <div class="inner">
          <button class="btn btn-primary" @click="sheetOpen = true">
            {{ connection ? "Save this note" : `Connect with ${first}` }}
          </button>
        </div>
      </div>
    </template>

    <ConnectSheet
      v-if="sheetOpen && view"
      :view="view"
      :note-token="noteToken"
      :event-id="eventId"
      :via="via"
      @close="sheetOpen = false"
      @connected="onConnected"
    />
  </main>
</template>

<style scoped>
.connected-foot { margin: 16px 0 0; text-align: center; }
.connected-foot time { white-space: nowrap; }
</style>
