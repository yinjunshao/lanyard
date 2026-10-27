<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { Api } from "../lib/api";
import { me, refreshMe } from "../lib/store";
import Avatar from "../components/Avatar.vue";
import PhotoCropper from "../components/PhotoCropper.vue";

const router = useRouter();
const f = ref({
  name: "", uni: "", course: "", year: "", headline: "", about: "",
  tags: "", linksText: "", projects: [], showAge: false, isPublic: true,
});
const photo = ref(null);
const existingPhoto = ref("");
const busy = ref(false);
const error = ref("");
const saved = ref(false);
const agreed = ref(false);

onMounted(() => {
  const p = me.profile;
  if (p) {
    f.value = {
      name: p.name || "", uni: p.uni || "", course: p.course || "",
      year: p.year || "", headline: p.headline || "", about: p.about || "",
      tags: (p.tags || []).join(", "),
      linksText: Object.entries(p.links || {}).map(([k, v]) => `${k} ${v}`).join("\n"),
      projects: p.projects || [],
      showAge: !!p.show_age, isPublic: !!p.is_public,
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

function parseLinks(text) {
  const links = {};
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^(\S.+?)\s+(https?:\/\/\S+)$/);
    if (m) links[m[1]] = m[2];
  }
  return links;
}

// A friendlier message for the failures someone actually hits here, instead
// of the raw "Request failed (###)" the generic fetch wrapper throws.
function saveErrorMessage(e) {
  if (e.status === 413) return "That photo is too large even after compressing. Try a smaller or simpler image.";
  if (e.status === 401) return "Your session has expired. Reload the page and try again.";
  if (e.status >= 500) return "The server hit a problem saving this (not your edits — try again in a moment).";
  return e.message;
}

async function save() {
  error.value = "";
  saved.value = false;
  if (!f.value.name.trim()) { error.value = "Name is required."; return; }
  if (!me.profile && !agreed.value) { error.value = "Please confirm you're 18 or over and agree to the Terms and Privacy Policy."; return; }
  busy.value = true;
  try {
    const payload = {
      name: f.value.name, uni: f.value.uni, course: f.value.course,
      year: f.value.year, headline: f.value.headline, about: f.value.about,
      tags: f.value.tags.split(",").map((s) => s.trim().slice(0, 24)).filter(Boolean).slice(0, 5),
      links: parseLinks(f.value.linksText),
      showAge: f.value.showAge, isPublic: f.value.isPublic,
    };
    if (photo.value) payload.photoDataUrl = photo.value;

    // This write is what actually persists the edit. Everything after it
    // (refreshing the cached `me`, navigating back) is best-effort: if either
    // of those stumbles, the save itself still happened, so we say so rather
    // than showing an error that makes it look like nothing was kept.
    if (me.profile) await Api.updateProfile(payload);
    else await Api.createProfile({ ...payload, over18: true, acceptTerms: true, note: "" });

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

    <div class="form-section">
      <span class="form-section-title">Basics</span>

      <div class="field">
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
      <div class="field"><label for="uni">University</label>
        <input id="uni" v-model="f.uni" type="text" /></div>
      <div class="field"><label for="course">Course</label>
        <input id="course" v-model="f.course" type="text" /></div>
      <div class="field"><label for="year">Year (optional)</label>
        <input id="year" v-model="f.year" type="text" /></div>
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
      <div class="field"><label for="tags">Come to me for — comma separated</label>
        <input id="tags" v-model="f.tags" type="text" placeholder="hackathons, CV reviews, CAD" />
        <span class="small muted">The first 4 show on your badge — keep each one short, e.g. "CV reviews"</span></div>

      <div class="field">
        <label for="links">Links — one per line as “Label https://…”</label>
        <textarea id="links" v-model="f.linksText" :placeholder="'LinkedIn https://linkedin.com/in/you\nGitHub https://github.com/you'"></textarea>
      </div>
    </div>

    <div class="form-section">
      <span class="form-section-title">Visibility</span>
      <label class="checkbox-row field">
        <input type="checkbox" v-model="f.isPublic" />
        <span class="small">Profile page is public</span>
      </label>
    </div>

    <label v-if="!me.profile" class="checkbox-row field">
      <input v-model="agreed" type="checkbox" />
      <span class="small">
        I'm 18 or over, and I agree to the
        <router-link to="/terms" target="_blank">Terms of Service</router-link> and
        <router-link to="/privacy" target="_blank">Privacy Policy</router-link>.
      </span>
    </label>

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <p v-if="saved" class="success-text" role="status">Saved.</p>

    <!-- Sits above the bottom tab bar (which would otherwise cover it). -->
    <div class="thumb-bar" :style="me.profile ? 'bottom:calc(64px + env(safe-area-inset-bottom, 0px));z-index:70' : ''">
      <div class="inner">
        <button class="btn btn-primary" :disabled="busy" @click="save">
          {{ busy ? "Saving…" : saved ? "Saved ✓" : "Save changes" }}
        </button>
      </div>
    </div>
  </div>
</template>
