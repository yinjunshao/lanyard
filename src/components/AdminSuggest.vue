<script setup>
// F75 (D064): "Suggest details for someone" on /admin/profiles. Find a person (a low-score filter shows cards of 2 of 6
// or under), see their card now next to an editable copy, say where the details came from, and send a suggestion.
// Nothing changes on their card until they accept; they get an email if their address is verified, and a banner on
// My card either way. Only AdminProfiles.vue imports this file.
import { nextTick, onMounted, ref } from "vue";
import PhotoCropper from "./PhotoCropper.vue";
import ModeFields from "./ModeFields.vue";
import TagFields from "./TagFields.vue";
import Avatar from "./Avatar.vue";
import { useBusy } from "./Waiting.vue";
import { buildLinks } from "../lib/links";

const props = defineProps({
  call: { type: Function, required: true }, // AdminProfiles' fetch with the admin token
  token: { type: String, required: true },
});
const { working, once } = useBusy();
const error = ref("");
const note = ref("");
const q = ref("");
const low = ref(true);
const people = ref(null);
const open = ref(null); // { userId, name, status, ... }[]
const totals = ref(null);
const person = ref(null); // the one being edited: { id, profile, suggestion, emailVerified, score }
const f = ref(null);
const photo = ref(null);
const cropFile = ref(null);
const suggestedPhoto = ref(null);

const SHOWN = [["name", "Name"], ["mode", "Student or career"], ["uni", "University"], ["course", "Course"], ["year", "Year"], ["company", "Company"], ["role", "Role"], ["headline", "What they do"], ["about", "About"], ["tags", "Come to me for"], ["links", "Links"]];
const nowText = (k, p) => {
  const v = p[k];
  if (k === "mode") return v === "career" ? "Career" : "Student";
  if (k === "tags") return (v || []).join(", ");
  if (k === "links") return Object.entries(v || {}).map(([l, u]) => `${l}: ${u}`).join("\n");
  return v || "";
};

async function loadOpen() {
  try { const r = await props.call("/api/admin/suggest"); open.value = r.open; totals.value = r.totals; } catch (e) { error.value = e.message; }
}
onMounted(loadOpen);

const search = once(async () => {
  error.value = ""; note.value = "";
  const params = new URLSearchParams();
  if (q.value.trim()) params.set("q", q.value.trim());
  if (low.value) params.set("low", "1");
  if (!q.value.trim() && !low.value) { people.value = []; return; }
  try { people.value = (await props.call(`/api/admin/suggest/people?${params}`)).people; } catch (e) { error.value = e.message; }
});

