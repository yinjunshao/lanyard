<script setup>
// One event, four tabs: the live poster and counts, its details, the feedback
// form and results, and the post-event report (with CSV download).
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { HostApi } from "../lib/hostapi";
import { joinUrl as joinLink, feedbackUrl as feedbackLink } from "../lib/checkinlink";
import { drawQR } from "../lib/qr";
import FeedbackEditor from "../components/FeedbackEditor.vue";
import FeedbackResults from "../components/FeedbackResults.vue";
import FeedbackSummary from "../components/FeedbackSummary.vue";
import { fmtDateTime } from "../lib/time";
import UiDateTimePicker from "../components/ui/UiDateTimePicker.vue";
import UiSelect from "../components/ui/UiSelect.vue";
import EventPreview from "../components/EventPreview.vue";
import EventCollects from "../components/EventCollects.vue";
import HostAttendees from "../components/HostAttendees.vue";
import HostDrops from "../components/HostDrops.vue";
import { THEME_OPTIONS, detailsBody, eventFromBody } from "../lib/eventform";
import { defaultEnd } from "../lib/dates";
import { cleanWhy, whyProblem } from "../lib/collects";

const route = useRoute();
const id = computed(() => route.params.id);
const tab = ref("live");
const live = ref(null);
const report = ref(null);
const reportLoading = ref(false);
const error = ref("");
const qrCanvas = ref(null);
let timer = null;

// Attendees check in and give feedback on the main site, not the host portal (F10).
// The same address the Present page and the poster use (lib/checkinlink.js).
const joinUrl = () => (live.value ? joinLink(live.value.event.code) : "");
const feedbackUrl = () => (live.value ? feedbackLink(live.value.event.code) : "");
const signedOut = ref(false);

onMounted(async () => {
  try {
    live.value = await HostApi.hostLive(id.value);
    fillDetails();
    await nextTick(); // the canvas is drawn into the page once `live` has rendered it
    await renderQr();
    timer = setInterval(refresh, 5000);
  } catch (e) {
    if (e.code === "signed_out" || e.code === "details_required" || e.code === "terms_required") signedOut.value = true;
    else error.value = e.message;
  }
});
onBeforeUnmount(() => clearInterval(timer));

async function refresh() {
  if (document.hidden || tab.value !== "live") return; // don't poll a hidden tab
  try { live.value = await HostApi.hostLive(id.value); } catch {}
}
async function renderQr() {
  if (qrCanvas.value) await drawQR(qrCanvas.value, joinUrl(), 320);
}
async function show(t) {
  tab.value = t;
  if (t === "live") { await Promise.resolve(); await renderQr(); refresh(); }
  if (t === "report") loadReport();
  if (t === "feedback") loadFeedback();
}
async function loadReport() {
  reportLoading.value = true;
  try { report.value = await HostApi.hostReport(id.value); }
  catch (e) { error.value = e.message; }
  finally { reportLoading.value = false; }
}
function printPage() { window.print(); }

// ---- Live: rotate code, end event ----
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
    await HostApi.hostRotateEventCode(id.value);
    live.value = await HostApi.hostLive(id.value);
    await renderQr();
  } catch (e) {
    error.value = e.message;
  } finally {
    rotating.value = false;
    confirmRotate.value = false;
  }
}
const confirmEnd = ref(false);
const ending = ref(false);
async function endEvent() {
  if (!confirmEnd.value) {
    confirmEnd.value = true;
    setTimeout(() => (confirmEnd.value = false), 4000);
    return;
  }
  ending.value = true;
  try {
    await HostApi.hostEndEvent(id.value);
    live.value = await HostApi.hostLive(id.value);
  } catch (e) {
    error.value = e.message;
  } finally {
    ending.value = false;
    confirmEnd.value = false;
  }
}

