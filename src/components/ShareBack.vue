<script setup>
// "What you're sharing back", inside the connect sheet: the scanner's side of what the card owner chose by showing
// their card. Pick one of your cards (its "What I do" and "About" come with it) and which of its links to include.
// Loaded only for someone with a card of their own, so the public card page stays small (F28). The choice is sent
// with the connection and saved per connection on the server (worker/shares.js), which checks it again.
import { computed, onMounted, ref, watch } from "vue";
import { me } from "../lib/store";

const props = defineProps({
  current: { type: Object, default: null }, // { cardId, links } you already share with them, if connected
  first: { type: String, required: true },  // their first name
});
const emit = defineEmits(["update"]);

const cards = (me.cards || []).filter(Boolean); // your cards, as /api/me lists them
const linksOn = (c) => Object.keys(c?.profile?.links || {});
const cardId = ref((cards.find((c) => c.cardId === props.current?.cardId) || cards[0])?.cardId || null);
const card = computed(() => cards.find((c) => c.cardId === cardId.value) || null);
const picked = ref(props.current?.links && props.current.cardId === cardId.value
  ? linksOn(card.value).filter((k) => props.current.links.includes(k))
  : linksOn(card.value));

function pickCard(id) { cardId.value = id; picked.value = linksOn(card.value); }
function toggle(k) { picked.value = picked.value.includes(k) ? picked.value.filter((x) => x !== k) : [...picked.value, k]; }

const seen = computed(() => {
  const p = card.value?.profile;
  if (!p) return "";
  const parts = ["your name and photo"];
  if (p.headline) parts.push(`what you do (“${p.headline}”)`);
  if (p.about) parts.push("your About");
  if (p.tags?.length) parts.push("your tags");
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
});

const send = () => emit("update", card.value ? { cardId: card.value.cardId, links: [...picked.value] } : null);
onMounted(send);
watch([cardId, picked], send);
</script>

<template>
  <fieldset v-if="card" class="field" style="border:0;padding:8px 0 0;margin:0;min-width:0">
    <legend class="label-top">What you're sharing back</legend>
    <div v-if="cards.length > 1" class="stack-1">
      <span id="share-card-l" class="small muted">Card</span>
      <div class="chip-row" role="radiogroup" aria-labelledby="share-card-l">
        <button v-for="c in cards" :key="c.cardId" type="button" role="radio" class="chip chip-toggle"
                :class="{ on: c.cardId === cardId }" :aria-checked="c.cardId === cardId" @click="pickCard(c.cardId)">{{ c.name }}</button>
      </div>
    </div>
    <p class="small">{{ first }} will see {{ seen }}, as on this card.</p>
    <div v-if="linksOn(card).length" class="stack-1">
      <span id="share-links-l" class="small muted">Links to include</span>
      <div class="chip-row" role="group" aria-labelledby="share-links-l">
        <button v-for="k in linksOn(card)" :key="k" type="button" class="chip chip-toggle"
                :class="{ on: picked.includes(k) }" :aria-pressed="picked.includes(k)" @click="toggle(k)">{{ k }}</button>
      </div>
    </div>
    <p class="small muted">
      To share a different "What I do" or About, give another card its own in
      <router-link to="/app/cards" target="_blank">My cards</router-link> and pick it here.
    </p>
  </fieldset>
</template>
