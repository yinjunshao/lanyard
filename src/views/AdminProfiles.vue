<script setup>
// F74 (D063): profiles for people who are not on Lanyard yet. The admin makes a card from details found elsewhere and
// copies a claim link to send them. Uses the admin token Admin.vue keeps for this tab (sessionStorage), nothing else.
// A link is shown once, when it is made; Copy link makes a new one and stops the old one.
import { onMounted, ref } from "vue";
import PhotoCropper from "../components/PhotoCropper.vue";
import ModeFields from "../components/ModeFields.vue";
import TagFields from "../components/TagFields.vue";
import Avatar from "../components/Avatar.vue";
import Waiting from "../components/Waiting.vue";
import AdminSuggest from "../components/AdminSuggest.vue";
import { useBusy } from "../components/Waiting.vue";
import { buildLinks } from "../lib/links";
import { fix } from "../lib/errors";
document.title = "Profiles for people | Admin | Lanyard";

const TOKEN_KEY = "lanyard_admin_token"; // the same key and storage as Admin.vue
const token = ref("");
const input = ref("");
const error = ref("");
const list = ref(null);
const shown = ref(null); // { name, link } the link just made, shown once
const copied = ref(false);
const editing = ref(null); // the id being edited, or null for a new one
const photos = ref({}); // id -> blob: address
const { working, once } = useBusy();

const blank = () => ({ name: "", mode: "career", company: "", role: "", uni: "", institutionId: null, course: "", year: "", headline: "", about: "", tags: "", links: [{ label: "", url: "" }], source: "" });
const f = ref(blank());
const photo = ref(null); // a new photo (data URL) to send
const existingPhoto = ref(null);
const cropFile = ref(null);

