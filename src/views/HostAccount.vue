<script setup>
// Host account: how you sign in, who else is on the organisation, and sign out.
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { Api } from "../lib/api";
import { refreshMe } from "../lib/store";
import { registerPasskey, passkeysSupported } from "../lib/passkeys";
import { drawQR } from "../lib/qr";
import { ON_HOST_SITE } from "../lib/site";

const router = useRouter();
const loading = ref(true);
const needsAccount = ref(false);
const error = ref("");
const msg = ref("");
const me = ref(null); // /api/host/me
const team = ref(null); // /api/host/team
const host = location.host;

async function load() {
  try {
    me.value = await Api.hostMe();
    team.value = await Api.hostTeam();
    loadInteg();
  } catch (e) {
    if (e.code === "account_required") needsAccount.value = true;
    else error.value = e.message;
  } finally { loading.value = false; }
}
onMounted(load);

// ----- sign-in methods -----
async function addPasskey() {
  error.value = ""; msg.value = "";
  try { await registerPasskey(); msg.value = "Passkey saved."; await load(); }
  catch (e) { error.value = e?.name === "NotAllowedError" ? "Passkey setup was cancelled." : e?.message || "Passkey setup failed."; }
}
const recoveryKey = ref("");
async function makeKey() {
  error.value = "";
  try { recoveryKey.value = (await Api.recoveryCreate()).key; await load(); }
  catch (e) { error.value = e.message; }
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); msg.value = "Copied."; } catch { /* manual */ }
}

const link = ref(null);
const linkCanvas = ref(null);
const secondsLeft = ref(0);
let tick = null;
async function showLink() {
  error.value = "";
  try {
    const r = await Api.authLink();
    link.value = { ...r, url: `${location.origin}/host/signin?code=${r.code}` };
    clearInterval(tick);
    const update = () => {
      secondsLeft.value = Math.max(0, Math.round((r.expiresAt - Date.now()) / 1000));
      if (!secondsLeft.value) { clearInterval(tick); link.value = null; }
    };
    update(); tick = setInterval(update, 1000);
    await nextTick();
    if (linkCanvas.value) await drawQR(linkCanvas.value, link.value.url, 360);
  } catch (e) { error.value = e.message; }
}
onBeforeUnmount(() => clearInterval(tick));
const mmss = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;

// ----- team -----
const invite = ref(null);
async function newInvite() {
  error.value = "";
  try { invite.value = await Api.hostInvite(); team.value = await Api.hostTeam(); }
  catch (e) { error.value = e.message; }
}
async function revoke(code) {
  await Api.hostRevokeInvite(code);
  team.value = await Api.hostTeam();
  invite.value = null;
}
async function remove(m) {
  if (!confirm(`Remove ${m.label} from the organisation?`)) return;
  try { await Api.hostRemoveMember(m.userId); team.value = await Api.hostTeam(); }
  catch (e) { error.value = e.message; }
}
const joinCode = ref("");
async function join() {
  error.value = "";
  try { await Api.hostJoin(joinCode.value); router.push("/host"); }
  catch (e) { error.value = e.message; }
}

// ----- integrations (owner only) -----
const integ = ref(null);
const hookUrl = ref("");
const hookSecret = ref("");
const apiKey = ref("");
const integMsg = ref("");
async function loadInteg() {
  if (team.value?.role !== "owner") return;
  try { integ.value = await Api.hostIntegrations(); hookUrl.value = integ.value.webhookUrl || ""; } catch { /* not owner */ }
}
async function saveHook() {
  error.value = ""; integMsg.value = ""; hookSecret.value = "";
  try { hookSecret.value = (await Api.hostSetWebhook(hookUrl.value)).secret; await loadInteg(); }
  catch (e) { error.value = e.message; }
}
async function removeHook() {
  await Api.hostRemoveWebhook(); hookSecret.value = ""; hookUrl.value = ""; await loadInteg();
}
async function testHook() {
  error.value = ""; integMsg.value = "";
  try {
    const r = await Api.hostTestWebhook();
    integMsg.value = r.ok ? `Test sent. Your endpoint replied ${r.status}.` : `Your endpoint didn't accept it${r.status ? ` (HTTP ${r.status})` : ""}.`;
  } catch (e) { error.value = e.message; }
}
async function newKey() {
  error.value = "";
  if (integ.value?.hasApiKey && !confirm("Make a new key? The old one stops working straight away.")) return;
  try { apiKey.value = (await Api.hostNewApiKey()).key; await loadInteg(); }
  catch (e) { error.value = e.message; }
}
async function removeKey() {
  await Api.hostRemoveApiKey(); apiKey.value = ""; await loadInteg();
}
const curlExample = () =>
  `curl -X POST ${integ.value?.rsvpEndpoint} \\\n  -H "Authorization: Bearer ${apiKey.value || "lyk_…"}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"eventCode":"ABC12","count":120}'`;

async function signOut() {
  await Api.logout();
  try { await refreshMe(); } catch { /* guest */ }
  router.push(ON_HOST_SITE ? "/host" : "/hosts");
}
const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
</script>

