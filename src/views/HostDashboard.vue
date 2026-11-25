<script setup>
// Host portal home (F10): sign in with an email code, then details, Host Terms
// and "under my own name or an organisation" (HostSetup and the org step
// below), then events. The step shown is the one the server says, so a refresh
// or another device resumes in the right place; Back only shows an earlier
// saved step. Sign out is in the header on every step.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { HostApi, hostSignOutAndReload } from "../lib/hostapi";
import { MAIN_ORIGIN } from "../lib/site";
import { useRoute, useRouter } from "vue-router";
import { pendingHostCode, clearPendingHostCode } from "../lib/hostredeem";
import HostSetup from "../components/HostSetup.vue";
import Waiting from "../components/Waiting.vue";
import EventCreate from "../components/EventCreate.vue";
import EventPreview from "../components/EventPreview.vue";
import { collectBody, createBody, eventFromBody, previewBrand } from "../lib/eventform";
import { UiCombobox } from "../components/ui/UiSelect.vue";
import { blankForm, copyFacts, firstBadStep, formFromDraft, freshForm as freshFrom, serverErrorField, startFromEvent, startValues, stepFromQuery, submitPlan } from "../lib/eventsteps";
import { clearDraft, loadDraft, saveDraft } from "../lib/eventdraft";
import { useBusy } from "../components/Waiting.vue";
import { useEventClock } from "../lib/eventlive";
import { groupByStatus } from "../lib/eventtext";
import EventStatusChip from "../components/EventStatusChip.vue";
document.title = "Your events | Lanyard hosts";

// loading | email | code (signed out) | details | terms | org (setup) | ready
const view = ref("loading");
const serverStep = ref(null);
const org = ref(null);
const account = ref(null);
const pendingTransfers = ref([]);
const limits = ref({ freePerWeek: 0, freeLeftThisWeek: 0, checkinCap: 300 });
const credits = ref({ granted: 0, used: 0, remaining: 0, nextExpiry: null });
const events = ref([]);
const { setServerNow, statusOf } = useEventClock();
// F68: the same status rule as the attendees' Events tab. Live, Open and Report open the same page.
const ACTION = { ongoing: "Live ›", upcoming: "Open ›", ended: "Report ›" };
const groups = computed(() => {
  const g = groupByStatus(events.value.map((e) => ({ e, status: statusOf(e) })), (e) => e.startsAt);
  return [{ id: "now", title: "In progress", list: g.ongoing }, { id: "soon", title: "Upcoming", list: g.upcoming }, { id: "past", title: "Ended", list: g.ended }].filter((x) => x.list.length);
});
const error = ref("");
const busy = ref(false);
const createdCode = ref(null);
const signedIn = computed(() => !!serverStep.value);
const SETUP = ["email", "code", "details", "terms"];

// Every step has a way out: Sign out ends the host session on the server, so
// nothing about a half-finished setup survives on this browser.
const signOutError = ref("");
const signingOut = ref(false);
async function signOut() {
  signOutError.value = ""; signingOut.value = true;
  try { await hostSignOutAndReload("/"); }
  catch (e) { signOutError.value = e?.message || "Couldn't sign out. Check your connection and try again."; signingOut.value = false; }
}

const f = ref(blankForm());
// F64 (D056): a fresh form starts with the switches and "What this event collects" as on the organisation's latest
// event (the server's `eventDefaults`; the fixed defaults for a first event). A draft keeps its own values.
const eventDefaults = ref(null);
// F66: the organisation's branding settings, for step 2's "Use our company branding" switch and the preview.
const brand = ref(null);
const freshForm = () => freshFrom(eventDefaults.value);
// Where the seven settings came from, so the form and Review can say so: the last event, or the one started from.
const start = computed(() => (f.value.from
  ? (source.value?.event ? { values: startFromEvent(source.value.event), by: "copy" } : null)
  : { values: startValues(eventDefaults.value), by: "last" }));
const setStart = (form, values) => Object.assign(form, values);
const FROM_OPTIONS = computed(() => [{ value: "", label: "A blank event" }, ...events.value.map((e) => ({ value: e.id, label: `A copy of ${e.name}` }))]);

