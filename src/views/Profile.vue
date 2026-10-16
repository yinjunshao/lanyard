<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Api } from "../lib/api";
import { getToken, me, refreshMe, saveProfile } from "../lib/store";
import { pickPhoto } from "../lib/photo";
import { ageFromBirthday } from "../lib/qr";

const route = useRoute();
const router = useRouter();
const id = route.params.id;
const profile = ref(null);
const notFound = ref(false);
const connected = ref(false);
const connecting = ref(false);
const myNote = ref("");
const myMessage = ref("");
const mini = ref({ name: "", course: "" });
const err = ref("");

// Optional selfie attached to the first message.
const attachDataUrl = ref("");
const attachBusy = ref(false);

async function pickAttach() {
  attachBusy.value = true;
  err.value = "";
  try {
    const dataUrl = await pickPhoto(720);
    if (dataUrl) attachDataUrl.value = dataUrl;
  } catch {
    err.value = "Couldn’t open the camera — you can still send the message.";
  } finally {
    attachBusy.value = false;
  }
}

// Post-connect together-photo flow
const justConnected = ref(false);
const peerIdForPhoto = ref(null);
const previewUrl = ref("");
const uploading = ref(false);
const photoDone = ref(false);

// The QR carries the owner's hello note: /p/:id?n=...
const noteFromQr = computed(() => {
  const n = route.query.n;
  return Array.isArray(n) ? n[0] : n;
});

const owner = computed(() => profile.value?.id === me.id);
const linkLabel = { linkedin: "LinkedIn", github: "GitHub", portfolio: "Portfolio", instagram: "Instagram", x: "X", other: "Link" };
const linkEntries = computed(() =>
  Object.entries(profile.value?.links || {}).filter(([, v]) => v && v.trim())
);
const age = computed(() =>
  profile.value?.age != null ? profile.value.age : ageFromBirthday(profile.value?.birthday)
);
const metaLine = computed(() =>
  [profile.value?.course, age.value != null ? `Age ${age.value}` : null, profile.value?.year]
    .filter(Boolean).join(" · ")
);

onMounted(async () => {
  if (!me.loaded) { try { await refreshMe(); } catch {} }
  const data = await Api.getProfile(id);
  if (data.profile) profile.value = data.profile;
  else notFound.value = true;

  if (me.id) {
    const c = await Api.connections(me.id);
    connected.value = (c.connections || []).some((x) => x.peerId === id);
  }
  if (noteFromQr.value) myNote.value = noteFromQr.value;
});

async function connect() {
  connecting.value = true;
  err.value = "";
  try {
    const token = getToken();
    const payload = { peerId: id, myNote: myNote.value, token, message: myMessage.value };
    if (me.id) payload.myId = me.id;
    else {
      if (!mini.value.name.trim()) throw new Error("name");
      payload.name = mini.value.name;
      payload.course = mini.value.course;
    }

    // Upload the optional selfie first so it can ride in the first message.
    if (attachDataUrl.value) {
      const { photoId } = await Api.uploadPhoto(attachDataUrl.value);
      payload.photoId = photoId;
    }
    previewUrl.value = attachDataUrl.value;

    const data = await Api.connect(payload, token);
    connected.value = true;
    if (!me.id && data.myId) {
      const detail = await Api.getProfile(data.myId);
      saveProfile(detail.profile);
      me.id = data.myId;
    }
    sentPayload.value = payload;
    if (attachDataUrl.value) photoDone.value = true;
    justConnected.value = true;
    peerIdForPhoto.value = id;
  } catch (e) {
    err.value = e.message === "name" ? "Add your name to connect." : (e?.message || "Couldn’t send — try again.");
    connecting.value = false;
  }
}

const sentPayload = ref(null);

async function takePhoto() {
  uploading.value = true;
  err.value = "";
  try {
    const dataUrl = await pickPhoto(720);
    if (!dataUrl) { uploading.value = false; return; }
    previewUrl.value = dataUrl;
    const { photoId } = await Api.uploadPhoto(dataUrl, me.id, peerIdForPhoto.value);
    photoDone.value = true;
  } catch {
    err.value = "Couldn’t save the photo — you can still add it from Network later.";
  } finally {
    uploading.value = false;
  }
}

function finish() {
  router.push({ path: "/connections", query: { just: peerIdForPhoto.value } });
}
</script>

