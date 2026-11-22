<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Api } from "../lib/api";
import { me, refreshMe } from "../lib/store";
import Avatar from "../components/Avatar.vue";
import PhotoCropper from "../components/PhotoCropper.vue";
import ModeFields from "../components/ModeFields.vue";
import TagFields from "../components/TagFields.vue";
import { buildLinks } from "../lib/links";
import CardPreview from "../components/CardPreview.vue";
import { cardOf, profileOf } from "../lib/cardpreview";

const router = useRouter();
const origin = location.origin;
const route = useRoute();
const f = ref({
  name: "", mode: "student", company: "", role: "", uni: "", institutionId: null, course: "", year: "", headline: "", about: "",
  tags: "", links: [{ label: "", url: "" }], projects: [], showAge: false,
});
const photo = ref(null);
const existingPhoto = ref("");
const busy = ref(false);
const error = ref("");
const saved = ref(false);
onMounted(() => {
  // No card yet: the welcome steps are where a card is made (F14); this page is for editing one.
  if (!me.profile) { router.replace("/app/welcome"); return; }
  // Arrived from "Finish your card": put the cursor in the field that's missing.
  if (route.hash) setTimeout(() => {
    const el = document.querySelector(route.hash);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    (el?.matches("input, textarea, button") ? el : el?.querySelector("input:not([type=file]), textarea"))?.focus({ preventScroll: true });
  }, 250);
  const p = me.profile;
  if (p) {
    const links = Object.entries(p.links || {}).map(([label, url]) => ({ label, url }));
    f.value = {
      name: p.name || "", mode: p.mode === "career" ? "career" : "student",
      company: p.company || "", role: p.role || "", uni: p.uni || "", institutionId: p.institution_id || null, course: p.course || "",
      year: p.year || "", headline: p.headline || "", about: p.about || "",
      tags: (p.tags || []).join(", "),
      links: links.length ? links : [{ label: "", url: "" }],
      projects: p.projects || [],
      showAge: !!p.show_age,
    };
    existingPhoto.value = p.photo || "";
  }
});

// Picking a photo opens the cropper (move / zoom to frame it). Confirming
// saves it right away when a profile already exists, so changing it never
// depends on finding a Save button further down.
const photoMsg = ref("");
const cropFile = ref(null);
function pickAvatar(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  error.value = ""; photoMsg.value = "";
  cropFile.value = file;
}
async function onCropped(dataUrl) {
  cropFile.value = null;
  photo.value = dataUrl;
  if (!me.profile) return; // first-time setup saves everything together
  busy.value = true;
  try {
    await Api.updateProfile({ photoDataUrl: dataUrl });
    existingPhoto.value = dataUrl;
    photo.value = null;
    photoMsg.value = "Photo updated.";
    refreshMe().catch(() => {});
  } catch (err) {
    error.value = saveErrorMessage(err);
  } finally {
    busy.value = false;
  }
}

const MAX_LINKS = 20;
function addLink() {
  if (f.value.links.length < MAX_LINKS) f.value.links.push({ label: "", url: "" });
}
function removeLink(i) {
  f.value.links.splice(i, 1);
  if (!f.value.links.length) f.value.links.push({ label: "", url: "" });
}
// A friendlier message for the one failure that needs its own words here (the rest come from api()).
function saveErrorMessage(e) {
  if (e.status === 413) return "That photo is too large even after compressing. Try a smaller or simpler image.";
  return e.message;
}

// What Save sends. The preview reads the same thing, so it shows what will be saved (F18).
const payloadOf = () => ({
  name: f.value.name, mode: f.value.mode, company: f.value.company, role: f.value.role,
  uni: f.value.uni, institutionId: f.value.institutionId, course: f.value.course,
  year: f.value.year, headline: f.value.headline, about: f.value.about,
  tags: f.value.tags.split(",").map((s) => s.trim().slice(0, 24)).filter(Boolean).slice(0, 12),
  links: buildLinks(f.value.links),
  showAge: f.value.showAge,
});
// Your first card (the one My card opens with) as it will look with these edits. A card's own
// "what you do", tags and links still win over the profile's, as they do for anyone who scans it.
const previewCard = computed(() => {
  const c = me.cards[0];
  return c ? cardOf({ name: c.name, note: c.note, theme: c.theme, strapColor: c.strapColor, visibleLinks: c.visibleLinks, headline: c.headlineOverride, about: c.aboutOverride },
    { tags: c.tagsOverride, cardId: c.cardId, code: c.code }) : null;
});
const previewProfile = computed(() => profileOf(payloadOf(), photo.value || existingPhoto.value || null, me.profile?.projects));