// What an earlier event brings when "Start from" is used (F30). Read from the host's own live route and only
// shown: Create still sends the name and times, and the server copies the rest.
const source = ref(null);
const sourceState = ref("ok"); // loading | error | ok
let sourceSeq = 0;
watch(() => [f.value, f.value.from], async ([form, id], prev) => {
  if (prev && prev[1] === id) return; // the same "Start from" in a form put in (a draft, a fresh form): nothing to read again
  // F64: the host changed "Start from" on this form (not a draft or a fresh form put in): the seven settings follow
  // the event chosen, or the latest event again for a blank one. Collects stay off until the chosen one is read.
  const picked = !!prev && prev[0] === form;
  const mine = ++sourceSeq;
  source.value = null;
  if (picked) setStart(form, startValues(id ? null : eventDefaults.value));
  if (!id) { sourceState.value = "ok"; return; }
  sourceState.value = "loading";
  try {
    const r = await HostApi.hostLive(id);
    if (mine === sourceSeq) { source.value = r; sourceState.value = "ok"; if (picked) setStart(form, startFromEvent(r.event)); }
  } catch { if (mine === sourceSeq) sourceState.value = "error"; }
}, { immediate: true });
const facts = computed(() => copyFacts(source.value));

// What attendees will see, from the form (F18). An empty name shows a stand-in so the preview is not blank.
const previewEvent = computed(() => {
  const s = f.value.from && source.value?.event;
  const e = s
    ? eventFromBody({ name: f.value.name.trim() || s.name, venue: s.venue, startsAt: f.value.startsAt, theme: s.theme, strapColor: s.strapColor, strapInk: s.strapInkChoice,
      perks: s.perks, directoryOn: s.directoryOn, suggestOn: s.suggestOn, info: s.info, feedbackOn: s.feedbackOn, collect: collectBody(f.value) }, s.questions, org.value?.name)
    : eventFromBody(createBody(f.value), undefined, org.value?.name);
  const b = previewBrand(brand.value, !freeNow.value, s ? events.value.find((x) => x.id === f.value.from)?.useBranding : f.value.useBranding); // F66: a copy keeps its event's switch
  return { ...e, ...(b ? { brand: b } : {}), name: e.name || "Your event name" };
});

const router = useRouter();
const route = useRoute();
onMounted(load);
async function load() {
  error.value = "";
  try {
    const d = await HostApi.hostMe();
    serverStep.value = d.step;
    account.value = d.account;
    org.value = d.org;
    pendingTransfers.value = d.pendingTransfers || [];
    if (d.limits) limits.value = d.limits;
    if (d.credits) credits.value = d.credits;
    setServerNow(d.now);
    events.value = d.events || [];
    eventDefaults.value = d.eventDefaults || null;
    brand.value = d.brand || null;
    if (d.step === "ready") loadDraftOnce();
    view.value = d.step;
    if (location.pathname === "/signin") history.replaceState(null, "", "/");
    // Came here from a promo-code link before signing in (F20): carry on to it once setup is done.
    const waiting = d.step === "ready" ? pendingHostCode() : null;
    if (waiting) { clearPendingHostCode(); router.replace(`/redeem/${waiting}`); } // once, so a code that fails cannot trap them
  } catch (e) {
    serverStep.value = null;
    if (e.code === "signed_out") view.value = "email";
    else { error.value = e.message; view.value = "error"; }
  }
}