<template>
  <div class="container profile-page">
    <div v-if="notFound" class="card center">
      <h2 class="section-title">Profile not found</h2>
      <p class="muted">This QR may be broken or the profile may have been removed.</p>
    </div>

    <template v-else-if="profile">
      <section v-if="justConnected" class="photo-sheet">
        <div class="photo-sheet-inner card">
          <span class="eyebrow">You’re connected</span>
          <h1 class="page-title">Card sent ✓</h1>
          <p class="muted photo-lede">
            You and {{ profile.name?.split(" ")[0] }} are now in each other’s network.
            {{ photoDone ? "Your message and selfie are shared" : "Your message is shared" }} —
            you can keep the thread going from People.
          </p>

          <div v-if="previewUrl" class="photo-stage">
            <img :src="previewUrl" alt="Together photo" />
          </div>
          <div v-else class="photo-stage">
            <div class="photo-placeholder">
              <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.6">
                <path d="M4 8h3l2-2h6l2 2h3v11H4z" stroke-linejoin="round"/>
                <circle cx="12" cy="13" r="3.4"/>
              </svg>
              <span>No photo this time</span>
            </div>
          </div>

          <div class="photo-actions">
            <button class="btn btn-primary btn-block btn-lg" @click="finish">Open People</button>
          </div>
        </div>
      </section>

      <template v-else>
        <div class="card profile-hero">
          <div class="identity-block">
            <div class="profile-avatar">{{ (profile.name || "?").trim().slice(0, 1).toUpperCase() }}</div>
            <div>
              <div class="eyebrow">Student card</div>
              <h1 class="profile-name">{{ profile.name }}</h1>
              <p class="profile-course">{{ metaLine || "Student" }}</p>
              <p v-if="profile.uni" class="profile-uni">{{ profile.uni }}</p>
            </div>
          </div>

          <div class="profile-action">
            <span v-if="connected" class="chip green">In your network</span>
            <router-link v-if="owner" to="/onboard" class="btn btn-ghost">Edit profile</router-link>
          </div>
        </div>

        <p v-if="profile.tagline" class="profile-tagline">{{ profile.tagline }}</p>

        <main class="profile-grid">
          <section class="card priority-card">
            <div class="card-label">The useful part</div>
            <h2 class="section-title">Come to me for</h2>
            <div v-if="profile.specialties?.length" class="specialty-list">
              <span v-for="s in profile.specialties" :key="s" class="chip specialty-chip">{{ s }}</span>
            </div>
            <p v-else class="muted">They haven’t added specialties yet.</p>

            <blockquote v-if="profile.helloNote" class="hello-quote">“{{ profile.helloNote }}”</blockquote>
          </section>

          <aside class="side-stack">
            <section v-if="linkEntries.length" class="card-plain">
              <div class="card-label">Elsewhere</div>
              <div class="link-list">
                <a v-for="[k, v] in linkEntries" :key="k" :href="v" target="_blank" rel="noopener" class="link-row">
                  <span>{{ linkLabel[k] || k }}</span><span>Open ↗</span>
                </a>
                <a v-if="profile.email" :href="`mailto:${profile.email}`" class="link-row">
                  <span>Email</span><span>Write ↗</span>
                </a>
              </div>
            </section>

            <section v-if="profile.about" class="card-plain">
              <div class="card-label">About</div>
              <p style="margin:0;color:var(--ink-soft)">{{ profile.about }}</p>
            </section>
          </aside>
        </main>

        <section v-if="!connected && !owner" class="card connect-sheet">
          <div>
            <div class="card-label">Send your card</div>
            <h2 class="section-title">Add a note before you connect.</h2>
            <p class="muted" style="margin:6px 0 0">
              Write a quick message so they remember you, and optionally attach a selfie. You’ll both be added to each other’s network and share a thread.
            </p>
          </div>
          <textarea v-model="myMessage" class="connect-message" rows="3"
            placeholder="“Great chatting about the QR swap at the Claude Builders Hackathon!”" maxlength="600"></textarea>
          <input v-model="myNote" type="text" placeholder="Where you met (e.g. UCL hackathon, table 4)" maxlength="80" />

          <button type="button" class="btn btn-ghost attach-btn" :disabled="attachBusy" @click="attachDataUrl ? (attachDataUrl = '') : pickAttach()">
            <template v-if="attachBusy">Opening camera…</template>
            <template v-else-if="attachDataUrl">✓ Photo attached — tap to remove</template>
            <template v-else>📷 Attach a selfie together</template>
          </button>
          <img v-if="attachDataUrl" :src="attachDataUrl" class="attach-preview" alt="Selfie preview" />

          <div v-if="!me.id" class="new-user-box">
            <label class="field">Your name *</label>
            <input v-model="mini.name" type="text" placeholder="So they know who saved them" />
            <label class="field">Course (optional)</label>
            <input v-model="mini.course" type="text" placeholder="e.g. BSc Mathematics" />
          </div>
          <button class="btn btn-primary btn-block" :disabled="connecting || (!me.id && !mini.name.trim())" @click="connect">
            {{ connecting ? "Sending…" : "Send card & connect" }}
          </button>
          <div v-if="err" class="notice" style="background:var(--danger-soft);border-color:#e5c5bf;color:var(--danger)">{{ err }}</div>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.profile-page { max-width: 760px; }
