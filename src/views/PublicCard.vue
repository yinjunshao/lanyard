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
import { morningIn, fmtDay, relativeDay } from "../lib/time";
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
// ---- Follow-up: a reminder, "done", and your own tags (all private to you) ----
const myTags = ref([]);
const remindAt = ref(null);
const followedUpAt = ref(null);
const metaMsg = ref("");
watch(connection, (cn) => {
  if (!cn) return;
  myTags.value = [...(cn.tags || [])];
  remindAt.value = cn.remindAt || null;
  followedUpAt.value = cn.followedUpAt || null;
}, { immediate: true });
async function saveMeta(patch) {
  metaMsg.value = "";
  try {
    const r = await Api.connectionMeta(connection.value.id, patch);
    myTags.value = r.tags; remindAt.value = r.remindAt; followedUpAt.value = r.followedUpAt;
  } catch (e) {
    metaMsg.value = e.message;
  }
}
const newTag = ref("");
function addTag() {
  const t = newTag.value.trim().toLowerCase().slice(0, 24);
  newTag.value = "";
  if (t && !myTags.value.includes(t)) saveMeta({ tags: [...myTags.value, t] });
}
const removeTag = (t) => saveMeta({ tags: myTags.value.filter((x) => x !== t) });
// The calendar is only fetched when someone taps "Pick a date" (public-page JS budget).
// A plain dynamic import: defineAsyncComponent would add its code to the Vue chunk every
// public page loads.
const DatePicker = shallowRef(null);
const pickingDate = ref(false);
const dateBtn = ref(null);
async function pickDate() {
  pickingDate.value = true;
  if (!DatePicker.value) DatePicker.value = (await import("../components/ui/UiDatePicker.vue")).default;
}
function remindOn(v) { if (v) saveMeta({ remindAt: new Date(`${v}T09:00`).getTime() }); }

function vcard() {
  const pr = p.value;
  const lines = [
    "BEGIN:VCARD", "VERSION:3.0",
    `FN:${pr.name}`,
    ...(pr.mode === "career"
      ? [pr.company ? `ORG:${pr.company}` : "", pr.role ? `TITLE:${pr.role}` : ""]
      : [pr.uni ? `ORG:${pr.uni}` : "", pr.course ? `TITLE:${pr.course}` : ""]),
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
const selfieBusy = ref(false);
async function selfieAction(fn) {
  selfieBusy.value = true;
  try { await fn(connection.value.id); await load(); } catch (e) { alert(e.message); }
  finally { selfieBusy.value = false; }
}
const acceptSelfie = () => selfieAction(Api.selfieAccept);
const removeSelfie = () => { if (confirm("Delete this selfie for both of you? The connection stays.")) selfieAction(Api.selfieRemove); };

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

      <section v-if="connection" class="panel stack-2" aria-label="Your connection">
        <div>
          <span class="label">Your connection</span>
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

        <div class="stack">
          <span class="label">Follow up</span>
          <p v-if="followedUpAt" class="small" style="margin:0">
            Followed up {{ fmtDay(followedUpAt) }}.
            <button type="button" class="link-btn" @click="saveMeta({ followedUp: false })">Undo</button>
          </p>
          <template v-else>
            <p v-if="remindAt" class="small" style="margin:0">
              Reminder {{ relativeDay(remindAt) }} ({{ fmtDay(remindAt) }}).
              <button type="button" class="link-btn" @click="saveMeta({ remindAt: null })">Clear</button>
            </p>
            <div class="chip-row" role="group" aria-label="Remind me to follow up">
              <button type="button" class="chip chip-toggle" @click="saveMeta({ remindAt: morningIn(1) })">Tomorrow</button>
              <button type="button" class="chip chip-toggle" @click="saveMeta({ remindAt: morningIn(3) })">In 3 days</button>
              <button type="button" class="chip chip-toggle" @click="saveMeta({ remindAt: morningIn(7) })">Next week</button>
              <button ref="dateBtn" type="button" class="chip chip-toggle" aria-haspopup="dialog" :aria-expanded="pickingDate ? 'true' : 'false'"
                      @click="pickDate">Pick a date</button>
              <component :is="DatePicker" v-if="pickingDate && DatePicker" bare v-model:open="pickingDate" min-today label="Remind me on" model-value=""
                            :anchor="dateBtn" @update:model-value="remindOn" />
            </div>
            <button type="button" class="btn" @click="saveMeta({ followedUp: true })">Mark as followed up</button>
          </template>
        </div>

        <div class="stack">
          <span class="label">Your tags</span>
          <p class="small muted" style="margin:0">Only you see these. Filter by them under People.</p>
          <div v-if="myTags.length" class="chip-row">
            <span v-for="t in myTags" :key="t" class="chip">
              {{ t }}
              <button type="button" class="tag-x" :aria-label="`Remove tag ${t}`" @click="removeTag(t)">×</button>
            </span>
          </div>
          <form class="row" @submit.prevent="addTag">
            <label for="new-tag" class="visually-hidden">Add a tag</label>
            <input id="new-tag" v-model="newTag" type="text" maxlength="24" placeholder="mentor, cofounder, hiring…" style="flex:1" />
            <button type="submit" class="btn" style="width:auto">Add</button>
          </form>
          <p v-if="metaMsg" class="error-text" role="alert">{{ metaMsg }}</p>
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
.tag-x { background: none; border: none; padding: 0 0 0 6px; margin: 0; cursor: pointer; font-weight: 800; color: inherit; min-width: 24px; min-height: 24px; }
.tag-x:focus-visible { outline: 2px solid var(--strap); }
</style>