// ----- first step: own name, or an organisation -----
const KINDS = [
  { value: "individual", label: "Under my own name", hint: "Run events as yourself. Standard prices." },
  { value: "society", label: "A student society", hint: "Free: 1 event a week, up to 200 check-ins each. Needs approval." },
  { value: "institution", label: "A university or educational institution", hint: "Discounted prices. Needs approval." },
  { value: "company", label: "A company or event organiser", hint: "Standard prices. Use your work email." },
];
const orgForm = ref({ kind: "individual", name: "", leaderName: "", orgLink: "", university: "", institutionId: null });
// The institution list is a separate chunk, fetched with a plain import() the
// first time the picker opens (D018). Typing your own works without it.
const institutions = ref([]);
let institutionsLoading = false;
function loadInstitutions() {
  if (institutionsLoading) return;
  institutionsLoading = true;
  import("../data/institutions.js")
    .then((m) => { institutions.value = m.default.institutions; institutionOptions.value = m.default.options; })
    .catch(() => { institutionsLoading = false; });
}
const institutionOptions = ref([]);
const customInstitution = (t) => `Not listed? Use ‘${t}’`;
const kindInfo = computed(() => KINDS.find((k) => k.value === orgForm.value.kind));
const needsApproval = computed(() => ["society", "institution"].includes(orgForm.value.kind));
const eduRe = /(^|\.)(ac|edu)\.[a-z]{2}$|\.edu$|\.sch\.uk$/;
const emailHint = computed(() => {
  const dom = (account.value?.email || "").split("@")[1] || "";
  const k = orgForm.value.kind;
  if ((k === "society" || k === "institution") && !eduRe.test(dom)) {
    return `${account.value?.email} isn't a university or school address. Societies and institutions need one (for example name@university.ac.uk).`;
  }
  return "";
});
async function createOrg() {
  error.value = "";
  busy.value = true;
  try {
    const o = orgForm.value;
    await HostApi.hostCreateOrg({
      kind: o.kind, name: o.name, leaderName: o.leaderName || account.value?.fullName,
      orgLink: o.orgLink, university: o.university, institutionId: o.institutionId,
    });
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
const { working, once } = useBusy();
const acceptTransfer = once(async (t) => {
  error.value = "";
  try { await HostApi.hostAcceptTransfer(t.id); await load(); }
  catch (e) { error.value = e.message; }
});
const declineTransfer = once(async (t) => {
  error.value = "";
  try { await HostApi.hostDeclineTransfer(t.id); await load(); }
  catch (e) { error.value = e.message; }
});

const canCreate = computed(() => org.value?.status === "approved");
const freeNow = computed(() => org.value?.type === "society" && limits.value.freeLeftThisWeek > 0);

// ----- Create event in steps (F30) -----
// The step is in the address (?step=N), so the browser's Back button moves between steps and a refresh
// stays put. The half-made form is kept in this tab's session storage, keyed to this host and
// organisation (lib/eventdraft.js); it is cleared on Create, Cancel and sign-out.
const step = computed(() => stepFromQuery(route.query.step));
const creating = computed(() => step.value > 0 && view.value === "ready" && canCreate.value);
const fieldError = ref(null);
const go = (n) => router.push({ query: { step: n } });
const leave = () => router.replace({ path: route.path, query: {} });

let draftFor = "";
const draftIds = () => [account.value?.email, org.value?.id];
function loadDraftOnce() {
  const key = draftIds().join(":");
  if (!org.value || draftFor === key) return;
  draftFor = key;
  const saved = loadDraft(...draftIds());
  const form = saved ? formFromDraft(saved) : freshForm(); // F64: only a fresh form takes the latest event's settings
  if (form.from && !events.value.some((e) => e.id === form.from)) form.from = ""; // that event is gone
  f.value = form;
}
const blank = JSON.stringify(blankForm());
watch(f, (form) => {
  if (!draftFor) return;
  // F64: a form still as it started (blank, or fresh with the latest event's settings) is not a draft, so the next visit starts fresh again.
  const now = JSON.stringify(form);
  if (now === blank || now === JSON.stringify(freshForm())) clearDraft(...draftIds()); else saveDraft(...draftIds(), form);
}, { deep: true });
function cancel() {
  clearDraft(...draftIds());
  f.value = freshForm();
  fieldError.value = null;
  error.value = "";
  leave();
}
// Someone who reaches a later step without finishing an earlier one (a link, a lost draft) is sent to
// the first step with a problem. (This is a convenience: the server checks everything again.)
watch([step, view, canCreate], () => {
  if (!step.value || view.value !== "ready") return;
  if (!canCreate.value) { leave(); return; }
  const bad = firstBadStep(step.value, f.value);
  if (bad) router.replace({ query: { step: bad } });
}, { immediate: true });

async function create() {
  error.value = "";
  fieldError.value = null;
  busy.value = true;
  try {
    // The same two requests the single form made (lib/eventsteps.js: submitPlan).
    const plan = submitPlan(f.value);
    const res = plan.copy ? await HostApi.hostDuplicateEvent(plan.from, plan.body) : await HostApi.hostCreateEvent(plan.body);
    createdCode.value = res.code;
    clearDraft(...draftIds());
    f.value = blankForm();
    leave();
    await load();
    f.value = freshForm(); // F64: the next form starts from the event just made
  } catch (e) {
    // A refusal that belongs to one field takes the host back to that field's step.
    const hit = serverErrorField(e.message);
    if (hit) { fieldError.value = { ...hit, message: e.message }; go(hit.step); }
    else error.value = e.message;
  } finally {
    busy.value = false;
  }
}

const fmtDate = (t) => (t ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
</script>

<template>
  <div class="wide-col in-app stack-3" style="max-width:760px">
    <div class="page-head">
      <div class="host-head-row">
        <a :href="MAIN_ORIGIN" class="small muted">‹ Back to Lanyard</a>
        <button v-if="signedIn" type="button" class="link-btn small" :disabled="signingOut" @click="signOut">{{ signingOut ? "Signing out…" : "Sign out" }}</button>
      </div>
      <p v-if="signOutError" class="error-text small" role="alert">{{ signOutError }}</p>
      <h1 style="margin-top:8px"><img src="/host-icon.svg" alt="" style="width:32px;height:32px;vertical-align:-6px;margin-right:8px" />Host portal</h1>
      <p v-if="org && view === 'ready'" class="sub">{{ org.name }}</p>
      <p v-if="view === 'ready' || view === 'org'" class="small" style="margin-top:6px">
        <router-link to="/account">Account and team</router-link>
      </p>
    </div>

    <Waiting v-if="view === 'loading'" shape="panel" :rows="2" title label="Loading your events" :retry="load" />
    <p v-else-if="view === 'error'" class="error-text" role="alert">{{ error }} <button type="button" class="link-btn" @click="load">Try again</button></p>

    <HostSetup v-else-if="SETUP.includes(view)" :view="view" :account="account" @go="(v) => (view = v)" @reload="load" />

    <!-- Setup 3 of 3: your own name, an organisation, or a transfer waiting for you -->
    <template v-else-if="view === 'org'">
      <section v-if="pendingTransfers.length" class="panel stack-2">
        <h2>Waiting for you</h2>
        <div v-for="t in pendingTransfers" :key="t.id" class="notice stack">
          <span><strong>{{ t.orgName }}</strong> has been handed to you<span v-if="t.fromName"> by {{ t.fromName }}</span>.
            Accepting makes you its owner and sends its invoices to {{ account?.email }}.</span>
          <div class="btn-row">
            <button class="btn btn-primary" :disabled="!!working" @click="acceptTransfer(t)">{{ working === acceptTransfer ? "Accepting…" : "Accept" }}</button>
            <button class="btn" :disabled="!!working" @click="declineTransfer(t)">{{ working === declineTransfer ? "Declining…" : "Decline" }}</button>
          </div>
        </div>
      </section>

      <section class="panel stack-2" aria-labelledby="org-h">
        <button type="button" class="link-btn small" style="display:block;min-height:44px" @click="view = 'terms'">‹ Back</button>
        <span class="label" style="display:block">Step 3 of 3</span>
        <h2 id="org-h">Where will your events live?</h2>
        <p class="muted">Pick one. Each host account has a single organisation, and you can hand it to someone else later.</p>
        <div class="stack">
          <label v-for="k in KINDS" :key="k.value" class="checkbox-row field" style="align-items:flex-start">
            <input v-model="orgForm.kind" type="radio" name="org-kind" :value="k.value" />
            <span><strong>{{ k.label }}</strong><span class="small muted" style="display:block">{{ k.hint }}</span></span>
          </label>
        </div>

        <template v-if="orgForm.kind !== 'individual'">
          <div class="field"><label for="org-name">{{ orgForm.kind === 'society' ? 'Society name' : orgForm.kind === 'institution' ? 'Institution name' : 'Organisation name' }}</label>
            <input id="org-name" v-model="orgForm.name" type="text" maxlength="100" /></div>
        </template>
        <template v-if="needsApproval">
          <div class="field"><label for="org-leader">{{ orgForm.kind === 'society' ? "Society leader's full name" : 'Your full name' }}</label>
            <input id="org-leader" v-model="orgForm.leaderName" type="text" maxlength="80" :placeholder="account?.fullName" /></div>
          <div class="field"><label for="org-link">{{ orgForm.kind === 'society' ? 'Society link' : 'Institution website' }}</label>
            <input id="org-link" v-model="orgForm.orgLink" type="url" inputmode="url" placeholder="https://" />
            <span class="small muted">{{ orgForm.kind === 'society' ? 'Your union listing, website or social page, so we can check it exists.' : 'Your official website.' }}</span></div>
          <div v-if="orgForm.kind === 'society'" class="field"><label id="org-uni-l">University</label>
            <UiCombobox id="org-uni" v-model="orgForm.institutionId" v-model:text="orgForm.university" labelledby="org-uni-l" :options="institutionOptions"
                        allow-custom clearable placeholder="Search for your university" search-placeholder="Type a name or short name"
                        :custom-label="customInstitution" @open="loadInstitutions" /></div>
          <p class="small muted" style="margin:0">
            The leader's email and the person billed is <strong>{{ account?.email }}</strong>, the email on your host account.
            An admin checks every application before events can be created.
          </p>
        </template>
        <p v-if="emailHint" class="notice small">{{ emailHint }}</p>
        <p class="small muted" style="margin:0">Joining a colleague's organisation instead? <router-link to="/account#join" style="text-decoration:underline">Use their invite code</router-link>.</p>
        <p v-if="error" class="error-text" role="alert">{{ error }}</p>
        <button class="btn btn-primary" :disabled="busy || !!emailHint" @click="createOrg">
          {{ busy ? "Saving…" : needsApproval ? "Send application" : orgForm.kind === 'individual' ? "Continue under my name" : "Create organisation" }}
        </button>
      </section>
    </template>

    <!-- Dashboard -->
    <template v-else>
      <div v-if="org && org.status === 'pending'" class="notice stack">
        <strong>Your application is being reviewed.</strong>
        <span class="small">We check every {{ org.type === 'society' ? 'society' : 'institution' }} by hand, usually within a couple of working days. You can create events as soon as it's approved.</span>
      </div>
      <div v-else-if="org && org.status === 'rejected'" class="notice stack">
        <strong>Your application wasn't approved.</strong>
        <span v-if="org.reviewNote" class="small">{{ org.reviewNote }}</span>
        <router-link to="/account" class="small" style="text-decoration:underline">Open a ticket if you think that's a mistake</router-link>
      </div>

      <div class="panel spread">
        <div v-if="org?.type === 'society'">
          <span class="label">Free events this week</span>
          <div class="tnum" style="font-size:28px;font-weight:700">{{ canCreate ? `${limits.freeLeftThisWeek} of ${limits.freePerWeek} left` : "Once approved" }}</div>
          <span class="small muted">Up to {{ limits.checkinCap }} check-ins each<span v-if="credits.remaining"> · {{ credits.remaining }} paid events banked</span></span>
        </div>
        <div v-else>
          <span class="label">Event credits</span>
          <div class="tnum" style="font-size:28px;font-weight:700">{{ credits.remaining }}</div>
          <span v-if="credits.nextExpiry" class="small muted">next expire {{ fmtDate(credits.nextExpiry) }}</span>
        </div>
        <router-link to="/billing" class="btn" style="width:auto">Billing</router-link>
      </div>

      <div class="spread">
        <span class="label">Your events</span>
        <button v-if="!creating" class="btn" style="width:auto" :disabled="!canCreate" @click="go(1)">New event</button>
      </div>

      <EventPreview v-if="creating" v-model:theme="f.theme" :event="previewEvent"
                    :sponsors="f.from ? (source?.sponsors || []) : []" :off="!!f.from && !source?.event" :strip="!f.from" :inline="step === 5">
        <EventCreate :form="f" :step="step" :from-options="FROM_OPTIONS" :has-events="events.length > 0" :facts="facts" :facts-state="sourceState"
                     :busy="busy" :error="error" :server-error="fieldError" :needs-credits="!freeNow" :start="start" :look="{ brand, paid: !freeNow }"
                     :create-label="(f.from ? 'Create the copy' : 'Create event') + (freeNow ? ' (free this week)' : ' (uses 1 credit)')"
                     @go="go" @create="create" @cancel="cancel">
          <template #error-extra><router-link v-if="credits.remaining <= 0" to="/billing" style="text-decoration:underline">Buy credits</router-link></template>
        </EventCreate>
      </EventPreview>

      <div v-if="createdCode" class="notice success-text">
        Event created — join code <strong class="tnum">{{ createdCode }}</strong>.
        Open it below to display the check-in QR.
      </div>
      <p v-if="error && !creating" class="error-text">{{ error }}</p>

      <div v-if="!events.length" class="empty">
        <span class="label">No events yet</span>
        <p>Create your first event and display its QR at the door.</p>
      </div>
      <template v-else>
        <section v-for="g in groups" :key="g.id" class="stack" :aria-labelledby="`host-events-${g.id}`">
          <h2 :id="`host-events-${g.id}`" class="label">{{ g.title }}</h2>
          <div class="list">
            <router-link v-for="{ e, status } in g.list" :key="e.id" :to="`/events/${e.id}`" class="list-row spread">
              <span style="min-width:0">
                <strong>{{ e.name }}</strong>
                <span class="small muted" style="display:block">
                  <span class="tnum">{{ e.code }}</span>{{ e.venue ? " · " + e.venue : "" }}{{ e.startsAt ? " · " + fmtDate(e.startsAt) : "" }}
                </span>
              </span>
              <span class="event-side">
                <EventStatusChip :status="status" />
                <span class="label">{{ ACTION[status] }}</span>
              </span>
            </router-link>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.event-side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex: none; }
</style>
