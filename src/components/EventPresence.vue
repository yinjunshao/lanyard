<script setup>
// F17: "Be easy to find" and "People you might want to meet", on the event hub while the event
// is on. Off until you turn it on. What you show, who sees it and when it is deleted are said in
// the card itself. A person in the list is a photo, a first name and last initial, their line and a
// reason; there is no card or link to open, because you meet them in the room and scan their badge.
import { explain } from "../lib/errors";
import { computed, onMounted, ref, watch } from "vue";
import { api } from "../lib/api";
import { fileToDataUrl } from "../lib/photo";
import Avatar from "./Avatar.vue";
import UiSheet from "./ui/UiSheet.vue";

const props = defineProps({ eventId: { type: String, required: true }, status: { type: String, default: "ongoing" } });

const INTRO_MAX = 80;
const WISH_MAX = 120;

const me = ref(null); // { available, why, on, intro, lookingFor, selfie }
const intro = ref("");
const wish = ref("");
const list = ref(null); // { mode, topics, people }
const busy = ref(false);
const error = ref("");
const note = ref("");
// F25: the AI re-ordering of the list above. F17's own list is always shown first; this swaps it for the model's order.
const aiLeft = ref(null); // AI rankings left for this event; null when this person cannot use them (the button is hidden)
const aiMode = ref(""); // "" (F17's list), "improved" (the model's order) or "same" (it found nobody better)
const aiBusy = ref(false);
const aiNote = ref("");

const over = computed(() => props.status === "ended" || me.value?.why === "not_ongoing");
const usable = computed(() => !!me.value && me.value.available && !over.value);
// Nothing to show when the host has the room off, or when it is over and you never turned it on.
const show = computed(() => !!me.value && me.value.why !== "directory_off" && (usable.value || (over.value && me.value.on)));

onMounted(load);
watch(() => props.eventId, load);
async function load() {
  me.value = null; list.value = null; error.value = ""; note.value = "";
  try {
    me.value = await api(`/api/e/${encodeURIComponent(props.eventId)}/presence`);
    intro.value = me.value.intro; wish.value = me.value.lookingFor;
    if (me.value.on && me.value.available) { await refresh(); await loadAllowance(); }
  } catch { /* not checked in, or no signal: the card simply does not show */ }
}

async function loadAllowance() {
  try { aiLeft.value = (await api(`/api/ai/who-to-meet/${encodeURIComponent(props.eventId)}`)).allowance?.left ?? null; } catch { aiLeft.value = null; }
}

async function refresh() {
  aiMode.value = ""; aiNote.value = "";
  try { list.value = await api(`/api/e/${encodeURIComponent(props.eventId)}/suggestions`); error.value = ""; }
  catch (e) { list.value = null; if (e.code !== "presence_off") error.value = e.message; }
}

async function change(body, done = "Saved.") {
  busy.value = true; error.value = ""; note.value = "";
  try {
    me.value = await api(`/api/e/${encodeURIComponent(props.eventId)}/presence`, "PUT", body);
    intro.value = me.value.intro; wish.value = me.value.lookingFor;
    note.value = done;
    return true;
  } catch (e) { error.value = e.message; return false; }
  finally { busy.value = false; }
}

async function toggle(e) {
  const on = e.target.checked;
  if (on) {
    // Ticking the box is the consent: the card above says exactly what is shown and to whom.
    if (await change({ consent: true }, "You're easy to find now.")) await refresh();
    else e.target.checked = false;
  } else {
    busy.value = true; error.value = ""; note.value = "";
    try {
      await api(`/api/e/${encodeURIComponent(props.eventId)}/presence`, "DELETE");
      me.value = { ...me.value, on: false, intro: "", lookingFor: "", selfie: null };
      intro.value = ""; wish.value = ""; list.value = null;
      note.value = "Done. Your photo and line are deleted.";
    } catch (err) { error.value = err.message; e.target.checked = true; }
    finally { busy.value = false; }
  }
}

