<script setup>
// F19: the poster, at /events/:id/print on the host site (host pages only). One A4 portrait page
// of paper and ink: the event, a big QR, the code, three steps and the wordmark. No live count,
// no controls, no per-person data. The print dialog opens when the page is ready (add ?auto=0 to
// stop that), and the Print button does it again. Sizes are in cqw, a share of the sheet's width,
// so the page on screen and on paper are the same design.
import { computed, nextTick, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { HostApi } from "../lib/hostapi";
import { joinText, joinUrl } from "../lib/checkinlink";
import { qrPath } from "../lib/qrpath";

const route = useRoute();
const id = computed(() => route.params.id);
const live = ref(null);
const problem = ref("");
const printIt = () => window.print();

onMounted(async () => {
  try { live.value = await HostApi.hostLive(id.value); }
  catch (e) {
    problem.value = ["signed_out", "details_required", "terms_required"].includes(e.code) || e.status === 401
      ? "signin" : e.status === 404 ? "missing" : "error";
    return;
  }
  if (route.query.auto === "0") return;
  await nextTick();
  try { await document.fonts?.ready; } catch { /* print with what we have */ }
  printIt();
});

const ev = computed(() => live.value?.event || null);
const qr = computed(() => (ev.value ? qrPath(joinUrl(ev.value.code)) : null));
// The event's own strap colour is the only colour on the paper.
const strap = computed(() => ev.value?.strapColor || (ev.value?.theme === "formal" ? "#2b3138" : "#d9502b"));
const when = computed(() => (ev.value?.startsAt
  ? new Date(ev.value.startsAt).toLocaleString(undefined, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })
  : ""));
</script>

<template>
  <main class="poster-page">
    <div class="poster-bar no-print">
      <router-link :to="`/events/${id}`" class="poster-btn">Back</router-link>
      <button v-if="ev" type="button" class="poster-btn poster-print" @click="printIt">Print</button>
      <p v-if="ev" class="poster-note">One A4 page, black on white. It works until you press New check-in code on the live page; after that, print it again.</p>
    </div>
    <p v-if="problem === 'signin'" class="poster-msg no-print">Sign in to the host portal to print this poster. <router-link to="/">Go to the host portal</router-link></p>
    <p v-else-if="problem === 'missing'" class="poster-msg no-print">This event was not found. <router-link to="/">Go to the host portal</router-link></p>
    <p v-else-if="problem" class="poster-msg no-print" role="alert">Could not load this event. <router-link to="/">Go to the host portal</router-link></p>
    <p v-else-if="!ev" class="poster-msg no-print" role="status" aria-busy="true">Getting the poster ready… <a class="sk-late" href="">Taking longer than usual. Try again</a></p>
    <div v-if="ev" class="poster-sheet">
      <div class="poster" :style="{ '--event-strap': strap }">
        <div class="poster-head">
          <p class="poster-kicker">Event check-in</p>
          <h1 class="poster-name">{{ ev.name }}</h1>
          <p v-if="when" class="poster-when">{{ when }}</p>
          <p v-if="ev.venue" class="poster-when">{{ ev.venue }}</p>
        </div>
        <div class="poster-mid">
          <svg class="poster-qr" :viewBox="`0 0 ${qr.size} ${qr.size}`" role="img" aria-label="Event check-in QR code. Scan it with a phone camera to check in." shape-rendering="crispEdges">
            <rect :width="qr.size" :height="qr.size" fill="#fff" />
            <path :d="qr.d" fill="#000" />
          </svg>
          <p class="poster-code tnum">{{ ev.code }}</p>
          <p class="poster-or">Or go to <strong>{{ joinText(ev.code) }}</strong></p>
        </div>
        <ol class="poster-steps">
          <li><b>1</b><span class="poster-step-t">Scan</span><span class="poster-step-d">Point your phone camera at the code.</span></li>
          <li><b>2</b><span class="poster-step-t">Check in</span><span class="poster-step-d">Add your name. No app to install.</span></li>
          <li><b>3</b><span class="poster-step-t">Meet people</span><span class="poster-step-d">Keep a face and a name for everyone you meet.</span></li>
        </ol>
        <p class="poster-brand">lanyard</p>
      </div>
    </div>
  </main>
</template>

<style scoped>
.poster-page { min-height: 100vh; padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
.poster-bar { width: min(100%, 560px); display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.poster-note { flex-basis: 100%; font-size: 13.5px; color: var(--graphite); }
.poster-btn {
  min-height: 44px; padding: 0 20px; display: inline-flex; align-items: center;
  border: var(--border-ink); border-radius: var(--radius); background: var(--paper-raised); color: var(--ink);
  font-size: 16px; font-weight: 700; cursor: pointer;
}
.poster-print { background: var(--strap); border-color: var(--strap); color: #fff; }
.poster-msg { margin: 48px auto; max-width: 30em; text-align: center; }
.poster-msg a { text-decoration: underline; }

/* The sheet is the page's printable area: A4 less 12 mm all round is 186 x 273 mm. On screen it
   is the same shape, shrunk to fit. It is paper whatever the app's theme: white, black. */
.poster-sheet {
  container-type: inline-size;
  width: min(100%, 560px); aspect-ratio: 186 / 273;
  background: #fff; color: #000; border: 1px solid var(--rule);
}
.poster {
  height: 100%; display: flex; flex-direction: column; align-items: center; text-align: center;
  padding: 4cqw 5cqw 3.5cqw; border-top: 1.6cqw solid var(--event-strap);
  justify-content: space-between; font-family: var(--font);
}
.poster-head { display: flex; flex-direction: column; gap: 1.4cqw; align-items: center; width: 100%; }
.poster-kicker { font-size: 2.2cqw; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
.poster-name {
  font-size: 6.6cqw; line-height: 1.06; letter-spacing: -0.02em; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.poster-when { font-size: 3cqw; line-height: 1.25; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.poster-mid { display: flex; flex-direction: column; align-items: center; gap: 2cqw; }
/* 54 cqw is 100 mm on paper, quiet zone included: the dark part is never under 76 mm (an address that fits the smallest QR, 25 modules). */
.poster-qr { width: 54cqw; height: 54cqw; display: block; }
.poster-code { font-size: 9cqw; font-weight: 700; letter-spacing: 0.14em; line-height: 1; padding-left: 0.14em; }
.poster-or { font-size: 3cqw; }
.poster-steps { list-style: none; margin: 0; padding: 0; width: 100%; display: grid; grid-template-columns: repeat(3, 1fr); gap: 3cqw; }
.poster-steps li { display: flex; flex-direction: column; align-items: center; gap: 0.8cqw; border-top: 0.4cqw solid #000; padding-top: 2cqw; }
.poster-steps b { font-size: 3cqw; }
.poster-step-t { font-size: 3.6cqw; font-weight: 700; line-height: 1.1; }
.poster-step-d { font-size: 2.2cqw; line-height: 1.3; }
.poster-brand { font-size: 2.6cqw; font-weight: 700; letter-spacing: -0.02em; }
</style>

<style>
/* Printing: one A4 portrait page, 12 mm margins, no controls. */
@page { size: A4; margin: 12mm; }
@media print {
  html, body { background: #fff !important; }
  body, #app { min-height: 0 !important; }
  .no-print { display: none !important; }
  .poster-page { display: block !important; min-height: 0 !important; padding: 0 !important; }
  .poster-sheet { width: 186mm !important; height: 272mm; aspect-ratio: auto !important; border: 0 !important; overflow: hidden; break-inside: avoid; }
}
</style>
