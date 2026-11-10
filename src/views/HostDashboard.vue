<script setup>
// Host portal home: a host account (passkey + name + email) -> an organisation
// or events under your own name -> events.
import { computed, onMounted, ref } from "vue";
import { Api } from "../lib/api";
import { me, refreshMe, signOutAndReload } from "../lib/store";
import { registerPasskey, loginPasskey } from "../lib/passkeys";
import { ON_HOST_SITE, MAIN_ORIGIN } from "../lib/site";
import FeedbackEditor from "../components/FeedbackEditor.vue";
import UiSelect from "../components/ui/UiSelect.vue";
import UiDateTimePicker from "../components/ui/UiDateTimePicker.vue";
import { defaultEnd } from "../lib/dates";

const state = ref("loading"); // loading | account | terms | profile | welcome | ready
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

const accountError = ref("");

// Every step has a way out: a half-finished setup is remembered by the session
// cookie, so leaving the page is not enough. Sign out clears it.
const signOutError = ref("");
const signingOut = ref(false);
async function signOut() {
  signOutError.value = ""; signingOut.value = true;
  try { await signOutAndReload(ON_HOST_SITE ? "/host" : "/hosts"); }
  catch (e) { signOutError.value = e?.message || "Couldn't sign out. Check your connection and try again."; signingOut.value = false; }
}

const blankForm = () => ({
  from: "", name: "", venue: "", startsAt: null, endsAt: null, theme: "default",
  perksText: "", directoryOn: true, q1: "", q2: "",
  rsvpCount: "", access: "", food: "", feedbackOn: true, feedbackQuestions: [],
});
const f = ref(blankForm());

onMounted(load);
async function load() {
  try {
    const d = await Api.hostMe();
    org.value = d.org;
    account.value = d.account;
    pendingTransfers.value = d.pendingTransfers || [];
    limits.value = d.limits;
    credits.value = d.credits;
    events.value = d.events;
    state.value = d.org ? "ready" : "welcome";
  } catch (e) {
    if (e.code === "account_required") state.value = "account";
    else if (e.code === "terms_required") state.value = "terms";
    else if (e.code === "profile_required") { det.value.fullName ||= me.profile?.name || ""; state.value = "profile"; }
    else { error.value = e.message; state.value = "ready"; }
  }
}

// ----- host account: name, email, short survey, terms -----
const hostAgreed = ref(false);
const needAgree = "Please agree to the Host Terms and Privacy Policy first.";
const det = ref({ fullName: "", email: "", useCase: "", frequency: "", size: "", referral: "" });
const FREQUENCIES = ["One-off event", "A few times a year", "About once a month", "Weekly or more"];
const SIZES = ["Under 50 people", "50 to 200", "200 to 1,000", "Over 1,000"];
const FROM_OPTIONS = computed(() => [{ value: "", label: "A blank event" }, ...events.value.map((e) => ({ value: e.id, label: `A copy of ${e.name}` }))]);
const SIZE_OPTIONS = [{ value: "", label: "Not sure yet" }, ...SIZES];
const THEME_OPTIONS = [
  { value: "default", label: "Default — Persimmon" },
  { value: "formal", label: "Formal — navy strap" },
  { value: "night", label: "Night — dark" },
];

