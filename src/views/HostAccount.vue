<script setup>
// Host account (F10): how you sign in, your devices, who else is on the
// organisation, handing it over, integrations, and sign out. The host account
// signs in with an email code only; it has nothing to do with a Lanyard card.
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { HostApi, hostSignOutAndReload } from "../lib/hostapi";
import UiSelect from "../components/ui/UiSelect.vue";
import { HELP_EMAIL } from "../lib/contact";
import Waiting from "../components/Waiting.vue";
import { SessionLost } from "../lib/errors";
import { useBusy } from "../components/Waiting.vue";
document.title = "Account | Lanyard hosts";

const router = useRouter();
const loading = ref(true);
const needsAccount = ref(false);
const error = ref("");
const msg = ref("");
const me = ref(null); // /api/host/me
const team = ref(null); // /api/host/team
const tix = ref({ tickets: [], outgoing: [] }); // /api/host/tickets

async function load() {
  loading.value = true; error.value = "";
  try {
    me.value = await HostApi.hostMe();
    if (me.value.step !== "ready" && me.value.step !== "org") { needsAccount.value = true; return; }
    loadDevices();
    if (me.value.org) {
      team.value = await HostApi.hostTeam();
      if (team.value.role === "owner") tix.value = await HostApi.hostTickets();
      loadInteg();
    }
  } catch (e) {
    if (e.code === "signed_out") needsAccount.value = true;
    else error.value = e.message;
  } finally { loading.value = false; }
}
onMounted(load);

async function copy(text) {
  try { await navigator.clipboard.writeText(text); msg.value = "Copied."; } catch { /* manual */ }
}

// ----- devices signed in to this host account -----
const devices = ref([]);
async function loadDevices() {
  try { devices.value = (await HostApi.sessions()).sessions; } catch { /* shown as empty */ }
}
const { working, once } = useBusy();
const signOutDevice = once(async (d) => {
  error.value = "";
  try { await HostApi.signOutDevice(d.id); await loadDevices(); }
  catch (e) { error.value = e.message; }
});
const signOutOthers = once(async () => {
  error.value = "";
  try { await HostApi.signOutOthers(); await loadDevices(); msg.value = "Other devices are signed out."; }
  catch (e) { error.value = e.message; }
});
const fmtDay = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

// ----- team -----
const invite = ref(null);
const inviteEmail = ref("");
const newInvite = once(async () => {
  error.value = "";
  try {
    invite.value = await HostApi.hostInvite(inviteEmail.value.trim());
    inviteEmail.value = "";
    team.value = await HostApi.hostTeam();
  }
  catch (e) { error.value = e.message; }
});
const revoke = once(async (code) => {
  await HostApi.hostRevokeInvite(code);
  team.value = await HostApi.hostTeam();
  invite.value = null;
});
const remove = once(async (m) => {
  if (!confirm(`Remove ${m.label} from the organisation?`)) return;
  try { await HostApi.hostRemoveMember(m.id); team.value = await HostApi.hostTeam(); }
  catch (e) { error.value = e.message; }
});
const joinCode = ref("");
const join = once(async () => {
  error.value = "";
  try { await HostApi.hostJoin(joinCode.value); router.push("/"); }
  catch (e) { error.value = e.message; }
});

