<script setup>
import { reactive, ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { Api } from "../lib/api";
import { getToken, me, refreshMe, saveProfile } from "../lib/store";

const router = useRouter();
const saving = ref(false);
const err = ref("");
const tagDraft = ref("");

const blank = {
  name: "",
  uni: "UCL",
  course: "",
  year: "",
  email: "",
  birthday: "",
  tagline: "",
  specialties: [],
  about: "",
  helloNote: "",
  links: { linkedin: "", github: "", portfolio: "", instagram: "" },
};

const form = reactive(blank);

const QUICK_ADD = [
  "CV reviews", "Python", "CAD", "startups", "hackathons", "ML",
  "motorsport", "product design", "film", "photography", "football", "investing",
];

function addSpecialty(s) {
  s = s.trim();
  if (s && !form.specialties.includes(s)) form.specialties.push(s);
}
function removeSpecialty(i) { form.specialties.splice(i, 1); }
function commitTag() {
  addSpecialty(tagDraft.value);
  tagDraft.value = "";
}

const linkKeys = ["linkedin", "github", "portfolio", "instagram"];
const LINK_LABEL = { linkedin: "LinkedIn", github: "GitHub", portfolio: "Portfolio", instagram: "Instagram", x: "X" };
const LINK_PH = { linkedin: "linkedin.com/in/you", github: "github.com/you", portfolio: "yoursite.com", instagram: "@handle" };
const linkLabel = (k) => LINK_LABEL[k] || k;
const linkPlaceholder = (k) => LINK_PH[k] || "https://";

onMounted(async () => {
  if (!me.loaded) await refreshMe();
  if (me.profile) {
    Object.assign(form, {
      ...blank,
      ...JSON.parse(JSON.stringify(me.profile)),
      links: { ...blank.links, ...(me.profile.links || {}) },
    });
  }
});

async function save() {
  err.value = "";
  if (!form.name.trim()) { err.value = "Add your name so the card works."; saving.value = false; return; }
  if (!form.birthday) { err.value = "Your birthday is required — it’s the second half of your login (code + birthday)."; return; }
  saving.value = true;
  try {
    const token = getToken();
    const data = me.id
      ? await Api.updateProfile(me.id, form, token)
      : await Api.createProfile(form, token);
    saveProfile(data.profile);
    me.id = data.profile.id;
    router.push("/qr");
  } catch (e) {
    err.value = e?.message || "Something went wrong — check your connection and try again.";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="page onboard-page">
    <header class="onboard-header">
      <span class="eyebrow">{{ me.id ? "Edit profile" : "30-second setup" }}</span>
      <h1 class="page-title">What should people remember?</h1>
      <p class="muted">Start with your name and what you can actually help with. Everything else is optional.</p>
    </header>

    <form class="card onboard-card" @submit.prevent="save">
      <section class="form-section">
        <div class="section-kicker">01 / Identity</div>
        <label class="field">Name *</label>
        <input v-model="form.name" type="text" placeholder="Full name" />

        <div class="form-grid">
          <div>
            <label class="field">University</label>
            <input v-model="form.uni" type="text" />
          </div>
          <div>
            <label class="field">Course / degree</label>
            <input v-model="form.course" type="text" placeholder="e.g. BSc Computer Science" />
          </div>
          <div>
            <label class="field">Year of study</label>
            <select v-model="form.year">
              <option value="">Select…</option>
              <option>Foundation</option>
              <option>Year 1</option>
              <option>Year 2</option>
              <option>Year 3</option>
              <option>Year 4</option>
              <option>Postgraduate</option>
              <option>PhD</option>
            </select>
          </div>
          <div>
            <label class="field">Email</label>
            <input v-model="form.email" type="email" placeholder="you@ucl.ac.uk" />
          </div>
          <div>
            <label class="field">Birthday * <span class="field-hint">(login key — never shown)</span></label>
            <input v-model="form.birthday" type="date" required />
          </div>
        </div>

        <label class="field">One-line tagline</label>
        <input v-model="form.tagline" type="text" placeholder="Builder, racer, terrible squash player" maxlength="80" />
      </section>

      <section class="form-section">
        <div class="section-kicker">02 / Why save you?</div>
        <label class="field">What can people come to you for?</label>
        <div class="tag-input-row">
          <input v-model="tagDraft" type="text" placeholder="Type a skill, interest or superpower"
            @keydown.enter.prevent="commitTag" />
          <button type="button" class="btn btn-ghost" @click="commitTag">Add</button>
        </div>

        <div v-if="form.specialties.length" class="selected-tags">
          <button v-for="(s,i) in form.specialties" :key="s" type="button" class="chip selected" @click="removeSpecialty(i)">
            {{ s }} <span>×</span>
          </button>
        </div>

        <div class="quick-add">
          <span>Quick add</span>
          <button v-for="s in QUICK_ADD" :key="s" type="button" class="chip" @click="addSpecialty(s)">{{ s }}</button>
        </div>
      </section>

      <section class="form-section">
        <div class="section-kicker">03 / Context</div>
        <label class="field">About you</label>
        <textarea v-model="form.about" placeholder="What are you building, into, or looking for right now?"></textarea>

        <label class="field">Hello note</label>
        <textarea v-model="form.helloNote" maxlength="120" placeholder="“We met at EEE Freshers — ask me about the racing team.”"></textarea>
      </section>

      <section class="form-section">
        <div class="section-kicker">04 / Links</div>
        <div class="form-grid">
          <div v-for="k in linkKeys" :key="k">
            <label class="field">{{ linkLabel(k) }}</label>
            <input v-model="form.links[k]" type="text" :placeholder="linkPlaceholder(k)" />
          </div>
        </div>
      </section>

      <div v-if="err" class="notice" style="background:var(--danger-soft);border-color:#e5c5bf;color:var(--danger)">{{ err }}</div>

      <button class="btn btn-primary btn-block submit-btn" :disabled="!form.name.trim() || saving">
        {{ saving ? "Saving…" : (me.id ? "Save changes" : "Create my QR") }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.onboard-page { max-width: 760px; }
.onboard-header { text-align: center; margin: 0 auto 26px; max-width: 620px; }
.onboard-header p { font-size: 17px; max-width: 620px; }
.onboard-card { padding: 0; overflow: hidden; }
.form-section { padding: 26px; border-bottom: 1px solid var(--line); }
.form-section:last-of-type { border-bottom: 0; }
.section-kicker { text-transform:uppercase; letter-spacing:.13em; font-size:11px; font-weight:800; color:var(--muted); margin-bottom:14px; }
.field-hint { text-transform:none; letter-spacing:0; font-weight:500; color:var(--muted); font-size:11px; }
.form-grid { display:grid; grid-template-columns:1fr 1fr; gap:0 14px; }
.tag-input-row { display:grid; grid-template-columns:1fr auto; gap:10px; }
.selected-tags { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
.selected-tags .selected { padding:8px 11px; cursor:pointer; background:var(--ink); color:var(--paper); border-color:var(--ink); }
.selected-tags .selected span { opacity:.65; margin-left:4px; }
.quick-add { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:16px; padding-top:14px; border-top:1px dashed var(--line); }
.quick-add > span { font-size:12px; color:var(--muted); font-weight:800; text-transform:uppercase; letter-spacing:.1em; }
.quick-add .chip { cursor:pointer; }
.submit-btn { margin: 24px 26px 26px; width: calc(100% - 52px); }
@media (max-width: 620px) { .form-grid { grid-template-columns:1fr; } .tag-input-row { grid-template-columns:1fr; } }
</style>