async function save() {
  error.value = "";
  saved.value = false;
  if (!f.value.name.trim()) { error.value = "Name is required."; return; }
  busy.value = true;
  try {
    const payload = payloadOf();
    if (photo.value) payload.photoDataUrl = photo.value;
    // F45: the browser's time zone, so finish-your-card emails (F49) keep to sensible hours. Unknown ones are ignored.
    try { payload.tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* not sent */ }

    // This write is what actually persists the edit. Everything after it
    // (refreshing the cached `me`, navigating back) is best-effort: if either
    // of those stumbles, the save itself still happened, so we say so rather
    // than showing an error that makes it look like nothing was kept.
    await Api.updateProfile(payload);

    saved.value = true;
    photo.value = null;
    try {
      await refreshMe();
      setTimeout(() => router.push("/app"), 700);
    } catch {
      error.value = "Saved, but couldn't refresh your card here — it'll show the change next time you open the app.";
    }
  } catch (e) {
    error.value = saveErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="stack-2">
    <PhotoCropper v-if="cropFile" :file="cropFile" @done="onCropped" @cancel="cropFile = null" />
    <h1>Edit profile</h1>
    <CardPreview v-if="previewCard" :profile="previewProfile" :card="previewCard" :url="`${origin}/c/${previewCard.cardId}`" />

    <div class="form-section">
      <span class="form-section-title">Basics</span>

      <div id="photo" class="field">
        <label class="label-top">Photo</label>
        <div class="file-picker">
          <Avatar class="avatar" style="width:64px;height:64px" :src="photo || existingPhoto || null" alt="Your photo" />
          <label for="avatarInput" class="btn">{{ photo || existingPhoto ? "Change photo" : "Choose photo" }}</label>
          <input id="avatarInput" class="visually-hidden" type="file" accept="image/*" @change="pickAvatar" />
        </div>
        <p v-if="photoMsg" class="success-text small" role="status">{{ photoMsg }}</p>
      </div>

      <div class="field"><label for="name">Name</label>
        <input id="name" v-model="f.name" type="text" autocomplete="name" /></div>
      <ModeFields :form="f" />
    </div>

    <div class="form-section">
      <span class="form-section-title">About</span>
      <div class="field"><label for="headline">What you do</label>
        <input id="headline" v-model="f.headline" type="text" maxlength="80"
               placeholder="e.g. Building robots and Roblox games" />
        <span class="small muted" style="align-self:flex-end">{{ f.headline.length }}/80 — this is one line on your badge</span></div>
      <div class="field"><label for="about">About</label>
        <textarea id="about" v-model="f.about" maxlength="600"></textarea></div>
    </div>

    <div class="form-section">
      <span class="form-section-title">Networking</span>
      <p class="small muted" style="margin:0 0 12px">These are your defaults. Each card can say something different under My cards.</p>
      <TagFields :form="f" />

      <div id="links" class="field">
        <label>Links <span class="muted">({{ f.links.filter((l) => l.label.trim() && l.url.trim()).length }} of {{ MAX_LINKS }})</span></label>
        <div v-for="(l, i) in f.links" :key="i" class="link-row">
          <input v-model="l.label" type="text" maxlength="40" placeholder="LinkedIn" :aria-label="`Link ${i + 1} label`" />
          <input v-model="l.url" type="url" inputmode="url" placeholder="linkedin.com/in/you" :aria-label="`Link ${i + 1} address`" />
          <button type="button" class="link-remove" :aria-label="`Remove link ${i + 1}`" @click="removeLink(i)">×</button>
        </div>
        <button type="button" class="btn" :disabled="f.links.length >= MAX_LINKS" @click="addLink">Add a link</button>
        <span class="small muted">Each card picks which of these to show, so add as many as you like.</span>
      </div>
    </div>

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <p v-if="saved" class="success-text" role="status">Saved.</p>

    <!-- Sits above the bottom tab bar (which would otherwise cover it). -->
    <div class="thumb-bar" style="bottom:calc(64px + env(safe-area-inset-bottom, 0px));z-index:70">
      <div class="inner">
        <button class="btn btn-primary" :disabled="busy" @click="save">
          <span :key="busy ? 1 : saved ? 2 : 0" class="swap">{{ busy ? "Saving…" : saved ? "Saved ✓" : "Save changes" }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