function detailsProblem() {
  const d = det.value;
  if (d.fullName.trim().length < 2) return "Add your full name.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim())) return "Add an email address we can reach you on.";
  if (!d.useCase.trim()) return "Tell us what you plan to use Lanyard for.";
  if (!d.frequency) return "Tell us how often you run events.";
  return "";
}
function saveDetails() {
  const d = det.value;
  return Api.hostSignup({
    fullName: d.fullName.trim(), email: d.email.trim(),
    survey: { useCase: d.useCase, frequency: d.frequency, size: d.size, referral: d.referral },
  });
}
async function acceptHostTerms() {
  accountError.value = ""; busy.value = true;
  try { await Api.hostAcceptTerms(); await load(); }
  catch (e) { accountError.value = e.message; }
  finally { busy.value = false; }
}
async function createAccount() {
  accountError.value = "";
  const problem = detailsProblem();
  if (problem) { accountError.value = problem; return; }
  if (!hostAgreed.value) { accountError.value = needAgree; return; }
  busy.value = true;
  try {
    await registerPasskey();
    await Api.hostAcceptTerms();
    await saveDetails();
    await refreshMe();
    await load();
  } catch (e) {
    accountError.value = e?.message || "Passkey setup was cancelled.";
  } finally {
    busy.value = false;
  }
}
const recoveryKey = ref("");
async function createWithKey() {
  accountError.value = "";
  const problem = detailsProblem();
  if (problem) { accountError.value = problem; return; }
  if (!hostAgreed.value) { accountError.value = needAgree; return; }
  busy.value = true;
  try {
    recoveryKey.value = (await Api.recoveryCreate()).key;
    await Api.hostAcceptTerms();
    await saveDetails();
  } catch (e) {
    accountError.value = e?.message || "Couldn't create the key.";
  } finally { busy.value = false; }
}
// A host account that exists but never gave a name and email (made before
// they were asked for) finishes here.
async function finishProfile() {
  accountError.value = "";
  const problem = detailsProblem();
  if (problem) { accountError.value = problem; return; }
  busy.value = true;
  try { await saveDetails(); await load(); }
  catch (e) { accountError.value = e.message; }
  finally { busy.value = false; }
}
async function signIn() {
  accountError.value = "";
  busy.value = true;
  try {
    await loginPasskey();
    await refreshMe();
    await load();
  } catch {
    accountError.value = "No host account found for a passkey on this device.";
  } finally {
    busy.value = false;
  }
}

