<script setup>
// Host portal home: a real host account (passkey) -> organisation -> events.
import { onMounted, ref } from "vue";
import { Api } from "../lib/api";
import { me, refreshMe } from "../lib/store";
import { registerPasskey, loginPasskey } from "../lib/passkeys";
import { ON_HOST_SITE, MAIN_ORIGIN } from "../lib/site";

const state = ref("loading"); // loading | account | terms | org | ready
const org = ref(null);
const credits = ref({ granted: 0, used: 0, remaining: 0, nextExpiry: null });
const events = ref([]);
const creating = ref(false);
const error = ref("");
const busy = ref(false);
const createdCode = ref(null);

const accountEmail = ref("");
const accountError = ref("");
const orgForm = ref({ name: "", type: "society", billingEmail: "" });

const f = ref({
  name: "", venue: "", startsAt: "", theme: "default",
  perksText: "", directoryOn: true,
  q1: "", q2: "",
});

onMounted(load);
async function load() {
  try {
    const d = await Api.hostMe();
    org.value = d.org;
    credits.value = d.credits;
    events.value = d.events;
    const unnamed = d.org.name === "My organisation";
    orgForm.value = {
      name: unnamed ? "" : d.org.name,
      type: d.org.type === "other" && unnamed ? "society" : d.org.type,
      billingEmail: d.org.billingEmail || "",
    };
    state.value = unnamed ? "org" : "ready";
  } catch (e) {
    if (e.code === "account_required") state.value = "account";
    else if (e.code === "terms_required") state.value = "terms";
    else { error.value = e.message; state.value = "ready"; }
  }
}

