<script setup>
// F75 (D064): /app/profile/suggested. Details someone at Lanyard suggested for this person's card, field by field,
// as they are now and as suggested, each with a tick. Nothing is on the card until they press Accept selected, which
// saves the ticked ones exactly as an Edit profile save would. Decline all deletes the suggestion.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../lib/api";
import { refreshMe } from "../lib/store";
import Avatar from "../components/Avatar.vue";
import Waiting from "../components/Waiting.vue";
document.title = "Suggested details | Lanyard";

const router = useRouter();
const state = ref("loading"); // loading | none | show | done
const data = ref(null);
const picked = ref({});
const error = ref("");
const busy = ref(false);
const photo = ref(null);
const doneText = ref("");

const show = (key, v) => {
  if (v == null || v === "") return "";
  if (key === "mode") return v === "career" ? "Career" : "Student";
  if (key === "tags") return (v || []).join(", ");
  if (key === "links") return Object.entries(v || {}).map(([l, u]) => `${l}: ${u}`).join("\n");
  return String(v);
};
const count = computed(() => Object.values(picked.value).filter(Boolean).length);

async function load() {
  try {
    data.value = await api("/api/profile/suggested");
    picked.value = Object.fromEntries(data.value.fields.map((f) => [f.key, true]));
    state.value = "show";
    if (data.value.fields.some((f) => f.key === "photo")) {
      const res = await fetch("/api/profile/suggested/photo", { credentials: "same-origin" }).catch(() => null);
      if (res?.ok) photo.value = URL.createObjectURL(await res.blob());
    }
  } catch (e) {
    if (e.status === 404) state.value = "none";
    else if (e.status === 401) router.replace("/signin");
    else { state.value = "none"; error.value = e.message; }
  }
}
onMounted(load);
onBeforeUnmount(() => { if (photo.value) URL.revokeObjectURL(photo.value); });

async function run(fn) {
  if (busy.value) return;
  error.value = ""; busy.value = true;
  try { await fn(); } catch (e) {
    error.value = e.message;
    if (e.status === 409 || e.status === 404) { state.value = "loading"; await load(); }
  } finally { busy.value = false; }
}
const accept = () => run(async () => {
  const fields = Object.keys(picked.value).filter((k) => picked.value[k]);
  if (!fields.length) { error.value = "Tick at least one detail to accept, or press Decline all."; return; }
  await api("/api/profile/suggested/accept", "POST", { id: data.value.id, fields });
  await refreshMe().catch(() => {});
  doneText.value = fields.length === 1 ? "Saved. That detail is on your card now." : `Saved. Those ${fields.length} details are on your card now.`;
  state.value = "done";
});
const decline = () => run(async () => {
  if (!window.confirm("Decline all of these details? They are deleted and nothing on your card changes.")) return;
  await api("/api/profile/suggested/decline", "POST", { id: data.value.id });
  doneText.value = "Declined. Nothing on your card changed, and the suggestion is deleted.";
  state.value = "done";
});
const day = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
</script>

<template>
  <div class="stack-3" style="max-width:640px">
    <div class="page-head">
      <h1>Suggested details</h1>
      <p v-if="state === 'show'" class="sub">Someone at Lanyard filled these in for your card, from {{ data.source }}. Nothing shows on your card until you accept it.</p>
    </div>
    <Waiting v-if="state === 'loading'" shape="panel" :rows="2" label="Loading the suggested details" />

    <template v-else-if="state === 'none'">
      <p class="muted">There are no suggested details waiting for you.</p>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <router-link to="/app" class="btn">Back to My card</router-link>
    </template>

    <template v-else-if="state === 'done'">
      <p role="status">{{ doneText }}</p>
      <div class="btn-row">
        <router-link to="/app" class="btn btn-primary">Back to My card</router-link>
        <router-link to="/app/profile" class="btn">Edit profile</router-link>
      </div>
    </template>

    <template v-else>
      <p class="small muted" style="margin:0">Untick anything you don't want. If you do nothing, they are deleted on {{ day(data.expiresAt) }}.</p>
      <fieldset class="stack-2 sg-list">
        <legend class="visually-hidden">Details to accept</legend>
        <label v-for="f in data.fields" :key="f.key" class="panel checkbox-row sg-row">
          <input v-model="picked[f.key]" type="checkbox" :aria-label="`Accept ${f.label}`" />
          <span class="sg-body">
            <strong>{{ f.label }}</strong>
            <template v-if="f.key === 'photo'">
              <span class="sg-photos">
                <span class="sg-col"><span class="small muted">Now</span><Avatar class="avatar" style="width:56px;height:56px" :src="data.photoNow" alt="Your photo now" /></span>
                <span class="sg-col"><span class="small muted">Suggested</span><Avatar class="avatar" style="width:56px;height:56px" :src="photo" alt="The suggested photo" /></span>
              </span>
            </template>
            <template v-else>
              <span class="sg-col"><span class="small muted">Now</span><span class="sg-val">{{ show(f.key, f.now) || "Empty" }}</span></span>
              <span class="sg-col"><span class="small muted">Suggested</span><span class="sg-val">{{ show(f.key, f.suggested) }}</span></span>
            </template>
          </span>
        </label>
      </fieldset>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <div class="stack">
        <button type="button" class="btn btn-primary" :disabled="busy || !count" @click="accept">{{ busy ? "Saving…" : `Accept selected (${count})` }}</button>
        <button type="button" class="btn" :disabled="busy" @click="decline">Decline all</button>
      </div>
      <p class="small muted">You can change anything later on Edit profile. See <router-link to="/privacy#made-for-you" style="text-decoration:underline">If we made a card for you</router-link> in the Privacy Policy.</p>
    </template>
  </div>
</template>

<style scoped>
.sg-list { border: 0; margin: 0; padding: 0; min-width: 0; }
.sg-row { align-items: flex-start; }
.sg-body { display: grid; gap: 8px; min-width: 0; flex: 1; }
.sg-col { display: grid; gap: 2px; min-width: 0; }
.sg-val { white-space: pre-line; overflow-wrap: anywhere; }
.sg-photos { display: flex; gap: 24px; }
</style>