async function takeSelfie(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  busy.value = true; error.value = "";
  try {
    const dataUrl = await fileToDataUrl(file, 720, 0.8);
    // Choosing a photo here is the consent to it being shown, as the text beside the button says.
    await change({ consent: true, selfieDataUrl: dataUrl }, "Photo saved.");
  } catch (err) { error.value = explain(err, "That photo couldn't be read. Try another."); busy.value = false; }
}
const removeSelfie = () => change({ selfieDataUrl: null }, "Photo deleted.");
const saveIntro = () => change({ intro: intro.value });
async function findPeople() {
  if (await change({ lookingFor: wish.value }, "")) await refresh();
}
// Re-order the list with AI, from the words saved with "Find people". Nothing runs until this button is pressed.
async function rankWithAi() {
  if (aiBusy.value || busy.value) return;
  if (wish.value.trim() !== me.value.lookingFor && !(await change({ lookingFor: wish.value }, ""))) return;
  aiBusy.value = true; aiNote.value = ""; error.value = "";
  try {
    const r = await api(`/api/ai/who-to-meet/${encodeURIComponent(props.eventId)}`, "POST", {});
    aiLeft.value = r.allowance?.left ?? aiLeft.value;
    if (r.fallback) {
      aiNote.value = r.message || "AI ranking isn't available right now. The usual list is shown.";
      await refresh(); aiNote.value = r.message || aiNote.value; // the usual list, fresh (someone may have left)
    } else {
      list.value = { ...(list.value || {}), people: r.people };
      aiMode.value = r.improved ? "improved" : "same";
    }
  } catch (e) {
    // Anything the route refuses (the event ended, you turned this off): the same list as ever, and why.
    aiNote.value = e.message; await refresh(); aiNote.value = e.message;
  } finally { aiBusy.value = false; }
}
function pickTopic(t) {
  if (!wish.value.toLowerCase().includes(t.toLowerCase())) wish.value = wish.value ? `${wish.value}, ${t}` : t;
}

