<script setup>
// The AI section of the admin page (F21): is it on, spend against budget, the kill switch, who may use it,
// calls per feature, the busiest people (ids only) and a test call. Every number comes from the Worker;
// nothing here shows a key, a prompt or anyone's text. `call` is the admin page's own fetch (it carries the token).
import { computed, onMounted, ref } from "vue";

const props = defineProps({ call: { type: Function, required: true } });
const d = ref(null);
const error = ref("");
const busy = ref(false);
const allowText = ref("");
const testResult = ref("");

async function load() {
  try {
    d.value = await props.call("/api/admin/ai");
    allowText.value = d.value.settings.allow.join("\n");
  } catch (e) { error.value = e.message; }
}
async function act(fn) {
  error.value = ""; busy.value = true;
  try { await fn(); await load(); } catch (e) { error.value = e.message; } finally { busy.value = false; }
}
const setKilled = (killed) => {
  if (killed && !window.confirm("Switch AI off for everyone? Every AI feature falls back to its non-AI version at once.")) return;
  act(() => props.call("/api/admin/ai/kill", "POST", { killed }));
};
const setRollout = (mode) => act(() => props.call("/api/admin/ai/rollout", "POST", { mode }));
const saveAllow = () => act(() => props.call("/api/admin/ai/allow", "PUT", { emails: allowText.value.split(/[\s,;]+/).filter(Boolean) }));
const runTest = () => act(async () => {
  testResult.value = "";
  const r = await props.call("/api/admin/ai/test", "POST", {});
  testResult.value = r.ok ? `Worked${r.stub ? " (local stub, no model was called)" : ""}: ${r.usage.inputTokens} tokens in, ${r.usage.outputTokens} out.` : `Did not work: ${r.reason}. ${r.message}`;
});

const money = (n) => `$${n >= 1 ? n.toFixed(2) : n.toFixed(4)}`;
const pct = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : "0%");
const STATE = {
  on: "AI is on.",
  off_env: "AI is off: AI_ENABLED is not set to 1 in the Worker's variables.",
  off_switch: "AI is off: switched off here by the kill switch.",
  not_configured: "AI is on but not set up: the gateway address or the key is missing, so every feature falls back.",
  stub_refused: "AI is on but AI_STUB is set on a non-local address, so it is refused and every feature falls back.",
};
const ROLLOUT = [
  { mode: "allowlist", label: "Only the addresses listed below", hint: "Start here." },
  { mode: "plus", label: "Plus accounts, hosts and the list", hint: "Free accounts stay out." },
  { mode: "everyone", label: "Everyone with a confirmed email", hint: "Each on their free allowance." },
];
const KIND = { user: "Person", host: "Host", admin: "Admin" };
const FOLLOWUP_ROWS = [["drafted_ai", "Written by the model"], ["drafted_template", "Template shown instead"], ["copied", "Copied"], ["opened", "Opened in LinkedIn, Mail or WhatsApp"], ["marked", "Marked as followed up"]];
const stateText = computed(() => STATE[d.value?.state] || "");
onMounted(load);
</script>

