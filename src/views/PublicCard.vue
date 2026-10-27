<script setup>
// What a scan opens: a real profile page, not the badge again.
// Shows only what this card permits (its chosen links and tags), the shared
// selfie if the viewer has already connected, and a note the owner left for
// this specific person (?n=…). Arriving here pops the connect sheet.
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Api } from "../lib/api";
import Avatar from "../components/Avatar.vue";
import { openPhoto } from "../lib/lightbox";
import ConnectSheet from "../components/ConnectSheet.vue";
import Icon from "../components/Icon.vue";

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
const meta = computed(() => [p.value.course, p.value.uni, p.value.year].filter(Boolean).join(" · "));
const links = computed(() => Object.entries(p.value.links || {}));
const connection = computed(() => view.value?.viewer?.connection || null);
const metOn = computed(() =>
  connection.value
    ? new Date(connection.value.metAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
    : ""
);
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

// ---- When you're already connected: your notes, the thread, vCard, remove ----
const note = ref("");
const noteSaved = ref(false);
const fmtShort = (t) =>
  new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
let noteDirty = false;
watch(connection, (cn) => { if (cn && !noteDirty) note.value = cn.note || ""; }, { immediate: true });
async function saveNote() {
  if (!connection.value) return;
  noteDirty = false;
  await Api.note(connection.value.id, note.value);
  noteSaved.value = true;
  setTimeout(() => (noteSaved.value = false), 1500);
}
function vcard() {
  const pr = p.value;
  const lines = [
    "BEGIN:VCARD", "VERSION:3.0",
    `FN:${pr.name}`,
    pr.uni ? `ORG:${pr.uni}` : "",
    pr.course ? `TITLE:${pr.course}` : "",
    ...Object.values(pr.links || {}).map((u) => `URL:${u}`),
    "END:VCARD",
  ].filter(Boolean);
  const blob = new Blob([lines.join("\r\n")], { type: "text/vcard" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${pr.name.replace(/\s+/g, "-")}.vcf`;
  a.click();
  URL.revokeObjectURL(a.href);
}
async function removeConnection() {
  if (!confirm("Remove this connection? The shared selfie is deleted for both of you.")) return;
  await Api.removeConnection(connection.value.id);
  router.push("/app/people");
}
const reporting = ref(false);
const reportText = ref("");
const reportAlsoBlock = ref(true);
const reportMsg = ref("");
async function sendReport() {
  reportMsg.value = "";
  try {
    const r = await Api.reportConnection(connection.value.id, reportText.value, reportAlsoBlock.value);
    if (r.blocked) { router.push("/app/people"); return; }
    reportMsg.value = "Thanks. We'll look into it.";
    reporting.value = false; reportText.value = "";
  } catch (e) {
    reportMsg.value = e.message;
  }
}
</script>

<template>
  <div class="strap-rail"></div>
  <main class="app-col profile-page">
    <header class="profile-top" style="justify-content:space-between">
      <router-link to="/" class="wordmark">lanyard<b>.</b></router-link>
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
          <p v-else-if="connection" class="profile-met label">Connected · {{ metOn }}</p>

          <blockquote v-if="view.note" class="profile-quote">“{{ view.note }}”</blockquote>

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

      <section v-if="connection" class="panel stack-2" aria-label="Your connection">
        <div>
          <span class="label">Your connection</span>
          <p class="small muted" style="margin-top:4px">
            Met {{ metOn }}<template v-if="connection.event"> at {{ connection.event.name }}</template>
          </p>
        </div>

        <div v-if="connection.messages?.length" class="thread">
          <div v-for="m in connection.messages" :key="m.id" class="bubble" :class="{ mine: m.mine }">
            <span class="bubble-who label">{{ m.mine ? "You" : first }} · {{ fmtShort(m.at) }}</span>
            <p>{{ m.text }}</p>
          </div>
        </div>

        <div class="field" style="margin-bottom:0">
          <label for="private-note">Your private note</label>
          <textarea id="private-note" v-model="note" maxlength="600" @input="noteDirty = true" @blur="saveNote"
                    placeholder="Where you met, what to follow up on…"></textarea>
          <span v-if="noteSaved" class="success-text small" role="status">Saved</span>
        </div>

        <div class="btn-row">
          <button class="btn" @click="vcard">Save to contacts</button>
          <button class="btn" style="color:var(--strap-deep)" @click="removeConnection">Remove</button>
          <button class="btn" :aria-expanded="reporting" @click="reporting = !reporting">Report</button>
        </div>
        <form v-if="reporting" class="stack-1" @submit.prevent="sendReport">
          <label for="report-text">What happened?</label>
          <textarea id="report-text" v-model="reportText" maxlength="500" required></textarea>
          <label class="checkbox-row"><input type="checkbox" v-model="reportAlsoBlock" />
            <span class="small">Also remove this connection and block them</span></label>
          <button class="btn btn-primary" type="submit">Send report</button>
        </form>
        <p v-if="reportMsg" class="small" role="status">{{ reportMsg }}</p>
      </section>

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
      @close="sheetOpen = false"
      @connected="onConnected"
    />
  </main>
</template>
