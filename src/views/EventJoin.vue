<script setup>
import { onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Api } from "../lib/api";
import { me } from "../lib/store";

const route = useRoute();
const router = useRouter();

const state = ref("loading");
const event = ref(null);
const sponsors = ref([]);
const name = ref(me.profile?.name || "");
const answers = reactive({});
const sponsorConsent = reactive({});
const directoryConsent = ref(false);
const busy = ref(false);
const error = ref("");

onMounted(load);
async function load() {
  try {
    const data = await Api.event(route.params.code);
    event.value = data.event;
    sponsors.value = data.sponsors;
    if (data.checkedIn) {
      router.replace(`/app/events/${data.event.id}`);
      return;
    }
    for (const q of event.value.questions) answers[q.key] = "";
    state.value = "checkin";
  } catch (e) {
    error.value = e.message === "event not found" ? "That event code doesn't exist." : e.message;
    state.value = "error";
  }
}

async function checkIn() {
  error.value = "";
  if (!me.profile && !name.value.trim()) {
    error.value = "Add your name to check in.";
    return;
  }
  busy.value = true;
  try {
    await Api.checkIn(route.params.code, {
      name: name.value.trim(),
      answers: { ...answers },
      sponsor: Object.keys(sponsorConsent).filter((k) => sponsorConsent[k]),
      directoryConsent: directoryConsent.value,
    });
    router.replace(`/app/events/${event.value.id}`);
  } catch (e) {
    error.value = e.message;
    busy.value = false;
  }
}

const fmtDate = (t) =>
  t ? new Date(t).toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
  }) : "";
</script>

<template>
  <main class="app-col stack-3">
    <p v-if="state === 'loading'" class="muted">Opening event…</p>

    <template v-else-if="state === 'checkin' && event">
      <div class="page-head">
        <span class="label">Event check-in</span>
        <h1>{{ event.name }}</h1>
        <p class="sub">
          <span v-if="event.venue">{{ event.venue }} · </span>{{ fmtDate(event.startsAt) }}
        </p>
      </div>

      <div class="notice">
        Checking in unlocks perks and the event album. If you choose to, you can also appear in the attendee room.
        Hosts see aggregate numbers only — never who connected with whom.
      </div>

      <label v-if="event.directoryOn" class="checkbox-row" style="margin:4px 0">
        <input type="checkbox" v-model="directoryConsent" />
        <span class="small">
          Show me in this event's attendee room to other checked-in people.
        </span>
      </label>

      <div v-if="!me.profile" class="field">
        <label for="name">Your name</label>
        <input id="name" v-model="name" type="text" autocomplete="name" />
      </div>

      <div v-for="q in event.questions" :key="q.key" class="field">
        <label :for="q.key">{{ q.label }}</label>
        <input :id="q.key" v-model="answers[q.key]" type="text" />
      </div>

      <div v-if="sponsors.length" class="panel stack-2">
        <span class="label">Sponsors</span>
        <label v-for="s in sponsors" :key="s.id" class="checkbox-row">
          <input type="checkbox" v-model="sponsorConsent[s.id]" />
          <span class="small">
            Share my name, course and tags with <strong>{{ s.name }}</strong>
            <span v-if="s.perk"> — {{ s.perk }}</span>
          </span>
        </label>
        <p class="small muted">Each sponsor is a separate, optional choice. Never pre-ticked.</p>
      </div>

      <p class="small muted">
        By checking in you agree to our <router-link to="/terms" target="_blank">Terms</router-link> and
        <router-link to="/privacy" target="_blank">Privacy Policy</router-link>. The organiser only sees
        anonymous totals, never who you connect with.
      </p>

      <p v-if="error" class="error-text" role="alert">{{ error }}</p>

      <div class="thumb-bar">
        <div class="inner">
          <button class="btn btn-primary" :disabled="busy" @click="checkIn">
            {{ busy ? "Checking in…" : "Check in" }}
          </button>
        </div>
      </div>
    </template>

    <template v-else-if="state === 'error'">
      <h1>Event not found</h1>
      <p class="muted">{{ error }}</p>
      <router-link to="/app/scan" class="btn btn-primary">Scan again</router-link>
    </template>
  </main>
</template>
