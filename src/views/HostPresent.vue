<script setup>
// F19: the Present page, for a screen or projector (host pages only). Full screen, landscape
// first, readable from the back of a room: the event name, a big check-in QR with its quiet
// zone, the code, and how many people have checked in. Nothing per person is ever shown (D004):
// only the event's own details and one aggregate count. It sits at /events/:id/present on the
// host site and reads the same host-only /live route as the live tab, so it is open only to a
// signed-in host of the event's organisation.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { applyTheme } from "../lib/theme";
import { themeOf } from "../lib/eventthemes";
import { idleHider, keepAwake } from "../lib/presentui";
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
// ---- Controls: Fullscreen, Theme, Exit. Shown on movement, hidden after 3 s with the cursor. ----
const controls = ref(true);
const bar = ref(null);
const fullscreen = ref(false);
const canFullscreen = typeof document !== "undefined" && !!document.fullscreenEnabled;
const dark = ref(false);
const hider = idleHider({
  show: () => { controls.value = true; },
  hide: () => { controls.value = false; },
  busy: () => !!bar.value?.contains(document.activeElement),
});
const poke = () => hider.poke();
const onFullscreen = () => { fullscreen.value = !!document.fullscreenElement; };
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { /* the browser said no: stay as we are */ }
}
// Light or dark for this page only (a bright room or a dim one). The portal's own choice comes back on leaving.
function setDark(on) {
  dark.value = on;
  document.documentElement.dataset.theme = on ? "night" : "light";
}

let stop = null, release = null;
onMounted(async () => {
  window.addEventListener("pointermove", poke);
  window.addEventListener("pointerdown", poke);
  window.addEventListener("keydown", poke);
  document.addEventListener("fullscreenchange", onFullscreen);
  poke();
  try { live.value = await HostApi.hostLive(id.value); }
  catch (e) {
    problem.value = ["signed_out", "details_required", "terms_required"].includes(e.code) || e.status === 401
      ? "signin" : e.status === 404 ? "missing" : "error";
    return;
  }
  setDark(themeOf(live.value.event.theme).dark); // a Night event is dark to begin with; the button changes it
  stop = startPolling(refresh);
  release = keepAwake();
});
onBeforeUnmount(() => {
  stop?.(); release?.(); hider.stop();
  window.removeEventListener("pointermove", poke);
  window.removeEventListener("pointerdown", poke);
  window.removeEventListener("keydown", poke);
  document.removeEventListener("fullscreenchange", onFullscreen);
  if (document.fullscreenElement) document.exitFullscreen?.().catch?.(() => {});
  applyTheme();
});

const ev = computed(() => live.value?.event || null);
// F66 (D061): the organisation's logo or name in place of the wordmark, only when the live route sends it (a paid event with
// branding on). "Check in with Lanyard" then stays at the foot.
const brand = computed(() => live.value?.brand || null);
const qr = computed(() => (ev.value ? qrPath(joinUrl(ev.value.code)) : null));
// The event's own strap: the host's colour, else the theme's (src/styles/eventthemes.css has a rule for each theme).
const strap = computed(() => ev.value?.strapColor || "");
const when = computed(() => [ev.value?.venue, ev.value?.startsAt ? fmtDateTime(ev.value.startsAt) : ""].filter(Boolean).join(" · "));
</script>

<template>
  <main class="present" :class="[ev?.theme, { idle: !controls }]" :style="strap ? { '--event-strap': strap } : null">
    <div class="present-strap" aria-hidden="true"></div>
    <p v-if="problem === 'signin'" class="present-note">Sign in to the host portal to present this event. <router-link to="/">Go to the host portal</router-link></p>
    <p v-else-if="problem === 'missing'" class="present-note">This event was not found. <router-link to="/">Go to the host portal</router-link></p>
    <p v-else-if="problem" class="present-note" role="alert">Could not load this event. <router-link to="/">Go to the host portal</router-link></p>
    <p v-else-if="!ev" class="present-note" role="status" aria-busy="true">Opening the event… <a class="sk-late" href="">Taking longer than usual. Try again</a></p>
    <div v-if="ev" ref="bar" class="present-controls" :class="{ shown: controls }" role="toolbar" aria-label="Present controls">
      <button v-if="canFullscreen" type="button" class="present-btn" @click="toggleFullscreen">{{ fullscreen ? "Exit fullscreen" : "Fullscreen" }}</button>
      <button type="button" class="present-btn" :aria-pressed="dark" @click="setDark(!dark)">{{ dark ? "Light" : "Dark" }}</button>
      <router-link :to="`/events/${id}`" class="present-btn">Exit</router-link>
    </div>
    <div v-if="ev" class="present-body">
      <section class="present-info">
        <p v-if="!brand" class="present-brand">lanyard<b>.</b></p>
        <p v-else class="present-brand present-host"><img v-if="brand.logo" :src="brand.logo" :alt="brand.name" class="present-logo" /><template v-else>{{ brand.name }}</template></p>
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
    <p v-if="ev && brand" class="present-with">Check in with Lanyard</p>
  </main>
</template>

<style scoped>
.present {
  --event-strap: var(--strap);
  position: fixed; inset: 0; z-index: 100; overflow-x: hidden; overflow-y: auto;
  background: var(--event-tint, var(--paper)); color: var(--ink);
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
.present-host { overflow-wrap: anywhere; }
.present-logo { display: block; width: auto; height: 10vh; max-width: 100%; object-fit: contain; object-position: left; padding: 0.6vh; border-radius: 0.6vh; background: #FFFDF8; }
.present-with { flex: none; padding: 0 5vw 2.4vh; font-size: 2.2vh; color: var(--graphite); }
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
/* Controls: the host's, not the room's, so they stay ordinary size and only show on movement. */
.present-controls {
  position: absolute; top: calc(2vh + 12px); right: 16px; z-index: 2;
  display: flex; gap: 8px; opacity: 0; visibility: hidden; transition: opacity 0.12s;
}
.present-controls.shown { opacity: 1; visibility: visible; }
.present-btn {
  min-height: 44px; padding: 0 18px; display: inline-flex; align-items: center;
  border: var(--border-ink); border-radius: var(--radius); background: var(--paper-raised); color: var(--ink);
  font-size: 15px; font-weight: 700; cursor: pointer;
}
.present-btn:active { background: var(--paper); }
.present.idle { cursor: none; }
@media (prefers-reduced-motion: reduce) { .present-controls { transition: none; } }
.present-qr { display: flex; align-items: center; justify-content: center; }
/* At least 40% of the screen's height; as large as the width allows beside the text. */
.present-qr-svg { width: min(72vh, 44vw); height: min(72vh, 44vw); display: block; border-radius: 0.8vh; }
@media (max-aspect-ratio: 1/1) {
  .present-body { grid-template-columns: 1fr; justify-items: center; text-align: center; gap: 3vh; flex: none; }
  .present-info { align-items: center; }
  .present-qr-svg { width: min(88vw, 46vh); height: min(88vw, 46vh); }
  .present-name { font-size: 6vh; }
  .present-code { font-size: 9vh; }
  .present-count { justify-content: center; }
  .present-with { text-align: center; }
}
</style>
