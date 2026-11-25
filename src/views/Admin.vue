<script setup>
// Admin: approve society and institution applications, handle tickets.
// Sign in with the ADMIN_TOKEN secret. It is kept for this browser tab only.
import { onMounted, ref } from "vue";
import UiDatePicker from "../components/ui/UiDatePicker.vue";
import AdminAi from "../components/AdminAi.vue";
import AdminMetrics from "../components/AdminMetrics.vue";
import { HOST_ORIGIN } from "../lib/site";
import { fix } from "../lib/errors"; // F39: plain words for a failed request
import Waiting from "../components/Waiting.vue";
import { useBusy } from "../components/Waiting.vue";
document.title = "Admin | Lanyard";

const TOKEN_KEY = "lanyard_admin_token";
const token = ref("");
const input = ref("");
const queue = ref(null);
const error = ref("");
const busy = ref(false);
const notes = ref({}); // per application / ticket id
const mail = ref({ subject: "", body: "", testTo: "", result: "" });
async function sendMailout(test) {
  error.value = ""; mail.value.result = "";
  if (!test && !window.confirm("Send this to everyone who opted in to news?")) return;
  busy.value = true;
  try {
    const r = await call("/api/admin/broadcast", "POST", {
      subject: mail.value.subject, body: mail.value.body, ...(test ? { testTo: mail.value.testTo } : { id: mail.value.id }),
    });
    if (test) mail.value.result = "Test sent.";
    else { mail.value.id = r.remaining ? r.id : undefined; mail.value.result = `Sent to ${r.sent}.${r.remaining ? ` ${r.remaining} left: press Send again.` : " Done."}`; }
  } catch (e) {
    // A send that failed part-way says which broadcast it was, so pressing Send again continues it instead of starting a new one.
    if (!test && e.broadcastId) mail.value.id = e.broadcastId;
    error.value = e.message;
  }
  finally { busy.value = false; }
}
const requests = ref(null);
const outcome = ref({});
async function loadRequests() {
  try { requests.value = (await call("/api/admin/privacy-requests")).requests; } catch (e) { error.value = e.message; }
}
async function closeRequest(id) {
  if (busy.value) return;
  error.value = ""; busy.value = true;
  try { await call(`/api/admin/privacy-requests/${id}/close`, "POST", { outcome: outcome.value[id] || "" }); await loadRequests(); }
  catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
// Abuse reports: asked for only when Show reports is pressed (each read is logged), newest first.
const reports = ref(null);
async function loadReports() {
  if (busy.value) return;
  error.value = ""; busy.value = true;
  try { reports.value = (await call("/api/admin/reports")).reports; } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
const search = ref("");
const found = ref(null);
const issued = ref({}); // user id -> sign-in code

async function findUsers() {
  error.value = "";
  try { found.value = (await call(`/api/admin/users?q=${encodeURIComponent(search.value)}`)).users; }
  catch (e) { error.value = e.message; }
}
// Host accounts (F10)
const hostQ = ref("");
const hosts = ref(null);
const attachTo = ref({}); // org id -> email
async function loadHosts() {
  try { hosts.value = await call(`/api/admin/hosts?q=${encodeURIComponent(hostQ.value.trim())}`); }
  catch (e) { error.value = e.message; }
}
const { working, once } = useBusy();
const setHostStatus = once(async (h, status) => {
  error.value = "";
  if (status === "disabled" && !window.confirm(`Switch off ${h.email}? They are signed out everywhere and can't sign in until it's switched back on.`)) return;
  try { await call(`/api/admin/hosts/${h.id}/status`, "POST", { status }); await loadHosts(); }
  catch (e) { error.value = e.message; }
});
const attach = once(async (o) => {
  error.value = "";
  try { await call(`/api/admin/orgs/${o.id}/attach`, "POST", { email: attachTo.value[o.id] || "" }); delete attachTo.value[o.id]; await loadHosts(); }
  catch (e) { error.value = e.message; }
});

// F66 (D061): company branding, for moderation. The logo is fetched with the admin token and shown from a blob address,
// so it never needs a public link; each request is in the admin audit log on the server.
const brands = ref(null);
const logoShown = ref({}); // org id -> blob: address
async function loadBrands() {
  try { brands.value = (await call("/api/admin/brands")).brands; }
  catch (e) { error.value = e.message; }
}
async function showLogo(o) {
  error.value = "";
  try {
    const res = await fetch(`/api/admin/orgs/${encodeURIComponent(o.id)}/brand/logo`, { headers: { authorization: `Bearer ${token.value}` } });
    if (!res.ok) throw new Error("That logo could not be shown. It may have been removed.");
    if (logoShown.value[o.id]) URL.revokeObjectURL(logoShown.value[o.id]);
    logoShown.value = { ...logoShown.value, [o.id]: URL.createObjectURL(await res.blob()) };
  } catch (e) { error.value = e.message; }
}
const removeBrandLogo = once(async (o) => {
  error.value = "";
  if (!window.confirm(`Remove the logo of ${o.name}? Its paid events show its name instead. It cannot be undone.`)) return;
  try { await call(`/api/admin/orgs/${encodeURIComponent(o.id)}/brand/logo`, "DELETE"); delete logoShown.value[o.id]; await loadBrands(); }
  catch (e) { error.value = e.message; }
});
const setBrandOff = once(async (o, off) => {
  error.value = "";
  if (off && !window.confirm(`Switch off branding for ${o.name}? Its events show the Lanyard look, and it cannot set a name or logo until you switch it back on.`)) return;
  try { await call(`/api/admin/orgs/${encodeURIComponent(o.id)}/brand`, "POST", { off }); await loadBrands(); }
  catch (e) { error.value = e.message; }
});

const issueCode = once(async (id) => {
  error.value = "";
  try { issued.value[id] = (await call(`/api/admin/users/${id}/signin-code`, "POST")).code; }
  catch (e) { error.value = e.message; }
});

onMounted(() => {
  try { token.value = sessionStorage.getItem(TOKEN_KEY) || ""; } catch { /* private window */ }
  if (token.value) load();
});

async function call(path, method = "GET", body) {
  let res, json = {};
  try {
    res = await fetch(path, {
      method,
      headers: { authorization: `Bearer ${token.value}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout?.(9e4),
    });
    json = await res.json().catch(() => ({}));
  } catch (e) { res = { status: 0 }; json = { code: "offline", e }; }
  if (!res.ok) throw fix(Object.assign(new Error(json.error || ""), { status: res.status, code: json.code || null, broadcastId: json.id || null }), json, res);
  return json;
}

// The welcome-steps funnel (F14): daily counts only, nothing about who.
const funnel = ref(null);
const STEP_NAMES = ["Name and photo", "Student or working", "What you can help with", "Links", "Save your card", "Done"];
async function loadFunnel() {
  try { funnel.value = await call("/api/admin/onboarding"); } catch (e) { error.value = e.message; }
}
// The tips funnel (F59): per tutorial, how many were shown, finished and skipped. Counts only: nothing about who.
const tips = ref(null);
const TIP_NAMES = { ai_finder: "AI Finder", followup_reminder: "Follow-up reminders", draft_message: "Draft a message", who_to_meet: "Who to meet", more_cards: "More than one card", add_to_home: "Add to home screen" };
async function loadTips() {
  try { tips.value = await call("/api/admin/stages"); } catch (e) { error.value = e.message; }
}
const pct = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : "–");

// Promo codes (/redeem)
const promos = ref(null);
const blankPromo = () => ({ audience: "user", code: "", days: 365, credits: 3, creditDays: 365, orgKinds: [], maxUses: 50, expiresAt: "", note: "" });
const newPromo = ref(blankPromo());
const KINDS = [["society", "Societies"], ["institution", "Institutions"], ["company", "Companies"], ["individual", "Individuals"]];
const toggleKind = (k) => { const l = newPromo.value.orgKinds; newPromo.value.orgKinds = l.includes(k) ? l.filter((x) => x !== k) : [...l, k]; };
const kindsOf = (p) => { try { return JSON.parse(p.org_kinds || "null") || []; } catch { return []; } };
const editing = ref(null); // the code whose limit and end date are being changed
const edit = ref({ maxUses: "", expiresAt: "" });
function startEdit(p) { editing.value = p.code; edit.value = { maxUses: p.max_uses ?? "", expiresAt: p.expires_at ? new Date(p.expires_at).toISOString().slice(0, 10) : "" }; }
const saveEdit = once(async (p) => {
  error.value = "";
  try {
    await call(`/api/admin/promos/${p.code}/edit`, "POST", { maxUses: edit.value.maxUses, expiresAt: edit.value.expiresAt });
    editing.value = null; await loadPromos();
  } catch (e) { error.value = e.message; }
});
async function loadPromos() {
  try { promos.value = (await call("/api/admin/promos")).promos; } catch (e) { error.value = e.message; }
}
const createPromo = once(async () => {
  error.value = "";
  try {
    const b = { ...newPromo.value };
    if (b.audience === "host") b.orgKinds = b.orgKinds.length ? b.orgKinds : null;
    await call("/api/admin/promos", "POST", b);
    newPromo.value = blankPromo();
    await loadPromos();
  } catch (e) { error.value = e.message; }
});
const togglePromo = once(async (p) => {
  error.value = "";
  try { await call(`/api/admin/promos/${p.code}/active`, "POST", { active: !p.active }); await loadPromos(); }
  catch (e) { error.value = e.message; }
});
// A host code is redeemed in the host portal, a person's code on the main site.
const redeemLink = (p) => `${p.audience === "host" ? HOST_ORIGIN : location.origin}/redeem/${p.code}`;

async function load() {
  error.value = "";
  loadRequests();
  loadPromos();
  loadHosts();
  loadBrands();
  loadFunnel();
  loadTips();
  try { queue.value = await call("/api/admin/queue"); }
  catch (e) {
    queue.value = null;
    if (e.status === 401) signOut();
    error.value = e.message;
  }
}
async function signIn() {
  token.value = input.value.trim();
  input.value = "";
  try { sessionStorage.setItem(TOKEN_KEY, token.value); } catch { /* not remembered */ }
  await load();
}
function signOut() {
  token.value = "";
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

async function act(path, decision, id) {
  error.value = ""; busy.value = true;
  try {
    await call(path, "POST", { decision, note: notes.value[id] || "" });
    delete notes.value[id];
    await load();
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}

const fmt = (t) => new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const TYPE = { society: "Student society", institution: "Educational institution", company: "Company", individual: "Individual" };
const KIND = { leader_change: "Change of leader", email_change: "Change of email", other: "Request" };
const EMAIL = { education: "university or school address", free: "webmail address", other: "other domain" };
</script>

<template>
  <div class="wide-col in-app stack-3" style="max-width:820px">
    <div class="page-head">
      <h1>Admin</h1>
      <p class="sub">Applications and tickets waiting for a decision.</p>
    </div>

    <form v-if="!token" class="panel stack" @submit.prevent="signIn">
      <label for="adm-token" class="label">Admin token</label>
      <input id="adm-token" v-model="input" type="password" autocomplete="off" />
      <button class="btn btn-primary" :disabled="!input.trim()">Open the queue</button>
    </form>

    <template v-else>
      <div class="spread">
        <button class="btn" style="width:auto" @click="load">Refresh</button>
        <button class="btn" style="width:auto" @click="signOut">Sign out</button>
      </div>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <Waiting v-if="!queue && !error" shape="panel" :rows="2" label="Loading the queue" :retry="load" />

      <section class="stack-2">
        <span class="label">Applications ({{ queue?.applications.length || 0 }})</span>
        <p v-if="queue && !queue.applications.length" class="muted">Nothing waiting.</p>
        <div v-for="a in queue?.applications || []" :key="a.id" class="panel stack">
          <div class="spread">
            <strong>{{ a.name }}</strong>
            <span class="label">{{ TYPE[a.type] }}</span>
          </div>
          <div class="list">
            <div class="list-row spread"><span class="muted">Leader</span><span>{{ a.leaderName }}</span></div>
            <div class="list-row spread"><span class="muted">Email</span>
              <span>{{ a.leaderEmail }} <span class="small" :class="a.emailKind === 'education' ? 'success-text' : 'error-text'">({{ EMAIL[a.emailKind] }})</span></span></div>
            <div v-if="a.university" class="list-row spread"><span class="muted">University</span><span>{{ a.university }}</span></div>
            <div class="list-row spread"><span class="muted">Link</span>
              <a :href="a.orgLink" target="_blank" rel="noopener noreferrer" style="text-decoration:underline;overflow-wrap:anywhere;text-align:right">{{ a.orgLink }}</a></div>
            <div class="list-row spread"><span class="muted">Applied</span><span>{{ fmt(a.appliedAt) }}</span></div>
            <div v-if="a.useCase" class="list-row" style="flex-direction:column;align-items:stretch">
              <span class="muted">Plans: {{ a.frequency }}<span v-if="a.size"> · {{ a.size }}</span></span><span>{{ a.useCase }}</span></div>
          </div>
          <input v-model="notes[a.id]" type="text" maxlength="300" placeholder="Note for the applicant (required to reject)" :aria-label="`Note for ${a.name}`" />
          <div class="btn-row">
            <button class="btn btn-primary" :disabled="busy" @click="act(`/api/admin/orgs/${a.id}/review`, 'approve', a.id)">Approve</button>
            <button class="btn btn-danger" :disabled="busy" @click="act(`/api/admin/orgs/${a.id}/review`, 'reject', a.id)">Reject</button>
          </div>
        </div>
      </section>

      <section class="stack-2">
        <span class="label">Tickets ({{ queue?.tickets.length || 0 }})</span>
        <p v-if="queue && !queue.tickets.length" class="muted">Nothing waiting.</p>
        <div v-for="t in queue?.tickets || []" :key="t.id" class="panel stack">
          <div class="spread">
            <strong>{{ KIND[t.kind] }} · {{ t.orgName }}</strong>
            <span class="label">{{ TYPE[t.orgType] }}</span>
          </div>
          <div class="list">
            <div class="list-row spread"><span class="muted">Current leader</span><span>{{ t.leaderName }} ({{ t.leaderEmail }})</span></div>
            <div v-if="t.newEmail" class="list-row spread"><span class="muted">New email</span>
              <span>{{ t.newEmail }} <span class="small" :class="t.newEmailKind === 'education' ? 'success-text' : 'error-text'">({{ EMAIL[t.newEmailKind] }})</span></span></div>
            <div v-if="t.kind === 'leader_change'" class="list-row spread"><span class="muted">Host account exists</span>
              <strong :class="t.accountExists ? 'success-text' : 'error-text'">{{ t.accountExists ? "Yes" : "No: they must sign up first" }}</strong></div>
            <div class="list-row spread"><span class="muted">Opened</span><span>{{ fmt(t.at) }}</span></div>
            <div class="list-row" style="flex-direction:column;align-items:stretch"><span class="muted">Message</span><span>{{ t.message }}</span></div>
          </div>
          <p v-if="t.kind === 'leader_change'" class="small muted" style="margin:0">Approving sends the transfer to the new leader, who must still press Accept.</p>
          <input v-model="notes[t.id]" type="text" maxlength="300" placeholder="Note (required to reject)" :aria-label="`Note for ${t.orgName}`" />
          <div class="btn-row">
            <button class="btn btn-primary" :disabled="busy" @click="act(`/api/admin/tickets/${t.id}/resolve`, 'approve', t.id)">
              {{ t.kind === 'other' ? 'Mark resolved' : 'Approve' }}</button>
            <button class="btn btn-danger" :disabled="busy" @click="act(`/api/admin/tickets/${t.id}/resolve`, 'reject', t.id)">Reject</button>
          </div>
        </div>
      </section>

      <section class="stack-2" aria-labelledby="adm-brands-h" data-admin-brands>
        <span id="adm-brands-h" class="label">Company branding ({{ brands?.length || 0 }})</span>
        <p class="small muted">Organisations with a display name or logo for their paid events. Removing a logo or switching branding off is recorded in the audit log.</p>
        <p v-if="brands && !brands.length" class="muted">No organisation has branding.</p>
        <div v-for="o in brands || []" :key="o.id" class="panel stack">
          <div class="spread"><strong style="overflow-wrap:anywhere">{{ o.name }}</strong>
            <span class="small" :class="o.off ? 'error-text' : ''">{{ o.off ? "Switched off" : "On" }}</span></div>
          <p class="small muted" style="margin:0">
            Name on pages: {{ o.brandName || "none (the organisation's name)" }} · {{ o.hasLogo ? "has a logo" : "no logo" }} · shown on {{ o.paidBrandedEvents }} paid {{ o.paidBrandedEvents === 1 ? "event" : "events" }}
          </p>
          <img v-if="logoShown[o.id]" :src="logoShown[o.id]" :alt="`Logo of ${o.name}`" style="max-height:80px;max-width:100%;object-fit:contain;align-self:flex-start;background:#FFFDF8;padding:4px;border:var(--border);border-radius:var(--radius)" />
          <div class="btn-row">
            <button v-if="o.hasLogo && !logoShown[o.id]" class="btn" type="button" @click="showLogo(o)">Show logo</button>
            <button v-if="o.hasLogo" class="btn btn-danger" type="button" :disabled="!!working" @click="removeBrandLogo(o)">{{ working === removeBrandLogo ? "Removing…" : "Remove logo" }}</button>
            <button v-if="!o.off" class="btn btn-danger" type="button" :disabled="!!working" @click="setBrandOff(o, true)">Switch branding off</button>
            <button v-else class="btn" type="button" :disabled="!!working" @click="setBrandOff(o, false)">Switch back on</button>
          </div>
        </div>
      </section>

      <section class="stack-2" aria-labelledby="adm-hosts-h">
        <span id="adm-hosts-h" class="label">Host accounts ({{ hosts?.hosts.length || 0 }})</span>
        <p class="small muted">Host accounts are separate from cards and sign in with an email code on the host portal.</p>
        <form class="btn-row" @submit.prevent="loadHosts">
          <input v-model="hostQ" type="text" maxlength="80" placeholder="Email, name or organisation" aria-label="Find a host account" />
          <button class="btn" style="width:auto">Search</button>
        </form>
        <p v-if="hosts && !hosts.hosts.length" class="muted">No host accounts.</p>
        <div v-for="h in hosts?.hosts || []" :key="h.id" class="panel stack">
          <div class="spread"><strong style="overflow-wrap:anywhere">{{ h.email }}</strong>
            <span class="small" :class="h.status === 'active' ? '' : 'error-text'">{{ h.status === "active" ? "Active" : "Switched off" }}</span></div>
          <p class="small muted" style="margin:0">
            {{ h.fullName || "No name yet" }}{{ h.setUp ? "" : " · setup not finished" }} · joined {{ fmt(h.createdAt) }}
            <template v-if="h.lastLoginAt"> · last sign-in {{ fmt(h.lastLoginAt) }}</template>
            <template v-if="h.org"> · {{ h.org.name }} ({{ h.org.role }})</template>
          </p>
          <button v-if="h.status === 'active'" class="btn btn-danger" :disabled="!!working" @click="setHostStatus(h, 'disabled')">Switch off</button>
          <button v-else class="btn" :disabled="!!working" @click="setHostStatus(h, 'active')">Switch back on</button>
        </div>
        <template v-if="hosts?.unclaimed.length">
          <span class="label">Organisations with no host ({{ hosts.unclaimed.length }})</span>
          <div v-for="o in hosts.unclaimed" :key="o.id" class="panel stack">
            <div class="spread"><strong>{{ o.name }}</strong><span class="label">{{ TYPE[o.type] }}</span></div>
            <form class="btn-row" @submit.prevent="attach(o)">
              <input v-model="attachTo[o.id]" type="email" placeholder="Host account email" :aria-label="`Host account email for ${o.name}`" />
              <button class="btn" style="width:auto" :disabled="!!working || !attachTo[o.id]">{{ working === attach ? "Attaching…" : "Attach" }}</button>
            </form>
          </div>
        </template>
      </section>

      <section class="stack-2">
        <span class="label">Privacy requests and complaints ({{ requests?.length || 0 }})</span>
        <p v-if="requests && !requests.length" class="muted">Nothing open.</p>
        <div v-for="r in requests || []" :key="r.id" class="panel stack">
          <div class="spread"><strong>{{ r.kind }} · {{ r.id }}</strong>
            <span class="small" :style="r.overdue ? 'color:var(--strap-deep);font-weight:700' : ''">{{ r.overdue ? "OVERDUE" : "reply by" }} {{ fmt(r.respondBy) }}</span></div>
          <p class="small muted" style="margin:0">{{ r.email }}<template v-if="r.userId"> · account {{ r.userId }}</template><template v-if="!r.acknowledged"> · acknowledgement email FAILED: reply by hand</template></p>
          <p style="margin:0;white-space:pre-wrap">{{ r.message }}</p>
          <input v-model="outcome[r.id]" type="text" maxlength="500" placeholder="Outcome (what you told them)" :aria-label="`Outcome for ${r.id}`" />
          <button class="btn" :disabled="busy || !outcome[r.id]" @click="closeRequest(r.id)">Close</button>
        </div>
      </section>

      <section class="stack-2" aria-labelledby="adm-reports-h" data-admin-reports>
        <span id="adm-reports-h" class="label">Abuse reports<template v-if="reports"> ({{ reports.length }}{{ reports.length === 100 ? ", newest 100" : "" }})</template></span>
        <p class="small muted">Reports people made about someone they connected with or saw in Who to meet. Each is kept 12 months. To act on one, look the person up under account recovery by their account ID.</p>
        <button v-if="!reports" class="btn" :disabled="busy" @click="loadReports">Show reports</button>
        <p v-else-if="!reports.length" class="muted">No reports.</p>
        <div v-for="r in reports || []" :key="r.id" class="panel stack">
          <div class="spread"><strong>{{ r.target.name || "No name" }} · {{ r.target.id }}</strong>
            <span class="small tnum">{{ fmt(r.createdAt) }}</span></div>
          <p class="small muted" style="margin:0">{{ r.target.reports }} report{{ r.target.reports === 1 ? "" : "s" }} about this person · from {{ r.reporter.name || "no name" }} ({{ r.reporter.id }})</p>
          <p style="margin:0;white-space:pre-wrap">{{ r.reason }}</p>
        </div>
      </section>

      <section class="stack-2">
        <span class="label">Promo codes ({{ promos?.length || 0 }})</span>
        <p class="small muted">A person's code gives Lanyard Plus for a number of days to the first people who claim it (a card and a confirmed email are needed; people after the limit are told their place and put on the Plus list). A host code gives an organisation event credits, is redeemed in the host portal and needs a limit. Anyone who cannot use a host code sees the same message, whatever the reason. The numbers are totals only.</p>
        <div v-for="p in promos || []" :key="p.code" class="panel stack">
          <div class="spread"><strong class="tnum">{{ p.code }}</strong>
            <span class="small" :class="p.active ? '' : 'muted'">{{ p.audience === "host" ? "Host" : "Person" }} · {{ p.active ? "Live" : "Off" }}</span></div>
          <p v-if="p.audience === 'host'" class="small muted" style="margin:0">
            {{ p.credits }} event credit{{ p.credits === 1 ? "" : "s" }}, lasting {{ p.credit_days }} days · {{ p.uses }} of {{ p.max_uses }} claimed
            · {{ p.credits_issued }} credits issued<template v-if="p.held"> · {{ p.held }} held until approval</template>
            <template v-if="kindsOf(p).length"> · only {{ kindsOf(p).join(", ") }}</template>
            <template v-if="p.expires_at"> · ends {{ fmt(p.expires_at) }}</template><template v-if="p.note"> · {{ p.note }}</template>
          </p>
          <p v-else class="small muted" style="margin:0">
            {{ p.days }} days of Plus · {{ p.uses }}<template v-if="p.max_uses"> of {{ p.max_uses }}</template> claimed · {{ p.attempts }} tried
            <template v-if="p.expires_at"> · ends {{ fmt(p.expires_at) }}</template><template v-if="p.note"> · {{ p.note }}</template>
          </p>
          <p class="small" style="margin:0;word-break:break-all">{{ redeemLink(p) }}</p>
          <div v-if="editing === p.code" class="stack">
            <label class="small">Limit<input v-model="edit.maxUses" type="number" min="1" :placeholder="p.audience === 'host' ? '' : 'blank = none'" /></label>
            <div class="small"><span :id="`pe-end-${p.code}`">Ends (optional)</span>
              <UiDatePicker :id="`pe-end-in-${p.code}`" v-model="edit.expiresAt" :labelledby="`pe-end-${p.code}`" min-today clearable /></div>
            <div class="btn-row"><button class="btn" @click="editing = null">Cancel</button><button class="btn btn-primary" :disabled="!!working" @click="saveEdit(p)">{{ working === saveEdit ? "Saving…" : "Save" }}</button></div>
          </div>
          <div v-else class="btn-row">
            <button class="btn" :disabled="!!working" @click="togglePromo(p)">{{ p.active ? "Switch off" : "Switch on" }}</button>
            <button class="btn" @click="startEdit(p)">Change limit or end date</button>
          </div>
        </div>
        <form class="stack" @submit.prevent="createPromo">
          <div class="seg" role="group" aria-label="Who is the code for" style="align-self:flex-start">
            <button type="button" class="seg-btn" :class="{ on: newPromo.audience === 'user' }" :aria-pressed="newPromo.audience === 'user'" @click="newPromo.audience = 'user'">A person (Plus)</button>
            <button type="button" class="seg-btn" :class="{ on: newPromo.audience === 'host' }" :aria-pressed="newPromo.audience === 'host'" @click="newPromo.audience = 'host'">A host (event credits)</button>
          </div>
          <input v-model="newPromo.code" type="text" maxlength="24" placeholder="New code, e.g. ABCD1234" aria-label="Code" style="text-transform:uppercase" />
          <div v-if="newPromo.audience === 'user'" class="btn-row">
            <label class="small" style="flex:1">Days of Plus<input v-model.number="newPromo.days" type="number" min="1" max="3650" /></label>
            <label class="small" style="flex:1">Limit (blank = none)<input v-model="newPromo.maxUses" type="number" min="1" /></label>
          </div>
          <template v-else>
            <div class="btn-row">
              <label class="small" style="flex:1">Event credits<input v-model.number="newPromo.credits" type="number" min="1" max="50" /></label>
              <label class="small" style="flex:1">Days they last<input v-model.number="newPromo.creditDays" type="number" min="1" max="730" /></label>
              <label class="small" style="flex:1">Limit (required)<input v-model="newPromo.maxUses" type="number" min="1" max="10000" /></label>
            </div>
            <div class="small"><span id="np-kinds-l">Only for (none ticked = any organisation)</span>
              <div class="chip-row" role="group" aria-labelledby="np-kinds-l" style="margin-top:6px">
                <button v-for="k in KINDS" :key="k[0]" type="button" class="chip chip-toggle" :class="{ on: newPromo.orgKinds.includes(k[0]) }" :aria-pressed="newPromo.orgKinds.includes(k[0])" @click="toggleKind(k[0])">{{ k[1] }}</button>
              </div>
            </div>
          </template>
          <div class="small"><span id="np-end-l">Ends (optional)</span>
            <UiDatePicker id="np-end" v-model="newPromo.expiresAt" labelledby="np-end-l" min-today clearable /></div>
          <input v-model="newPromo.note" type="text" maxlength="200" placeholder="Where is it printed? (only you see this)" aria-label="Note" />
          <button class="btn btn-primary" :disabled="!!working || newPromo.code.replace(/[^a-z0-9]/gi, '').length < 4 || (newPromo.audience === 'host' && !newPromo.maxUses)">{{ working === createPromo ? "Creating…" : "Create code" }}</button>
        </form>
      </section>

      <section class="stack-2" aria-labelledby="adm-funnel-h">
        <span id="adm-funnel-h" class="label">Welcome steps, last {{ funnel?.days || 30 }} days</span>
        <p class="small muted">How many new cards reached each step and got past it. Counts only: nothing about who. Step 1 counts people who saved a name, so someone who opens the page and leaves is not in it. Skipping a step counts as getting past it. Going Back and forward is counted once.</p>
        <p v-if="funnel && !funnel.steps.length" class="muted">No one has been through the steps yet.</p>
        <table v-else-if="funnel" class="funnel small">
          <thead><tr><th scope="col">Step</th><th scope="col" class="num">Reached</th><th scope="col" class="num">Got past it</th><th scope="col" class="num">Of step 1</th></tr></thead>
          <tbody>
            <tr v-for="s in funnel.steps" :key="s.step">
              <th scope="row">{{ s.step }}. {{ STEP_NAMES[s.step - 1] }}</th>
              <td class="num tnum">{{ s.reached }}</td><td class="num tnum">{{ s.completed }}</td>
              <td class="num tnum">{{ pct(s.reached, funnel.steps[0]?.reached) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="stack-2" aria-labelledby="adm-tips-h">
        <span id="adm-tips-h" class="label">Tips, last {{ tips?.days || 30 }} days</span>
        <p class="small muted">How many times each short tutorial started, was finished and was skipped. Counts only: nothing about who. A tip that was left without a choice is in neither of the last two.</p>
        <table v-if="tips" class="funnel small">
          <thead><tr><th scope="col">Tip</th><th scope="col" class="num">Shown</th><th scope="col" class="num">Finished</th><th scope="col" class="num">Skipped</th></tr></thead>
          <tbody>
            <tr v-for="t in tips.stages" :key="t.stage">
              <th scope="row">{{ TIP_NAMES[t.stage] || t.stage }}</th>
              <td class="num tnum">{{ t.shown }}</td><td class="num tnum">{{ t.finished }}</td><td class="num tnum">{{ t.skipped }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- F70: loaded only when Show metrics is pressed, so signing in adds no request for it. -->
      <AdminMetrics :call="call" :token="token" />

      <AdminAi :call="call" />

      <section class="stack-2">
        <span class="label">News and offers</span>
        <p class="small muted">Goes only to people who ticked the news box and have a verified email. Every email has an unsubscribe link. Send yourself a test first.</p>
        <input v-model="mail.subject" type="text" maxlength="150" placeholder="Subject" aria-label="Subject" />
        <textarea v-model="mail.body" rows="7" maxlength="8000" placeholder="Message (blank line = new paragraph)" aria-label="Message"></textarea>
        <div class="btn-row">
          <input v-model="mail.testTo" type="email" placeholder="Send a test to…" aria-label="Test address" />
          <button class="btn" style="width:auto" :disabled="busy || !mail.subject || !mail.body || !mail.testTo" @click="sendMailout(true)">Test</button>
        </div>
        <button class="btn btn-primary" :disabled="busy || !mail.subject || !mail.body" @click="sendMailout(false)">Send to everyone opted in</button>
        <p v-if="mail.result" class="success-text small">{{ mail.result }}</p>
      </section>

      <section class="stack-2">
        <span class="label">Account recovery</span>
        <p class="small muted">Find someone by name, university, email or card code. Check it is really them before giving a one-time code (valid 30 minutes) to type at /signin.</p>
        <form class="btn-row" @submit.prevent="findUsers">
          <input v-model="search" type="text" maxlength="60" placeholder="Name, email or card code" aria-label="Find a user" />
          <button class="btn" style="width:auto" :disabled="search.trim().length < 2">Search</button>
        </form>
        <p v-if="found && !found.length" class="muted">No matches.</p>
        <div v-for="u in found || []" :key="u.id" class="panel stack">
          <div class="spread"><strong>{{ u.name || "(no profile)" }}</strong><span class="small muted tnum">{{ u.id }}</span></div>
          <p class="small muted" style="margin:0">
            {{ [u.uni, u.course].filter(Boolean).join(" · ") || "No university" }} · joined {{ fmt(u.created_at) }}
            <template v-if="u.last_seen"> · last sign-in {{ fmt(u.last_seen) }}</template>
            <template v-if="u.recovery_email"> · {{ u.recovery_email }}{{ u.email_verified ? " (verified)" : "" }}</template>
          </p>
          <button v-if="!issued[u.id]" class="btn" :disabled="!!working" @click="issueCode(u.id)">{{ working === issueCode ? "Making…" : "Make a sign-in code" }}</button>
          <p v-else class="tnum" style="font-size:28px;font-weight:800;letter-spacing:3px;margin:0">{{ issued[u.id] }}</p>
        </div>
      </section>
    </template>
  </div>
</template>
