<script setup>
// F60: "Who to meet" on the event hub, for everyone checked in while the event is on (D054). Up to five people here,
// each with only what their card shows (first name and last initial, headline, up to three tags), what they hope to
// get from the event, one reason and, only if they turned on Be easy to find, their photo. No card, link or contact
// detail: you find them in the room and scan their badge. Above the list, your own intention and the Suggest me tick
// (the same words as the check-in page); unticking takes you out of everyone's list at once, and you then see no
// list either. The order is the AI's when it ran ("Ranked with AI"), otherwise the plain order, with no label.
import { computed, onMounted, ref, watch } from "vue";
import { api } from "../lib/api";
import Avatar from "./Avatar.vue";
import UiSheet from "./ui/UiSheet.vue";
import RotatingHint from "./ui/RotatingHint.vue";
import { INTENTION_EXAMPLES } from "../lib/examples";
import { INTENTION_LABEL, INTENTION_MAX, SUGGEST_DETAIL, SUGGEST_NOTICE } from "../lib/suggest";

const props = defineProps({ eventId: { type: String, required: true }, status: { type: String, default: "ongoing" } });
const emit = defineEmits(["state"]);

const me = ref(null); // { available, why, suggest, intention }
const intention = ref("");
const list = ref(null); // { people, ai, mode }
const busy = ref(false);
const listBusy = ref(false);
const error = ref("");
const note = ref("");
const [HEAD, ...REST] = SUGGEST_NOTICE.split(". ");
const path = (p = "") => `/api/e/${encodeURIComponent(props.eventId)}${p}`;

const show = computed(() => !!me.value && me.value.available);
const changed = computed(() => !!me.value && intention.value.trim() !== (me.value.intention || ""));

onMounted(load);
watch(() => props.eventId, load);
async function load() {
  me.value = null; list.value = null; error.value = ""; note.value = "";
  try {
    me.value = await api(path("/suggest"));
    intention.value = me.value.intention || "";
    emit("state", { hostOff: me.value.why === "suggest_off" });
    if (me.value.available && me.value.suggest) await refresh();
  } catch { /* not checked in, or no signal: the section simply does not show */ }
}

async function refresh() {
  listBusy.value = true;
  try { list.value = await api(path("/who-to-meet"), "POST", {}); error.value = ""; }
  catch (e) { list.value = null; if (e.code !== "suggest_me_off") error.value = e.message; }
  finally { listBusy.value = false; }
}

