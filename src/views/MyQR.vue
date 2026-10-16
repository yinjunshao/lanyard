<script setup>
import { ref, onMounted, watch, nextTick, computed } from "vue";
import { useRouter } from "vue-router";
import { Api, passUrl } from "../lib/api";
import { getToken, me, refreshMe, saveProfile } from "../lib/store";
import { drawPass, downloadPass } from "../lib/qr";

const router = useRouter();
const passCanvas = ref(null);
// The note shown on THIS pass/QR. It's per-moment: typing regenerates the QR
// immediately so each person you show can get a different note, without
// overwriting your saved default.
const qrNote = ref("");
const savedDefault = ref("");
const isDefault = ref(true);
const savingDefault = ref(false);
const savedPill = ref(false);

const noteTouched = computed(() => qrNote.value.trim() !== savedDefault.value.trim());

function profileUrl() {
  return new URL(passUrl(me.id, qrNote.value || ""), window.location.origin).href;
}

async function render() {
  if (!me.id || !passCanvas.value) return;
  await drawPass(passCanvas.value, { ...(me.profile || {}), helloNote: qrNote.value }, profileUrl(), 2);
}

onMounted(async () => {
  if (!me.loaded) await refreshMe();
  if (me.id) {
    qrNote.value = me.profile?.helloNote || "";
    savedDefault.value = me.profile?.helloNote || "";
    await nextTick();
    render();
  }
});

watch(() => me.id, async () => { await nextTick(); render(); });
// Live-regenerate the pass + QR as the per-moment note changes.
watch(qrNote, () => { isDefault.value = !noteTouched.value; render(); });
watch(() => me.profile, render, { deep: true });

async function saveDefault() {
  savingDefault.value = true;
  const data = await Api.updateProfile(me.id, { helloNote: qrNote.value }, getToken());
  saveProfile(data.profile);
  savedDefault.value = data.profile.helloNote || "";
  isDefault.value = true;
  savedPill.value = true;
  setTimeout(() => (savedPill.value = false), 2200);
  savingDefault.value = false;
}

function resetNote() {
  qrNote.value = savedDefault.value;
}
</script>

<template>
  <div class="container qr-page">
    <div v-if="!me.id" class="card center" style="padding:44px">
      <h1 class="page-title">Your lanyard is blank.</h1>
      <p class="muted">Make your profile first, then you’ll get a QR worth showing.</p>
      <button class="btn btn-primary" @click="router.push('/onboard')">Make my Lanyard</button>
    </div>

    <template v-else>
      <div class="qr-layout">
        <section class="pass-stage">
          <div class="pass-frame">
            <canvas ref="passCanvas" aria-label="Your Lanyard personal QR pass"></canvas>
          </div>
          <div class="pass-actions">
            <button class="btn btn-primary" @click="downloadPass({ ...(me.profile || {}), helloNote: qrNote.value }, profileUrl())">Download card PNG</button>
            <router-link class="btn btn-ghost" :to="`/p/${me.id}`">Preview public page</router-link>
          </div>
        </section>

        <section class="card note-editor">
          <div class="card-label">Note on this QR</div>
          <h2 class="section-title">Say where you met.</h2>
          <p class="muted">
            This note is baked into the QR on the left — change it for each person or event,
            and the code regenerates. It isn’t your public profile unless you set it as default.
          </p>
          <textarea
            v-model="qrNote"
            maxlength="120"
            placeholder="“We met at the UCL Claude Builders Hackathon — ask me about the QR swap.”"
          ></textarea>
          <div class="note-state">
            <span v-if="noteTouched" class="chip accent">● Live — only this QR carries this note</span>
            <span v-else class="chip">Showing your saved default</span>
          </div>
          <div class="note-footer">
            <span class="small muted">{{ qrNote.length }}/120</span>
            <div class="note-buttons">
              <button v-if="noteTouched" class="btn btn-ghost" @click="resetNote">Reset</button>
              <button class="btn btn-primary" :disabled="savingDefault || isDefault" @click="saveDefault">
                {{ savingDefault ? "Saving…" : "Set as my default" }}
              </button>
            </div>
          </div>
          <span v-if="savedPill" class="small" style="color:var(--green)">Default updated ✓</span>
          <router-link class="edit-link" to="/onboard">Edit name, course, links & more →</router-link>

          <p class="pass-hint small muted">
            Download it for your wallpaper, or hold it up to scan. Add a note for the
            person in front of you — the QR updates instantly and only they see that note.
          </p>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.qr-page { max-width: 1000px; padding-top: 8px; }
.qr-layout { display:grid; grid-template-columns: 440px 1fr; gap:26px; align-items:start; justify-content:center; }
.pass-stage { display:grid; gap:14px; justify-items:center; }
.pass-frame { width:100%; max-width:420px; background:var(--paper-2); border:1px solid var(--line); border-radius:20px; padding:18px; box-shadow: 10px 10px 0 rgba(14,17,16,.92); }
.pass-frame canvas { width:100%; height:auto; display:block; border-radius:14px; }
.pass-actions { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
.note-editor textarea { min-height:110px; font-size:16px; margin-top:8px; }
.note-state { margin-top:12px; }
.note-footer { display:flex; justify-content:space-between; gap:12px; align-items:center; margin-top:14px; }
.note-buttons { display:flex; gap:10px; align-items:center; }
.card-label { text-transform:uppercase; letter-spacing:.13em; font-size:11px; font-weight:800; color:var(--accent-dark); margin-bottom:8px; }
.edit-link { display:inline-block; margin-top:18px; font-weight:700; font-size:14px; color:var(--accent-dark); }
.pass-hint { margin: 18px 0 0; padding-top: 14px; border-top: 1px solid var(--line); line-height: 1.45; }
@media (max-width: 820px) {
  .qr-page { padding-top: 4px; }
  .qr-layout { grid-template-columns:1fr; gap:20px; }
  .pass-stage { order: 1; }
  .note-editor { order: 2; }
  .pass-frame { margin:0 auto; max-width:340px; box-shadow: 6px 6px 0 rgba(14,17,16,.92); }
  .note-footer { flex-wrap: wrap; }
}
</style>
