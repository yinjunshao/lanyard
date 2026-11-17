<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../lib/api"; // the card calls are written here, not in Api: that object is in every public page (F39)
import { me, refreshMe } from "../lib/store";
import CardForm from "../components/CardForm.vue";
import CardPreview from "../components/CardPreview.vue";
import CardCode from "../components/CardCode.vue";
import { cardOf, profileOf } from "../lib/cardpreview";
import { useBusy } from "../components/Waiting.vue";

const blank = () => ({ name: "", theme: "default", note: "", headline: "", about: "", tagsText: "", visibleLinks: [], strapColor: "" });
const creating = ref(false);
const form = ref(blank());
const editingId = ref(null);
const editForm = ref(blank());
const busy = ref(false);
const error = ref("");
const atLimit = computed(() => me.cards.length >= me.plan.cards);

const tagList = (text) => text.split(",").map((s) => s.trim().slice(0, 24)).filter(Boolean).slice(0, 30);

// The live preview (F18): your saved profile with the card as the form has it. A new card is not saved,
// so its QR is a placeholder that opens nothing, and a colour is only saved when you edit a card.
const origin = location.origin;
const previewProfile = computed(() => (me.profile ? profileOf(me.profile, me.profile.photo, me.profile.projects) : null));
const newPreview = computed(() => cardOf(form.value, { tags: tagList(form.value.tagsText), creating: true }));
const editPreview = computed(() => {
  const saved = me.cards.find((x) => x.cardId === editingId.value);
  return cardOf(editForm.value, { tags: tagList(editForm.value.tagsText), cardId: editingId.value, code: saved?.code });
});
// One preview at a time: it sits beside the page on a wide screen.
function toggleCreating() { creating.value = !creating.value; if (creating.value) editingId.value = null; }

onMounted(refreshMe);

// "Change in My cards" on My card lands here as ?edit=<card>&section=code: that card's editor,
// scrolled to its code. It is in the address, so a refresh and the Back button work.
const route = useRoute();
const router = useRouter();
function openFromAddress() {
  const id = route.query.edit;
  if (typeof id !== "string" || editingId.value === id) return;
  const c = me.cards.find((x) => x.cardId === id);
  if (!c) return;
  startEdit(c);
  if (route.query.section === "code") nextTick(() => requestAnimationFrame(() => document.getElementById(`card-code-${id}`)?.scrollIntoView({ block: "start" })));
}
watch(() => [route.query.edit, me.cards.length], openFromAddress, { immediate: true });
function closeEdit() {
  editingId.value = null;
  if (route.query.edit) router.replace({ path: "/app/cards" });
}

async function createCard() {
  error.value = "";
  if (!form.value.name.trim()) return;
  busy.value = true;
  try {
    const { tagsText, strapColor, ...rest } = form.value;
    await api("/api/cards", "POST", { ...rest, tags: tagList(tagsText) });
    creating.value = false;
    form.value = blank();
    await refreshMe();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

function startEdit(card) {
  creating.value = false;
  editingId.value = card.cardId;
  editForm.value = {
    name: card.name,
    note: card.note || "",
    theme: card.theme,
    headline: card.headlineOverride || "",
    about: card.aboutOverride || "",
    tagsText: (card.tagsOverride || []).join(", "),
    visibleLinks: [...(card.visibleLinks || [])],
    strapColor: card.strapColor || "",
  };
}

const { working, once } = useBusy();
const saveEdit = once(async () => {
  const { strapColor, tagsText, ...rest } = editForm.value;
  // Custom colours are a Plus feature; free accounts never send the field.
  const body = { ...rest, tags: tagList(tagsText) };
  if (me.plan.customStrap) body.strap_color = strapColor || "";
  try {
    await api(`/api/cards/${editingId.value}`, "PUT", body);
    closeEdit();
    error.value = "";
    await refreshMe();
  } catch (e) {
    error.value = e.message;
  }
});

async function remove(card) {
  if (busy.value || !confirm(`Delete the "${card.name}" card?`)) return;
  busy.value = true;
  try { await api(`/api/cards/${card.cardId}`, "DELETE"); await refreshMe(); }
  finally { busy.value = false; }
}
</script>

<template>
  <div class="stack-2">
    <div class="spread">
      <div>
        <h1>My cards</h1>
        <p class="small muted" style="margin:2px 0 0">{{ me.cards.length }} of {{ me.plan.cards }} cards · {{ me.plan.label }}</p>
      </div>
      <button class="btn" style="width:auto" :disabled="atLimit" @click="toggleCreating">New card</button>
    </div>

    <div v-if="atLimit" class="notice small">
      <template v-if="me.plan.tier === 'free'">
        You've used all {{ me.plan.cards }} cards on the free plan.
        <router-link to="/app/settings/plan" style="text-decoration:underline">See Lanyard Plus</router-link>
        for more cards and custom colours.
      </template>
      <template v-else>You've used all {{ me.plan.cards }} cards on your plan.</template>
    </div>
    <p v-if="error && !creating && !editingId" class="error-text">{{ error }}</p>

    <div v-if="creating" class="list stack" style="padding:16px">
      <CardPreview v-if="previewProfile" :profile="previewProfile" :card="newPreview" :url="`${origin}/c/preview-only`" />
      <CardForm v-model="form" />
      <p v-if="error" class="error-text">{{ error }}</p>
      <button class="btn btn-primary" :disabled="busy" @click="createCard">{{ busy ? "Creating…" : "Create card" }}</button>
    </div>

    <div class="list">
      <div v-for="c in me.cards" :key="c.cardId" class="list-row" style="flex-direction:column;align-items:stretch;gap:8px">
        <template v-if="editingId === c.cardId">
          <CardPreview v-if="previewProfile" :profile="previewProfile" :card="editPreview" :url="`${origin}/c/${c.cardId}`" />
          <CardForm v-model="editForm" show-strap />
          <CardCode :card="c" />
          <p v-if="error" class="error-text">{{ error }}</p>
          <div class="btn-row">
            <button class="btn btn-primary" :disabled="!!working" @click="saveEdit">{{ working === saveEdit ? "Saving…" : "Save" }}</button>
            <button class="btn" @click="closeEdit">Cancel</button>
          </div>
        </template>
        <template v-else>
          <div class="spread">
            <strong>{{ c.name }}</strong>
            <span class="label tnum">{{ c.code }}</span>
          </div>
          <p v-if="c.note" class="small muted">{{ c.note }}</p>
          <div class="btn-row">
            <router-link class="btn" :to="`/c/${c.cardId}`" target="_blank">View</router-link>
            <button class="btn" @click="startEdit(c)">Edit</button>
            <button class="btn" :disabled="busy || (c.theme === 'default' && me.cards.length === 1)"
                    style="color:var(--strap-deep)" @click="remove(c)">Delete</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
