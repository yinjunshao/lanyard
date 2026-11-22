<script setup>
// The sheet that slides up when someone lands on a card (QR scan, 4-character
// code, or a shared link): shared selfie + a note back, then Connect.
// Everything is optional except a name and (F45) an email for guests. The email is only ours: it is
// kept unconfirmed until they open our first email, is never shown to the person they connect with,
// and cannot sign anyone in until it is confirmed. If the card carried a
// per-person note (?n=), it is redeemed here — once — and shown on success.
// Someone with a card of their own also picks what they share back: which card
// (its "What I do" and "About" come with it) and which of its links. The card
// owner chose theirs by showing this card; this is the scanner's equivalent.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { useRouter } from "vue-router";
import { Api } from "../lib/api";
import { me, refreshMe } from "../lib/store";
import Icon from "./Icon.vue";
import { useSheetExit } from "../lib/sheetMotion";
// Loaded on mount, and only for someone with a card of their own (public-page JS budget, F28).
const ShareBack = shallowRef(null);

const props = defineProps({
  view: { type: Object, required: true },
  noteToken: { type: String, default: null },
  eventId: { type: String, default: null },
  via: { type: String, default: null }, // qr | code | link: how the card was opened (F13)
});
const emit = defineEmits(["close", "connected"]);
const router = useRouter();
// F40: closing slides the sheet down first, then tells the page, which takes it out (so the scroll lock below is
// let go after the exit); on a phone it can be swiped down (D045).
const root = ref(null);
const { leaving, close } = useSheetExit(emit, root);

const NOTE_MAX = 300;
const first = computed(() => (props.view.profile.name || "them").split(/\s+/)[0]);
const already = computed(() => !!props.view.viewer?.connection);

const name = ref(me.profile?.name || "");
// F45: someone without a card (and without a confirmed email) gives one. Never sent by anyone else.
const needsEmail = computed(() => !me.profile && !me.user?.emailVerified);
const email = ref("");
const signInTo = computed(() => `/signin?next=${encodeURIComponent(`/c/${props.view.cardId}`)}`);
const message = ref("");
const privateNote = ref("");
const showPrivate = ref(false);
const selfieDataUrl = ref(null);
const selfieInput = ref(null);
const consent = ref(false);
const needsAgree = computed(() => !me.user?.termsAccepted);
const agreed = ref(false);
const flash = ref(false);
const busy = ref(false);
const error = ref("");
const result = ref(null); // { connectionId, receivedNote }

// What you share back (ShareBack.vue): only for someone with a card of their own, and loaded only for them.
const share = ref(null); // { cardId, links } once ShareBack has loaded; without it the server keeps what you shared before

function removeSelfie() {
  selfieDataUrl.value = null;
  consent.value = false;
  if (selfieInput.value) selfieInput.value.value = "";
}

async function takeSelfie(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  // The photo code loads when a photo is picked, not with the card (public-page JS budget, F28).
  const { fileToDataUrl } = await import("../lib/photo");
  selfieDataUrl.value = await fileToDataUrl(file, 1080);
  consent.value = false;
}

async function submit() {
  error.value = "";
  if (!me.profile && !name.value.trim()) {
    error.value = "Add your name so they remember you.";
    return;
  }
  if (needsEmail.value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) {
    error.value = "Add your email to connect. Only we see it, and it's how you get back to your card.";
    return;
  }
  if (needsAgree.value && !agreed.value) {
    error.value = "Please tick the box to confirm you're 18 or over and agree to the Terms and Privacy Policy.";
    return;
  }
  if (selfieDataUrl.value && !consent.value) {
    error.value = "Both of you need to agree to the shared selfie.";
    return;
  }
  busy.value = true;
  try {
    if (selfieDataUrl.value) { flash.value = true; setTimeout(() => (flash.value = false), 450); }
    const res = await Api.connect({
      cardId: props.view.cardId,
      name: name.value.trim(),
      email: needsEmail.value ? email.value.trim() : undefined,
      tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } })(),
      message: message.value.trim(),
      note: privateNote.value.trim(),
      noteToken: props.noteToken || undefined,
      selfieDataUrl: selfieDataUrl.value || undefined,
      consent: consent.value,
      acceptTerms: needsAgree.value ? agreed.value : undefined,
      over18: needsAgree.value ? agreed.value : undefined,
      eventId: props.eventId,
      via: props.via || undefined,
      share: share.value || undefined,
    });
    await refreshMe();
    result.value = res;
    emit("connected", res);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

function openPerson() {
  router.push(`/app/people/${result.value.connectionId}`);
}

function onKey(e) { if (e.key === "Escape") close(); }
onMounted(() => {
  if (me.profile) import("./ShareBack.vue").then((m) => { ShareBack.value = m.default; });
  window.addEventListener("keydown", onKey);
  document.body.style.overflow = "hidden";
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  document.body.style.overflow = "";
});
</script>

