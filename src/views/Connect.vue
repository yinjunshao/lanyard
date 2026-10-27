<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Api } from "../lib/api";
import { me, refreshMe } from "../lib/store";
import { fileToDataUrl } from "../lib/photo";
import Icon from "../components/Icon.vue";

const route = useRoute();
const router = useRouter();

const card = ref(null);
const loading = ref(true);
const error = ref("");
const name = ref(me.profile?.name || "");
const note = ref("");
const selfieDataUrl = ref(null);
const consent = ref(false);
const flash = ref(false);
const busy = ref(false);
const done = ref(false);

onMounted(async () => {
  try {
    card.value = await Api.getCard(route.params.cardId);
    name.value = me.profile?.name || "";
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

async function takeSelfie(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  selfieDataUrl.value = await fileToDataUrl(file, 1080);
}

function fireFlash() {
  flash.value = true;
  setTimeout(() => (flash.value = false), 450);
}

const eventId = computed(() => {
  const e = route.query.event;
  return typeof e === "string" && /^[0-9a-f]{10}$/.test(e) ? e : null;
});

async function submit() {
  error.value = "";
  if (!me.profile && !name.value.trim()) {
    error.value = "Add your name so they remember you.";
    return;
  }
  if (selfieDataUrl.value && !consent.value) {
    error.value = "Both people need to agree to the shared selfie.";
    return;
  }
  busy.value = true;
  try {
    if (selfieDataUrl.value) fireFlash();
    await Api.connect({
      cardId: route.params.cardId,
      name: name.value.trim(),
      note: note.value.trim(),
      selfieDataUrl: selfieDataUrl.value || undefined,
      consent: consent.value,
      eventId: eventId.value,
    });
    await refreshMe();
    done.value = true;
    setTimeout(() => router.push(eventId.value ? `/app/events/${eventId.value}` : "/app/people"), 900);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="app-col stack-2">
    <div v-if="flash" class="shutter-flash"></div>

    <p v-if="loading" class="muted">Loading…</p>
    <template v-else-if="card && !done">
      <header>
        <div class="label">Connect with</div>
        <h1>{{ card.profile.name }}</h1>
        <p class="muted small">{{ [card.profile.course, card.profile.uni].filter(Boolean).join(" · ") }}</p>
        <p v-if="eventId" class="notice small" style="margin-top:12px">
          This connection will be saved to the event album.
        </p>
      </header>

      <div v-if="!me.profile" class="field">
        <label for="name">Your name</label>
        <input id="name" v-model="name" type="text" autocomplete="name" placeholder="Your name" />
      </div>

      <div class="field">
        <label class="label-top">Shared selfie (optional)</label>
        <div class="file-picker">
          <img v-if="selfieDataUrl" :src="selfieDataUrl" alt="Selfie preview" class="avatar" style="width:60px;height:60px" />
          <span v-else class="avatar avatar-initial" style="width:60px;height:60px" aria-hidden="true">
            <Icon name="camera" :size="22" />
          </span>
          <label for="selfie" class="btn">{{ selfieDataUrl ? "Retake" : "Take selfie" }}</label>
          <input id="selfie" class="visually-hidden" type="file" accept="image/*" capture="user" @change="takeSelfie" />
        </div>
      </div>

      <label v-if="selfieDataUrl" class="checkbox-row">
        <input type="checkbox" v-model="consent" />
        <span class="small">
          We both agree to this photo. Either of us can delete it at any time,
          and it disappears for both.
        </span>
      </label>

      <div class="field">
        <label for="note">Private note (only you see this)</label>
        <textarea id="note" v-model="note" maxlength="600"
                  placeholder="e.g. Talked about the spring internship"></textarea>
      </div>

      <p v-if="error" class="error-text">{{ error }}</p>

      <div class="thumb-bar">
        <div class="inner">
          <button class="btn btn-primary" :disabled="busy" @click="submit">
            {{ busy ? "Saving…" : "Connect" }}
          </button>
        </div>
      </div>
    </template>

    <div v-else-if="done" class="stack" style="margin-top:64px;text-align:center">
      <h1>Connected.</h1>
      <p class="muted">You'll find each other under People.</p>
    </div>
  </main>
</template>
