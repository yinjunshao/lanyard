<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { Api } from "../lib/api";
import { drawQR } from "../lib/qr";

const route = useRoute();
const live = ref(null);
const report = ref(null);
const reportOpen = ref(false);
const reportLoading = ref(false);
const error = ref("");
const qrCanvas = ref(null);
let timer = null;

const joinUrl = () =>
  live.value ? `${location.origin}/e/${live.value.event.code}` : "";

onMounted(async () => {
  try {
    live.value = await Api.hostLive(route.params.id);
    await renderQr();
    timer = setInterval(refresh, 4000);
  } catch (e) {
    error.value = e.message;
  }
});
onBeforeUnmount(() => clearInterval(timer));

async function refresh() {
  try { live.value = await Api.hostLive(route.params.id); } catch {}
}
async function renderQr() {
  if (qrCanvas.value) await drawQR(qrCanvas.value, joinUrl(), 320);
}
async function toggleReport() {
  reportOpen.value = !reportOpen.value;
  if (reportOpen.value && !report.value) {
    reportLoading.value = true;
    try { report.value = await Api.hostReport(route.params.id); }
    finally { reportLoading.value = false; }
  }
}
function printPoster() { window.print(); }

// A new join code makes the old poster/QR stop working at once.
const confirmRotate = ref(false);
const rotating = ref(false);
async function rotateCode() {
  if (!confirmRotate.value) {
    confirmRotate.value = true;
    setTimeout(() => (confirmRotate.value = false), 4000);
    return;
  }
  rotating.value = true;
  try {
    await Api.hostRotateEventCode(route.params.id);
    live.value = await Api.hostLive(route.params.id);
    await renderQr();
  } catch (e) {
    error.value = e.message;
  } finally {
    rotating.value = false;
    confirmRotate.value = false;
  }
}
</script>

<template>
  <div class="wide-col stack-3" style="max-width:860px">
    <router-link to="/host" class="small muted">‹ Dashboard</router-link>

    <p v-if="error" class="error-text">{{ error }}</p>
    <template v-else-if="live">
      <div class="spread">
        <div>
          <span class="label tnum">Check-in code {{ live.event.code }}</span>
          <h1>{{ live.event.name }}</h1>
          <p v-if="live.event.venue" class="sub muted">{{ live.event.venue }}</p>
        </div>
        <button class="btn" style="width:auto" @click="toggleReport">
          {{ reportOpen ? "Live poster" : "Report" }}
        </button>
      </div>

      <template v-if="!reportOpen">
        <div class="event-live-grid">
          <div class="panel stack" style="text-align:center">
            <span class="label">Scan to check in</span>
            <div class="poster-qr"><canvas ref="qrCanvas" role="img" aria-label="Event check-in QR code. Scan it to join this event."></canvas></div>
            <div class="code-glyph tnum" style="font-size:26px;letter-spacing:.3em">{{ live.event.code }}</div>
            <button class="btn" @click="printPoster">Print / full-screen</button>
            <button class="btn" :disabled="rotating" @click="rotateCode">
              {{ confirmRotate ? "Tap again: the old poster stops working" : "New check-in code" }}
            </button>
          </div>

          <div class="panel stack-2">
            <div class="stat">
              <span class="stat-n tnum">{{ live.checkins }}</span>
              <span class="label">Checked in</span>
            </div>
            <div class="stat">
              <span class="stat-n tnum">{{ live.connections }}</span>
              <span class="label">Connections</span>
            </div>
            <div class="stat">
              <span class="stat-n tnum">{{ live.selfies }}</span>
              <span class="label">Selfies</span>
            </div>
            <p v-if="live.overCap" class="notice small">
              Over {{ live.cap }} check-ins. Nobody is turned away, but events this size
              use a second credit. Ask us if you run big events regularly.
            </p>
            <p class="small muted">
              Aggregate only. You never see who connected with whom.
            </p>
          </div>
        </div>
      </template>

      <div v-else class="panel stack-3">
        <p v-if="reportLoading" class="muted">Building report…</p>
        <template v-else-if="report">
          <div class="spread">
            <h2>Post-event report</h2>
            <span class="small muted">{{ new Date(report.generatedAt).toLocaleString() }}</span>
          </div>
          <div class="report-stats">
            <div><strong class="tnum">{{ report.totals.checkins }}</strong><span class="label">Check-ins</span></div>
            <div><strong class="tnum">{{ report.totals.connections }}</strong><span class="label">Connections</span></div>
            <div><strong class="tnum">{{ report.totals.selfies }}</strong><span class="label">Selfies</span></div>
          </div>
          <p class="notice small">{{ report.privacy.note }}</p>

          <div v-if="report.courses.length" class="report-block">
            <span class="label">Courses</span>
            <div class="chip-row"><span v-for="x in report.courses" :key="x.term" class="chip muted">{{ x.term }} · {{ x.count }}</span></div>
          </div>
          <div v-if="report.tags.length" class="report-block">
            <span class="label">Come-to-me-for topics</span>
            <div class="chip-row"><span v-for="x in report.tags" :key="x.term" class="chip muted">{{ x.term }} · {{ x.count }}</span></div>
          </div>
          <div v-for="q in report.questions" :key="q.key" class="report-block">
            <span class="label">{{ q.label }}</span>
            <div class="chip-row"><span v-for="x in q.buckets" :key="x.term" class="chip muted">{{ x.term }} · {{ x.count }}</span></div>
          </div>
          <div v-if="report.sponsors.length" class="report-block">
            <span class="label">Sponsor opt-ins</span>
            <div class="chip-row"><span v-for="x in report.sponsors" :key="x.name" class="chip muted">{{ x.name }} · {{ x.count }}</span></div>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.event-live-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
@media (min-width: 720px) { .event-live-grid { grid-template-columns: 1.1fr .9fr; } }
.poster-qr { border: var(--border-ink); border-radius: var(--radius); background: #fff; padding: 16px; display: flex; justify-content: center; }
.poster-qr canvas { width: 280px; height: 280px; }
.stat { display: flex; align-items: baseline; justify-content: space-between; border-bottom: var(--border); padding-bottom: 10px; }
.stat:last-of-type { border-bottom: none; }
.stat-n { font-size: 34px; font-weight: 700; }
.report-stats { display:grid; grid-template-columns: repeat(3,1fr); gap:12px; text-align:center; }
.report-stats div { border:var(--border); border-radius:var(--radius); padding:14px; display:flex; flex-direction:column; gap:4px; }
.report-stats strong { font-size:30px; }
.report-block { display:flex; flex-direction:column; gap:8px; }
@media print {
  .topbar, .strap-rail, .tabbar, .thumb-bar, .btn, .wide-col > a { display: none !important; }
  .poster-qr canvas { width: 420px; height: 420px; }
}
</style>
