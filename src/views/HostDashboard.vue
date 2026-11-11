<script setup>
// Host portal home (F10): sign in with an email code, then details, Host Terms
// and "under my own name or an organisation" (HostSetup and the org step
// below), then events. The step shown is the one the server says, so a refresh
// or another device resumes in the right place; Back only shows an earlier
// saved step. Sign out is in the header on every step.
import { computed, onMounted, ref } from "vue";
import { HostApi, hostSignOutAndReload } from "../lib/hostapi";
import { MAIN_ORIGIN } from "../lib/site";
import { useRouter } from "vue-router";
import { pendingHostCode, clearPendingHostCode } from "../lib/hostredeem";
import HostSetup from "../components/HostSetup.vue";
import FeedbackEditor from "../components/FeedbackEditor.vue";
import UiSelect from "../components/ui/UiSelect.vue";
import EventPreview from "../components/EventPreview.vue";
import { THEME_OPTIONS, createBody, eventFromBody } from "../lib/eventform";
import { UiCombobox } from "../components/ui/UiSelect.vue";
import UiDateTimePicker from "../components/ui/UiDateTimePicker.vue";
import { defaultEnd } from "../lib/dates";

// loading | email | code (signed out) | details | terms | org (setup) | ready
const view = ref("loading");
const serverStep = ref(null);
const org = ref(null);
const account = ref(null);
const pendingTransfers = ref([]);
const limits = ref({ freePerWeek: 0, freeLeftThisWeek: 0, checkinCap: 300 });
const credits = ref({ granted: 0, used: 0, remaining: 0, nextExpiry: null });
const events = ref([]);
const creating = ref(false);
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

const blankForm = () => ({
  from: "", name: "", venue: "", startsAt: null, endsAt: null, theme: "default", strapColor: "",
  perksText: "", directoryOn: true, q1: "", q2: "",
  rsvpCount: "", access: "", food: "", feedbackOn: true, feedbackQuestions: [],
});
const f = ref(blankForm());
const FROM_OPTIONS = computed(() => [{ value: "", label: "A blank event" }, ...events.value.map((e) => ({ value: e.id, label: `A copy of ${e.name}` }))]);
// What attendees will see, from the form (F18). An empty name shows a stand-in so the preview is not blank.
const previewEvent = computed(() => {
  const e = eventFromBody(createBody(f.value));
  return e.name ? e : { ...e, name: "Your event name" };
});

const router = useRouter();
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
    events.value = d.events || [];
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
  import("../data/institutions-uk.json")
    .then((m) => { institutions.value = (m.default || m).institutions; })
    .catch(() => { institutionsLoading = false; });
}
const institutionOptions = computed(() => institutions.value.map((i) => ({ value: i.id, label: i.name, aliases: i.aliases })));
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
async function acceptTransfer(t) {
  error.value = "";
  try { await HostApi.hostAcceptTransfer(t.id); await load(); }
  catch (e) { error.value = e.message; }
}
async function declineTransfer(t) {
  error.value = "";
  try { await HostApi.hostDeclineTransfer(t.id); await load(); }
  catch (e) { error.value = e.message; }
}

const canCreate = computed(() => org.value?.status === "approved");
const freeNow = computed(() => org.value?.type === "society" && limits.value.freeLeftThisWeek > 0);

async function create() {
  error.value = "";
  busy.value = true;
  try {
    let res;
    if (f.value.from) {
      // Start from a past event: the server copies its details, questions, form and sponsors.
      res = await HostApi.hostDuplicateEvent(f.value.from, {
        name: f.value.name.trim() || undefined,
        startsAt: f.value.startsAt, endsAt: f.value.endsAt,
      });
    } else {
      if (!f.value.name.trim()) { error.value = "Event name is required."; return; }
      res = await HostApi.hostCreateEvent(createBody(f.value));
    }
    createdCode.value = res.code;
    creating.value = false;
    f.value = blankForm();
    await load();
  } catch (e) {
    error.value = e.message;
    if (e.code === "no_credits") error.value = e.message;
  } finally {
    busy.value = false;
  }
}