<template>
  <section class="stack-2" aria-labelledby="adm-ai-h">
    <span id="adm-ai-h" class="label">AI features</span>
    <p class="small muted">The foundation for every AI feature: the switches, the budget and who may use it. No prompt or reply text is shown here, and people appear as ids only.</p>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>

    <template v-if="d">
      <div class="panel stack">
        <p :class="d.state === 'on' ? 'success-text' : 'error-text'" style="margin:0;font-weight:700" role="status">{{ stateText }}</p>
        <div class="list">
          <div class="list-row spread"><span class="muted">Model</span><span class="tnum">{{ d.config.model }}</span></div>
          <div class="list-row spread"><span class="muted">Gateway address</span><span>{{ d.config.gatewaySet ? "Set" : "Not set" }}</span></div>
          <div class="list-row spread"><span class="muted">Key</span><span>{{ d.config.keySet ? "Set" : "Not set" }}</span></div>
          <div class="list-row spread"><span class="muted">Prices per million tokens</span>
            <span class="tnum">{{ money(d.config.prices.inputPerMtokUsd) }} in, {{ money(d.config.prices.outputPerMtokUsd) }} out</span></div>
          <div class="list-row spread"><span class="muted">Budget alerts by email</span><span>{{ d.config.alertEmailSet ? "On" : "Not set" }}</span></div>
        </div>
        <p v-if="!d.config.prices.confirmed" class="small error-text" style="margin:0">These prices are the plan's figures and have not been checked. Check them against Anthropic's published pricing and set AI_PRICE_INPUT_PER_MTOK_USD and AI_PRICE_OUTPUT_PER_MTOK_USD, or the spend figures below may be wrong.</p>
        <p v-if="d.config.stub.allowed" class="small muted" style="margin:0">Local stub mode: answers are canned and nothing leaves this machine.</p>
      </div>

      <div class="panel stack">
        <span class="label">Spend</span>
        <div class="list">
          <div class="list-row spread"><span class="muted">Today</span>
            <span class="tnum">{{ money(d.today.spendUsd) }} of {{ money(d.config.dailyBudgetUsd) }} ({{ pct(d.today.spendUsd, d.config.dailyBudgetUsd) }})</span></div>
          <div class="list-row spread"><span class="muted">This month</span>
            <span class="tnum">{{ money(d.month.spendUsd) }} of {{ money(d.config.monthlyBudgetUsd) }} ({{ pct(d.month.spendUsd, d.config.monthlyBudgetUsd) }})</span></div>
          <div class="list-row spread"><span class="muted">Calls to the model, today / month</span><span class="tnum">{{ d.today.calls }} / {{ d.month.calls }}</span></div>
          <div class="list-row spread"><span class="muted">Served from the cache, today / month</span><span class="tnum">{{ d.today.cacheHits }} / {{ d.month.cacheHits }}</span></div>
          <div class="list-row spread"><span class="muted">Cache hit rate, this month</span><span class="tnum">{{ d.cacheHitRate === null ? "none yet" : Math.round(d.cacheHitRate * 100) + "%" }}</span></div>
          <div class="list-row spread"><span class="muted">Fell back to the non-AI version, today / month</span><span class="tnum">{{ d.today.fallbacks }} / {{ d.month.fallbacks }}</span></div>
        </div>
        <p class="small muted" style="margin:0">At 100% of either budget every feature falls back until it resets (midnight UTC, or the 1st). The Cloudflare AI Gateway dashboard is the second count to compare with.</p>
      </div>

      <div class="panel stack">
        <span class="label">Kill switch</span>
        <p class="small muted" style="margin:0">Takes effect on the next request. Nobody is signed out and nothing is deleted.</p>
        <button v-if="!d.settings.killed" class="btn btn-danger" :disabled="busy" @click="setKilled(true)">Switch AI off for everyone</button>
        <button v-else class="btn btn-primary" :disabled="busy" @click="setKilled(false)">Switch AI back on</button>
      </div>

      <fieldset class="panel stack" style="border:var(--border);margin:0">
        <legend class="label" style="padding:0 6px">Who may use it</legend>
        <label v-for="r in ROLLOUT" :key="r.mode" class="small" style="display:flex;gap:10px;align-items:flex-start;min-height:44px">
          <input type="radio" name="ai-rollout" :value="r.mode" :checked="d.settings.rollout === r.mode" :disabled="busy" style="margin-top:3px" @change="setRollout(r.mode)" />
          <span><strong>{{ r.label }}</strong><br /><span class="muted">{{ r.hint }}</span></span>
        </label>
        <label for="adm-ai-allow" class="label">Allow-list: one email address per line (up to {{ d.settings.maxAllow }})</label>
        <textarea id="adm-ai-allow" v-model="allowText" rows="4" maxlength="6000" spellcheck="false" autocomplete="off"></textarea>
        <button class="btn" :disabled="busy" @click="saveAllow">Save the list</button>
        <p class="small muted" style="margin:0">Listed addresses can always use AI, at any stage. They still need a confirmed email, and a host account is matched by its sign-in address.</p>
      </fieldset>

      <div class="panel stack">
        <span class="label">Test the connection</span>
        <p class="small muted" style="margin:0">Sends one tiny request with no personal data through the same checks as everything else. Costs a fraction of a penny.</p>
        <button class="btn" :disabled="busy" @click="runTest">Run a test call</button>
        <p v-if="testResult" class="small" role="status" style="margin:0">{{ testResult }}</p>
      </div>

      <div class="stack-2">
        <span class="label">Calls per feature, this month</span>
        <p v-if="!d.features.length" class="muted">Nothing yet.</p>
        <div v-else style="overflow-x:auto"><table class="funnel small">
          <thead><tr><th scope="col">Feature</th><th scope="col" class="num">Calls</th><th scope="col" class="num">Cache</th><th scope="col" class="num">Fallbacks</th><th scope="col" class="num">At limit</th><th scope="col" class="num">Spend</th></tr></thead>
          <tbody>
            <tr v-for="f in d.features" :key="f.feature">
              <th scope="row">{{ f.feature }}</th>
              <td class="num tnum">{{ f.calls }}</td><td class="num tnum">{{ f.cacheHits }}</td><td class="num tnum">{{ f.fallbacks }}</td>
              <td class="num tnum">{{ f.limited }}</td><td class="num tnum">{{ money(f.spendUsd) }}</td>
            </tr>
          </tbody>
        </table></div>
      </div>

      <div class="stack-2">
        <span class="label">Follow-up drafts: did they help?</span>
        <p class="small muted" style="margin:0">Counts only, with no person or text. Shown means a draft appeared (written by the model, or the template when AI was not available).</p>
        <div style="overflow-x:auto"><table class="funnel small">
          <thead><tr><th scope="col">What happened</th><th scope="col" class="num">Today</th><th scope="col" class="num">This month</th></tr></thead>
          <tbody>
            <tr v-for="row in FOLLOWUP_ROWS" :key="row[0]">
              <th scope="row">{{ row[1] }}</th>
              <td class="num tnum">{{ d.followup?.[row[0]]?.today ?? 0 }}</td><td class="num tnum">{{ d.followup?.[row[0]]?.month ?? 0 }}</td>
            </tr>
          </tbody>
        </table></div>
      </div>

      <div class="stack-2">
        <span class="label">Busiest this month (ids only)</span>
        <p v-if="!d.topUsers.length" class="muted">Nobody yet.</p>
        <div v-else style="overflow-x:auto"><table class="funnel small">
          <thead><tr><th scope="col">Who</th><th scope="col" class="num">Calls</th><th scope="col" class="num">At limit</th><th scope="col" class="num">Spend</th></tr></thead>
          <tbody>
            <tr v-for="u in d.topUsers" :key="u.kind + u.id">
              <th scope="row"><span class="muted">{{ KIND[u.kind] || u.kind }}</span> <span class="tnum">{{ u.id }}</span></th>
              <td class="num tnum">{{ u.calls }}</td><td class="num tnum">{{ u.limited }}</td><td class="num tnum">{{ money(u.spendUsd) }}</td>
            </tr>
          </tbody>
        </table></div>
        <template v-if="d.flagged.length">
          <span class="label">At their limit three days running</span>
          <p class="small muted" style="margin:0">Flagged, not blocked. Look them up under Account recovery with the id.</p>
          <p v-for="u in d.flagged" :key="u.kind + u.id" class="small" style="margin:0"><span class="muted">{{ KIND[u.kind] || u.kind }}</span> <span class="tnum">{{ u.id }}</span>, {{ u.days }} days, last {{ u.last }}</p>
        </template>
      </div>
    </template>
  </section>
</template>
