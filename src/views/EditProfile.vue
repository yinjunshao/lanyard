<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Api } from "../lib/api";
import { me, refreshMe } from "../lib/store";
import Avatar from "../components/Avatar.vue";
import PhotoCropper from "../components/PhotoCropper.vue";
import { afterAccountPath } from "../lib/redeem";

const router = useRouter();
const route = useRoute();
const f = ref({
  name: "", mode: "student", company: "", role: "", uni: "", course: "", year: "", headline: "", about: "",
  tags: "", links: [{ label: "", url: "" }], projects: [], showAge: false,
});
const photo = ref(null);
const existingPhoto = ref("");
const busy = ref(false);
const error = ref("");
const saved = ref(false);
const agreed = ref(false);
// First time here: a short "make your card" form. About and links wait
// behind "Add more" so a new person is done in under a minute.
const firstRun = computed(() => !me.profile);
const showMore = ref(false);
const SUGGESTED_STUDENT = ["CV reviews", "internships", "hackathons", "startups", "coding help", "design", "finding a team", "research"];
const SUGGESTED_CAREER = ["Hiring", "Referrals", "Industry advice", "Mentoring", "Side projects"];
const MODES = [["student", "Student"], ["career", "Career"]];
const career = computed(() => f.value.mode === "career");
const SUGGESTED = computed(() => (career.value ? SUGGESTED_CAREER : SUGGESTED_STUDENT));
// Career mode: where you studied is optional and tucked away, unless it is already filled in.
const showStudied = ref(false);
const tagList = computed(() => f.value.tags.split(",").map((t) => t.trim()).filter(Boolean));
function toggleTag(t) {
  const have = tagList.value;
  const i = have.findIndex((x) => x.toLowerCase() === t.toLowerCase());
  f.value.tags = (i >= 0 ? have.filter((_, j) => j !== i) : [...have, t]).join(", ");
}
const hasTag = (t) => tagList.value.some((x) => x.toLowerCase() === t.toLowerCase());

