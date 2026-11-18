<script setup>
// F40: the voucher scanner, host.<domain>/scan/<token>. What staff open from the link the host sent them: no account,
// the token is the key, and it only works from 15 minutes before the voucher (or event) starts until 15 minutes after
// it ends. The whole screen is the camera. A scan shows the person (photo, name, what is left) for about a second,
// then the camera is ready for the next one. Below the camera: the figures and every scan so far, newest first.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { startScanner } from "../lib/scanner";
import Avatar from "../components/Avatar.vue";

document.title = "Voucher scanner | Lanyard";
const route = useRoute();
const token = String(route.params.token || "");
const url = `/api/host/scan/${encodeURIComponent(token)}`;

const view = ref(null); // GET reply
const fatal = ref(""); // the link can't be used: invalid, replaced, expired
const video = ref(null);
const camError = ref("");
const typed = ref("");
const result = ref(null); // { kind: ok|used|bad, person?, title, line }
const sending = ref(false);
let stop = null;
let poll = null;
let hideTimer = null;
let lastRaw = "", lastAt = 0;

async function load() {
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { fatal.value = j.error || "This scanner link can't be used."; stopCamera(); clearInterval(poll); return; }
    const wasEarly = view.value?.early;
    view.value = j;
    if (!j.early && (wasEarly || !stop)) startCamera();
  } catch { /* no signal: keep what is on screen, and try again on the next poll */ }
}

function startCamera() {
  if (stop || !video.value) return;
  stop = startScanner(video.value, {
    onResult: (raw) => scan(raw),
    onError: () => { camError.value = "The camera isn't available. Allow it in the browser, or type the 6-digit code below."; },
  });
}
function stopCamera() { stop?.(); stop = null; }

onMounted(() => {
  load();
  poll = setInterval(load, 15000);
});
onBeforeUnmount(() => { stopCamera(); clearInterval(poll); clearTimeout(hideTimer); });

const clock = (ms) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const clockS = (ms) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function show(r, ms) {
  result.value = { ...r, at: Date.now() };
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { result.value = null; }, ms);
  try { navigator.vibrate?.(r.kind === "ok" ? 80 : [60, 60, 60]); } catch { /* no vibration here */ }
}

async function scan(raw) {
  const now = Date.now();
  // The camera sees the same code many times a second: one scan per code every few seconds.
  if (sending.value || (raw === lastRaw && now - lastAt < 3500)) return;
  lastRaw = raw; lastAt = now;
  sending.value = true;
  try {
    const res = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: raw }) });
    const j = await res.json().catch(() => ({}));
    const title = view.value?.voucher.title || "Voucher";
    if (res.ok) {
      show({ kind: "ok", person: j.person, title, line: j.perPerson > 1 ? `Use ${j.used} of ${j.perPerson}. ${j.left} left.` : "Valid. Marked as used." }, 1300);
    } else if (j.person) {
      show({ kind: "used", person: j.person, title, line: j.code === "already_used" && j.lastUsedAt ? `Already used at ${clockS(j.lastUsedAt)}.` : j.error }, 2400);
    } else {
      if ((res.status === 404 && j.code === "bad_link") || res.status === 410) { fatal.value = j.error; stopCamera(); return; }
      show({ kind: "bad", title, line: j.error || "That didn't work. Try again." }, 2200);
    }
    load();
  } catch {
    show({ kind: "bad", title: "No connection", line: "Check the signal and scan again." }, 2200);
    lastRaw = ""; // let the same code through again once the signal is back
  } finally {
    sending.value = false;
  }
}

function submitTyped() {
  const d = typed.value.replace(/\D/g, "");
  if (d.length !== 6) return;
  lastRaw = ""; // a typed code always goes through
  scan(d);
  typed.value = "";
}

const stats = computed(() => view.value?.stats || null);
const pct = (n, of) => (of ? Math.round((n / of) * 100) : 0);
const windowLine = computed(() => {
  const v = view.value;
  if (!v) return "";
  if (v.early) return `Opens at ${clock(v.from)}`;
  return v.until ? `Works until ${clock(v.until)}` : "Working";
});
</script>