// One person, in a sheet.
const picked = ref(null);
const pickedTrigger = ref(null);
const reporting = ref(false);
const reason = ref("");
function open(p, ev) { picked.value = p; pickedTrigger.value = ev.currentTarget; reporting.value = false; reason.value = ""; }
function close() { picked.value = null; }
async function flag(block) {
  const p = picked.value;
  busy.value = true; error.value = "";
  try {
    await api(`/api/e/${encodeURIComponent(props.eventId)}/presence/${encodeURIComponent(p.presenceId)}/report`, "POST", { block, reason: reason.value });
    close(); note.value = block ? "Blocked. You won't see each other here again." : "Thanks, we've got your report.";
    await refresh();
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
const withdrawNow = async () => {
  busy.value = true;
  try {
    await api(`/api/e/${encodeURIComponent(props.eventId)}/presence`, "DELETE");
    me.value = { ...me.value, on: false, selfie: null, intro: "", lookingFor: "" };
    note.value = "Done. Your photo and line are deleted.";
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
};
</script>

<template>
  <section v-if="show" class="stack" aria-labelledby="presence-h">
    <!-- The event is over: say what happens to what you showed, and let them delete it now. -->
    <div v-if="over" class="panel stack">
      <h2 id="presence-h" class="label">Be easy to find</h2>
      <p class="small">This event has ended, so nobody can see your photo or line any more. They are deleted within 48 hours of the end, or now if you press the button.</p>
      <button type="button" class="btn" :disabled="busy" @click="withdrawNow">Delete my photo and line now</button>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <p v-if="note" class="success-text" role="status">{{ note }}</p>
    </div>

    <template v-else>
      <div class="panel stack">
        <h2 id="presence-h" class="label">Be easy to find</h2>
        <p class="small">Show a photo and a line about you to other people at this event who do the same, so you can spot each other in the room.</p>
        <ul class="small presence-facts">
          <li><strong>Who sees it:</strong> only people checked in to this event who have turned this on too, and only while the event is on.</li>
          <li><strong>What they see:</strong> your first name and last initial, your photo and your line. Not your card, links or contact details. The organiser only sees how many people used this.</li>
          <li><strong>When it is deleted:</strong> as soon as you turn it off, and 48 hours after the event ends at the latest.</li>
        </ul>
        <label class="checkbox-row">
          <input type="checkbox" :checked="me.on" :disabled="busy" @change="toggle" />
          <span><strong>Show me to people here</strong></span>
        </label>

        <template v-if="me.on">
          <div class="presence-me">
            <Avatar class="presence-me-photo" :src="me.selfie" alt="Your photo" />
            <div class="stack presence-me-actions">
              <label for="presence-selfie" class="btn" :class="{ 'btn-disabled': busy }">{{ me.selfie ? "Retake selfie" : "Take a selfie" }}</label>
              <input id="presence-selfie" class="visually-hidden" type="file" accept="image/*" capture="user" :disabled="busy" @change="takeSelfie" />
              <button v-if="me.selfie" type="button" class="btn-quiet" :disabled="busy" @click="removeSelfie">Delete photo</button>
            </div>
          </div>
          <p class="small muted">Taking a selfie means you're happy for the people described above to see it.</p>

          <div class="field">
            <label for="presence-intro">A line about you</label>
            <input id="presence-intro" v-model="intro" type="text" :maxlength="INTRO_MAX" placeholder="Here for the robotics talk" @keydown.enter.prevent="saveIntro" />
            <span class="small muted" style="align-self:flex-end">{{ intro.length }}/{{ INTRO_MAX }}</span>
          </div>
          <button type="button" class="btn" :disabled="busy || intro === me.intro" @click="saveIntro">Save my line</button>
        </template>

        <p v-if="error" class="error-text" role="alert">{{ error }}</p>
        <p v-if="note" class="success-text" role="status">{{ note }}</p>
      </div>

      <div v-if="me.on" class="panel stack">
        <div class="field" style="margin-bottom:0">
          <label for="presence-wish">I want to meet someone who…</label>
          <input id="presence-wish" v-model="wish" type="text" :maxlength="WISH_MAX" placeholder="is into robotics, or works in design" @keydown.enter.prevent="findPeople" />
        </div>
        <div v-if="list?.topics?.length" class="chip-row" role="group" aria-label="Topics people here show">
          <button v-for="t in list.topics" :key="t" type="button" class="chip chip-toggle" @click="pickTopic(t)">{{ t }}</button>
        </div>
        <button type="button" class="btn" :disabled="busy" @click="findPeople">Find people</button>
      </div>

      <div v-if="me.on" class="stack" aria-labelledby="presence-people">
        <div class="spread">
          <h2 id="presence-people" class="label">People you might want to meet</h2>
          <button type="button" class="btn-quiet" :disabled="busy || aiBusy" @click="refresh">{{ aiMode ? "Usual list" : "Refresh" }}</button>
        </div>
        <div v-if="aiLeft !== null && me.lookingFor.length >= 3 && list?.people?.length" class="presence-ai stack">
          <button type="button" class="btn" :disabled="busy || aiBusy || aiLeft < 1" :aria-busy="aiBusy" @click="rankWithAi">{{ aiBusy ? "Ranking..." : "Rank with AI" }}</button>
          <p class="small muted">Re-orders this list by what you asked for, using each person's line, headline and tags. Never their name or photo. {{ aiLeft }} left for this event.</p>
        </div>
        <p v-if="aiMode === 'improved'" class="small presence-ai-label" role="status"><strong>Improved with AI.</strong> Ranked from what people here show. Not right? Press Usual list.</p>
        <p v-else-if="aiMode === 'same'" class="small muted" role="status">AI didn't find anyone who fits better, so this is the usual list.</p>
        <p v-if="aiNote" class="small muted" role="status">{{ aiNote }}</p>
        <div v-if="!list?.people?.length" class="empty">
          <p>No one else has turned this on yet. People who do will show up here.</p>
        </div>
        <ul v-else class="presence-row" aria-label="People you might want to meet">
          <li v-for="p in list.people" :key="p.presenceId">
            <button type="button" class="presence-card" aria-haspopup="dialog" @click="open(p, $event)">
              <Avatar class="presence-photo" :src="p.selfie" :alt="`Photo of ${p.name}`" />
              <strong>{{ p.name }}</strong>
              <span v-if="p.intro" class="small">{{ p.intro }}</span>
              <span class="small muted">{{ p.reason }}</span>
            </button>
          </li>
        </ul>
      </div>
    </template>

    <UiSheet v-if="picked" :open="!!picked" :anchor="pickedTrigger" :label="picked.name" @close="close">
      <div class="stack">
        <Avatar class="presence-big" :src="picked.selfie" :alt="`Photo of ${picked.name}`" />
        <h3 class="presence-name">{{ picked.name }}</h3>
        <p v-if="picked.intro">{{ picked.intro }}</p>
        <p class="small muted">{{ picked.reason }}</p>
        <p class="notice small">Find them in the room and scan their badge to connect.</p>
        <template v-if="!reporting">
          <button type="button" class="btn-quiet" @click="reporting = true">Report or block</button>
        </template>
        <template v-else>
          <div class="field">
            <label for="presence-reason">What happened? (only needed to report)</label>
            <textarea id="presence-reason" v-model="reason" maxlength="500"></textarea>
          </div>
          <div class="btn-row">
            <button type="button" class="btn" :disabled="busy" @click="flag(true)">Block them</button>
            <button type="button" class="btn" :disabled="busy || !reason.trim()" @click="flag(false)">Report</button>
          </div>
          <p class="small muted">Blocking is for both of you: you won't see each other here or anywhere else on Lanyard.</p>
          <p v-if="error" class="error-text" role="alert">{{ error }}</p>
        </template>
      </div>
    </UiSheet>
  </section>
</template>

<style scoped>
.presence-facts { margin: 0; padding-left: 18px; }
.presence-facts li + li { margin-top: 6px; }
.presence-ai > * + * { margin-top: 4px; }
.presence-ai-label { margin: 0; }
.presence-me { display: flex; gap: 14px; align-items: center; }
.presence-me-photo { width: 96px; height: 96px; border-radius: var(--radius); object-fit: cover; flex: none; border: var(--border); }
.presence-me-actions { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space); }
.presence-me-actions > * + * { margin-top: 0; }
label.btn { display: inline-flex; align-items: center; justify-content: center; cursor: pointer; width: auto; }
.btn-disabled { opacity: 0.4; pointer-events: none; }
#presence-selfie:focus-visible + .btn, label.btn:focus-within { outline: 2.5px solid var(--strap); outline-offset: 2px; }

.presence-row {
  list-style: none; margin: 0; padding: 0 0 6px;
  display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x proximity;
}
.presence-row li { flex: none; width: 156px; scroll-snap-align: start; }
.presence-card {
  width: 100%; text-align: left; display: flex; flex-direction: column; gap: 4px;
  padding: 8px 8px 10px; border: var(--border); border-radius: var(--radius);
  background: var(--paper-raised); color: var(--ink); font: inherit; cursor: pointer; min-height: var(--tap);
}
.presence-card:active { border-color: var(--ink); }
.presence-card:focus-visible { outline: 2.5px solid var(--strap); outline-offset: 2px; }
.presence-photo { width: 100%; aspect-ratio: 1; height: auto; object-fit: cover; border-radius: 4px; display: block; background: var(--rule); margin-bottom: 4px; }
.presence-big { width: 100%; max-width: 360px; aspect-ratio: 1; height: auto; object-fit: cover; border-radius: var(--radius); display: block; margin: 0 auto; background: var(--rule); border: var(--border); }
.presence-name { margin: 0; font-size: 20px; }
</style>