// ----- hand the organisation to someone / ask an admin -----
const approvalOrg = () => ["society", "institution"].includes(me.value?.org?.type);
const handoverEmail = ref("");
const ticketForm = ref({ kind: "leader_change", newEmail: "", message: "" });
const sentTicket = ref(false);
const TICKET_KINDS = [
  { value: "leader_change", label: "Change the leader (someone new takes over)" },
  { value: "email_change", label: "Change my email address" },
  { value: "other", label: "Something else" },
];
const handOver = once(async () => {
  error.value = ""; msg.value = "";
  try {
    await HostApi.hostTransfer(handoverEmail.value);
    handoverEmail.value = "";
    msg.value = "Sent. Nothing changes until they accept it in their host portal.";
    tix.value = await HostApi.hostTickets();
  } catch (e) { error.value = e.message; }
});
const cancelHandover = once(async (t) => {
  await HostApi.hostCancelTransfer(t.id);
  tix.value = await HostApi.hostTickets();
});
const sendTicket = once(async () => {
  error.value = ""; msg.value = ""; sentTicket.value = false;
  try {
    const t = ticketForm.value;
    await HostApi.hostCreateTicket({ kind: t.kind, newEmail: t.kind === "other" ? undefined : t.newEmail, message: t.message });
    ticketForm.value = { kind: t.kind, newEmail: "", message: "" };
    sentTicket.value = true;
    tix.value = await HostApi.hostTickets();
  } catch (e) { error.value = e.message; }
});
const TICKET_LABEL = { leader_change: "Change of leader", email_change: "Change of email", other: "Request" };

// ----- integrations (owner only) -----
const integ = ref(null);
const hookUrl = ref("");
const hookSecret = ref("");
const apiKey = ref("");
const integMsg = ref("");
async function loadInteg() {
  if (team.value?.role !== "owner") return;
  try { integ.value = await HostApi.hostIntegrations(); hookUrl.value = integ.value.webhookUrl || ""; } catch { /* not owner */ }
}
const saveHook = once(async () => {
  error.value = ""; integMsg.value = ""; hookSecret.value = "";
  try { hookSecret.value = (await HostApi.hostSetWebhook(hookUrl.value)).secret; await loadInteg(); }
  catch (e) { error.value = e.message; }
});
const removeHook = once(async () => {
  await HostApi.hostRemoveWebhook(); hookSecret.value = ""; hookUrl.value = ""; await loadInteg();
});
const testHook = once(async () => {
  error.value = ""; integMsg.value = "";
  try {
    const r = await HostApi.hostTestWebhook();
    integMsg.value = r.ok ? `Test sent. Your endpoint replied ${r.status}.` : `Your endpoint didn't accept it${r.status ? ` (HTTP ${r.status})` : ""}.`;
  } catch (e) { error.value = e.message; }
});
const newKey = once(async () => {
  error.value = "";
  if (integ.value?.hasApiKey && !confirm("Make a new key? The old one stops working straight away.")) return;
  try { apiKey.value = (await HostApi.hostNewApiKey()).key; await loadInteg(); }
  catch (e) { error.value = e.message; }
});
const removeKey = once(async () => {
  await HostApi.hostRemoveApiKey(); apiKey.value = ""; await loadInteg();
});
const curlExample = () =>
  `curl -X POST ${integ.value?.rsvpEndpoint} \\\n  -H "Authorization: Bearer ${apiKey.value || "lyk_…"}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"eventCode":"ABC12","count":120}'`;

async function signOut() {
  try { await hostSignOutAndReload("/"); }
  catch (e) { error.value = e.message; }
}
const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
</script>

