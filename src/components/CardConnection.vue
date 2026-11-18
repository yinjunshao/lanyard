<script setup>
// The "Your connection" panel of a card you are already connected to: your private note, the
// follow-up reminder, your tags, Save to contacts, Remove and Report. PublicCard.vue loads it
// only once the card says you are connected (a plain import(), like the calendar), so the first
// load of a scanned card does not carry it (public-page JS budget, F28).
import { computed, ref, shallowRef, watch } from "vue";
import { useRouter } from "vue-router";
import { Api } from "../lib/api";
import { morningIn, fmtDay, relativeDay } from "../lib/time";

const props = defineProps({
  connection: { type: Object, required: true },
  profile: { type: Object, default: () => ({}) },
  first: { type: String, default: "" },
});
const router = useRouter();
const connection = computed(() => props.connection);
const p = computed(() => props.profile);

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
const metaBusy = ref(false);
async function saveMeta(patch) {
  if (metaBusy.value) return;
  metaMsg.value = ""; metaBusy.value = true;
  try {
    const r = await Api.connectionMeta(connection.value.id, patch);
    myTags.value = r.tags; remindAt.value = r.remindAt; followedUpAt.value = r.followedUpAt;
  } catch (e) {
    metaMsg.value = e.message;
  } finally { metaBusy.value = false; }
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
// F22: the draft composer is its own chunk, fetched when "Draft a follow-up" is pressed (plain import(), as above).
const Composer = shallowRef(null);
const drafting = ref(false);
async function openDraft() {
  drafting.value = true;
  if (!Composer.value) Composer.value = (await import("./FollowupComposer.vue")).default;
}
function draftedFollowUp() { saveMeta({ followedUp: true }); }
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

const removeBusy = ref(false);
async function removeConnection() {
  if (removeBusy.value || !confirm("Remove this connection? The shared selfie is deleted for both of you.")) return;
  removeBusy.value = true;
  try { await Api.removeConnection(connection.value.id); router.push("/app/people"); }
  finally { removeBusy.value = false; }
}
const reporting = ref(false);
const reportText = ref("");
const reportAlsoBlock = ref(true);
const reportMsg = ref("");
const reportBusy = ref(false);
async function sendReport() {
  if (reportBusy.value) return;
  reportMsg.value = ""; reportBusy.value = true;
  try {
    const r = await Api.reportConnection(connection.value.id, reportText.value, reportAlsoBlock.value);
    if (r.blocked) { router.push("/app/people"); return; }
    reportMsg.value = "Thanks. We'll look into it.";
    reporting.value = false; reportText.value = "";
  } catch (e) {
    reportMsg.value = e.message;
  } finally { reportBusy.value = false; }
}
</script>

<template>
  <section class="panel stack-2" aria-label="Your connection">
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
        <button type="button" class="link-btn" :disabled="metaBusy" @click="saveMeta({ followedUp: false })">Undo</button>
      </p>
      <template v-else>
        <p v-if="remindAt" class="small" style="margin:0">
          Reminder {{ relativeDay(remindAt) }} ({{ fmtDay(remindAt) }}).
          <button type="button" class="link-btn" :disabled="metaBusy" @click="saveMeta({ remindAt: null })">Clear</button>
        </p>
        <div class="chip-row" role="group" aria-label="Remind me to follow up">
          <button type="button" class="chip chip-toggle" :disabled="metaBusy" @click="saveMeta({ remindAt: morningIn(1) })">Tomorrow</button>
          <button type="button" class="chip chip-toggle" :disabled="metaBusy" @click="saveMeta({ remindAt: morningIn(3) })">In 3 days</button>
          <button type="button" class="chip chip-toggle" :disabled="metaBusy" @click="saveMeta({ remindAt: morningIn(7) })">Next week</button>
          <button ref="dateBtn" type="button" class="chip chip-toggle" aria-haspopup="dialog" :aria-expanded="pickingDate ? 'true' : 'false'"
                  @click="pickDate">Pick a date</button>
          <component :is="DatePicker" v-if="DatePicker" bare v-model:open="pickingDate" min-today label="Remind me on" model-value=""
                        :anchor="dateBtn" @update:model-value="remindOn" />
        </div>
        <button type="button" class="btn" aria-haspopup="dialog" @click="openDraft">Draft a follow-up</button>
        <button type="button" class="btn" :disabled="metaBusy" @click="saveMeta({ followedUp: true })">Mark as followed up</button>
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
      <button class="btn" style="color:var(--strap-deep)" :disabled="removeBusy" @click="removeConnection">{{ removeBusy ? "Removing…" : "Remove" }}</button>
      <button class="btn" :aria-expanded="reporting" @click="reporting = !reporting">Report</button>
    </div>
    <form v-if="reporting" class="stack-1" @submit.prevent="sendReport">
      <label for="report-text">What happened?</label>
      <textarea id="report-text" v-model="reportText" maxlength="500" required></textarea>
      <label class="checkbox-row"><input type="checkbox" v-model="reportAlsoBlock" />
        <span class="small">Also remove this connection and block them</span></label>
      <button class="btn btn-primary" type="submit" :disabled="reportBusy">{{ reportBusy ? "Sending…" : "Send report" }}</button>
    </form>
    <p v-if="reportMsg" class="small" role="status">{{ reportMsg }}</p>
    <component :is="Composer" v-if="drafting && Composer" :connection-id="connection.id" :links="p.links" :first="first"
               @close="drafting = false" @followed-up="draftedFollowUp" />
  </section>
</template>

<style scoped>
.tag-x { background: none; border: none; padding: 0 0 0 6px; margin: 0; cursor: pointer; font-weight: 800; color: inherit; min-width: 24px; min-height: 24px; }
.tag-x:focus-visible { outline: 2px solid var(--strap); }
</style>
