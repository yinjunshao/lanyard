<script setup>
// F32: drops, the host's side. Host pages only: it rides in the host event chunk with HostLive, so no public
// page loads it. A drop gives each checked-in person something only they can see: a key, a code, a password
// or a lunch voucher. The host sees counts. The only items that ever come back to this page are the ones
// nobody was given, and only as a file the host asks for. Pasted text is cleared from the page as soon as
// it is saved, and nothing here keeps it in storage.
import { computed, onMounted, ref } from "vue";
import { api } from "../lib/api";
import UiDateTimePicker from "./ui/UiDateTimePicker.vue";

const props = defineProps({ eventId: { type: String, required: true } });
const base = computed(() => `/api/host/events/${encodeURIComponent(props.eventId)}/drops`);

const KINDS = [
  { key: "one_each", label: "One each from a list", help: "Paste API keys, codes or links. Each person gets the next unused one, and no item goes to two people." },
  { key: "random", label: "Random from a list", help: "Paste a list. Each person gets one at random." },
  { key: "same", label: "Same for everyone", help: "One text for everyone, such as a Wi-Fi password." },
  { key: "voucher", label: "Voucher", help: "A food or drink voucher. Staff mark it as used with a PIN." },
];
const kindLabel = (k) => KINDS.find((x) => x.key === k)?.label || k;

const data = ref(null);
const loading = ref(true);
const error = ref("");
const busy = ref("");
const notice = ref("");
const confirm = ref(""); // "<drop id>:<action>" waiting for a second tap
const pinShown = ref(null); // { title, pin }

async function load() {
  try { data.value = await api(base.value); error.value = ""; }
  catch (e) { error.value = e.message; }
  finally { loading.value = false; }
}
onMounted(load);

/* ----------------------------------- making one ----------------------------------- */
const blank = () => ({ kind: "one_each", title: "", note: "", items: "", value: "", reuse: false, perPerson: 1, validFrom: null, validUntil: null });
const form = ref(blank());
const opening = ref(false);
const listKind = computed(() => form.value.kind === "one_each" || form.value.kind === "random");

async function make() {
  if (busy.value) return;
  busy.value = "make"; error.value = ""; notice.value = "";
  const f = form.value;
  const body = { kind: f.kind, title: f.title, note: f.note, validFrom: f.validFrom, validUntil: f.validUntil };
  if (f.kind === "same") body.value = f.value;
  if (listKind.value) { body.items = f.items; body.reuse = f.kind === "random" && f.reuse; }
  if (f.kind === "voucher") body.perPerson = Number(f.perPerson);
  try {
    const r = await api(base.value, "POST", body);
    const title = f.title;
    form.value = blank(); // the pasted text leaves the page here
    opening.value = false;
    notice.value = listKind.value || f.kind === "same" ? `${title} is on. ${r.loaded} loaded${r.duplicates ? `, ${r.duplicates} repeated line${r.duplicates === 1 ? "" : "s"} left out` : ""}.` : `${title} is on.`;
    if (r.pin) pinShown.value = { title, pin: r.pin };
    await load();
  } catch (e) { error.value = e.message; }
  finally { busy.value = ""; }
}

/* --------------------------------- one drop's actions --------------------------------- */
const adding = ref(""); // the drop id whose "add more" box is open
const addText = ref("");

async function act(d, what, fn) {
  if (busy.value) return;
  busy.value = d.id + ":" + what; error.value = ""; notice.value = "";
  try { await fn(); await load(); }
  catch (e) { error.value = e.message; }
  finally { busy.value = ""; confirm.value = ""; }
}
const setStatus = (d, status) => act(d, "status", () => api(`${base.value}/${d.id}`, "PUT", { status }));
function twice(d, what, fn) {
  const key = d.id + ":" + what;
  if (confirm.value !== key) { confirm.value = key; return; }
  return act(d, what, fn);
}
const delUnused = (d) => twice(d, "unused", async () => { const r = await api(`${base.value}/${d.id}/unused`, "DELETE"); notice.value = `${r.deleted} unused item${r.deleted === 1 ? "" : "s"} deleted.`; });
const delDrop = (d) => twice(d, "drop", () => api(`${base.value}/${d.id}`, "DELETE"));
async function saveMore(d) {
  await act(d, "add", async () => {
    const r = await api(`${base.value}/${d.id}/items`, "POST", { items: addText.value });
    addText.value = ""; adding.value = "";
    notice.value = `${r.added} added${r.alreadyThere ? `, ${r.alreadyThere} already there` : ""}. ${r.loaded} loaded now.`;
  });
}
// The unused items, as a file. A POST (it is logged), turned into a download here and then forgotten.
async function download(d) {
  await act(d, "download", async () => {
    const res = await fetch(`${base.value}/${d.id}/unused`, { method: "POST", credentials: "same-origin" });
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Couldn't download them."); }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = `${d.title.replace(/[^A-Za-z0-9 _-]/g, "").trim().replace(/\s+/g, "-") || "drop"}-unused.txt`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice.value = "Downloaded. This file holds real keys: delete it when you have used it.";
  });
}