// ---- Details ----
const d = ref({});
const detailsMsg = ref("");
const detailsErr = ref("");
function fillDetails() {
  const e = live.value.event;
  d.value = {
    name: e.name, venue: e.venue || "",
    startsAt: e.startsAt || null, endsAt: e.endsAt || null,
    rsvpCount: e.rsvpCount ?? "",
    access: e.info?.access || "", dress: e.info?.dress || "", food: e.info?.food || "", other: e.info?.other || "",
    theme: e.theme || "default", strapColor: e.strapColor || "", perksText: (e.perks || []).join("\n"), directoryOn: e.directoryOn !== false,
    // F31: what the event collects (the live route sends it only when the list is on).
    collectWas: !!e.collect, collectOn: !!e.collect, collectEmail: !!e.collect?.items?.includes("email"),
    collectCard: !!e.collect?.items?.includes("card"), collectWhy: e.collect?.why || "",
  };
}
// The notice shows the organisation's name, which the live route gives only for an event that has the list on.
// For one that is switching it on now it is read once from the host's own account.
const organiser = ref("");
watch(() => d.value.collectOn, async (on) => {
  if (!on || organiser.value || live.value?.event?.collect?.organiser) return;
  try { organiser.value = (await HostApi.hostMe()).org?.name || ""; } catch { /* the preview says "The organisers" */ }
});
const collectErrors = computed(() => {
  const w = d.value.collectOn ? whyProblem(cleanWhy(d.value.collectWhy)) : "";
  return w ? { collectWhy: w } : {};
});
// What attendees will see on the check-in page, from the form as it stands (F18).
const previewEvent = computed(() => {
  const e = eventFromBody(detailsBody(d.value), live.value?.event?.questions || [], live.value?.event?.collect?.organiser || organiser.value);
  return { ...e, name: e.name || "Your event name" };
});
async function saveDetails() {
  detailsMsg.value = ""; detailsErr.value = "";
  if (Object.keys(collectErrors.value).length) { detailsErr.value = collectErrors.value.collectWhy; return; }
  try {
    await HostApi.hostUpdateEvent(id.value, detailsBody(d.value));
    live.value = await HostApi.hostLive(id.value);
    d.value = { ...d.value, collectWas: d.value.collectOn };
    detailsMsg.value = "Saved.";
  } catch (e) {
    detailsErr.value = e.message;
  }
}
const dupName = ref("");
const dupBusy = ref(false);
async function duplicate() {
  detailsErr.value = "";
  dupBusy.value = true;
  try {
    const r = await HostApi.hostDuplicateEvent(id.value, { name: dupName.value.trim() || undefined });
    location.assign(`/events/${r.id}`); // a fresh page for the new event
  } catch (e) {
    detailsErr.value = e.code === "no_credits" ? "You're out of event credits. Buy more from Billing." : e.message;
  } finally {
    dupBusy.value = false;
  }
}

// ---- Feedback ----
const fb = ref(null);
const fbQuestions = ref([]);
const fbMsg = ref("");
const fbErr = ref("");
const copied = ref(false);
async function loadFeedback() {
  try {
    fb.value = await HostApi.hostFeedback(id.value);
    fbQuestions.value = fb.value.questions.map((q) => ({ ...q, options: q.options ? [...q.options] : undefined }));
  } catch (e) {
    fbErr.value = e.message;
  }
}
async function saveFeedback() {
  fbMsg.value = ""; fbErr.value = "";
  try {
    await HostApi.hostSaveFeedback(id.value, { questions: fbQuestions.value });
    await loadFeedback();
    fbMsg.value = "Saved.";
  } catch (e) {
    fbErr.value = e.message;
  }
}
async function setFeedbackOn(on) {
  fbErr.value = "";
  try { await HostApi.hostSaveFeedback(id.value, { on }); await loadFeedback(); }
  catch (e) { fbErr.value = e.message; }
}
async function copyFeedbackLink() {
  try { await navigator.clipboard.writeText(feedbackUrl()); copied.value = true; setTimeout(() => (copied.value = false), 1600); } catch {}
}
</script>

