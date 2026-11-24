<script setup>
// One form for creating and editing a card. Every card can carry its own
// "what you do", "about", "come to me for" and links; anything left empty
// falls back to the profile's.
import { computed } from "vue";
import { me } from "../lib/store";
import UiSelect from "./ui/UiSelect.vue";
import RotatingHint from "./ui/RotatingHint.vue";
import { headlineExamples } from "../lib/examples";
import UiTagInput from "./ui/UiTagInput.vue";
import { CARD_TAGS, joinTags, parseTags } from "../lib/tags";
import { nextUid } from "./ui/uid";

const f = defineModel({ type: Object, required: true });
defineProps({ showStrap: { type: Boolean, default: false } });

const THEMES = [
  { value: "default", label: "Default" },
  { value: "formal", label: "Formal" },
  { value: "night", label: "Night" },
];

// This card's own tags: boxes in the form, the same text in `f.tagsText` that Cards.vue turns into the list it sends.
const tagsId = nextUid();
const cardTags = computed({ get: () => parseTags(f.value.tagsText), set: (v) => { f.value.tagsText = joinTags(v); } });

const labels = computed(() => Object.keys(me.profile?.links || {}));
const shown = computed(() => (f.value.visibleLinks.length ? f.value.visibleLinks.length : labels.value.length));

function toggle(label) {
  const i = f.value.visibleLinks.indexOf(label);
  if (i === -1) f.value.visibleLinks.push(label);
  else f.value.visibleLinks.splice(i, 1);
}
</script>

<template>
  <div class="stack-2">
    <div class="field"><label>Card name</label>
      <input v-model="f.name" type="text" maxlength="24" placeholder="Careers fair" /></div>
    <div class="field"><label>Theme</label>
      <UiSelect v-model="f.theme" label="Theme" :options="THEMES" />
    </div>

    <div class="form-section">
      <span class="form-section-title">What this card says</span>
      <p class="small muted" style="margin:0 0 12px">Leave a box empty to use what's on your profile.</p>
      <div class="field"><label>What you do</label>
        <RotatingHint :pool="headlineExamples(me.profile?.mode)" :empty="!f.headline" :off="!!me.profile?.headline" v-slot="{ placeholder }">
          <input v-model="f.headline" type="text" maxlength="80" :placeholder="me.profile?.headline || placeholder" />
        </RotatingHint></div>
      <div class="field"><label :for="tagsId">Come to me for</label>
        <UiTagInput :id="tagsId" v-model="cardTags" :max="CARD_TAGS.max" :max-length="CARD_TAGS.maxLength" />
        <span v-if="!cardTags.length && me.profile?.tags?.length" class="small muted">Empty: your profile's tags show instead ({{ me.profile.tags.join(", ") }}).</span>
        <span class="small muted">Press Enter after each one. The first 4 show on the badge. All of them show on the full card.</span></div>
      <div class="field"><label>About</label>
        <textarea v-model="f.about" maxlength="600" :placeholder="me.profile?.about || ''"></textarea></div>
    </div>

    <div class="field">
      <label>Links on this card</label>
      <template v-if="labels.length">
        <div class="chip-row">
          <button v-for="label in labels" :key="label" type="button" class="chip chip-toggle"
                  :class="{ on: f.visibleLinks.includes(label) }" :aria-pressed="f.visibleLinks.includes(label)"
                  @click="toggle(label)">{{ label }}</button>
        </div>
        <div class="spread">
          <span class="small muted">{{ shown }} of {{ labels.length }} shown<template v-if="!f.visibleLinks.length"> (none picked = all)</template></span>
          <span class="row" style="gap:12px">
            <button type="button" class="link-btn" @click="f.visibleLinks = [...labels]">Select all</button>
            <button type="button" class="link-btn" @click="f.visibleLinks = []">Clear</button>
          </span>
        </div>
      </template>
      <p v-else class="small muted" style="margin:0">
        You haven't added any links yet.
        <router-link to="/app/profile" style="text-decoration:underline">Add them on your profile</router-link>.
      </p>
    </div>

    <div class="field"><label>Note on the card</label>
      <textarea v-model="f.note" maxlength="300"></textarea></div>

    <div v-if="showStrap" class="field">
      <label>Strap colour</label>
      <div v-if="me.plan.customStrap" class="row">
        <input type="color" v-model="f.strapColor" aria-label="Strap colour"
               style="width:56px;height:44px;padding:2px;flex:none" />
        <span class="small muted" style="flex:1">{{ f.strapColor || "Using the theme colour" }}</span>
        <button class="btn" style="width:auto;flex:none" type="button" @click="f.strapColor = ''">Reset</button>
      </div>
      <p v-else class="small muted" style="margin:0">
        Custom colours are part of Lanyard Plus.
        <router-link to="/app/settings/plan" style="text-decoration:underline">See Plus</router-link>
      </p>
    </div>
  </div>
</template>
