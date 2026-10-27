<script setup>
import { computed, onMounted, ref } from "vue";
import { Api } from "../lib/api";
import { me, refreshMe } from "../lib/store";

const creating = ref(false);
const form = ref({ name: "", theme: "default", note: "", tagsText: "", visibleLinks: [] });
const editingId = ref(null);
const editForm = ref({ name: "", note: "", theme: "default", visibleLinks: [], strapColor: "" });
const busy = ref(false);
const error = ref("");
const atLimit = computed(() => me.cards.length >= me.plan.cards);

const THEMES = [
  { value: "default", label: "Default" },
  { value: "formal", label: "Formal" },
  { value: "night", label: "Night" },
];

// Every link label on the profile, so a card can show a subset of them
// (a careers-fair card shows LinkedIn + portfolio, a social one shows
// Instagram). Empty selection = show every profile link, same as the API.
const profileLinkLabels = computed(() => Object.keys(me.profile?.links || {}));

function toggleLink(f, label) {
  const i = f.visibleLinks.indexOf(label);
  if (i === -1) f.visibleLinks.push(label);
  else f.visibleLinks.splice(i, 1);
}

onMounted(refreshMe);

async function createCard() {
  error.value = "";
  if (!form.value.name.trim()) return;
  busy.value = true;
  try {
    await Api.createCard({
      name: form.value.name,
      theme: form.value.theme,
      note: form.value.note,
      tags: form.value.tagsText.split(",").map((s) => s.trim().slice(0, 24)).filter(Boolean).slice(0, 5),
      visibleLinks: form.value.visibleLinks,
    });
    creating.value = false;
    form.value = { name: "", theme: "default", note: "", tagsText: "", visibleLinks: [] };
    await refreshMe();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

function startEdit(card) {
  editingId.value = card.cardId;
  editForm.value = {
    name: card.name,
    note: card.note || "",
    theme: card.theme,
    visibleLinks: [...(card.visibleLinks || [])],
    strapColor: card.strapColor || "",
  };
}

async function saveEdit() {
  const { strapColor, ...rest } = editForm.value;
  // Custom colours are a Plus feature; free accounts never send the field.
  const body = me.plan.customStrap ? { ...rest, strap_color: strapColor || "" } : rest;
  try {
    await Api.updateCard(editingId.value, body);
    editingId.value = null;
    error.value = "";
    await refreshMe();
  } catch (e) {
    error.value = e.message;
  }
}

async function remove(card) {
  if (!confirm(`Delete the "${card.name}" card?`)) return;
  await Api.deleteCard(card.cardId);
  await refreshMe();
}
</script>

<template>
  <div class="stack-2">
    <div class="spread">
      <div>
        <h1>My cards</h1>
        <p class="small muted" style="margin:2px 0 0">{{ me.cards.length }} of {{ me.plan.cards }} cards · {{ me.plan.label }}</p>
      </div>
      <button class="btn" style="width:auto" :disabled="atLimit" @click="creating = !creating">New card</button>
    </div>

    <div v-if="atLimit" class="notice small">
      <template v-if="me.plan.tier === 'free'">
        You've used all {{ me.plan.cards }} cards on the free plan.
        <router-link to="/app/settings#plus" style="text-decoration:underline">See Lanyard Plus</router-link>
        for more cards and custom colours.
      </template>
      <template v-else>You've used all {{ me.plan.cards }} cards on your plan.</template>
    </div>
    <p v-if="error && !creating && !editingId" class="error-text">{{ error }}</p>

    <div v-if="creating" class="list stack" style="padding:16px">
      <div class="field"><label>Card name</label>
        <input v-model="form.name" type="text" maxlength="24" placeholder="Careers fair" /></div>
      <div class="field"><label>Theme</label>
        <div class="select-wrap">
          <select v-model="form.theme">
            <option v-for="t in THEMES" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
        </div>
      </div>
      <div class="field"><label>Note on the card</label>
        <textarea v-model="form.note" maxlength="300"></textarea></div>
      <div class="field"><label>Tags for this card (comma separated)</label>
        <input v-model="form.tagsText" type="text" /></div>
      <div v-if="profileLinkLabels.length" class="field">
        <label>Links shown on this card</label>
        <div class="chip-row">
          <button
            v-for="label in profileLinkLabels"
            :key="label"
            type="button"
            class="chip chip-toggle"
            :class="{ on: form.visibleLinks.includes(label) }"
            @click="toggleLink(form, label)"
          >{{ label }}</button>
        </div>
        <p class="small muted" style="margin-top:6px">Leave none selected to show every link from your profile.</p>
      </div>
      <p v-if="error" class="error-text">{{ error }}</p>
      <button class="btn btn-primary" :disabled="busy" @click="createCard">Create card</button>
    </div>

    <div class="list">
      <div v-for="c in me.cards" :key="c.cardId" class="list-row" style="flex-direction:column;align-items:stretch;gap:8px">
        <template v-if="editingId === c.cardId">
          <input v-model="editForm.name" type="text" maxlength="24" aria-label="Card name" />
          <textarea v-model="editForm.note" aria-label="Note"></textarea>
          <div class="select-wrap">
            <select v-model="editForm.theme" aria-label="Theme">
              <option v-for="t in THEMES" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
          </div>
          <div v-if="profileLinkLabels.length" class="chip-row">
            <button
              v-for="label in profileLinkLabels"
              :key="label"
              type="button"
              class="chip chip-toggle"
              :class="{ on: editForm.visibleLinks.includes(label) }"
              @click="toggleLink(editForm, label)"
            >{{ label }}</button>
          </div>
          <div class="field">
            <label>Strap colour</label>
            <div v-if="me.plan.customStrap" class="row">
              <input type="color" v-model="editForm.strapColor" aria-label="Strap colour"
                     style="width:56px;height:44px;padding:2px;flex:none" />
              <span class="small muted" style="flex:1">{{ editForm.strapColor || "Using the theme colour" }}</span>
              <button class="btn" style="width:auto;flex:none" type="button" @click="editForm.strapColor = ''">Reset</button>
            </div>
            <p v-else class="small muted" style="margin:0">
              Custom colours are part of Lanyard Plus.
              <router-link to="/app/settings#plus" style="text-decoration:underline">See Plus</router-link>
            </p>
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" @click="saveEdit">Save</button>
            <button class="btn" @click="editingId = null">Cancel</button>
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
            <button class="btn" :disabled="c.theme === 'default' && me.cards.length === 1"
                    style="color:var(--strap-deep)" @click="remove(c)">Delete</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
