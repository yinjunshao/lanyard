<script setup>
// The Platform metrics section of the admin page (F70, D062): totals about the service (accounts, profiles, use,
// network, events, revenue), a daily archive of them and a CSV of that archive. Every number comes from the Worker
// and is a total; nothing here shows or asks for a person. It is only fetched when "Show metrics" is pressed, so the
// page's first load does not add a slow query or another admin request. `call` is the admin page's own fetch (JSON,
// carries the token); the CSV needs the raw response, so it uses `token` with fetch itself (a plain link cannot send
// the Bearer header).
import { computed, ref } from "vue";
import UiDatePicker from "./ui/UiDatePicker.vue";

const props = defineProps({ call: { type: Function, required: true }, token: { type: String, default: "" } });
const d = ref(null);
const error = ref("");
const busy = ref(false);
const notice = ref("");
const from = ref("");
const to = ref("");

const N = (v) => Number(v || 0).toLocaleString("en-GB");
const P = (v) => `${Number(v || 0).toFixed(1)}%`;
const R = (v) => Number(v || 0).toFixed(2);
const GBP = (pence) => `£${(Number(pence || 0) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Each group: its tiles [label, key, formatter] and one plain line where the meaning is not obvious.
const GROUPS = [
  { id: "accounts", title: "Accounts", note: "An account is anyone with a Lanyard card or who connected from one; claimed means they saved it to sign in again. Guests are everyone else.", tiles: [
    ["Accounts", "users_total", N], ["Claimed", "users_claimed", N], ["Guests", "users_guest", N], ["Email confirmed", "users_email_confirmed", N], ["Made by admin, waiting", "premade_waiting", N],
    ["Suggested details waiting", "suggestions_open", N], ["Suggestions accepted, 30 days", "suggestions_accepted_30d", N], ["Suggestions declined, 30 days", "suggestions_declined_30d", N],
    ["New today", "signups_1d", N], ["New in 7 days", "signups_7d", N], ["New in 30 days", "signups_30d", N],
    ["Student profiles", "mode_student", N], ["Career profiles", "mode_career", N]] },
  { id: "profiles", title: "Profiles", note: "Percentages are out of all accounts. Complete is 6 of 6 on the same score people see on Edit profile: name, photo, university or company, course or role, what you do, a link.", tiles: [
    ["Profiles saved", "profiles_total", N], ["Have a profile", "profile_pct", P], ["Complete (6 of 6)", "profile_complete_pct", P], ["Half done (3 or more)", "profile_half_pct", P], ["Average score", "profile_score_avg", R],
    ["With a photo", "with_photo_pct", P], ["With a headline", "with_headline_pct", P], ["With a link", "with_link_pct", P], ["With a card", "with_card_pct", P],
    ["Finished the welcome steps", "onboarding_done_pct", P]] },
  { id: "active", title: "Active use", note: "Active means they opened the app. Lanyard notes this at most once a day for each person, so the one-day figure reads a little low. Came back is rough: of accounts made 30 to 60 days ago, the share opened in the last 30 days.", tiles: [
    ["Active today", "active_1d", N], ["Active in 7 days", "active_7d", N], ["Active in 30 days", "active_30d", N], ["Daily out of monthly", "stickiness_pct", P],
    ["Claimed and active in 30 days", "active_30d_of_claimed_pct", P], ["Came back a month later", "returned_pct", P],
    ["Added to home screen", "app_installed_pct", P], ["Use a passkey", "passkey_pct", P]] },
  { id: "network", title: "Network", note: "A connection is one pair of people.", tiles: [
    ["Connections", "connections_total", N], ["In 7 days", "connections_7d", N], ["In 30 days", "connections_30d", N],
    ["Accounts with a connection", "connected_users_pct", P], ["Per active account (30 days)", "connections_per_active", R]] },
  { id: "events", title: "Events", note: "An event counts as recent if it started in the last 30 days.", tiles: [
    ["Organisations", "orgs_total", N], ["Approved", "orgs_approved", N], ["Host accounts", "host_accounts", N],
    ["Events", "events_total", N], ["Events in 30 days", "events_30d", N], ["Check-ins", "checkins_total", N], ["Check-ins in 30 days", "checkins_30d", N],
    ["Check-ins per event (30 days)", "checkins_per_event_30d", R], ["Feedback answers (30 days)", "feedback_responses_30d", N]] },
  { id: "revenue", title: "Revenue", note: "Paid orders only: a refunded order is not counted. Plus is counted the way the app counts it. Credits are the ones bought, not starter or promo ones.", tiles: [
    ["Plus now", "plus_active", N], ["Plus out of claimed", "plus_pct", P], ["Paid orders (30 days)", "paid_orders_30d", N],
    ["Paid in 30 days", "paid_pence_30d", GBP], ["Event credits bought (30 days)", "event_credits_bought_30d", N]] },
];

const spread = computed(() => {
  const m = d.value?.now;
  if (!m) return [];
  const rows = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ score: i, n: m[`profile_score_${i}`] || 0 }));
  const top = Math.max(1, ...rows.map((r) => r.n));
  return rows.map((r) => ({ ...r, w: Math.round((r.n / top) * 100) }));
});

async function show() {
  if (busy.value) return;
  error.value = ""; busy.value = true;
  try { d.value = await props.call("/api/admin/metrics"); } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
async function snapshot() {
  if (busy.value) return;
  error.value = ""; notice.value = ""; busy.value = true;
  try {
    const r = await props.call("/api/admin/metrics/snapshot", "POST", {});
    d.value = { ...d.value, snapshots: r.snapshots, first: r.first, last: r.last };
    notice.value = `Saved today's snapshot (${r.day}). Taking it again replaces it.`;
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
async function download() {
  if (busy.value) return;
  error.value = ""; notice.value = ""; busy.value = true;
  try {
    const q = new URLSearchParams();
    if (from.value) q.set("from", from.value);
    if (to.value) q.set("to", to.value);
    const res = await fetch(`/api/admin/metrics/export${q.toString() ? "?" + q : ""}`, { headers: { authorization: `Bearer ${props.token}` } });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || "The file could not be made. Try again in a minute.");
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")?.[1] || "lanyard-metrics.csv";
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice.value = `Downloaded ${name}.`;
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
</script>

<template>
  <section class="stack-2" aria-labelledby="adm-metrics-h" data-admin-metrics>
    <span id="adm-metrics-h" class="label">Platform metrics</span>
    <p class="small muted">Totals about the whole service, for reporting. Nothing here is about one person. Every press of Show metrics reads every account, so it is logged and only done when you ask. A snapshot is kept each night at about 03:17 UTC and describes the day before.</p>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <button v-if="!d" class="btn" :disabled="busy" @click="show">{{ busy ? "Counting…" : "Show metrics" }}</button>

    <template v-else>
      <div v-for="g in GROUPS" :key="g.id" class="am-group stack-2">
        <h3 :id="`adm-m-${g.id}`" class="label am-h">{{ g.title }}</h3>
        <div class="am-tiles" role="list" :aria-labelledby="`adm-m-${g.id}`">
          <div v-for="t in g.tiles" :key="t[1]" class="am-tile" role="listitem">
            <span class="am-num tnum">{{ t[2](d.now[t[1]]) }}</span>
            <span class="small muted">{{ t[0] }}</span>
          </div>
        </div>
        <p class="small muted" style="margin:0">{{ g.note }}</p>
        <div v-if="g.id === 'profiles'" class="am-spread" role="group" aria-label="How many profiles have each score out of 6">
          <div v-for="r in spread" :key="r.score" class="am-row">
            <span class="small tnum am-score">{{ r.score }} of 6</span>
            <span class="am-track" aria-hidden="true"><span class="am-fill" :style="{ width: r.w + '%' }"></span></span>
            <span class="small tnum am-n">{{ N(r.n) }}</span>
          </div>
        </div>
      </div>

      <div class="panel stack">
        <span class="label">Archive</span>
        <p class="small" style="margin:0">Snapshots: <strong class="tnum">{{ d.snapshots }}</strong><template v-if="d.snapshots">, from {{ d.first }} to {{ d.last }}</template><template v-else>: none yet. The first is taken tonight, or press the button.</template></p>
        <button class="btn" :disabled="busy" @click="snapshot">{{ busy ? "Working…" : "Take a snapshot now" }}</button>
        <div class="am-range">
          <div class="small"><span id="adm-m-from-l">From (optional)</span>
            <UiDatePicker id="adm-m-from" v-model="from" labelledby="adm-m-from-l" :max="to" clearable placeholder="First day" /></div>
          <div class="small"><span id="adm-m-to-l">To (optional)</span>
            <UiDatePicker id="adm-m-to" v-model="to" labelledby="adm-m-to-l" :min="from" clearable placeholder="Last day" /></div>
        </div>
        <button class="btn btn-primary" :disabled="busy" @click="download">{{ busy ? "Working…" : "Download CSV" }}</button>
        <p class="small muted" style="margin:0">One line a day and one column for each number, so a spreadsheet can graph it. A column is empty on days before that number existed.</p>
        <p v-if="notice" class="success-text small" role="status" style="margin:0">{{ notice }}</p>
      </div>
      <button class="btn" :disabled="busy" @click="show">Refresh the numbers</button>
    </template>
  </section>
</template>

<style scoped>
.am-h { margin: 0; }
.am-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.am-tile { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; background: var(--paper-raised); border: var(--border); border-radius: var(--radius); min-width: 0; }
.am-num { font-size: 22px; font-weight: 800; line-height: 1.15; overflow-wrap: anywhere; }
.am-spread { display: flex; flex-direction: column; gap: 6px; }
.am-row { display: grid; grid-template-columns: 52px 1fr 52px; align-items: center; gap: 8px; }
.am-n { text-align: right; }
.am-track { height: 12px; background: var(--rule); border-radius: 3px; overflow: hidden; }
.am-fill { display: block; height: 100%; background: var(--strap); border-radius: 3px; min-width: 0; }
.am-range { display: grid; grid-template-columns: 1fr; gap: 8px; }
@media (min-width: 600px) { .am-range { grid-template-columns: 1fr 1fr; } }
</style>