const pick = once(async (p) => {
  error.value = ""; note.value = "";
  try {
    const r = await props.call(`/api/admin/suggest/${encodeURIComponent(p.id || p.userId)}`);
    person.value = r;
    const cur = r.profile;
    const links = Object.entries(cur.links || {}).map(([label, url]) => ({ label, url }));
    f.value = { ...cur, tags: (cur.tags || []).join(", "), links: links.length ? links : [{ label: "", url: "" }], source: r.suggestion?.source || "" };
    photo.value = null;
    suggestedPhoto.value = null;
    if (r.suggestion?.hasPhoto) {
      const res = await fetch(`/api/admin/suggest/${encodeURIComponent(r.id)}/photo`, { headers: { authorization: `Bearer ${props.token}` } }).catch(() => null);
      if (res?.ok) suggestedPhoto.value = URL.createObjectURL(await res.blob());
    }
    await nextTick();
    document.getElementById("sg-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) { error.value = e.message; }
});
function close() { person.value = null; f.value = null; photo.value = null; }

function pickPhoto(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (file) cropFile.value = file;
}
function onCropped(url) { cropFile.value = null; photo.value = url; }

const send = once(async () => {
  error.value = ""; note.value = "";
  if (!f.value.source.trim()) { error.value = "Say where the details came from, for example LinkedIn."; return; }
  const v = f.value;
  const body = {
    name: v.name, mode: v.mode, company: v.company, role: v.role, uni: v.uni, institutionId: v.institutionId, course: v.course, year: v.year,
    headline: v.headline, about: v.about, tags: v.tags.split(",").map((s) => s.trim().slice(0, 24)).filter(Boolean).slice(0, 12),
    links: buildLinks(v.links), source: v.source, ...(photo.value ? { photoDataUrl: photo.value } : {}),
  };
  if (body.institutionId == null) delete body.institutionId;
  try {
    const r = await props.call(`/api/admin/suggest/${encodeURIComponent(person.value.id)}`, "POST", body);
    note.value = r.emailed ? `Sent. ${v.name || "They"} will get an email and see it on My card.` : `Sent. ${v.name || "They"} will see it on My card (no email: they have no verified address).`;
    const sent = person.value.id;
    if (people.value) people.value = people.value.map((x) => (x.id === sent ? { ...x, open: true } : x));
    close();
    await loadOpen();
  } catch (e) { error.value = e.message; }
});
const withdraw = once(async (o) => {
  error.value = ""; note.value = "";
  if (!window.confirm(`Withdraw the details suggested for ${o.name}? Nothing on their card changes.`)) return;
  try { await props.call(`/api/admin/suggest/${encodeURIComponent(o.userId)}`, "DELETE"); await loadOpen(); } catch (e) { error.value = e.message; }
});

const MAX_LINKS = 20;
const addLink = () => { if (f.value.links.length < MAX_LINKS) f.value.links.push({ label: "", url: "" }); };
const removeLink = (i) => { f.value.links.splice(i, 1); if (!f.value.links.length) f.value.links.push({ label: "", url: "" }); };
const day = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
</script>

<template>
  <section class="stack-2" aria-labelledby="sg-h">
    <PhotoCropper v-if="cropFile" :file="cropFile" @done="onCropped" @cancel="cropFile = null" />
    <span id="sg-h" class="label">Suggest details for someone</span>
    <p class="small muted" style="margin:0">For someone whose card is nearly empty. They see what you suggest, field by field, and nothing changes on their card until they accept it. Suggestions are deleted after 30 days.</p>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <p v-if="note" class="success-text small" role="status">{{ note }}</p>

    <form class="panel stack" @submit.prevent="search">
      <label for="sg-q">Find someone</label>
      <input id="sg-q" v-model="q" type="search" autocomplete="off" placeholder="Name, institution, company, email or card code" />
      <label class="checkbox-row"><input v-model="low" type="checkbox" /><span class="small">Only cards with 2 of 6 or less</span></label>
      <button class="btn btn-primary" :disabled="!!working">{{ working === search ? "Finding…" : "Find" }}</button>
    </form>
    <p v-if="people && !people.length && !person" class="muted small">Nobody found.</p>
    <div v-for="p in person ? [] : people || []" :key="p.id" class="panel spread sg-person">
      <span class="sg-who"><strong>{{ p.name || "No name" }}</strong><br /><span class="small muted">{{ p.place || (p.mode === "career" ? "No company" : "No institution") }} · {{ p.score }} of {{ p.max }} · {{ p.emailVerified ? "email" : "no email" }}<template v-if="p.open"> · suggestion waiting</template></span></span>
      <button type="button" class="btn sg-go" :disabled="!!working" @click="pick(p)">Suggest details</button>
    </div>

    <form v-if="person && f" id="sg-form" class="stack-2" @submit.prevent="send">
      <span class="label">Details for {{ person.profile.name || "them" }}</span>
      <p v-if="person.suggestion" class="small muted" style="margin:0">They have one waiting, sent {{ day(person.suggestion.createdAt) }}. Sending a new one replaces it.</p>
      <div class="sg-grid">
        <div class="panel stack-2 sg-now" aria-label="Their card now">
          <span class="form-section-title">Their card now ({{ person.score }} of 6)</span>
          <Avatar class="avatar" style="width:56px;height:56px" :src="person.profile.photo" alt="Their photo now" />
          <dl class="sg-dl">
            <template v-for="[k, label] in SHOWN" :key="k"><dt class="small muted">{{ label }}</dt><dd>{{ nowText(k, person.profile) || "Empty" }}</dd></template>
          </dl>
        </div>
        <div class="stack-2">
          <div class="form-section">
            <span class="form-section-title">Suggest</span>
            <div class="field">
              <label class="label-top">Photo</label>
              <div class="file-picker">
                <Avatar class="avatar" style="width:64px;height:64px" :src="photo || suggestedPhoto || null" alt="The suggested photo" />
                <label for="sg-photo" class="btn">{{ photo ? "Change photo" : "Choose photo" }}</label>
                <input id="sg-photo" class="visually-hidden" type="file" accept="image/*" @change="pickPhoto" />
              </div>
            </div>
            <div class="field"><label for="sg-name">Name</label><input id="sg-name" v-model="f.name" type="text" autocomplete="off" /></div>
            <ModeFields :form="f" id-prefix="sg-" />
            <div class="field"><label for="sg-headline">What they do</label><input id="sg-headline" v-model="f.headline" type="text" maxlength="80" /></div>
            <div class="field"><label for="sg-about">About</label><textarea id="sg-about" v-model="f.about" maxlength="600"></textarea></div>
            <TagFields :form="f" id-prefix="sg-" />
            <div class="field">
              <label>Links</label>
              <div v-for="(l, i) in f.links" :key="i" class="link-row">
                <input v-model="l.label" type="text" maxlength="40" placeholder="LinkedIn" :aria-label="`Link ${i + 1} label`" />
                <input v-model="l.url" type="url" inputmode="url" placeholder="https://" :aria-label="`Link ${i + 1} address`" />
                <button type="button" class="link-remove" :aria-label="`Remove link ${i + 1}`" @click="removeLink(i)">×</button>
              </div>
              <button type="button" class="btn" :disabled="f.links.length >= MAX_LINKS" @click="addLink">Add a link</button>
            </div>
          </div>
          <div class="form-section">
            <span class="form-section-title">Where the details came from</span>
            <div class="field"><label for="sg-source">Source</label>
              <input id="sg-source" v-model="f.source" type="text" maxlength="80" placeholder="LinkedIn" />
              <span class="small muted">Only what you change is sent. They are told it came from {{ f.source.trim() || "LinkedIn" }}<template v-if="person.emailVerified">, by email and on My card</template><template v-else>, on My card (they have no verified email)</template>.</span></div>
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" :disabled="!!working">{{ working === send ? "Sending…" : "Send suggestion" }}</button>
            <button type="button" class="btn" @click="close">Cancel</button>
          </div>
        </div>
      </div>
    </form>

    <span class="label" style="margin-top:8px">Suggestions waiting<template v-if="open"> ({{ open.length }})</template></span>
    <p v-if="totals" class="small muted tnum" style="margin:0">Last 30 days: {{ totals.accepted30d }} accepted, {{ totals.declined30d }} declined, {{ totals.expired30d }} expired.</p>
    <p v-if="open && !open.length" class="muted small">None waiting.</p>
    <div v-for="o in open || []" :key="o.userId" class="panel stack">
      <div class="spread"><strong>{{ o.name || "No name" }}</strong><span class="small muted">waiting</span></div>
      <p class="small muted tnum" style="margin:0">Sent {{ day(o.createdAt) }} from {{ o.source }} · {{ o.emailedAt ? "emailed" : "banner only" }} · deleted {{ day(o.expiresAt) }}</p>
      <p class="small" style="margin:0">{{ o.offered.map((x) => x.label).join(", ") }}</p>
      <div class="btn-row">
        <button type="button" class="btn" :disabled="!!working" @click="pick(o)">Change</button>
        <button type="button" class="btn btn-danger" :disabled="!!working" @click="withdraw(o)">Withdraw</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sg-person { gap: 12px; }
.sg-who { min-width: 0; overflow-wrap: anywhere; flex: 1; }
.sg-go { width: auto; flex: none; }
.sg-grid { display: grid; gap: 16px; }
.sg-dl { margin: 0; display: grid; gap: 2px; }
.sg-dl dd { margin: 0 0 6px; white-space: pre-line; overflow-wrap: anywhere; }
@media (min-width: 760px) { .sg-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); align-items: start; } }
</style>