async function call(path, method = "GET", body) {
  let res, json = {};
  try {
    res = await fetch(path, {
      method,
      headers: { authorization: `Bearer ${token.value}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout?.(9e4),
    });
    json = await res.json().catch(() => ({}));
  } catch (e) { res = { status: 0 }; json = { code: "offline", e }; }
  if (!res.ok) {
    if (res.status === 401) signOut();
    throw fix(Object.assign(new Error(json.error || ""), { status: res.status, code: json.code || null }), json, res);
  }
  return json;
}
function signIn() {
  token.value = input.value.trim(); input.value = "";
  try { sessionStorage.setItem(TOKEN_KEY, token.value); } catch { /* not remembered */ }
  load();
}
function signOut() {
  token.value = "";
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}
onMounted(() => {
  try { token.value = sessionStorage.getItem(TOKEN_KEY) || ""; } catch { /* private window */ }
  if (token.value) load();
});

async function load() {
  error.value = "";
  try { list.value = await call("/api/admin/premade"); } catch (e) { list.value = null; error.value = e.message; }
}

function pickPhoto(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (file) cropFile.value = file;
}
function onCropped(url) { cropFile.value = null; photo.value = url; }

function reset() {
  f.value = blank(); photo.value = null; existingPhoto.value = null; editing.value = null;
}
const payload = () => ({
  name: f.value.name, mode: f.value.mode, company: f.value.company, role: f.value.role, uni: f.value.uni,
  institutionId: f.value.institutionId, course: f.value.course, year: f.value.year, headline: f.value.headline, about: f.value.about,
  tags: f.value.tags.split(",").map((s) => s.trim().slice(0, 24)).filter(Boolean).slice(0, 12),
  links: buildLinks(f.value.links), source: f.value.source,
  ...(photo.value ? { photoDataUrl: photo.value } : {}),
});
const save = once(async () => {
  error.value = ""; copied.value = false;
  if (!f.value.name.trim()) { error.value = "Add their name."; return; }
  if (!f.value.source.trim()) { error.value = "Say where the details came from, for example LinkedIn."; return; }
  try {
    if (editing.value) {
      await call(`/api/admin/premade/${encodeURIComponent(editing.value)}`, "PUT", payload());
      shown.value = null;
    } else {
      const r = await call("/api/admin/premade", "POST", payload());
      shown.value = { name: f.value.name.trim(), link: location.origin + r.path };
    }
    reset();
    await load();
  } catch (e) { error.value = e.message; }
});

const startEdit = once(async (w) => {
  error.value = ""; shown.value = null;
  try {
    const r = await call(`/api/admin/premade/${encodeURIComponent(w.id)}`);
    const p = r.profile;
    const links = Object.entries(p.links || {}).map(([label, url]) => ({ label, url }));
    f.value = { ...blank(), ...p, tags: (p.tags || []).join(", "), links: links.length ? links : [{ label: "", url: "" }], source: r.source };
    photo.value = null;
    existingPhoto.value = p.hasPhoto ? await photoOf(w.id) : null;
    editing.value = w.id;
    document.getElementById("pp-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) { error.value = e.message; }
});
async function photoOf(id) {
  if (photos.value[id]) return photos.value[id];
  const res = await fetch(`/api/admin/premade/${encodeURIComponent(id)}/photo`, { headers: { authorization: `Bearer ${token.value}` } }).catch(() => null);
  if (!res?.ok) return null;
  const url = URL.createObjectURL(await res.blob());
  photos.value = { ...photos.value, [id]: url };
  return url;
}

const newLink = once(async (w) => {
  error.value = ""; copied.value = false;
  if (!window.confirm(`Make a new link for ${w.name}? The link you sent before stops working.`)) return;
  try {
    const r = await call(`/api/admin/premade/${encodeURIComponent(w.id)}/link`, "POST", {});
    shown.value = { name: w.name, link: location.origin + r.path };
    await copy();
  } catch (e) { error.value = e.message; }
});
const remove = once(async (w) => {
  error.value = "";
  if (!window.confirm(`Delete the profile made for ${w.name}? Its photo goes too, and the link stops working. It cannot be undone.`)) return;
  try {
    await call(`/api/admin/premade/${encodeURIComponent(w.id)}`, "DELETE");
    if (editing.value === w.id) reset();
    if (shown.value?.name === w.name) shown.value = null;
    await load();
  } catch (e) { error.value = e.message; }
});
async function copy() {
  copied.value = false;
  try { await navigator.clipboard.writeText(shown.value.link); copied.value = true; }
  catch { error.value = "The link could not be copied here. Select it and copy it by hand."; }
}

const MAX_LINKS = 20;
const addLink = () => { if (f.value.links.length < MAX_LINKS) f.value.links.push({ label: "", url: "" }); };
const removeLink = (i) => { f.value.links.splice(i, 1); if (!f.value.links.length) f.value.links.push({ label: "", url: "" }); };
const day = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
</script>

<template>
  <div class="wide-col in-app stack-3" style="max-width:820px">
    <PhotoCropper v-if="cropFile" :file="cropFile" @done="onCropped" @cancel="cropFile = null" />
    <div class="page-head">
      <h1>Profiles for people</h1>
      <p class="sub">Make a card for someone who is not on Lanyard yet, then send them the link to claim it. Nobody else can see it until they do, and it is deleted after 30 days if they don't.</p>
    </div>
    <router-link to="/admin" class="small" style="text-decoration:underline">Back to admin</router-link>

    <form v-if="!token" class="panel stack" @submit.prevent="signIn">
      <label for="pp-token" class="label">Admin token</label>
      <input id="pp-token" v-model="input" type="password" autocomplete="off" />
      <button class="btn btn-primary" :disabled="!input.trim()">Open</button>
    </form>

    <template v-else>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>

      <section v-if="shown" class="panel stack" aria-labelledby="pp-link-h" data-claim-link>
        <span id="pp-link-h" class="label">Claim link for {{ shown.name }}</span>
        <p class="small muted" style="margin:0">Send it to them yourself. It is shown only now: to see it again, make a new one with Copy link.</p>
        <input :value="shown.link" type="text" readonly aria-label="Claim link" style="overflow-wrap:anywhere" @focus="$event.target.select()" />
        <div class="btn-row">
          <button type="button" class="btn btn-primary" @click="copy">Copy</button>
          <button type="button" class="btn" @click="shown = null">Done</button>
        </div>
        <p v-if="copied" class="success-text small" role="status">Copied.</p>
      </section>

      <section id="pp-form" class="stack-2" aria-labelledby="pp-make-h">
        <span id="pp-make-h" class="label">{{ editing ? `Edit ${f.name || "profile"}` : "Make a profile" }}</span>
        <div class="form-section">
          <span class="form-section-title">Basics</span>
          <div class="field">
            <label class="label-top">Photo</label>
            <div class="file-picker">
              <Avatar class="avatar" style="width:64px;height:64px" :src="photo || existingPhoto || null" alt="Their photo" />
              <label for="pp-photo" class="btn">{{ photo || existingPhoto ? "Change photo" : "Choose photo" }}</label>
              <input id="pp-photo" class="visually-hidden" type="file" accept="image/*" @change="pickPhoto" />
            </div>
          </div>
          <div class="field"><label for="pp-name">Name</label><input id="pp-name" v-model="f.name" type="text" autocomplete="off" /></div>
          <ModeFields :form="f" id-prefix="pp-" />
        </div>
        <div class="form-section">
          <span class="form-section-title">About</span>
          <div class="field"><label for="pp-headline">What they do</label><input id="pp-headline" v-model="f.headline" type="text" maxlength="80" /></div>
          <div class="field"><label for="pp-about">About</label><textarea id="pp-about" v-model="f.about" maxlength="600"></textarea></div>
          <TagFields :form="f" id-prefix="pp-" />
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
          <div class="field"><label for="pp-source">Source</label>
            <input id="pp-source" v-model="f.source" type="text" maxlength="80" placeholder="LinkedIn" />
            <span class="small muted">Shown to them on the claim page: "Someone at Lanyard made this card for you from details on {{ f.source.trim() || "LinkedIn" }}."</span></div>
        </div>
        <div class="btn-row">
          <button type="button" class="btn btn-primary" :disabled="!!working" @click="save">{{ working === save ? "Saving…" : editing ? "Save changes" : "Make the profile" }}</button>
          <button v-if="editing" type="button" class="btn" @click="reset">Cancel</button>
        </div>
      </section>

      <section class="stack-2" aria-labelledby="pp-wait-h">
        <span id="pp-wait-h" class="label">Waiting to be claimed<template v-if="list"> ({{ list.waiting.length }})</template></span>
        <Waiting v-if="!list && !error" shape="panel" :rows="2" label="Loading the profiles" :retry="load" />
        <p v-if="list && !list.waiting.length" class="muted">None waiting.</p>
        <div v-for="w in list?.waiting || []" :key="w.id" class="panel stack">
          <div class="spread"><strong>{{ w.name }}</strong><span class="small muted">from {{ w.source }}</span></div>
          <p class="small muted tnum" style="margin:0">Made {{ day(w.createdAt) }} · deleted {{ day(w.expiresAt) }} unless claimed</p>
          <div class="btn-row">
            <button type="button" class="btn" :disabled="!!working" @click="newLink(w)">Copy link</button>
            <button type="button" class="btn" :disabled="!!working" @click="startEdit(w)">Edit</button>
            <button type="button" class="btn btn-danger" :disabled="!!working" @click="remove(w)">Delete</button>
          </div>
        </div>
      </section>

      <AdminSuggest :call="call" :token="token" />

      <section class="stack-2" aria-labelledby="pp-claimed-h">
        <span id="pp-claimed-h" class="label">Claimed<template v-if="list"> ({{ list.claimed.count }})</template></span>
        <p class="small muted">For support: the account IDs of the latest claimed ones. Look one up under Account recovery on the admin page.</p>
        <p v-for="r in list?.claimed.recent || []" :key="r.id" class="small tnum" style="margin:0">{{ r.id }}<template v-if="r.claimedAt"> · {{ day(r.claimedAt) }}</template></p>
      </section>
    </template>
  </div>
</template>
