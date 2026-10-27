<script setup>
// The sheet that slides up when someone lands on a card (QR scan, 4-character
// code, or a shared link): shared selfie + a note back, then Connect.
// Everything is optional except a name for guests. If the card carried a
// per-person note (?n=), it is redeemed here — once — and shown on success.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { Api } from "../lib/api";
import { me, refreshMe } from "../lib/store";
import { fileToDataUrl } from "../lib/photo";
import Icon from "./Icon.vue";

const props = defineProps({
  view: { type: Object, required: true },
  noteToken: { type: String, default: null },
  eventId: { type: String, default: null },
});
const emit = defineEmits(["close", "connected"]);
const router = useRouter();

const NOTE_MAX = 300;
const first = computed(() => (props.view.profile.name || "them").split(/\s+/)[0]);
const already = computed(() => !!props.view.viewer?.connection);

const name = ref(me.profile?.name || "");
const message = ref("");
const privateNote = ref("");
const showPrivate = ref(false);
const selfieDataUrl = ref(null);
const consent = ref(false);
const needsAgree = computed(() => !me.user?.termsAccepted);
const agreed = ref(false);
const flash = ref(false);
const busy = ref(false);
const error = ref("");
const result = ref(null); // { connectionId, receivedNote }

async function takeSelfie(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  selfieDataUrl.value = await fileToDataUrl(file, 1080);
  consent.value = false;
}

async function submit() {
  error.value = "";
  if (!me.profile && !name.value.trim()) {
    error.value = "Add your name so they remember you.";
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
      message: message.value.trim(),
      note: privateNote.value.trim(),
      noteToken: props.noteToken || undefined,
      selfieDataUrl: selfieDataUrl.value || undefined,
      consent: consent.value,
      acceptTerms: needsAgree.value ? agreed.value : undefined,
      over18: needsAgree.value ? agreed.value : undefined,
      eventId: props.eventId,
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

function onKey(e) { if (e.key === "Escape") emit("close"); }
onMounted(() => {
  window.addEventListener("keydown", onKey);
  document.body.style.overflow = "hidden";
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  document.body.style.overflow = "";
});
</script>

<template>
  <div class="sheet-backdrop" @click.self="emit('close')">
    <div v-if="flash" class="shutter-flash"></div>
    <section class="sheet" role="dialog" aria-modal="true" :aria-label="`Connect with ${view.profile.name}`">
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
          <button class="btn" @click="emit('close')">Stay here</button>
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
          <button class="icon-btn" type="button" aria-label="Close" @click="emit('close')">
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

        <div class="field">
          <label class="label-top">Shared selfie (optional)</label>
          <div class="file-picker">
            <img v-if="selfieDataUrl" :src="selfieDataUrl" alt="Selfie preview" class="avatar" style="width:64px;height:64px" />
            <span v-else class="avatar avatar-initial" style="width:64px;height:64px" aria-hidden="true">
              <Icon name="camera" :size="24" />
            </span>
            <label for="sheet-selfie" class="btn">{{ selfieDataUrl ? "Retake" : "Take a selfie together" }}</label>
            <input id="sheet-selfie" class="visually-hidden" type="file" accept="image/*" capture="user" @change="takeSelfie" />
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
            and it disappears for both.
          </span>
        </label>

        <p v-if="error" class="error-text" role="alert">{{ error }}</p>

        <div class="btn-row">
          <button class="btn btn-ghost" type="button" @click="emit('close')">Not now</button>
          <button class="btn btn-primary" :disabled="busy" @click="submit">
            {{ busy ? "Saving…" : "Connect" }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