<template>
  <div class="wide-col stack-3" style="max-width:760px">
    <div class="page-head">
      <router-link to="/host" class="small muted">‹ Host portal</router-link>
      <h1 style="margin-top:8px">Account and team</h1>
      <p v-if="me" class="sub">{{ me.org.name }}</p>
    </div>

    <p v-if="loading" class="muted">Loading…</p>

    <section v-else-if="needsAccount" class="panel stack-2">
      <h2>Create your host account first</h2>
      <p class="muted">You need a host account to manage security and your team.</p>
      <router-link to="/host" class="btn btn-primary">Create host account</router-link>
      <router-link to="/host/signin" class="btn">I already have one</router-link>
    </section>

    <template v-else-if="me">
      <section class="panel stack">
        <span class="label">How you sign in</span>
        <div class="spread">
          <span>Passkey</span>
          <strong v-if="me.account.hasPasskey">Saved</strong>
          <button v-else-if="passkeysSupported()" class="btn" style="width:auto" @click="addPasskey">Add passkey</button>
          <span v-else class="small muted">Not supported here</span>
        </div>
        <div class="spread">
          <span>Recovery key</span>
          <strong v-if="me.account.hasRecovery && !recoveryKey">Saved</strong>
        </div>
        <button class="btn" @click="makeKey">{{ me.account.hasRecovery ? "Make a new recovery key" : "Get a recovery key" }}</button>
        <div v-if="recoveryKey" class="stack">
          <p class="small muted">Shown once. Keep it somewhere safe; it opens this account from any device.</p>
          <p class="tnum" style="font-size:22px;font-weight:800;letter-spacing:2px;margin:0;word-break:break-all">{{ recoveryKey }}</p>
          <button class="btn" @click="copy(recoveryKey)">Copy key</button>
        </div>

        <button v-if="!link" class="btn" @click="showLink">Sign in on another device</button>
        <div v-else class="stack" style="align-items:center;text-align:center">
          <p class="small muted">On the other device open <strong>{{ host }}/host/signin</strong> and enter this code, or scan the QR.</p>
          <p class="tnum" style="font-size:36px;font-weight:800;letter-spacing:4px;margin:0">{{ link.code }}</p>
          <canvas ref="linkCanvas" width="360" height="360" style="width:180px;height:180px" aria-label="Sign-in QR code"></canvas>
          <p class="small muted">One use, expires in {{ mmss(secondsLeft) }}.</p>
        </div>
      </section>

      <section class="panel stack">
        <div class="spread">
          <span class="label">Team</span>
          <button v-if="team?.role === 'owner'" class="btn" style="width:auto" @click="newInvite">Invite a colleague</button>
        </div>
        <div class="list">
          <div v-for="m in team?.members || []" :key="m.userId" class="list-row spread">
            <span><strong>{{ m.label }}</strong>{{ m.you ? " (you)" : "" }}
              <span class="small muted" style="display:block">{{ m.role === "owner" ? "Owner" : "Staff" }}</span></span>
            <button v-if="team.role === 'owner' && m.role !== 'owner'" class="btn" style="width:auto" @click="remove(m)">Remove</button>
          </div>
        </div>
        <div v-if="invite" class="notice">
          Invite code <strong class="tnum">{{ invite.code }}</strong>, valid until {{ fmtDate(invite.expiresAt) }}.
          Your colleague creates their own host account, then enters it under "Join a team" on this page.
          <button class="btn" style="margin-top:8px" @click="copy(invite.code)">Copy code</button>
        </div>
        <div v-for="i in team?.invites || []" :key="i.code" class="spread small muted">
          <span>Open invite <span class="tnum">{{ i.code.slice(0, 4) }}-{{ i.code.slice(4) }}</span> · expires {{ fmtDate(i.expiresAt) }}</span>
          <button class="btn" style="width:auto" @click="revoke(i.code)">Cancel</button>
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
            <button class="btn" style="width:auto" type="submit">{{ integ.hasWebhook ? "Update" : "Save" }}</button>
          </form>
          <div v-if="hookSecret" class="notice small stack">
            <span>Signing secret. Shown once, so copy it into your Zap or server now:</span>
            <code style="word-break:break-all">{{ hookSecret }}</code>
            <button class="btn" type="button" @click="copy(hookSecret)">Copy secret</button>
          </div>
          <div v-if="integ.hasWebhook" class="btn-row">
            <button class="btn" type="button" @click="testHook">Send a test</button>
            <button class="btn btn-danger" type="button" @click="removeHook">Remove</button>
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
            <button class="btn" type="button" @click="newKey">{{ integ.hasApiKey ? "Replace key" : "Create API key" }}</button>
            <button v-if="integ.hasApiKey" class="btn btn-danger" type="button" @click="removeKey">Revoke</button>
          </div>
        </div>
      </section>

      <section id="join" class="panel stack">
        <span class="label">Join a team</span>
        <p class="small muted">Got an invite code from a colleague? Enter it to work in their organisation instead of your own.</p>
        <form class="stack" @submit.prevent="join">
          <input v-model="joinCode" aria-label="Invite code" placeholder="ABCD-EFGH" autocapitalize="characters" maxlength="12"
                 style="font-size:20px;letter-spacing:3px;text-transform:uppercase;text-align:center" />
          <button class="btn" :disabled="joinCode.replace(/[^a-z0-9]/gi, '').length < 8">Join team</button>
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