<template>
  <div class="wide-col in-app stack-3" style="max-width:760px">
    <SessionLost />
    <div class="page-head">
      <router-link to="/" class="small muted">‹ Host portal</router-link>
      <h1 style="margin-top:8px">Account and team</h1>
      <p v-if="me?.org" class="sub">{{ me.org.name }}</p>
    </div>

    <Waiting v-if="loading" shape="panel" :rows="3" label="Loading your account" :retry="load" />

    <section v-else-if="needsAccount" class="panel stack-2">
      <h2>Finish your host account first</h2>
      <p class="muted">Sign in and finish setting up in the host portal, then come back here.</p>
      <router-link to="/" class="btn btn-primary">Go to the host portal</router-link>
    </section>

    <template v-else-if="me">
      <section class="panel stack" aria-labelledby="signin-h">
        <span id="signin-h" class="label">How you sign in</span>
        <p style="margin:0">With a code we email to <strong>{{ me.account.email }}</strong>. To change the address, email <a :href="`mailto:${HELP_EMAIL}`">{{ HELP_EMAIL }}</a>.</p>
        <div class="stack" style="gap:0">
          <span class="label" style="margin-top:8px">Signed-in devices</span>
          <div class="list">
            <div v-for="d in devices" :key="d.id" class="list-row spread">
              <span>{{ d.device }}<span class="small muted" style="display:block">Since {{ fmtDay(d.at) }}{{ d.current ? " · This device" : "" }}</span></span>
              <button v-if="!d.current" class="btn" style="width:auto" type="button" :disabled="!!working" @click="signOutDevice(d)">{{ working === signOutDevice ? "Signing out…" : "Sign out" }}</button>
            </div>
          </div>
        </div>
        <button v-if="devices.length > 1" class="btn" type="button" :disabled="!!working" @click="signOutOthers">{{ working === signOutOthers ? "Signing out…" : "Sign out all other devices" }}</button>
        <a :href="HostApi.exportUrl" class="small" style="text-decoration:underline" download>Download my host account data</a>
      </section>

      <section v-if="me.org" class="panel stack">
        <span class="label">Organisation</span>
        <div class="list">
          <div class="list-row spread"><span class="muted">Name</span><strong>{{ me.org.name }}</strong></div>
          <div class="list-row spread"><span class="muted">Type</span>
            <strong>{{ { society: "Student society", institution: "Educational institution", company: "Company", individual: "Under your own name" }[me.org.type] }}</strong></div>
          <div v-if="approvalOrg()" class="list-row spread"><span class="muted">Approval</span>
            <strong>{{ me.org.status === "approved" ? "Approved" : me.org.status === "rejected" ? "Not approved" : "Waiting for review" }}</strong></div>
          <div v-if="me.org.leaderName" class="list-row spread"><span class="muted">Leader</span><strong>{{ me.org.leaderName }}</strong></div>
          <div class="list-row spread"><span class="muted">Leader and billing email</span><strong>{{ me.org.billingEmail || me.account.email }}</strong></div>
          <div v-if="me.org.university" class="list-row spread"><span class="muted">University</span><strong>{{ me.org.university }}</strong></div>
          <div v-if="me.org.orgLink" class="list-row spread"><span class="muted">Link</span>
            <a :href="me.org.orgLink" target="_blank" rel="noopener" style="text-decoration:underline;overflow-wrap:anywhere;text-align:right">{{ me.org.orgLink }}</a></div>
        </div>
      </section>

      <section v-if="me.org && team?.role === 'owner' && me.org.type !== 'individual'" class="panel stack">
        <span class="label">{{ approvalOrg() ? "Change the leader or email" : "Hand over this organisation" }}</span>

        <template v-if="!approvalOrg()">
          <p class="small muted" style="margin:0">
            Enter the email your colleague signed up to the host portal with. They need their own host account first,
            and can only have one organisation. Nothing changes until they accept it; then you're back to an empty portal.
          </p>
          <form class="row" @submit.prevent="handOver">
            <label for="hand-email" class="visually-hidden">Their host account email</label>
            <input id="hand-email" v-model="handoverEmail" type="email" inputmode="email" placeholder="colleague@company.com" style="flex:1" />
            <button class="btn" style="width:auto" type="submit" :disabled="!!working || !handoverEmail.trim()">{{ working === handOver ? "Sending…" : "Send" }}</button>
          </form>
        </template>

        <template v-else>
          <p class="small muted" style="margin:0">
            {{ me.org.type === "society" ? "Your society" : "Your institution" }} was approved for a particular leader, so a change goes through an admin.
            For a new leader, they must sign up to the host portal first; once an admin approves, they press Accept to take over.
          </p>
          <form class="stack" @submit.prevent="sendTicket">
            <UiSelect v-model="ticketForm.kind" label="What do you need?" :options="TICKET_KINDS" />
            <input v-if="ticketForm.kind !== 'other'" v-model="ticketForm.newEmail" type="email" inputmode="email"
                   :placeholder="ticketForm.kind === 'leader_change' ? 'New leader\'s university email' : 'New university email'"
                   :aria-label="ticketForm.kind === 'leader_change' ? 'New leader email' : 'New email'" />
            <textarea v-model="ticketForm.message" maxlength="1000" aria-label="Why"
                      placeholder="Why the change is needed, e.g. the committee changed after elections."></textarea>
            <button class="btn btn-primary" type="submit" :disabled="!!working">{{ working === sendTicket ? "Sending…" : "Open a ticket" }}</button>
          </form>
          <p v-if="sentTicket" class="success-text small" role="status">Ticket opened. We'll review it and the status shows below.</p>
        </template>

        <div v-for="o in tix.outgoing" :key="o.id" class="notice small stack">
          <span>Waiting for <strong>{{ o.toEmail }}</strong> to accept. Sent {{ fmtDate(o.at) }}.</span>
          <button class="btn" type="button" :disabled="!!working" @click="cancelHandover(o)">{{ working === cancelHandover ? "Cancelling…" : "Cancel" }}</button>
        </div>
        <div v-if="tix.tickets.length" class="stack">
          <span class="label">Your tickets</span>
          <div class="list">
            <div v-for="t in tix.tickets" :key="t.id" class="list-row" style="flex-direction:column;align-items:stretch;gap:4px">
              <div class="spread">
                <strong>{{ TICKET_LABEL[t.kind] }}<span v-if="t.newEmail" class="muted"> to {{ t.newEmail }}</span></strong>
                <span class="status-pill" :class="t.status">{{ t.status }}</span>
              </div>
              <span class="small muted">{{ fmtDate(t.at) }} · {{ t.message }}</span>
              <span v-if="t.adminNote" class="small">Admin: {{ t.adminNote }}</span>
              <span v-if="t.status === 'approved' && t.kind === 'leader_change'" class="small">Approved. The new leader now needs to accept the transfer in their host portal.</span>
            </div>
          </div>
        </div>
      </section>

      <section v-if="me.org" class="panel stack">
        <span class="label">Team</span>
        <div class="list">
          <div v-for="m in team?.members || []" :key="m.id" class="list-row spread">
            <span><strong>{{ m.label }}</strong>{{ m.you ? " (you)" : "" }}
              <span class="small muted" style="display:block">{{ m.role === "owner" ? "Owner" : "Staff" }}</span></span>
            <button v-if="team.role === 'owner' && m.role !== 'owner'" class="btn" style="width:auto" :disabled="!!working" @click="remove(m)">{{ working === remove ? "Removing…" : "Remove" }}</button>
          </div>
        </div>
        <form v-if="team?.role === 'owner'" class="stack" @submit.prevent="newInvite">
          <label for="invite-email" class="small">Invite a colleague by the email they sign in to the host portal with</label>
          <div class="row">
            <input id="invite-email" v-model="inviteEmail" type="email" inputmode="email" placeholder="colleague@company.com" style="flex:1" />
            <button class="btn" style="width:auto" type="submit" :disabled="!!working">{{ working === newInvite ? "Inviting…" : "Invite" }}</button>
          </div>
          <span class="small muted">Leave it empty for a code anyone you give it to can use.</span>
        </form>
        <div v-if="invite" class="notice">
          <template v-if="invite.email">Invite sent to <strong>{{ invite.email }}</strong>. Only that host account can use it.</template>
          Invite code <strong class="tnum">{{ invite.code }}</strong>, valid until {{ fmtDate(invite.expiresAt) }}.
          Your colleague signs in to the host portal, then enters it under "Join a team" on this page.
          <button class="btn" style="margin-top:8px" @click="copy(invite.code)">Copy code</button>
        </div>
        <div v-for="i in team?.invites || []" :key="i.code" class="spread small muted">
          <span>Open invite <span class="tnum">{{ i.code.slice(0, 4) }}-{{ i.code.slice(4) }}</span><span v-if="i.email"> for {{ i.email }}</span> · expires {{ fmtDate(i.expiresAt) }}</span>
          <button class="btn" style="width:auto" :disabled="!!working" @click="revoke(i.code)">{{ working === revoke ? "Cancelling…" : "Cancel" }}</button>
        </div>
      </section>

      <section v-if="integ" class="panel stack-2" aria-labelledby="integ-h">
        <h2 id="integ-h">Integrations</h2>
        <p class="small muted" style="margin:0">
          Connect Lanyard to Luma, Google Sheets, Slack and others through Zapier or Make, or your own server.
          Only totals are ever sent: no names, emails or who connected with whom.
        </p>

        <div class="stack">
          <span class="label">Webhook: when you end an event</span>
          <p class="small muted" style="margin:0">
            We POST check-in, connection and feedback totals to this address, signed with a secret
            (header <code>Lanyard-Signature: t=…,v1=HMAC-SHA256(secret, "t.body")</code>).
          </p>
          <form class="row" @submit.prevent="saveHook">
            <label for="hook-url" class="visually-hidden">Webhook address</label>
            <input id="hook-url" v-model="hookUrl" type="url" inputmode="url" placeholder="https://hooks.zapier.com/…" style="flex:1" />
            <button class="btn" style="width:auto" type="submit" :disabled="!!working">{{ working === saveHook ? "Saving…" : integ.hasWebhook ? "Update" : "Save" }}</button>
          </form>
          <div v-if="hookSecret" class="notice small stack">
            <span>Signing secret. Shown once, so copy it into your Zap or server now:</span>
            <code style="word-break:break-all">{{ hookSecret }}</code>
            <button class="btn" type="button" @click="copy(hookSecret)">Copy secret</button>
          </div>
          <div v-if="integ.hasWebhook" class="btn-row">
            <button class="btn" type="button" :disabled="!!working" @click="testHook">{{ working === testHook ? "Sending…" : "Send a test" }}</button>
            <button class="btn btn-danger" type="button" :disabled="!!working" @click="removeHook">{{ working === removeHook ? "Removing…" : "Remove" }}</button>
          </div>
          <p v-if="integMsg" class="small" role="status">{{ integMsg }}</p>
        </div>

        <div class="stack">
          <span class="label">API key: send us your sign-up count</span>
          <p class="small muted" style="margin:0">
            Let Zapier (or a script) update an event's sign-ups from Luma or the Union site, so your report shows turnout.
            Send a number, never a guest list.
          </p>
          <div v-if="apiKey" class="notice small stack">
            <span>Your API key. Shown once, so store it somewhere safe:</span>
            <code style="word-break:break-all">{{ apiKey }}</code>
            <button class="btn" type="button" @click="copy(apiKey)">Copy key</button>
          </div>
          <pre v-if="integ.hasApiKey || apiKey" class="small code-block">{{ curlExample() }}</pre>
          <div class="btn-row">
            <button class="btn" type="button" :disabled="!!working" @click="newKey">{{ integ.hasApiKey ? "Replace key" : "Create API key" }}</button>
            <button v-if="integ.hasApiKey" class="btn btn-danger" type="button" :disabled="!!working" @click="removeKey">{{ working === removeKey ? "Revoking…" : "Revoke" }}</button>
          </div>
        </div>
      </section>

      <section id="join" class="panel stack">
        <span class="label">Join a team</span>
        <p class="small muted">Got an invite code from a colleague? Enter it to work in their organisation instead of your own.</p>
        <form class="stack" @submit.prevent="join">
          <input v-model="joinCode" aria-label="Invite code" placeholder="ABCD-EFGH" autocapitalize="characters" maxlength="12"
                 style="font-size:20px;letter-spacing:3px;text-transform:uppercase;text-align:center" />
          <button class="btn" :disabled="!!working || joinCode.replace(/[^a-z0-9]/gi, '').length < 8">{{ working === join ? "Joining…" : "Join team" }}</button>
        </form>
      </section>

      <button class="btn" @click="signOut">Sign out of this device</button>
    </template>

    <p v-if="msg" class="success-text" role="status">{{ msg }}</p>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.code-block { margin: 0; padding: 10px; border: var(--border); border-radius: var(--radius); background: var(--paper); overflow-x: auto; white-space: pre; }
</style>