/* ---------------------------------- words for a drop ---------------------------------- */
const counts = (d) => {
  if (d.purged) return d.kind === "voucher" ? `Cleared away. ${d.used} used in all.` : `Cleared away. ${d.loaded} were loaded and ${d.given} given.`;
  if (d.kind === "voucher") return `${d.used} of ${d.entitled} used${d.people ? `, by ${d.people} ${d.people === 1 ? "person" : "people"}` : ""}`;
  if (d.kind === "same") return `${d.given} ${d.given === 1 ? "person has" : "people have"} it`;
  return `${d.loaded} loaded, ${d.given} given${d.kind === "one_each" || !d.reuse ? `, ${d.unused} left` : ""}${d.revoked ? `, ${d.revoked} withdrawn` : ""}`;
};
const stateText = (d) => ({ open: "On", stopped: "Stopped", soon: "Not started", closed: "Finished", gone: "Cleared" }[d.state] || d.state);
const isList = (d) => d.kind === "one_each" || d.kind === "random";
const when = (ms) => new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
</script>

<template>
  <section class="stack-3 drops" aria-labelledby="drops-h" data-drops>
    <div class="panel stack-2">
      <h2 id="drops-h">Drops</h2>
      <p class="small muted" style="margin:0">
        Give each person who checked in a key, a code, a password or a food voucher. They open theirs on this event's page in the app, and it is shown only to them.
        You see counts, never what was given.
      </p>
      <p v-if="data && !data.ready" class="notice" role="alert">Drops are switched off on this server, because it has no key to keep them safe with. Nothing can be saved until whoever runs Lanyard sets it up.</p>
    </div>

    <p v-if="loading" class="muted">Loading…</p>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <p v-if="notice" class="success-text" role="status">{{ notice }}</p>

    <div v-if="pinShown" class="panel stack-2 pin-box" role="status">
      <span class="label">Staff PIN for {{ pinShown.title }}</span>
      <div class="pin tnum" aria-label="Staff PIN">{{ pinShown.pin }}</div>
      <p class="small" style="margin:0">Give this to the staff who hand out the voucher. They type it on the person's phone to mark a use. <strong>It is shown once</strong> and Lanyard keeps only a scrambled copy.</p>
      <button type="button" class="btn" @click="pinShown = null">I have noted it</button>
    </div>

    <div v-if="data" class="stack-3">
      <article v-for="d in data.drops" :key="d.id" class="panel stack-2 drop" :data-drop="d.id">
        <div class="spread" style="align-items:flex-start">
          <div style="min-width:0">
            <h3 class="drop-title">{{ d.title }}</h3>
            <span class="small muted">{{ kindLabel(d.kind) }}<template v-if="d.kind === 'voucher'">, {{ d.perPerson }} {{ d.perPerson === 1 ? "use" : "uses" }} each</template><template v-if="d.reuse">, items can repeat</template></span>
          </div>
          <span class="status-pill" :class="d.state">{{ stateText(d) }}</span>
        </div>
        <p class="drop-counts tnum">{{ counts(d) }}</p>
        <p v-if="d.note" class="small muted" style="margin:0">{{ d.note }}</p>
        <p v-if="d.validFrom || d.validUntil" class="small muted" style="margin:0">
          <template v-if="d.validFrom">From {{ when(d.validFrom) }}. </template><template v-if="d.validUntil">Until {{ when(d.validUntil) }}.</template>
        </p>
        <p v-if="isList(d) && !d.purged && d.loaded > 0 && d.unused === 0 && d.state === 'open'" class="notice small">All given out. People who open it now are told there are none left.</p>

        <template v-if="!d.purged">
          <div class="btn-row wrap">
            <button v-if="d.status === 'on'" type="button" class="btn" :disabled="!!busy" @click="setStatus(d, 'stopped')">Stop giving</button>
            <button v-else type="button" class="btn" :disabled="!!busy" @click="setStatus(d, 'on')">Start again</button>
            <button v-if="isList(d)" type="button" class="btn" :disabled="!!busy" @click="adding = adding === d.id ? '' : d.id; addText = ''">Add more</button>
            <button v-if="isList(d)" type="button" class="btn" :disabled="!!busy || d.unused === 0" @click="download(d)">Download unused</button>
          </div>
          <form v-if="adding === d.id" class="stack-2" @submit.prevent="saveMore(d)">
            <div class="field" style="margin:0">
              <label :for="'more-' + d.id">More items, one on each line</label>
              <textarea :id="'more-' + d.id" v-model="addText" rows="5" spellcheck="false" autocomplete="off" autocapitalize="off" required></textarea>
              <span class="small muted">Anything already in this drop is left out, so no item goes to two people.</span>
            </div>
            <button type="submit" class="btn btn-primary" :disabled="!!busy">Add these</button>
          </form>
          <div class="btn-row wrap">
            <button v-if="isList(d)" type="button" class="btn btn-danger" :disabled="!!busy || d.unused === 0" @click="delUnused(d)">
              {{ confirm === d.id + ':unused' ? `Tap again: delete ${d.unused} unused` : "Delete unused items" }}
            </button>
            <button type="button" class="btn btn-danger" :disabled="!!busy" @click="delDrop(d)">
              {{ confirm === d.id + ':drop' ? "Tap again: people who have one lose it" : "Delete this drop" }}
            </button>
          </div>
        </template>
      </article>
      <p v-if="!data.drops.length && !loading" class="empty small">No drops yet. Make one below.</p>
    </div>

    <div v-if="data?.ready" class="panel stack-2">
      <button v-if="!opening" type="button" class="btn btn-primary" @click="opening = true">Make a drop</button>
      <form v-else class="stack-2" @submit.prevent="make">
        <h3 class="label" style="margin:0">Make a drop</h3>
        <fieldset class="kinds">
          <legend class="label-top">What are you giving?</legend>
          <label v-for="k in KINDS" :key="k.key" class="checkbox-row field" style="margin:0">
            <input v-model="form.kind" type="radio" name="drop-kind" :value="k.key" />
            <span class="small"><strong>{{ k.label }}</strong><span class="muted" style="display:block">{{ k.help }}</span></span>
          </label>
        </fieldset>
        <div class="field">
          <label for="drop-title">Title</label>
          <input id="drop-title" v-model="form.title" type="text" maxlength="60" autocomplete="off" placeholder="API credit, Wi-Fi password, Lunch" required />
        </div>
        <div class="field">
          <label for="drop-note">A line to show with it (optional)</label>
          <input id="drop-note" v-model="form.note" type="text" maxlength="200" autocomplete="off" placeholder="Paste this into the portal before 5pm" />
        </div>
        <div v-if="listKind" class="field">
          <label for="drop-items">Paste the items, one on each line</label>
          <textarea id="drop-items" v-model="form.items" rows="8" spellcheck="false" autocomplete="off" autocapitalize="off" required></textarea>
          <span class="small muted">Up to 2,000, each up to 600 characters. They are stored scrambled and you can't read them back, except the ones nobody has been given.</span>
        </div>
        <label v-if="form.kind === 'random'" class="checkbox-row">
          <input v-model="form.reuse" type="checkbox" />
          <span class="small">The same item can go to more than one person (each person still gets just one)</span>
        </label>
        <div v-if="form.kind === 'same'" class="field">
          <label for="drop-value">The text everyone gets</label>
          <input id="drop-value" v-model="form.value" type="text" maxlength="600" autocomplete="off" spellcheck="false" required />
        </div>
        <div v-if="form.kind === 'voucher'" class="field">
          <label for="drop-uses">Uses for each person</label>
          <input id="drop-uses" v-model="form.perPerson" type="number" min="1" max="10" inputmode="numeric" required />
          <span class="small muted">For example 1 lunch. Staff mark each use with a PIN you will be shown once.</span>
        </div>
        <div class="field"><label id="drop-from-l">Starts (optional)</label><UiDateTimePicker id="drop-from" v-model="form.validFrom" labelledby="drop-from-l" clearable /></div>
        <div class="field"><label id="drop-until-l">Ends (optional)</label><UiDateTimePicker id="drop-until" v-model="form.validUntil" labelledby="drop-until-l" clearable :min="form.validFrom" /></div>
        <p class="small muted" style="margin:0">Only people who have checked in to this event can open a drop. You can stop it at any time: nothing new is given, and people keep what they already have.</p>
        <div class="btn-row">
          <button type="button" class="btn" @click="opening = false; form = blank()">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="!!busy">{{ busy === "make" ? "Saving…" : "Make this drop" }}</button>
        </div>
      </form>
    </div>
  </section>
</template>

<style scoped>
.drop-title { margin: 0; font-size: 18px; overflow-wrap: anywhere; }
.drop-counts { margin: 0; font-size: 20px; font-weight: 700; }
.btn-row.wrap { flex-wrap: wrap; }
.btn-row.wrap .btn { flex: 1 1 140px; }
.kinds { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.kinds legend { padding: 0; margin-bottom: 8px; }
.status-pill.stopped, .status-pill.closed { color: var(--graphite); }
.pin { font-size: 40px; font-weight: 800; letter-spacing: .25em; }
.pin-box { border-color: var(--strap); }
</style>
