<script setup>
// F19: the Present page, for a screen or projector (host pages only). Full screen, landscape
// first, readable from the back of a room: the event name, a big check-in QR with its quiet
// zone, the code, and how many people have checked in. Nothing per person is ever shown (D004):
// only the event's own details and one aggregate count. It sits at /events/:id/present on the
// host site and reads the same host-only /live route as the live tab, so it is open only to a
// signed-in host of the event's organisation.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { HostApi } from "../lib/hostapi";
import { joinText, joinUrl } from "../lib/checkinlink";
import { qrPath } from "../lib/qrpath";
import { startPolling } from "../lib/presentpoll";
import { fmtDateTime } from "../lib/time";

const route = useRoute();
const id = computed(() => route.params.id);
const live = ref(null);
const problem = ref("");
// True after a refresh fails, until one works: the page keeps showing what it last had.
const stale = ref(false);

// The check-in count and the code come from the same host-only route as the live tab. Every
// 15 s the page asks again (not while the tab is hidden). The QR and the code are worked out
// from `live`, so when the host presses "New check-in code" they change here by themselves.
async function refresh() {
  try { live.value = await HostApi.hostLive(id.value); stale.value = false; }
  catch (e) { stale.value = true; throw e; }
}
let stop = null;
onMounted(async () => {
  try { live.value = await HostApi.hostLive(id.value); }
  catch (e) {
    problem.value = ["signed_out", "details_required", "terms_required"].includes(e.code) || e.status === 401
      ? "signin" : e.status === 404 ? "missing" : "error";
    return;
  }
  stop = startPolling(refresh);
});
onBeforeUnmount(() => stop?.());

const ev = computed(() => live.value?.event || null);
const qr = computed(() => (ev.value ? qrPath(joinUrl(ev.value.code)) : null));
// The event's own strap: the host's colour, else Formal's navy-grey, else the Lanyard strap.
const strap = computed(() => ev.value?.strapColor || (ev.value?.theme === "formal" ? "#2b3138" : ""));
const when = computed(() => [ev.value?.venue, ev.value?.startsAt ? fmtDateTime(ev.value.startsAt) : ""].filter(Boolean).join(" · "));
</script>

<template>
  <main class="present" :style="strap ? { '--event-strap': strap } : null">
    <div class="present-strap" aria-hidden="true"></div>
    <p v-if="problem === 'signin'" class="present-note">Sign in to the host portal to present this event. <router-link to="/">Go to the host portal</router-link></p>
    <p v-else-if="problem === 'missing'" class="present-note">This event was not found. <router-link to="/">Go to the host portal</router-link></p>
    <p v-else-if="problem" class="present-note" role="alert">Could not load this event. <router-link to="/">Go to the host portal</router-link></p>
    <div v-else-if="ev" class="present-body">
      <section class="present-info">
        <p class="present-brand">lanyard<b>.</b></p>
        <h1 class="present-name">{{ ev.name }}</h1>
        <p v-if="when" class="present-when">{{ when }}</p>
        <p class="present-scan">Scan to check in</p>
        <p class="present-code tnum" aria-label="Event code">{{ ev.code }}</p>
        <p class="present-or">Or go to <strong>{{ joinText(ev.code) }}</strong></p>
        <p class="present-count" role="status">
          <span class="present-n tnum">{{ live.checkins }}</span>
          <span class="present-n-label">checked in<template v-if="ev.endedAt"> · ended</template></span>
        </p>
        <p v-if="stale" class="present-stale">Not updating. Check the connection.</p>
      </section>
      <section class="present-qr">
        <svg class="present-qr-svg" :viewBox="`0 0 ${qr.size} ${qr.size}`" role="img" aria-label="Event check-in QR code. Scan it with a phone camera to check in." shape-rendering="crispEdges">
          <rect :width="qr.size" :height="qr.size" fill="#fff" />
          <path :d="qr.d" fill="#1b1a17" />
        </svg>
      </section>
    </div>
  </main>
</template>

<style scoped>
.present {
  --event-strap: var(--strap);
  position: fixed; inset: 0; z-index: 100; overflow: hidden;
  background: var(--paper); color: var(--ink);
  display: flex; flex-direction: column;
}
.present-strap { height: 2vh; min-height: 8px; background: var(--event-strap); flex: none; }
.present-note { margin: auto; max-width: 30em; padding: 24px; font-size: 20px; text-align: center; }
.present-note a { text-decoration: underline; }
.present-body {
  flex: 1; min-height: 0;
  display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center;
  gap: 5vw; padding: 4vh 5vw;
}
.present-info { display: flex; flex-direction: column; gap: 2.4vh; min-width: 0; }
.present-brand { font-weight: 700; font-size: 3.4vh; letter-spacing: -0.02em; line-height: 1; }
.present-brand b { color: var(--event-strap); }
.present-name {
  font-size: 8vh; line-height: 1.04; letter-spacing: -0.02em; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.present-when { font-size: 3vh; color: var(--graphite); line-height: 1.25; }
.present-scan { margin-top: 2vh; font-size: 4.4vh; font-weight: 700; line-height: 1.1; }
.present-code { font-size: 13vh; font-weight: 700; letter-spacing: 0.14em; line-height: 1; }
.present-or { font-size: 3.2vh; color: var(--graphite); line-height: 1.25; overflow-wrap: anywhere; }
.present-or strong { color: var(--ink); }
.present-count { display: flex; align-items: baseline; gap: 1.6vh; margin-top: 1vh; }
.present-n { font-size: 7vh; font-weight: 700; line-height: 1; }
.present-n-label { font-size: 3vh; color: var(--graphite); }
.present-stale { font-size: 2.4vh; color: var(--strap-deep); }
.present-qr { display: flex; align-items: center; justify-content: center; }
/* At least 40% of the screen's height; as large as the width allows beside the text. */
.present-qr-svg { width: min(72vh, 44vw); height: min(72vh, 44vw); display: block; border-radius: 0.8vh; }
@media (max-aspect-ratio: 1/1) {
  .present-body { grid-template-columns: 1fr; justify-items: center; text-align: center; gap: 3vh; }
  .present-info { align-items: center; }
  .present-qr-svg { width: min(88vw, 46vh); height: min(88vw, 46vh); }
  .present-name { font-size: 6vh; }
  .present-code { font-size: 9vh; }
  .present-count { justify-content: center; }
}
</style>