async function save(body, done) {
  busy.value = true; error.value = ""; note.value = "";
  try {
    me.value = { ...me.value, ...(await api(path("/suggest"), "PUT", body)) };
    intention.value = me.value.intention || "";
    note.value = done;
    if (me.value.suggest) await refresh(); else list.value = null;
    return true;
  } catch (e) { error.value = e.message; return false; }
  finally { busy.value = false; }
}
// Someone who checked in before this existed has no choice yet (null): ticking sends their first one.
const saveIntention = () => save({ intention: intention.value.trim(), ...(me.value.suggest === null ? { suggest: false } : {}) }, "Saved.");
async function toggle(e) {
  const on = e.target.checked;
  if (!(await save({ suggest: on, intention: intention.value.trim() }, on ? "You're suggested to people here again." : "Done. You're not suggested to anyone here now."))) e.target.checked = !on;
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
    await api(path(`/who-to-meet/${encodeURIComponent(p.id)}/report`), "POST", { block, reason: reason.value });
    close(); note.value = block ? "Blocked. You won't see each other here again." : "Thanks, we've got your report.";
    await refresh();
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
</script>

<template>
  <section v-if="show" class="stack" aria-labelledby="meet-h" data-who-to-meet>
    <div class="spread">
      <h2 id="meet-h" class="label">Who to meet</h2>
      <button v-if="me.suggest" type="button" class="btn-quiet" :disabled="busy || listBusy" @click="refresh">Refresh</button>
    </div>

    <template v-if="me.suggest">
      <p v-if="list?.ai" class="small meet-ai" role="status" data-ai-label><strong>Ranked with AI</strong> from what people here show and hope for. Never their name or photo.</p>
      <p v-if="listBusy && !list" class="small muted" role="status" aria-busy="true">Finding people here…</p>
      <div v-else-if="list && !list.people.length" class="empty">
        <p>No one else to suggest yet. People who check in will show up here.</p>
      </div>
      <ul v-else-if="list" class="meet-row" aria-label="Who to meet">
        <li v-for="p in list.people" :key="p.id">
          <button type="button" class="meet-card" aria-haspopup="dialog" @click="open(p, $event)">
            <Avatar v-if="p.photo" class="meet-photo" :src="p.photo" :alt="`Photo of ${p.name}`" />
            <strong>{{ p.name }}</strong>
            <span v-if="p.headline" class="small">{{ p.headline }}</span>
            <span v-if="p.tags.length" class="small muted">{{ p.tags.join(" · ") }}</span>
            <span v-if="p.intention" class="small">Hoping to: {{ p.intention }}</span>
            <span class="small meet-reason">{{ p.reason }}</span>
          </button>
        </li>
      </ul>
    </template>
    <p v-else class="small muted">You're not suggested to people here, so you don't see suggestions either. Tick Suggest me below to see who to meet.</p>

    <div class="panel stack-2">
      <div class="field" style="margin:0">
        <label for="meet-intention">{{ INTENTION_LABEL }} <span class="muted">(optional)</span></label>
        <RotatingHint :pool="INTENTION_EXAMPLES" :empty="!intention" v-slot="{ placeholder }">
          <input id="meet-intention" v-model="intention" type="text" :maxlength="INTENTION_MAX" autocomplete="off" :placeholder="placeholder" @keydown.enter.prevent="changed && saveIntention()" />
        </RotatingHint>
      </div>
      <button v-if="changed" type="button" class="btn" :disabled="busy" @click="saveIntention">Save</button>
      <label class="checkbox-row meet-tick">
        <input type="checkbox" :checked="!!me.suggest" :disabled="busy" data-suggest-me @change="toggle" />
        <span class="small"><strong>{{ HEAD }}.</strong> {{ REST.join(". ") }}</span>
      </label>
      <p class="small muted" style="margin:0">{{ SUGGEST_DETAIL }}</p>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <p v-if="note" class="success-text" role="status">{{ note }}</p>
    </div>

    <UiSheet :open="!!picked" :anchor="pickedTrigger" :label="picked?.name || ''" @close="close">
      <div class="stack">
        <Avatar v-if="picked.photo" class="meet-big" :src="picked.photo" :alt="`Photo of ${picked.name}`" />
        <h3 class="meet-name">{{ picked.name }}</h3>
        <p v-if="picked.headline">{{ picked.headline }}</p>
        <p v-if="picked.tags.length" class="small muted">{{ picked.tags.join(" · ") }}</p>
        <p v-if="picked.intention" class="small">Hoping to: {{ picked.intention }}</p>
        <p class="small meet-reason">{{ picked.reason }}</p>
        <p class="notice small">Find them in the room and scan their badge to connect.</p>
        <template v-if="!reporting">
          <button type="button" class="btn-quiet" @click="reporting = true">Report or block</button>
        </template>
        <template v-else>
          <div class="field">
            <label for="meet-reason">What happened? (only needed to report)</label>
            <textarea id="meet-reason" v-model="reason" maxlength="500"></textarea>
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
.meet-ai { margin: 0; }
.meet-tick { min-height: 44px; align-items: flex-start; }
.meet-reason { color: var(--graphite); }
.meet-row {
  list-style: none; margin: 0; padding: 0 0 6px;
  display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x proximity;
}
.meet-row li { flex: none; width: 176px; scroll-snap-align: start; }
.meet-card {
  width: 100%; height: 100%; text-align: left; display: flex; flex-direction: column; gap: 4px;
  padding: 10px; border: var(--border); border-radius: var(--radius);
  background: var(--paper-raised); color: var(--ink); font: inherit; cursor: pointer; min-height: var(--tap);
  overflow-wrap: anywhere;
}
.meet-card:active { border-color: var(--ink); }
.meet-card:focus-visible { outline: 2.5px solid var(--strap); outline-offset: 2px; }
.meet-photo { width: 100%; aspect-ratio: 1; height: auto; object-fit: cover; border-radius: 4px; display: block; background: var(--rule); margin-bottom: 4px; }
.meet-big { width: 100%; max-width: 360px; aspect-ratio: 1; height: auto; object-fit: cover; border-radius: var(--radius); display: block; margin: 0 auto; background: var(--rule); border: var(--border); }
.meet-name { margin: 0; font-size: 20px; }
@media (min-width: 600px) { .meet-row li { width: 200px; } }
</style>