<template>
  <div class="sheet-backdrop" :class="{ 'is-leaving': leaving }" @click.self="close()">
    <div v-if="flash" class="shutter-flash"></div>
    <section ref="root" class="sheet" role="dialog" aria-modal="true" :aria-label="`Connect with ${view.profile.name}`">
      <div class="sheet-handle" aria-hidden="true"></div>

      <!-- Done -->
      <div v-if="result" class="stack-2">
        <div class="sheet-head">
          <div>
            <span class="label">Connected</span>
            <h2>You and {{ first }} are connected.</h2>
          </div>
        </div>
        <div v-if="result.receivedNote" class="note-callout">
          <span class="label">A note from {{ first }}</span>
          <p>“{{ result.receivedNote }}”</p>
          <p class="small muted">Saved to this connection.</p>
        </div>
        <p v-else class="muted small">
          You'll find each other under People<template v-if="result.event"> and in the {{ result.event.name }} album</template>.
        </p>
        <div class="btn-row">
          <button class="btn" @click="close()">Stay here</button>
          <button class="btn btn-primary" @click="openPerson">Open in People</button>
        </div>
      </div>

      <!-- Form -->
      <div v-else class="stack-2">
        <div class="sheet-head">
          <div>
            <span class="label">{{ already ? "Add to your connection" : "Connect with" }}</span>
            <h2>{{ view.profile.name }}</h2>
          </div>
          <button class="icon-btn" type="button" aria-label="Close" @click="close()">
            <Icon name="close" :size="20" />
          </button>
        </div>

        <p v-if="view.viewer?.event" class="notice small">
          You're both checked in to <strong>{{ view.viewer.event.name }}</strong>, so this connection is
          saved to the event album.
        </p>

        <div v-if="!me.profile" class="field">
          <label for="sheet-name">Your name</label>
          <input id="sheet-name" v-model="name" type="text" autocomplete="name" placeholder="So they remember you" />
        </div>
        <div v-if="needsEmail" class="field">
          <label for="sheet-email">Your email</label>
          <input id="sheet-email" v-model="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false"
                 maxlength="254" required aria-describedby="sheet-email-hint" placeholder="you@example.com" />
          <span id="sheet-email-hint" class="small muted">Only we see this. It isn't shown to {{ first }} or on your card.</span>
        </div>
        <p v-if="!me.profile" class="small" style="margin:0">
          <span class="muted">Already on Lanyard?</span> <router-link :to="signInTo">Sign in</router-link>
        </p>

        <component :is="ShareBack" v-if="ShareBack" :current="view.viewer?.connection?.myShare || null" :first="first" @update="share = $event" />

        <div class="field">
          <label class="label-top">Shared selfie (optional)</label>
          <div class="selfie-field">
            <input id="sheet-selfie" ref="selfieInput" class="visually-hidden" type="file" accept="image/*" capture="user" @change="takeSelfie" />
            <label v-if="!selfieDataUrl" for="sheet-selfie" class="btn selfie-btn">
              <Icon name="camera" :size="22" />
              Take a selfie together
            </label>
            <div v-else class="selfie-done">
              <img :src="selfieDataUrl" alt="Selfie preview" class="selfie-thumb" />
              <label for="sheet-selfie" class="btn-quiet">Retake</label>
              <button type="button" class="btn-quiet" @click="removeSelfie">Remove</button>
            </div>
          </div>
        </div>

        <div class="field">
          <label for="sheet-message">Leave {{ first }} a note (they'll see it)</label>
          <textarea id="sheet-message" v-model="message" :maxlength="NOTE_MAX"
                    placeholder="Nice to meet you — I'd love to hear more about…"></textarea>
          <span class="small muted" style="align-self:flex-end">{{ message.length }}/{{ NOTE_MAX }}</span>
        </div>

        <div v-if="showPrivate" class="field">
          <label for="sheet-private">Private reminder (only you see this)</label>
          <textarea id="sheet-private" v-model="privateNote" maxlength="600"
                    placeholder="e.g. Talked about the spring internship"></textarea>
        </div>
        <button v-else type="button" class="link-btn" @click="showPrivate = true">+ Add a private reminder</button>

        <label v-if="needsAgree" class="checkbox-row">
          <input type="checkbox" v-model="agreed" />
          <span class="small">
            I'm 18 or over and I agree to the
            <router-link to="/terms" target="_blank">Terms</router-link> and
            <router-link to="/privacy" target="_blank">Privacy Policy</router-link>.
          </span>
        </label>
        <p v-else class="small muted">
          Connecting is covered by the <router-link to="/terms" target="_blank">Terms</router-link> and
          <router-link to="/privacy" target="_blank">Privacy Policy</router-link> you've agreed to.
        </p>

        <label v-if="selfieDataUrl" class="checkbox-row">
          <input type="checkbox" v-model="consent" />
          <span class="small">
            Everyone in the shared selfie agrees to it. Either of us can delete it at any time,
            and it disappears for both. The other person has to accept it in the app, or it is deleted after 7 days.
          </span>
        </label>

        <p v-if="error" class="error-text" role="alert">{{ error }}</p>

        <div class="btn-row">
          <button class="btn btn-ghost" type="button" @click="close()">Not now</button>
          <button class="btn btn-primary" :disabled="busy" @click="submit">
            {{ busy ? "Saving…" : "Connect" }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* One control before a photo (the whole button is the tap target); after one, a plain picture with Retake and Remove. */
.selfie-field { display: flex; }
.selfie-btn { width: 100%; }
.selfie-done { display: flex; align-items: center; gap: 12px; }
.selfie-thumb { width: 64px; height: 64px; border-radius: var(--radius); object-fit: cover; border: var(--border); }
.selfie-field:has(input:focus-visible) :is(.selfie-btn, .selfie-done label) { outline: 2.5px solid var(--strap); outline-offset: 2px; }
</style>