const hostAgreed = ref(false);
const needAgree = "Please agree to the Host Terms and Privacy Policy first.";
async function acceptHostTerms() {
  accountError.value = ""; busy.value = true;
  try { await Api.hostAcceptTerms(); await load(); }
  catch (e) { accountError.value = e.message; }
  finally { busy.value = false; }
}
async function createAccount() {
  accountError.value = "";
  if (!hostAgreed.value) { accountError.value = needAgree; return; }
  busy.value = true;
  try {
    if (accountEmail.value.trim()) await Api.setEmail(accountEmail.value.trim());
    await registerPasskey();
    await Api.hostAcceptTerms();
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
  if (!hostAgreed.value) { accountError.value = needAgree; return; }
  busy.value = true;
  try {
    if (accountEmail.value) await Api.setEmail(accountEmail.value);
    recoveryKey.value = (await Api.recoveryCreate()).key;
    await Api.hostAcceptTerms();
  } catch (e) {
    accountError.value = e?.message || "Couldn't create the key.";
  } finally { busy.value = false; }
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

async function saveOrg() {
  error.value = "";
  if (!orgForm.value.name.trim()) { error.value = "Add your organisation's name."; return; }
  busy.value = true;
  try {
    await Api.hostOrg({ ...orgForm.value });
    await load();
    state.value = "ready";
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function create() {
  error.value = "";
  if (!f.value.name.trim()) { error.value = "Event name is required."; return; }
  busy.value = true;
  try {
    const body = {
      name: f.value.name,
      venue: f.value.venue,
      startsAt: f.value.startsAt ? new Date(f.value.startsAt).getTime() : null,
      theme: f.value.theme,
      directoryOn: f.value.directoryOn,
      perks: f.value.perksText.split("\n").map((s) => s.trim()).filter(Boolean),
      questions: [
        { key: "extra1", label: f.value.q1 },
        { key: "extra2", label: f.value.q2 },
      ].filter((q) => q.label.trim()),
    };
    const res = await Api.hostCreateEvent(body);
    createdCode.value = res.code;
    creating.value = false;
    await load();
  } catch (e) {
    error.value = e.message;
    if (e.code === "no_credits") error.value = "You're out of event credits.";
  } finally {
    busy.value = false;
  }
}

const fmtDate = (t) => (t ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
</script>

<template>
  <div class="wide-col stack-3" style="max-width:760px">
    <div class="page-head">
      <a v-if="ON_HOST_SITE" :href="MAIN_ORIGIN" class="small muted">‹ lanyard</a>
      <router-link v-else to="/hosts" class="small muted">‹ For hosts</router-link>
      <h1 style="margin-top:8px">Host portal</h1>
      <p v-if="org && state === 'ready'" class="sub">{{ org.name }}</p>
      <p v-if="state === 'ready' || state === 'org'" class="small" style="margin-top:6px">
        <router-link to="/host/account">Account and team</router-link>
      </p>
    </div>

    <p v-if="state === 'loading'" class="muted">Loading…</p>

    <!-- 1. Account -->
    <section v-else-if="state === 'account'" class="panel stack-2">
      <h2>Create your host account</h2>
      <p class="muted">
        Your organisation, its events and its invoices live on a host account,
        separate from your personal Lanyard card. It signs in with a passkey
        (Face ID, fingerprint or screen lock). No password.
      </p>
      <div class="field">
        <label for="host-email">Contact email (optional, for account recovery)</label>
        <input id="host-email" v-model="accountEmail" type="email" autocomplete="email" inputmode="email" />
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

    <!-- 2. Organisation -->
    <section v-else-if="state === 'org'" class="panel stack-2">
      <h2>Set up your organisation</h2>
      <p class="muted">You get {{ credits.remaining }} free events to start. No card needed.</p>
      <div class="field"><label for="org-name">Organisation name</label>
        <input id="org-name" v-model="orgForm.name" type="text" placeholder="UCL Robotics Society" maxlength="100" /></div>
      <div class="field"><label for="org-type">What kind of organisation?</label>
        <div class="select-wrap">
          <select id="org-type" v-model="orgForm.type">
            <option value="society">Student society</option>
            <option value="careers_service">Careers service or students' union</option>
            <option value="company">Company or conference organiser</option>
            <option value="other">Something else</option>
          </select>
        </div>
      </div>
      <div class="field"><label for="org-bill">Billing email (where invoices go)</label>
        <input id="org-bill" v-model="orgForm.billingEmail" type="email" autocomplete="email" inputmode="email" /></div>
      <p v-if="error" class="error-text">{{ error }}</p>
      <button class="btn btn-primary" :disabled="busy" @click="saveOrg">Save and continue</button>
    </section>

    <!-- 3. Dashboard -->
    <template v-else>
      <div class="panel spread">
        <div>
          <span class="label">Event credits</span>
          <div class="tnum" style="font-size:28px;font-weight:700">{{ credits.remaining }}</div>
          <span v-if="credits.nextExpiry" class="small muted">next expire {{ fmtDate(credits.nextExpiry) }}</span>
        </div>
        <router-link to="/host/billing" class="btn" style="width:auto">Billing</router-link>
      </div>

      <div class="spread">
        <span class="label">Your events</span>
        <button class="btn" style="width:auto" @click="creating = !creating">New event</button>
      </div>

      <div v-if="creating" class="panel stack-2">
        <h2>Create event</h2>
        <div class="field"><label>Event name</label>
          <input v-model="f.name" type="text" placeholder="UCL Careers Fair" /></div>
        <div class="field"><label>Venue</label>
          <input v-model="f.venue" type="text" /></div>
        <div class="field"><label>Date and time (optional)</label>
          <input v-model="f.startsAt" type="datetime-local" /></div>
        <div class="field"><label>Theme</label>
          <div class="select-wrap">
            <select v-model="f.theme">
              <option value="default">Default — Persimmon</option>
              <option value="formal">Formal — navy strap</option>
              <option value="night">Night — dark</option>
            </select>
          </div>
        </div>
        <div class="field"><label>Perks — one per line</label>
          <textarea v-model="f.perksText" placeholder="Free coffee&#10;Raffle entry"></textarea></div>
        <div class="field"><label>Check-in question 1 (optional)</label>
          <input v-model="f.q1" type="text" placeholder="Course" /></div>
        <div class="field"><label>Check-in question 2 (optional)</label>
          <input v-model="f.q2" type="text" placeholder="What are you looking for?" /></div>
        <label class="checkbox-row">
          <input type="checkbox" v-model="f.directoryOn" />
          <span class="small">Show the live attendee room to checked-in people</span>
        </label>
        <p v-if="error" class="error-text">
          {{ error }}
          <router-link v-if="credits.remaining <= 0" to="/host/billing" style="text-decoration:underline">Buy credits</router-link>
        </p>
        <button class="btn btn-primary" :disabled="busy" @click="create">
          {{ busy ? "Creating…" : "Create event (uses 1 credit)" }}
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
              <span class="tnum">{{ e.code }}</span>{{ e.venue ? " · " + e.venue : "" }}
            </span>
          </span>
          <span class="label">Live ›</span>
        </router-link>
      </div>
    </template>
  </div>
</template>
