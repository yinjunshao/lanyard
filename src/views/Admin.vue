<script setup>
// Admin: approve society and institution applications, handle tickets.
// Sign in with the ADMIN_TOKEN secret. It is kept for this browser tab only.
import { onMounted, ref } from "vue";

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
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
const requests = ref(null);
const outcome = ref({});
async function loadRequests() {
  try { requests.value = (await call("/api/admin/privacy-requests")).requests; } catch (e) { error.value = e.message; }
}
async function closeRequest(id) {
  error.value = "";
  try { await call(`/api/admin/privacy-requests/${id}/close`, "POST", { outcome: outcome.value[id] || "" }); await loadRequests(); }
  catch (e) { error.value = e.message; }
}
const search = ref("");
const found = ref(null);
const issued = ref({}); // user id -> sign-in code

async function findUsers() {
  error.value = "";
  try { found.value = (await call(`/api/admin/users?q=${encodeURIComponent(search.value)}`)).users; }
  catch (e) { error.value = e.message; }
}
async function issueCode(id) {
  error.value = "";
  try { issued.value[id] = (await call(`/api/admin/users/${id}/signin-code`, "POST")).code; }
  catch (e) { error.value = e.message; }
}

onMounted(() => {
  try { token.value = sessionStorage.getItem(TOKEN_KEY) || ""; } catch { /* private window */ }
  if (token.value) load();
});

async function call(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: { authorization: `Bearer ${token.value}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error || `Request failed (${res.status})`), { status: res.status });
  return json;
}

// Promo codes (/redeem)
const promos = ref(null);
const newPromo = ref({ code: "", days: 365, maxUses: 50, expiresAt: "", note: "" });
async function loadPromos() {
  try { promos.value = (await call("/api/admin/promos")).promos; } catch (e) { error.value = e.message; }
}
async function createPromo() {
  error.value = "";
  try {
    await call("/api/admin/promos", "POST", { ...newPromo.value });
    newPromo.value = { code: "", days: 365, maxUses: 50, expiresAt: "", note: "" };
    await loadPromos();
  } catch (e) { error.value = e.message; }
}
async function togglePromo(p) {
  error.value = "";
  try { await call(`/api/admin/promos/${p.code}/active`, "POST", { active: !p.active }); await loadPromos(); }
  catch (e) { error.value = e.message; }
}
const redeemLink = (code) => `${location.origin}/redeem/${code}`;

async function load() {
  error.value = "";
  loadRequests();
  loadPromos();
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
  <div class="wide-col stack-3" style="max-width:820px">
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

      <section class="stack-2">
        <span class="label">Privacy requests and complaints ({{ requests?.length || 0 }})</span>
        <p v-if="requests && !requests.length" class="muted">Nothing open.</p>
        <div v-for="r in requests || []" :key="r.id" class="panel stack">
          <div class="spread"><strong>{{ r.kind }} · {{ r.id }}</strong>
            <span class="small" :style="r.overdue ? 'color:var(--strap-deep);font-weight:700' : ''">{{ r.overdue ? "OVERDUE" : "reply by" }} {{ fmt(r.respondBy) }}</span></div>
          <p class="small muted" style="margin:0">{{ r.email }}<template v-if="r.userId"> · account {{ r.userId }}</template><template v-if="!r.acknowledged"> · acknowledgement email FAILED: reply by hand</template></p>
          <p style="margin:0;white-space:pre-wrap">{{ r.message }}</p>
          <input v-model="outcome[r.id]" type="text" maxlength="500" placeholder="Outcome (what you told them)" :aria-label="`Outcome for ${r.id}`" />
          <button class="btn" :disabled="!outcome[r.id]" @click="closeRequest(r.id)">Close</button>
        </div>
      </section>

      <section class="stack-2">
        <span class="label">Promo codes ({{ promos?.length || 0 }})</span>
        <p class="small muted">Each code gives Lanyard Plus for a number of days to the first people who claim it. Claiming needs a card and a confirmed email. People after the limit are told their place and put on the Plus list.</p>
        <div v-for="p in promos || []" :key="p.code" class="panel stack">
          <div class="spread"><strong class="tnum">{{ p.code }}</strong>
            <span class="small" :class="p.active ? '' : 'muted'">{{ p.active ? "Live" : "Off" }}</span></div>
          <p class="small muted" style="margin:0">
            {{ p.days }} days of Plus · {{ p.uses }}<template v-if="p.max_uses"> of {{ p.max_uses }}</template> claimed · {{ p.attempts }} tried
            <template v-if="p.expires_at"> · ends {{ fmt(p.expires_at) }}</template><template v-if="p.note"> · {{ p.note }}</template>
          </p>
          <p class="small" style="margin:0;word-break:break-all">{{ redeemLink(p.code) }}</p>
          <button class="btn" @click="togglePromo(p)">{{ p.active ? "Switch off" : "Switch on" }}</button>
        </div>
        <form class="stack" @submit.prevent="createPromo">
          <input v-model="newPromo.code" type="text" maxlength="24" placeholder="New code, e.g. AISOC" aria-label="Code" style="text-transform:uppercase" />
          <div class="btn-row">
            <label class="small" style="flex:1">Days of Plus<input v-model.number="newPromo.days" type="number" min="1" max="3650" /></label>
            <label class="small" style="flex:1">Limit (blank = none)<input v-model="newPromo.maxUses" type="number" min="1" /></label>
          </div>
          <label class="small">Ends (optional)<input v-model="newPromo.expiresAt" type="date" /></label>
          <input v-model="newPromo.note" type="text" maxlength="200" placeholder="Where is it printed? (only you see this)" aria-label="Note" />
          <button class="btn btn-primary" :disabled="newPromo.code.replace(/[^a-z0-9]/gi, '').length < 4">Create code</button>
        </form>
      </section>

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
          <button v-if="!issued[u.id]" class="btn" @click="issueCode(u.id)">Make a sign-in code</button>
          <p v-else class="tnum" style="font-size:28px;font-weight:800;letter-spacing:3px;margin:0">{{ issued[u.id] }}</p>
        </div>
      </section>
    </template>
  </div>
</template>