<template>
  <div class="wide-col stack-3" style="max-width:860px">
    <router-link to="/" class="small muted back">‹ Dashboard</router-link>

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <div v-if="signedOut" class="notice">Sign in to the host portal to see this event. <router-link to="/" style="text-decoration:underline">Go to the host portal</router-link></div>
    <template v-if="live">
      <div>
        <span class="label tnum">Check-in code {{ live.event.code }}</span>
        <h1>{{ live.event.name }}</h1>
        <p class="sub muted">
          <span v-if="live.event.venue">{{ live.event.venue }}</span>
          <span v-if="live.event.startsAt"> · {{ fmtDateTime(live.event.startsAt) }}</span>
          <span v-if="live.event.endedAt" class="status-pill" style="margin-left:8px">Ended</span>
        </p>
      </div>

      <div class="seg host-tabs" role="tablist" aria-label="Event">
        <button v-for="t in [['live','Live'],['details','Details'],['drops','Drops'],['feedback','Feedback'],['report','Report']]" :key="t[0]"
                type="button" role="tab" class="seg-btn" :class="{ on: tab === t[0] }" :aria-selected="tab === t[0]"
                @click="show(t[0])">{{ t[1] }}</button>
      </div>

      <!-- Live -->
      <div v-show="tab === 'live'" class="event-live-grid" role="tabpanel">
        <div class="panel stack" style="text-align:center">
          <span class="label">Scan to check in</span>
          <div class="poster-qr"><canvas ref="qrCanvas" role="img" aria-label="Event check-in QR code. Scan it to join this event."></canvas></div>
          <div class="code-glyph tnum" style="font-size:26px;letter-spacing:.3em">{{ live.event.code }}</div>
          <div class="btn-row present-row">
            <a class="btn" :href="`/events/${id}/present`" target="_blank" rel="noopener">Present</a>
            <router-link class="btn" :to="`/events/${id}/print`">Print poster</router-link>
          </div>
          <p class="small muted" style="margin:0">Present fills a screen or projector with the QR and the code. Print poster makes one A4 page.</p>
          <button class="btn" :disabled="rotating" @click="rotateCode">
            {{ confirmRotate ? "Tap again: the old poster stops working" : "New check-in code" }}
          </button>
        </div>

        <div class="panel stack-2">
          <div class="stat"><span class="stat-n tnum">{{ live.checkins }}</span><span class="label">Checked in</span></div>
          <div v-if="live.event.rsvpCount" class="stat"><span class="stat-n tnum">{{ live.event.rsvpCount }}</span><span class="label">Signed up</span></div>
          <div class="stat"><span class="stat-n tnum">{{ live.connections }}</span><span class="label">Connections</span></div>
          <div class="stat"><span class="stat-n tnum">{{ live.selfies }}</span><span class="label">Selfies</span></div>
          <div v-if="live.presenceUsed" class="stat"><span class="stat-n tnum">{{ live.presenceUsed }}</span><span class="label">Used Be easy to find</span></div>
          <div class="stat"><span class="stat-n tnum">{{ live.feedback }}</span><span class="label">Feedback</span></div>
          <p v-if="live.overCap" class="notice small">
            Over {{ live.cap }} check-ins. Nobody is turned away, but events this size
            use a second credit. Ask us if you run big events regularly.
          </p>
          <template v-if="!live.event.endedAt">
            <button class="btn" :disabled="ending" @click="endEvent">
              {{ confirmEnd ? "Tap again to end the event" : "End event" }}
            </button>
            <p class="small muted" style="margin:0">
              {{ live.event.feedbackOn ? "Ending opens the feedback form for everyone who checked in." : "Feedback is off for this event." }}
            </p>
          </template>
          <p v-else class="small muted" style="margin:0">Ended {{ fmtDateTime(live.event.endedAt) }}. Feedback is open for a week.</p>
          <p class="small muted" style="margin:0">{{ live.event.collect ? "Counts only, apart from the list of who checked in below. You never see who connected with whom." : "Aggregate only. You never see who connected with whom." }}</p>
        </div>
      </div>

      <!-- Who checked in (F31): only for an event whose host switched the list on. -->
      <HostAttendees v-if="tab === 'live' && live.event.collect" :event-id="id" :checkins="live.checkins" />

      <!-- Drops (F32): keys, codes and vouchers for the people who checked in. -->
      <HostDrops v-if="tab === 'drops'" :event-id="id" role="tabpanel" />

      <!-- Details -->
      <EventPreview v-if="tab === 'details'" v-model:theme="d.theme" v-model:strap-color="d.strapColor" :event="previewEvent" :sponsors="live.sponsors || []">
      <form class="panel stack-2" role="tabpanel" @submit.prevent="saveDetails">
        <div class="field"><label for="d-name">Event name</label><input id="d-name" v-model="d.name" type="text" maxlength="120" /></div>
        <div class="field"><label for="d-venue">Venue</label><input id="d-venue" v-model="d.venue" type="text" maxlength="120" /></div>
        <div class="two-col">
          <div class="field"><label id="d-start-l">Starts</label><UiDateTimePicker id="d-start" v-model="d.startsAt" labelledby="d-start-l" clearable /></div>
          <div class="field"><label id="d-end-l">Ends</label><UiDateTimePicker id="d-end" v-model="d.endsAt" labelledby="d-end-l" clearable :min="d.startsAt" :suggest="d.startsAt ? defaultEnd(d.startsAt) : null" /></div>
        </div>
        <div class="field">
          <label for="d-rsvp">Sign-ups (from Luma, the Union site, etc.)</label>
          <input id="d-rsvp" v-model="d.rsvpCount" type="number" min="0" inputmode="numeric" />
          <span class="small muted">A number only. The report compares it with check-ins.</span>
        </div>
        <div class="field"><label id="d-theme-l">Theme</label>
          <UiSelect id="d-theme" v-model="d.theme" labelledby="d-theme-l" :options="THEME_OPTIONS" /></div>
        <div class="field"><label for="d-strap">Brand colour (optional)</label>
          <div class="row">
            <input id="d-strap" type="color" :value="d.strapColor || '#d9502b'" style="width:56px;height:44px;padding:2px;flex:none" @input="d.strapColor = $event.target.value" />
            <span class="small muted" style="flex:1">{{ d.strapColor || "Using the theme colour" }}</span>
            <button v-if="d.strapColor" class="btn" style="width:auto;flex:none" type="button" @click="d.strapColor = ''">Reset</button>
          </div>
        </div>
        <div class="field"><label for="d-perks">Perks (one per line)</label>
          <textarea id="d-perks" v-model="d.perksText" placeholder="Free coffee&#10;Raffle entry"></textarea></div>
        <label class="checkbox-row">
          <input type="checkbox" v-model="d.directoryOn" />
          <span class="small">Show the live attendee room to checked-in people</span>
        </label>
        <EventCollects :form="d" :errors="collectErrors" :was-on="d.collectWas" />
        <span class="label">Shown to attendees</span>
        <div class="field"><label for="d-access">Access</label><input id="d-access" v-model="d.access" type="text" maxlength="200" placeholder="Step-free entrance at the side door" /></div>
        <div class="field"><label for="d-food">Food and drink</label><input id="d-food" v-model="d.food" type="text" maxlength="200" placeholder="Pizza, vegan options, soft drinks" /></div>
        <div class="field"><label for="d-dress">Dress code</label><input id="d-dress" v-model="d.dress" type="text" maxlength="200" /></div>
        <div class="field"><label for="d-other">Good to know</label><input id="d-other" v-model="d.other" type="text" maxlength="200" placeholder="Quiet room in 106" /></div>
        <p v-if="detailsErr" class="error-text" role="alert">{{ detailsErr }}</p>
        <p v-if="detailsMsg" class="success-text" role="status">{{ detailsMsg }}</p>
        <button class="btn btn-primary" type="submit">Save details</button>

        <div class="stack dup">
          <span class="label">Run it again</span>
          <p class="small muted" style="margin:0">Copies the details, questions, feedback form and sponsors into a new event with a new code. Uses 1 credit.</p>
          <div class="row">
            <label for="dup-name" class="visually-hidden">Name for the copy</label>
            <input id="dup-name" v-model="dupName" type="text" maxlength="120" :placeholder="`${live.event.name} (next)`" style="flex:1" />
            <button type="button" class="btn" style="width:auto" :disabled="dupBusy" @click="duplicate">Duplicate</button>
          </div>
        </div>
      </form>
      </EventPreview>

      <!-- Feedback -->
      <div v-if="tab === 'feedback'" class="stack-3" role="tabpanel">
        <p v-if="!fb && !fbErr" class="muted">Loading…</p>
        <template v-if="fb">
          <div v-if="fb.results.responses > 0" class="panel stack-2">
            <FeedbackSummary :event-id="id" />
          </div>
          <div class="panel stack-2">
            <div class="spread">
              <h2>Feedback form</h2>
              <label class="checkbox-row" style="margin:0">
                <input type="checkbox" :checked="fb.on" @change="setFeedbackOn($event.target.checked)" />
                <span class="small">Ask attendees</span>
              </label>
            </div>
            <p class="small muted" style="margin:0">
              Everyone who checked in is asked after the event
              <template v-if="fb.opensAt">(from {{ fmtDateTime(fb.opensAt) }} for a week)</template>
              <template v-else>(when you press End event, or 2 hours after they check in)</template>.
              Answers are anonymous.
            </p>
            <template v-if="fb.on">
              <FeedbackEditor v-model="fbQuestions" :locked="fb.locked" :max="fb.maxQuestions" />
              <p v-if="fbErr" class="error-text" role="alert">{{ fbErr }}</p>
              <p v-if="fbMsg" class="success-text" role="status">{{ fbMsg }}</p>
              <button v-if="!fb.locked" class="btn btn-primary" @click="saveFeedback">Save questions</button>
              <div class="stack">
                <span class="label">Share the form</span>
                <p class="small muted" style="margin:0">Paste this into your Luma blast, group chat or slides. Only people who checked in can answer.</p>
                <div class="row">
                  <input :value="feedbackUrl()" readonly aria-label="Feedback link" style="flex:1" @focus="$event.target.select()" />
                  <button type="button" class="btn" style="width:auto" @click="copyFeedbackLink">{{ copied ? "Copied" : "Copy" }}</button>
                </div>
              </div>
            </template>
          </div>
          <div id="fs-answers" class="panel stack-2">
            <h2>Results</h2>
            <FeedbackResults :results="fb.results" />
          </div>
        </template>
        <p v-else-if="fbErr" class="error-text" role="alert">{{ fbErr }}</p>
      </div>

      <!-- Report -->
      <div v-if="tab === 'report'" class="panel stack-3" role="tabpanel">
        <p v-if="reportLoading && !report" class="muted">Building report…</p>
        <template v-if="report">
          <div class="spread">
            <h2>Post-event report</h2>
            <span class="small muted">{{ new Date(report.generatedAt).toLocaleString() }}</span>
          </div>
          <div class="btn-row no-print">
            <a class="btn" :href="HostApi.hostReportCsvUrl(id)" download>Download CSV</a>
            <a v-if="live.event.collect" class="btn" :href="HostApi.hostAttendeesCsvUrl(id)" download>Download attendee list (CSV)</a>
            <button class="btn" @click="printPage">Print or save as PDF</button>
          </div>
          <div class="report-stats">
            <div><strong class="tnum">{{ report.totals.checkins }}</strong><span class="label">Check-ins</span></div>
            <div v-if="report.rsvp"><strong class="tnum">{{ report.rsvp.turnout ?? "–" }}%</strong><span class="label">Turnout of {{ report.rsvp.count }} sign-ups</span></div>
            <div><strong class="tnum">{{ report.totals.connections }}</strong><span class="label">Connections</span></div>
            <div><strong class="tnum">{{ report.connectionsPerAttendee }}</strong><span class="label">Per attendee</span></div>
            <div><strong class="tnum">{{ report.totals.selfies }}</strong><span class="label">Selfies</span></div>
            <div v-if="report.totals.presence"><strong class="tnum">{{ report.totals.presence }}</strong><span class="label">Used Be easy to find</span></div>
            <div><strong class="tnum">{{ report.feedback.responses }}</strong><span class="label">Feedback</span></div>
          </div>
          <p class="notice small">{{ report.privacy.note }}</p>

          <div v-if="report.arrivals?.length" class="report-block">
            <span class="label">Arrivals by hour</span>
            <div class="chip-row"><span v-for="a in report.arrivals" :key="a.hour" class="chip muted tnum">{{ a.hour }} · {{ a.count }}</span></div>
          </div>
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
          <div v-if="report.feedback.responses > 0" class="report-block">
            <FeedbackSummary :event-id="id" />
          </div>
          <div id="fs-answers" class="report-block">
            <span class="label">Feedback</span>
            <FeedbackResults :results="report.feedback" />
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.host-tabs { align-self: flex-start; flex-wrap: wrap; }
.event-live-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
@media (min-width: 720px) { .event-live-grid { grid-template-columns: 1.1fr .9fr; } }
.poster-qr { border: var(--border-ink); border-radius: var(--radius); background: #fff; padding: 16px; display: flex; justify-content: center; }
.poster-qr canvas { width: 280px; height: 280px; }
.stat { display: flex; align-items: baseline; justify-content: space-between; border-bottom: var(--border); padding-bottom: 10px; }
.stat-n { font-size: 34px; font-weight: 700; }
.two-col { display: grid; grid-template-columns: 1fr; gap: 0 12px; }
@media (min-width: 560px) { .two-col { grid-template-columns: 1fr 1fr; } }
.dup { border-top: var(--border); padding-top: 16px; margin-top: 8px; }
.report-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; text-align: center; }
.report-stats div { border: var(--border); border-radius: var(--radius); padding: 14px; display: flex; flex-direction: column; gap: 4px; }
.report-stats strong { font-size: 30px; }
.report-block { display: flex; flex-direction: column; gap: 8px; }
@media print {
  .topbar, .strap-rail, .tabbar, .thumb-bar, .btn, .back, .host-tabs, .no-print { display: none !important; }
  .poster-qr canvas { width: 420px; height: 420px; }
}
</style>