// ----- first step: own name, or an organisation -----
const KINDS = [
  { value: "individual", label: "Under my own name", hint: "Run events as yourself. Standard prices." },
  { value: "society", label: "A student society", hint: "Free: 1 event a week, up to 200 check-ins each. Needs approval." },
  { value: "institution", label: "A university or educational institution", hint: "Discounted prices. Needs approval." },
  { value: "company", label: "A company or event organiser", hint: "Standard prices. Use your work email." },
];
const orgForm = ref({ kind: "individual", name: "", leaderName: "", orgLink: "", university: "" });
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
    await Api.hostCreateOrg({
      kind: o.kind, name: o.name, leaderName: o.leaderName || account.value?.fullName,
      orgLink: o.orgLink, university: o.university,
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
  try { await Api.hostAcceptTransfer(t.id); await load(); }
  catch (e) { error.value = e.message; }
}
async function declineTransfer(t) {
  error.value = "";
  try { await Api.hostDeclineTransfer(t.id); await load(); }
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
      res = await Api.hostDuplicateEvent(f.value.from, {
        name: f.value.name.trim() || undefined,
        startsAt: f.value.startsAt, endsAt: f.value.endsAt,
      });
    } else {
      if (!f.value.name.trim()) { error.value = "Event name is required."; return; }
      res = await Api.hostCreateEvent({
        name: f.value.name,
        venue: f.value.venue,
        startsAt: f.value.startsAt,
        endsAt: f.value.endsAt,
        theme: f.value.theme,
        directoryOn: f.value.directoryOn,
        perks: f.value.perksText.split("\n").map((s) => s.trim()).filter(Boolean),
        questions: [
          { key: "extra1", label: f.value.q1 },
          { key: "extra2", label: f.value.q2 },
        ].filter((q) => q.label.trim()),
        rsvpCount: f.value.rsvpCount === "" ? null : Number(f.value.rsvpCount),
        info: { access: f.value.access, food: f.value.food },
        feedbackOn: f.value.feedbackOn,
        feedbackQuestions: f.value.feedbackQuestions,
      });
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
        <a v-if="ON_HOST_SITE" :href="MAIN_ORIGIN" class="small muted">‹ Back to Lanyard</a>
        <router-link v-else to="/hosts" class="small muted">‹ For hosts</router-link>
        <button type="button" class="link-btn small" :disabled="signingOut" @click="signOut">{{ signingOut ? "Signing out…" : "Sign out" }}</button>
      </div>
      <p v-if="signOutError" class="error-text small" role="alert">{{ signOutError }}</p>
      <h1 style="margin-top:8px"><img src="/host-icon.svg" alt="" style="width:32px;height:32px;vertical-align:-6px;margin-right:8px" />Host portal</h1>
      <p v-if="org && state === 'ready'" class="sub">{{ org.name }}</p>
      <p v-if="state === 'ready' || state === 'welcome'" class="small" style="margin-top:6px">
        <router-link to="/host/account">Account and team</router-link>
      </p>
    </div>

    <p v-if="state === 'loading'" class="muted">Loading…</p>

    <!-- 1. Account -->
    <section v-else-if="state === 'account'" class="panel stack-2">
      <h2>Create your host account</h2>
      <p class="muted">
        Your events and invoices live on a host account, separate from your
        personal Lanyard card. It signs in with a passkey (Face ID, fingerprint
        or screen lock). No password. Organisations can be handed to another host
        account later, so a new committee can take over.
      </p>
      <div class="form-section">
        <span class="form-section-title">About you</span>
        <div class="field"><label for="sv-name">Full name</label>
          <input id="sv-name" v-model="det.fullName" type="text" maxlength="80" autocomplete="name" /></div>
        <div class="field"><label for="host-email">Email</label>
          <input id="host-email" v-model="det.email" type="email" autocomplete="email" inputmode="email" />
          <span class="small muted">Use your university or work email. Societies and institutions need a university address to qualify for their prices.</span></div>
        <div class="field"><label for="sv-use">What do you plan to use Lanyard for?</label>
          <textarea id="sv-use" v-model="det.useCase" maxlength="600"
                    placeholder="e.g. Helping members meet each other at our weekly socials and the annual careers fair"></textarea></div>
        <div class="field"><label id="sv-freq-l">How often do you run events?</label>
          <UiSelect id="sv-freq" v-model="det.frequency" labelledby="sv-freq-l" placeholder="Choose one" :options="FREQUENCIES" /></div>
        <div class="field"><label id="sv-size-l">How many people usually come? (optional)</label>
          <UiSelect id="sv-size" v-model="det.size" labelledby="sv-size-l" :options="SIZE_OPTIONS" /></div>
        <div class="field"><label for="sv-ref">How did you hear about Lanyard? (optional)</label>
          <input id="sv-ref" v-model="det.referral" type="text" maxlength="200" /></div>
      </div>
      <label class="checkbox-row field">
        <input v-model="hostAgreed" type="checkbox" />
        <span class="small">
          I'm 18 or over, I'm authorised to act for this organisation, and I agree to the
          <router-link to="/terms#hosts" target="_blank">Host Terms</router-link> and
          <router-link to="/privacy" target="_blank">Privacy Policy</router-link>.
        </span>
      </label>
      <p v-if="accountError" class="error-text" role="alert">{{ accountError }}</p>
      <button class="btn btn-primary" :disabled="busy" @click="createAccount">
        {{ busy ? "Waiting for passkey…" : "Create account with a passkey" }}
      </button>
      <router-link to="/host/signin" class="btn">I already have a host account</router-link>
      <button v-if="!recoveryKey" class="btn" :disabled="busy" @click="createWithKey">
        No passkey on this device? Use a recovery key instead
      </button>
      <div v-else class="stack">
        <p class="small muted">Your recovery key. Shown once, so save it somewhere safe. It signs you in from any device.</p>
        <p class="tnum" style="font-size:22px;font-weight:800;letter-spacing:2px;margin:0;word-break:break-all">{{ recoveryKey }}</p>
        <button class="btn btn-primary" @click="recoveryKey = ''; load()">I've saved it, continue</button>
      </div>
    </section>

    <!-- 1b. Host terms (new version, or an account made before they existed) -->
    <section v-else-if="state === 'terms'" class="panel stack-2">
      <h2>Host Terms</h2>
      <p class="muted">Please agree to the current Host Terms and Privacy Policy to keep using the host portal.</p>
      <label class="checkbox-row field">
        <input v-model="hostAgreed" type="checkbox" />
        <span class="small">
          I'm authorised to act for this organisation and I agree to the
          <router-link to="/terms#hosts" target="_blank">Host Terms</router-link> and
          <router-link to="/privacy" target="_blank">Privacy Policy</router-link>.
        </span>
      </label>
      <p v-if="accountError" class="error-text" role="alert">{{ accountError }}</p>
      <button class="btn btn-primary" :disabled="busy || !hostAgreed" @click="acceptHostTerms">Agree and continue</button>
    </section>

    <!-- 1c. Name and email, for accounts that don't have them yet -->
    <section v-else-if="state === 'profile'" class="panel stack-2">
      <h2>Finish your host account</h2>
      <p class="muted">We need your name and an email you can be reached on, so organisations can be handed to you and invoices find you.</p>
      <div class="field"><label for="pf-name">Full name</label>
        <input id="pf-name" v-model="det.fullName" type="text" maxlength="80" autocomplete="name" /></div>
      <div class="field"><label for="pf-email">Email</label>
        <input id="pf-email" v-model="det.email" type="email" autocomplete="email" inputmode="email" />
        <span class="small muted">Use your university or work email if you want student or institution prices.</span></div>
      <div class="field"><label for="pf-use">What do you plan to use Lanyard for?</label>
        <textarea id="pf-use" v-model="det.useCase" maxlength="600"></textarea></div>
      <div class="field"><label id="pf-freq-l">How often do you run events?</label>
        <UiSelect id="pf-freq" v-model="det.frequency" labelledby="pf-freq-l" placeholder="Choose one" :options="FREQUENCIES" /></div>
      <p v-if="accountError" class="error-text" role="alert">{{ accountError }}</p>
      <button class="btn btn-primary" :disabled="busy" @click="finishProfile">Continue</button>
    </section>

    <!-- 2. Empty portal: your own name, an organisation, or a transfer waiting for you -->
    <template v-else-if="state === 'welcome'">
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

      <section class="panel stack-2">
        <h2>Where will your events live?</h2>
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
          <div v-if="orgForm.kind === 'society'" class="field"><label for="org-uni">University</label>
            <input id="org-uni" v-model="orgForm.university" type="text" maxlength="120" /></div>
          <p class="small muted" style="margin:0">
            The leader's email and the person billed is <strong>{{ account?.email }}</strong>, the email on your host account.
            An admin checks every application before events can be created.
          </p>
        </template>
        <p v-if="emailHint" class="notice small">{{ emailHint }}</p>
        <p v-if="error" class="error-text" role="alert">{{ error }}</p>
        <button class="btn btn-primary" :disabled="busy || !!emailHint" @click="createOrg">
          {{ busy ? "Saving…" : needsApproval ? "Send application" : orgForm.kind === 'individual' ? "Continue under my name" : "Create organisation" }}
        </button>
      </section>
    </template>

    <!-- 3. Dashboard -->
    <template v-else>
      <div v-if="org && org.status === 'pending'" class="notice stack">
        <strong>Your application is being reviewed.</strong>
        <span class="small">We check every {{ org.type === 'society' ? 'society' : 'institution' }} by hand, usually within a couple of working days. You can create events as soon as it's approved.</span>
      </div>
      <div v-else-if="org && org.status === 'rejected'" class="notice stack">
        <strong>Your application wasn't approved.</strong>
        <span v-if="org.reviewNote" class="small">{{ org.reviewNote }}</span>
        <router-link to="/host/account" class="small" style="text-decoration:underline">Open a ticket if you think that's a mistake</router-link>
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
        <router-link to="/host/billing" class="btn" style="width:auto">Billing</router-link>
      </div>

      <div class="spread">
        <span class="label">Your events</span>
        <button class="btn" style="width:auto" :disabled="!canCreate" @click="creating = !creating">New event</button>
      </div>

      <div v-if="creating" class="panel stack-2">
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
          <router-link v-if="credits.remaining <= 0" to="/host/billing" style="text-decoration:underline">Buy credits</router-link>
        </p>
        <button class="btn btn-primary" :disabled="busy" @click="create">
          {{ busy ? "Creating…" : (f.from ? "Create the copy" : "Create event") + (freeNow ? " (free this week)" : " (uses 1 credit)") }}
        </button>
      </div>

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
          :to="`/host/events/${e.id}`"
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