onMounted(() => {
  // Arrived from "Finish your card": put the cursor in the field that's missing.
  if (route.hash) setTimeout(() => {
    const el = document.querySelector(route.hash);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    (el?.matches("input, textarea") ? el : el?.querySelector("input:not([type=file]), textarea"))?.focus({ preventScroll: true });
  }, 250);
  const p = me.profile;
  if (p) {
    const links = Object.entries(p.links || {}).map(([label, url]) => ({ label, url }));
    f.value = {
      name: p.name || "", mode: p.mode === "career" ? "career" : "student",
      company: p.company || "", role: p.role || "", uni: p.uni || "", course: p.course || "",
      year: p.year || "", headline: p.headline || "", about: p.about || "",
      tags: (p.tags || []).join(", "),
      links: links.length ? links : [{ label: "", url: "" }],
      projects: p.projects || [],
      showAge: !!p.show_age,
    };
    existingPhoto.value = p.photo || "";
    showStudied.value = !!p.uni;
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
// Rows to the {label: url} object the API stores. A bare "github.com/you"
// gets https:// put in front of it; rows missing either half are dropped.
function buildLinks(rows) {
  const links = {};
  for (const { label, url } of rows) {
    const l = label.trim().slice(0, 40);
    let u = url.trim();
    if (!l || !u) continue;
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    links[l] = u;
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
      name: f.value.name, mode: f.value.mode, company: f.value.company, role: f.value.role,
      uni: f.value.uni, course: f.value.course,
      year: f.value.year, headline: f.value.headline, about: f.value.about,
      tags: f.value.tags.split(",").map((s) => s.trim().slice(0, 24)).filter(Boolean).slice(0, 12),
      links: buildLinks(f.value.links),
      showAge: f.value.showAge,
    };
    if (photo.value) payload.photoDataUrl = photo.value;

    // This write is what actually persists the edit. Everything after it
    // (refreshing the cached `me`, navigating back) is best-effort: if either
    // of those stumbles, the save itself still happened, so we say so rather
    // than showing an error that makes it look like nothing was kept.
    const wasNew = !me.profile;
    if (me.profile) await Api.updateProfile(payload);
    else await Api.createProfile({ ...payload, over18: true, acceptTerms: true, note: "" });

    saved.value = true;
    photo.value = null;
    try {
      await refreshMe();
      // New card: back to a promo code they arrived with, else the welcome.
      setTimeout(() => router.push(wasNew ? afterAccountPath("/app?welcome=1") : "/app"), wasNew ? 0 : 700);
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
    <div v-if="firstRun" class="page-head">
      <span class="label">New here</span>
      <h1>Make your card</h1>
      <p class="sub">Takes about a minute. People see this when they scan you, and you can change it any time.</p>
    </div>
    <h1 v-else>Edit profile</h1>

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
      <!-- Switching keeps what is typed in the other mode; only the chosen mode shows on the card. -->
      <div class="field">
        <span id="mode-label" class="label-top">I am a</span>
        <div class="seg" role="group" aria-labelledby="mode-label" style="align-self:flex-start">
          <button v-for="m in MODES" :key="m[0]" type="button" class="seg-btn"
                  :class="{ on: f.mode === m[0] }" :aria-pressed="f.mode === m[0]"
                  @click="f.mode = m[0]">{{ m[1] }}</button>
        </div>
      </div>

      <template v-if="!career">
        <div class="field"><label for="uni">University</label>
          <input id="uni" v-model="f.uni" type="text" placeholder="Your university" /></div>
        <div class="field"><label for="course">Course</label>
          <input id="course" v-model="f.course" type="text" placeholder="e.g. Computer Science" /></div>
        <div class="field"><label for="year">Year (optional)</label>
          <input id="year" v-model="f.year" type="text" /></div>
      </template>
      <template v-else>
        <div class="field"><label for="company">Company</label>
          <input id="company" v-model="f.company" type="text" maxlength="80" placeholder="Where you work" /></div>
        <div class="field"><label for="role">Role</label>
          <input id="role" v-model="f.role" type="text" maxlength="80" placeholder="e.g. Product designer" /></div>
        <button v-if="!showStudied" type="button" class="link-btn small" style="text-align:left" @click="showStudied = true">
          Add where you studied (optional)
        </button>
        <template v-else>
          <div class="field"><label for="uni">Studied at (optional)</label>
            <input id="uni" v-model="f.uni" type="text" placeholder="Your university or school" /></div>
        </template>
      </template>
    </div>

    <div class="form-section">
      <span class="form-section-title">About</span>
      <div class="field"><label for="headline">What you do</label>
        <input id="headline" v-model="f.headline" type="text" maxlength="80"
               placeholder="e.g. Building robots and Roblox games" />
        <span class="small muted" style="align-self:flex-end">{{ f.headline.length }}/80 — this is one line on your badge</span></div>
      <div v-if="!firstRun || showMore" class="field"><label for="about">About</label>
        <textarea id="about" v-model="f.about" maxlength="600"></textarea></div>
    </div>

    <div class="form-section">
      <span class="form-section-title">Networking</span>
      <p v-if="!firstRun" class="small muted" style="margin:0 0 12px">These are your defaults. Each card can say something different under My cards.</p>
      <div class="field"><label for="tags">Come to me for — comma separated</label>
        <input id="tags" v-model="f.tags" type="text" placeholder="hackathons, CV reviews, CAD" />
        <div class="chip-row" role="group" aria-label="Suggestions" style="margin-top:6px">
          <button v-for="t in SUGGESTED" :key="t" type="button" class="chip chip-toggle"
                  :aria-pressed="hasTag(t)" :class="{ on: hasTag(t) }" @click="toggleTag(t)">{{ hasTag(t) ? "✓ " : "+ " }}{{ t }}</button>
        </div>
        <span class="small muted">The first 4 show on your badge — keep each one short, e.g. "CV reviews"</span></div>

      <button v-if="firstRun && !showMore" type="button" class="link-btn small" style="text-align:left" @click="showMore = true">
        Add more: a short bio and links (optional)
      </button>

      <div v-if="!firstRun || showMore" id="links" class="field">
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
          {{ busy ? "Saving…" : saved ? "Saved ✓" : firstRun ? "Create my card" : "Save changes" }}
        </button>
      </div>
    </div>
  </div>
</template>