<template>
  <div class="scanpage">
    <div v-if="fatal" class="scan-dead">
      <span class="wordmark">lanyard<b>.</b></span>
      <h1>Scanner closed</h1>
      <p>{{ fatal }}</p>
    </div>

    <template v-else>
      <header class="scan-top">
        <div class="scan-top-text">
          <span class="scan-event">{{ view?.event.name || "Voucher scanner" }}</span>
          <strong class="scan-title">{{ view?.voucher.title || "Loading…" }}</strong>
        </div>
        <span v-if="view" class="scan-window" :class="{ early: view.early }">{{ windowLine }}</span>
      </header>

      <section class="scan-cam" aria-label="Camera">
        <video ref="video" muted playsinline aria-label="Camera view. Point it at the QR code on the person's voucher."></video>
        <div v-if="!view?.early" class="scan-reticle" aria-hidden="true"></div>
        <div v-if="view?.early" class="scan-cover">
          <p>This scanner opens at <strong>{{ clock(view.from) }}</strong>, 15 minutes before the voucher starts.</p>
        </div>
        <p v-else-if="camError" class="scan-cover"><span>{{ camError }}</span></p>

        <!-- No <transition>: it would add Vue's transition code to the entry every public page loads (D024). -->
        <div v-if="result" :key="result.at" class="scan-result" :class="result.kind" role="status" aria-live="assertive" data-result>
            <Avatar v-if="result.person" class="avatar scan-photo" :src="result.person.photo" :alt="result.person.name" />
            <span v-else class="scan-icon" aria-hidden="true">!</span>
            <strong v-if="result.person" class="scan-name">{{ result.person.name }}</strong>
            <span class="scan-what">{{ result.kind === "ok" ? "✓ " : "" }}{{ result.title }}</span>
            <span class="scan-line">{{ result.line }}</span>
        </div>
      </section>

      <form v-if="!view?.early" class="scan-type" @submit.prevent="submitTyped">
        <label for="scan-digits" class="visually-hidden">Type the 6-digit code</label>
        <input id="scan-digits" v-model="typed" type="text" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" autocomplete="off"
               placeholder="Type 6-digit code" />
        <button type="submit" class="btn btn-primary" :disabled="typed.replace(/\D/g, '').length !== 6 || sending">Check</button>
      </form>

      <section v-if="stats" class="scan-more" aria-labelledby="scan-stats-h">
        <p class="scan-scroll" aria-hidden="true">Scroll for figures and history</p>
        <h2 id="scan-stats-h" class="label">So far</h2>
        <dl class="scan-stats">
          <div><dt>Checked in</dt><dd class="tnum">{{ stats.checkedIn }}</dd></div>
          <div><dt>Opened their voucher</dt><dd class="tnum">{{ stats.opened }}</dd></div>
          <div><dt>Scanned</dt><dd class="tnum">{{ stats.scanned }}</dd></div>
          <div><dt>Not scanned yet</dt><dd class="tnum">{{ Math.max(0, stats.checkedIn - stats.scanned) }}</dd></div>
        </dl>
        <div class="scan-bar" role="img" :aria-label="`${pct(stats.scanned, stats.checkedIn)}% of people who checked in have been scanned`">
          <span class="bar-opened" :style="{ width: pct(stats.opened, stats.checkedIn) + '%' }"></span>
          <span class="bar-scanned" :style="{ width: pct(stats.scanned, stats.checkedIn) + '%' }"></span>
        </div>
        <p class="small muted" style="margin:0">
          {{ pct(stats.scanned, stats.checkedIn) }}% scanned, {{ pct(stats.opened, stats.checkedIn) }}% opened.
          <template v-if="stats.perPerson > 1">{{ stats.uses }} uses in all ({{ stats.perPerson }} each).</template>
        </p>

        <h2 class="label" style="margin-top:24px">Scanned</h2>
        <ul v-if="view.history.length" class="list scan-history" data-history>
          <li v-for="(h, i) in view.history" :key="i" class="list-row">
            <Avatar class="avatar" :src="h.photo" :alt="h.name" />
            <span class="scan-h-name"><strong>{{ h.name }}</strong><span v-if="stats.perPerson > 1" class="small muted">Use {{ h.use }}</span></span>
            <span class="small muted tnum">{{ clockS(h.at) }}</span>
          </li>
        </ul>
        <p v-else class="empty small">Nobody scanned yet.</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.scanpage { min-height: 100vh; min-height: 100dvh; background: #111; color: #f4f1ea; }
.scan-dead { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 24px; text-align: center; }
.scan-dead h1 { margin: 16px 0 0; }
.scan-dead p { margin: 0; color: #c9c4b8; max-width: 36ch; }
.wordmark b { color: var(--strap); }

.scan-top {
  position: sticky; top: 0; z-index: 3; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 16px; padding-top: calc(12px + env(safe-area-inset-top, 0px)); background: rgba(17, 17, 17, .92);
}
.scan-top-text { display: flex; flex-direction: column; min-width: 0; }
.scan-event { font-size: 13px; color: #b9b4a8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scan-title { font-size: 19px; line-height: 1.2; overflow-wrap: anywhere; }
.scan-window { flex: none; font-size: 13px; font-weight: 700; padding: 6px 10px; border-radius: 999px; background: #1f5132; color: #d7f5e1; }
.scan-window.early { background: #5a4513; color: #fbe9bf; }

.scan-cam { position: relative; height: calc(100vh - 140px); height: calc(100dvh - 140px); min-height: 320px; overflow: hidden; background: #000; }
.scan-cam video { width: 100%; height: 100%; object-fit: cover; display: block; }
.scan-reticle {
  position: absolute; left: 50%; top: 50%; width: min(64vw, 300px); aspect-ratio: 1; transform: translate(-50%, -50%);
  border: 3px solid var(--strap); border-radius: 18px; box-shadow: 0 0 0 100vmax rgba(0, 0, 0, .35);
}
.scan-cover { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; margin: 0; text-align: center; background: rgba(0, 0, 0, .7); font-size: 18px; }
.scan-cover p { margin: 0; max-width: 30ch; }

.scan-result {
  position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  padding: 24px; text-align: center; color: #fff;
}
.scan-result.ok { background: rgba(22, 112, 58, .96); }
.scan-result.used { background: rgba(176, 62, 31, .97); }
.scan-result.bad { background: rgba(70, 66, 60, .97); }
.scan-photo { width: 140px; height: 140px; border: 4px solid #fff; border-radius: 16px; }
.scan-icon { width: 96px; height: 96px; border-radius: 50%; border: 4px solid #fff; display: grid; place-items: center; font-size: 56px; font-weight: 800; }
.scan-name { font-size: 30px; line-height: 1.15; overflow-wrap: anywhere; }
.scan-what { font-size: 20px; font-weight: 700; }
.scan-line { font-size: 18px; max-width: 30ch; }
.scan-result { animation: scan-pop 90ms ease-out; }
@keyframes scan-pop { from { transform: scale(.96); } to { transform: none; } }
@media (prefers-reduced-motion: reduce) { .scan-result { animation: none; } }

.scan-type { display: flex; gap: 8px; padding: 12px 16px; background: #111; }
.scan-type input {
  flex: 1; min-width: 0; font-size: 18px; letter-spacing: .08em; padding: 12px 14px; border-radius: var(--radius);
  border: 1px solid #3a362f; background: #201e1a; color: #f4f1ea;
}
.scan-type .btn { width: auto; flex: none; }

.scan-more { padding: 8px 16px 48px; max-width: 640px; margin: 0 auto; }
.scan-more .label { color: #b9b4a8; }
.scan-scroll { text-align: center; font-size: 13px; color: #8d887d; margin: 0 0 16px; }
.scan-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 8px 0 12px; }
.scan-stats > div { background: #1d1b18; border: 1px solid #2f2c27; border-radius: 10px; padding: 12px 14px; }
.scan-stats dt { font-size: 13px; color: #b9b4a8; }
.scan-stats dd { margin: 2px 0 0; font-size: 30px; font-weight: 800; line-height: 1.1; }
.scan-bar { position: relative; height: 10px; border-radius: 5px; background: #2f2c27; overflow: hidden; margin-bottom: 8px; }
.scan-bar span { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 5px; }
.bar-opened { background: #6b675f; }
.bar-scanned { background: #3fae6a; }
.scan-more .muted { color: #a29d92; }
.scan-history { list-style: none; padding: 0; margin: 8px 0 0; }
.scan-history .list-row { background: #1d1b18; border-color: #2f2c27; color: #f4f1ea; }
.scan-h-name { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.scan-h-name strong { overflow-wrap: anywhere; }
.scan-more .empty { color: #a29d92; }
</style>
