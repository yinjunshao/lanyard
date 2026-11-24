<script setup>
import { onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Api } from "../lib/api";
import "../lib/errors"; // F39: plain words for a failed request
import { me } from "../lib/store";
import EventPage from "../components/EventPage.vue";

// What the page looks like is EventPage (F18), shared with the host's live preview.
// This file fetches the event, holds the form and checks in.
const route = useRoute();
const router = useRouter();

const state = ref("loading");
const event = ref(null);
const sponsors = ref([]);
// First-timers agree to the Terms here by pressing Check in, under the line that says so (F51; the server checks it too).
const form = reactive({ name: me.profile?.name || "", answers: {}, sponsorConsent: {}, directoryConsent: false, collect: null, hasEmail: true });
const needsAgree = () => !me.user?.termsAccepted;
const busy = ref(false);
const error = ref("");

onMounted(load);
async function load() {
  try {
    const data = await Api.event(route.params.code);
    event.value = data.event;
    document.title = `${data.event.name} on Lanyard`;
    sponsors.value = data.sponsors;
    if (data.checkedIn) {
      router.replace(`/app/events/${data.event.id}`);
      return;
    }
    for (const q of event.value.questions) form.answers[q.key] = "";
    // F31: an event that collects names starts with every tick on (the person unticks what they do not want to share).
    // Sharing an email needs a verified one, so that row is off and says why when there is none.
    if (event.value.collects) {
      form.hasEmail = !!me.user?.emailVerified;
      form.collect = { attendance: true, email: form.hasEmail, card: true };
    }
    state.value = "checkin";
  } catch (e) {
    error.value = e.message;
    state.value = "error";
  }
}

async function checkIn() {
  error.value = "";
  if (!me.profile && !form.name.trim()) {
    error.value = "Add your name to check in.";
    return;
  }
  busy.value = true;
  try {
    await Api.checkIn(route.params.code, {
      name: form.name.trim(),
      answers: { ...form.answers },
      sponsor: Object.keys(form.sponsorConsent).filter((k) => form.sponsorConsent[k]),
      directoryConsent: form.directoryConsent,
      // The ticks as they are now. Sent only for an event that collects; each is a plain true or false.
      ...(event.value.collects ? { collect: Object.fromEntries(event.value.collects.items.map((i) => [i.key, form.collect?.[i.key] === true])) } : {}),
      ...(needsAgree() ? { acceptTerms: true, over18: true } : {}),
    });
    router.replace(`/app/events/${event.value.id}`);
  } catch (e) {
    error.value = e.message;
    busy.value = false;
  }
}
</script>

<template>
  <main class="app-col stack-3">
    <div v-if="state === 'loading'" class="sk-wrap" aria-busy="true"><b class="visually-hidden" role="status">Opening event…</b><span class="sk sk-title"></span><span class="sk sk-line"></span><span class="sk sk-line s"></span><span class="sk sk-tall"></span><span class="sk sk-box"></span><a class="sk-slow" href="">Try again</a></div>

    <EventPage v-else-if="state === 'checkin' && event" :event="event" :sponsors="sponsors" :form="form"
               :show-name="!me.profile" :needs-agree="needsAgree()" :error="error" :busy="busy" @checkin="checkIn" />

    <template v-else-if="state === 'error'">
      <h1>Event not found</h1>
      <p class="muted">{{ error }}</p>
      <router-link to="/app/scan" class="btn btn-primary">Scan again</router-link>
    </template>
  </main>
</template>