.profile-hero { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; padding:28px; }
.identity-block { display:flex; gap:18px; align-items:center; min-width:0; }
.profile-avatar {
  width:78px; height:78px; border-radius:22px; flex:0 0 auto;
  display:flex; align-items:center; justify-content:center;
  background:var(--ink); color:var(--volt); font-family:var(--font-mono); font-size:34px; font-weight:700;
}
.profile-name { font-family:var(--font-display); font-weight:700; font-size:clamp(40px,6vw,58px); line-height:.95; letter-spacing:-.04em; margin:4px 0 2px; }
.profile-course { margin:0; color:var(--muted); font-size:15px; }
.profile-uni { margin:3px 0 0; color:var(--ink-soft); font-size:13px; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:.05em; }
.profile-action { flex:0 0 auto; }
.profile-tagline { font-size:20px; color:var(--ink-soft); max-width:720px; margin:22px 4px; }
.profile-grid { display:grid; grid-template-columns:1.35fr .85fr; gap:18px; align-items:start; }
.priority-card { min-height:260px; }
.card-label { text-transform:uppercase; letter-spacing:.13em; font-size:11px; font-weight:800; color:var(--accent-dark); margin-bottom:8px; }
.specialty-list { display:flex; gap:8px; flex-wrap:wrap; margin-top:16px; }
.specialty-chip { font-size:14px; padding:8px 12px; }
.hello-quote {
  margin:22px 0 0; padding:16px; border-left:3px solid var(--accent);
  background:rgba(200,242,56,.30); border-radius:0 12px 12px 0;
  font-family:var(--font-display); font-weight:500; font-size:21px; line-height:1.25;
}
.side-stack { display:grid; gap:14px; }
.link-list { display:grid; gap:8px; }
.link-row { display:flex; justify-content:space-between; gap:12px; padding:10px 0; border-bottom:1px solid var(--line); text-transform:capitalize; font-weight:700; font-size:14px; }
.link-row:last-child { border-bottom:0; }
.link-row span:last-child { color:var(--muted); font-weight:600; }
.connect-sheet { margin-top:18px; display:grid; gap:14px; background:var(--surface); }
.connect-message { width:100%; min-height:84px; font-size:16px; resize:vertical; }
.attach-btn { justify-self:start; }
.attach-preview { width:100%; max-height:240px; object-fit:cover; border-radius:14px; border:1px solid var(--line); }
.new-user-box { padding:14px; border:1px dashed var(--line); border-radius:14px; }

/* together-photo sheet */
.photo-sheet { padding-top: 8px; }
.photo-lede { font-size: 16px; margin: 8px 0 20px; }
.photo-stage { margin-bottom: 18px; }
.photo-stage img { width:100%; border-radius:18px; border:1.5px solid var(--line-strong); display:block; aspect-ratio:4/3; object-fit:cover; }
.photo-placeholder {
  aspect-ratio:4/3; border:2px dashed var(--line); border-radius:18px;
  display:flex; flex-direction:column; gap:10px; align-items:center; justify-content:center;
  color:var(--muted); background:var(--paper);
}
.photo-actions { display:grid; gap:10px; }
.saved-pill { justify-self:center; }

@media (max-width: 760px) {
  .profile-hero { flex-direction:column; }
  .identity-block { align-items:flex-start; }
  .profile-grid { grid-template-columns:1fr; }
  .profile-action { width:100%; }
  .profile-action .btn { width:100%; }
}
</style>
