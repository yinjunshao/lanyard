<script setup>
// The card's code: shown large, replaced with a random one, or (Plus) chosen once a week.
// It lives in the card editor in My cards and acts on the card it is given (F33).
import { computed, ref } from "vue";
import { me, refreshMe } from "../lib/store";
import { Api } from "../lib/api";

const props = defineProps({ card: { type: Object, required: true } });

// The card's code is permanent. Anyone can swap it for a random one (if it got
// out somewhere); Plus members can choose their own, once a week.
const isPlus = computed(() => me.plan?.tier === "plus");
const rotating = ref(false);
const confirmRotate = ref(false);
const codeMsg = ref("");
async function newCode() {
  codeMsg.value = "";
  if (!confirmRotate.value) {
    confirmRotate.value = true;
    setTimeout(() => (confirmRotate.value = false), 4000);
    return;
  }
  rotating.value = true;
  try {
    await Api.rotateCode(props.card.cardId);
    await refreshMe();
  } catch (e) {
    codeMsg.value = e.message;
  } finally {
    rotating.value = false;
    confirmRotate.value = false;
  }
}
const customOpen = ref(false);
const customDraft = ref("");
const customBusy = ref(false);
const nextChange = computed(() => props.card.codeNextChangeAt || null);
const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
async function saveCustom() {
  codeMsg.value = "";
  customBusy.value = true;
  try {
    await Api.customCode(props.card.cardId, customDraft.value);
    await refreshMe();
    customOpen.value = false;
    customDraft.value = "";
  } catch (e) {
    codeMsg.value = e.message;
  } finally {
    customBusy.value = false;
  }
}
</script>

<template>
  <section :id="`card-code-${card.cardId}`" class="panel stack-2" aria-label="Card code">
    <div class="spread">
      <span class="label">Card code</span>
      <span v-if="card.codeCustom" class="small muted">Chosen by you</span>
    </div>
    <div class="code-glyph tnum" style="font-size:32px;letter-spacing:.3em;text-align:center">{{ card.code }}</div>
    <p class="small muted">
      If someone can't scan, they type this under Scan. It stays the same, so
      it's fine to print it or put it on a slide.
    </p>

    <template v-if="isPlus">
      <p v-if="nextChange" class="small muted" style="margin:0">You can choose a new code on {{ fmtDate(nextChange) }}.</p>
      <button v-else-if="!customOpen" type="button" class="btn" @click="customOpen = true; customDraft = ''">Choose your own code</button>
      <form v-if="customOpen && !nextChange" class="stack" @submit.prevent="saveCustom">
        <label :for="`custom-code-${card.cardId}`" class="small">4 to 8 letters or numbers. You can change it once a week, and your old code keeps working for 30 days.</label>
        <input :id="`custom-code-${card.cardId}`" v-model="customDraft" type="text" maxlength="8" autocapitalize="characters" autocomplete="off" spellcheck="false"
               placeholder="ALEX24" style="text-transform:uppercase;letter-spacing:.2em" />
        <div class="btn-row">
          <button type="submit" class="btn btn-primary" :disabled="customBusy || customDraft.replace(/[^a-z0-9]/gi, '').length < 4">
            {{ customBusy ? "Saving…" : "Use this code" }}
          </button>
          <button type="button" class="btn" @click="customOpen = false">Cancel</button>
        </div>
      </form>
    </template>
    <router-link v-else to="/app/settings/plan" class="small link-btn" style="text-align:left">
      Want a code you choose, like your name? That comes with Lanyard Plus.
    </router-link>

    <button type="button" class="link-btn small" style="text-align:left" :disabled="rotating" @click="newCode">
      {{ confirmRotate ? "Tap again: your current code stops working straight away" : "Replace with a random code" }}
    </button>
    <p v-if="codeMsg" class="error-text small" role="alert">{{ codeMsg }}</p>
  </section>
</template>