const fmtDate = (t) => (t ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
</script>

<template>
  <div class="wide-col stack-3" style="max-width:760px">
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

    <p v-if="view === 'loading'" class="muted">Loading…</p>
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
            <button class="btn btn-primary" @click="acceptTransfer(t)">Accept</button>
            <button class="btn" @click="declineTransfer(t)">Decline</button>
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
        <button class="btn" style="width:auto" :disabled="!canCreate" @click="creating = !creating">New event</button>
      </div>

      <EventPreview v-if="creating" v-model:theme="f.theme" v-model:strap-color="f.strapColor" :event="previewEvent" :off="!!f.from">
      <div class="panel stack-2">
        <h2>Create event</h2>
        <div v-if="events.length" class="field"><label id="ev-from-l">Start from</label>
          <UiSelect id="ev-from" v-model="f.from" labelledby="ev-from-l" :options="FROM_OPTIONS" />
          <span v-if="f.from" class="small muted">Copies the venue, perks, questions, feedback form and sponsors. Change anything afterwards under Details.</span>
        </div>
        <div class="field"><label for="ev-name">Event name</label>
          <input id="ev-name" v-model="f.name" type="text" :placeholder="f.from ? 'Same name as before' : 'Spring networking night'" /></div>
        <div class="field"><label id="ev-start-l">Starts (optional)</label>
          <UiDateTimePicker id="ev-start" v-model="f.startsAt" labelledby="ev-start-l" clearable /></div>
        <div class="field"><label id="ev-end-l">Ends (optional)</label>
          <UiDateTimePicker id="ev-end" v-model="f.endsAt" labelledby="ev-end-l" clearable :min="f.startsAt" :suggest="f.startsAt ? defaultEnd(f.startsAt) : null" />
          <span class="small muted">Feedback opens when the event ends. Without an end time it opens 3 hours after the start, or when you press End event.</span></div>
        <template v-if="!f.from">
        <div class="field"><label for="ev-venue">Venue</label>
          <input id="ev-venue" v-model="f.venue" type="text" /></div>
        <div class="field"><label id="ev-theme-l">Theme</label>
          <UiSelect id="ev-theme" v-model="f.theme" labelledby="ev-theme-l" :options="THEME_OPTIONS" />
        </div>
        <div class="field"><label for="ev-strap">Brand colour (optional)</label>
          <div class="row">
            <input id="ev-strap" type="color" :value="f.strapColor || '#d9502b'" style="width:56px;height:44px;padding:2px;flex:none" @input="f.strapColor = $event.target.value" />
            <span class="small muted" style="flex:1">{{ f.strapColor || "Using the theme colour" }}</span>
            <button v-if="f.strapColor" class="btn" style="width:auto;flex:none" type="button" @click="f.strapColor = ''">Reset</button>
          </div>
          <span class="small muted">Colours the strap at the top of the check-in page.</span></div>
        <div class="field"><label for="ev-perks">Perks — one per line</label>
          <textarea id="ev-perks" v-model="f.perksText" placeholder="Free coffee&#10;Raffle entry"></textarea></div>
        <div class="field"><label for="ev-access">Access info for attendees (optional)</label>
          <input id="ev-access" v-model="f.access" type="text" maxlength="200" placeholder="Step-free entrance at the side door" /></div>
        <div class="field"><label for="ev-food">Food and drink (optional)</label>
          <input id="ev-food" v-model="f.food" type="text" maxlength="200" /></div>
        <div class="field"><label for="ev-rsvp">Sign-ups so far (optional)</label>
          <input id="ev-rsvp" v-model="f.rsvpCount" type="number" min="0" inputmode="numeric" />
          <span class="small muted">From Luma or the Union site. A number only; the report shows turnout.</span></div>
        <div class="field"><label for="ev-q1">Check-in question 1 (optional)</label>
          <input id="ev-q1" v-model="f.q1" type="text" placeholder="Course" /></div>
        <div class="field"><label for="ev-q2">Check-in question 2 (optional)</label>
          <input id="ev-q2" v-model="f.q2" type="text" placeholder="What are you looking for?" /></div>
        <label class="checkbox-row">
          <input type="checkbox" v-model="f.directoryOn" />
          <span class="small">Show the live attendee room to checked-in people</span>
        </label>
        <label class="checkbox-row">
          <input type="checkbox" v-model="f.feedbackOn" />
          <span class="small">Ask attendees for anonymous feedback after the event</span>
        </label>
        <FeedbackEditor v-if="f.feedbackOn" v-model="f.feedbackQuestions" />
        </template>
        <p v-if="error" class="error-text">
          {{ error }}
          <router-link v-if="credits.remaining <= 0" to="/billing" style="text-decoration:underline">Buy credits</router-link>
        </p>
        <button class="btn btn-primary" :disabled="busy" @click="create">
          {{ busy ? "Creating…" : (f.from ? "Create the copy" : "Create event") + (freeNow ? " (free this week)" : " (uses 1 credit)") }}
        </button>
      </div>
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
      <div v-else class="list">
        <router-link
          v-for="e in events"
          :key="e.id"
          :to="`/events/${e.id}`"
          class="list-row spread"
        >
          <span>
            <strong>{{ e.name }}</strong>
            <span class="small muted" style="display:block">
              <span class="tnum">{{ e.code }}</span>{{ e.venue ? " · " + e.venue : "" }}{{ e.startsAt ? " · " + fmtDate(e.startsAt) : "" }}
            </span>
          </span>
          <span class="label">{{ e.ended ? "Report ›" : "Live ›" }}</span>
        </router-link>
      </div>
    </template>
  </div>
</template>
