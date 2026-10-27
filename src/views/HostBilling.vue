<script setup>
// Billing for hosts: balance, credit packs, invoice requests, history.
// Card checkout comes later; until then a request creates an invoice (societies
// usually pay through union finance with a PO number).
import { onMounted, ref } from "vue";
import { Api } from "../lib/api";

const data = ref(null);
const state = ref("loading");
const error = ref("");
const picked = ref(null); // { id, label, pence, quote }
const form = ref({ email: "", po: "", note: "", quantity: 1 });
const busy = ref(false);
const sent = ref(null);

onMounted(load);
async function load() {
  try {
    data.value = await Api.hostBilling();
    form.value.email = data.value.org.billingEmail || "";
    state.value = "ready";
  } catch (e) {
    state.value = e.code === "account_required" ? "account" : "error";
    error.value = e.message;
  }
}

const gbp = (pence) => `£${(pence / 100).toFixed(pence % 100 ? 2 : 0)}`;
const fmt = (t) => (t ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "No expiry");
const perEvent = (s) => (s.credits > 1 && s.credits < 99 ? `${gbp(Math.round(s.pence / s.credits))} per event` : "");

function pick(s, quote = false) {
  picked.value = { ...s, quote };
  sent.value = null;
  error.value = "";
}
async function submit() {
  error.value = "";
  busy.value = true;
  try {
    const res = await Api.hostBillingRequest({
      sku: picked.value.id,
      quantity: picked.value.quote ? 1 : form.value.quantity,
      email: form.value.email,
      po: form.value.po,
      note: form.value.note,
    });
    sent.value = res;
    picked.value = null;
    form.value.note = "";
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="wide-col stack-3" style="max-width:760px">
    <div class="page-head">
      <router-link to="/host" class="small muted">‹ Host portal</router-link>
      <h1 style="margin-top:8px">Billing</h1>
      <p v-if="data" class="sub">{{ data.org.name }}</p>
    </div>

    <p v-if="state === 'loading'" class="muted">Loading…</p>
    <div v-else-if="state === 'account'" class="notice">
      Create your host account first. <router-link to="/host" style="text-decoration:underline">Go to the host portal</router-link>
    </div>
    <p v-else-if="state === 'error'" class="error-text">{{ error }}</p>

    <template v-else-if="data">
      <div class="panel spread">
        <div>
          <span class="label">Event credits left</span>
          <div class="tnum" style="font-size:32px;font-weight:700">{{ data.credits.remaining }}</div>
          <span v-if="data.credits.nextExpiry" class="small muted">next expire {{ fmt(data.credits.nextExpiry) }}</span>
        </div>
        <span class="small muted" style="max-width:240px;text-align:right">
          1 credit = 1 event of up to {{ data.cap }} check-ins.
        </span>
      </div>

      <div v-if="sent" class="notice success-text">
        Request received for {{ gbp(sent.amountPence) }}. We'll email an invoice to the billing address,
        and your credits are added once it's paid.
      </div>

      <section class="stack-2">
        <span class="label">{{ data.audience === 'society' ? 'Student society prices' : 'Event credits' }}</span>
        <div class="price-grid">
          <div v-for="s in data.skus" :key="s.id" class="price-card" :class="{ featured: s.id.endsWith('_5') }">
            <strong>{{ s.label }}</strong>
            <span class="price tnum">{{ gbp(s.pence) }}</span>
            <span class="per">{{ perEvent(s) || (s.credits >= 99 ? 'Unlimited events for a term' : 'One-off') }}</span>
            <button class="btn" style="margin-top:8px" @click="pick(s)">Request invoice</button>
          </div>
        </div>
        <p v-if="data.audience !== 'society'" class="small muted">
          Running a student society? Set your organisation type to “Student society” in the host portal for society prices.
        </p>
        <p class="small muted">
          Events over {{ data.cap }} check-ins use a second credit up to 1,000; bigger than that, ask for a quote.
          Card payments are coming. For now we invoice, and you can quote a purchase order number.
        </p>
      </section>

      <section class="stack-2">
        <span class="label">Bigger plans</span>
        <div class="list">
          <button v-for="q in data.quotes" :key="q.id" class="list-row spread" style="width:100%;text-align:left;background:none;border:none;cursor:pointer" @click="pick(q, true)">
            <span><strong>{{ q.label }}</strong>
              <span class="small muted" style="display:block">Termly or annual, unlimited events, reports, team seats</span></span>
            <span class="label">Get a quote ›</span>
          </button>
        </div>
      </section>

      <section v-if="picked" class="panel stack-2">
        <h2>{{ picked.quote ? 'Request a quote' : `Invoice for ${picked.label}` }}</h2>
        <div v-if="!picked.quote" class="field"><label for="qty">How many?</label>
          <input id="qty" v-model.number="form.quantity" type="number" min="1" max="20" /></div>
        <div class="field"><label for="b-email">Billing email</label>
          <input id="b-email" v-model="form.email" type="email" autocomplete="email" inputmode="email" /></div>
        <div v-if="!picked.quote" class="field"><label for="b-po">Purchase order number (optional)</label>
          <input id="b-po" v-model="form.po" type="text" maxlength="60" /></div>
        <div class="field"><label for="b-note">{{ picked.quote ? 'Tell us about your organisation and events' : 'Anything we should know? (optional)' }}</label>
          <textarea id="b-note" v-model="form.note" maxlength="300"></textarea></div>
        <p v-if="!picked.quote" class="small">Total <strong>{{ gbp(picked.pence * (form.quantity || 1)) }}</strong></p>
        <p v-if="error" class="error-text">{{ error }}</p>
        <div class="btn-row">
          <button class="btn" @click="picked = null">Cancel</button>
          <button class="btn btn-primary" :disabled="busy" @click="submit">{{ busy ? 'Sending…' : 'Send request' }}</button>
        </div>
      </section>

      <section v-if="data.requests.length" class="stack-2">
        <span class="label">Requests</span>
        <div class="list">
          <div v-for="r in data.requests" :key="r.id" class="list-row spread">
            <span>
              <strong>{{ r.sku.replace(/_/g, ' ') }}<span v-if="r.quantity > 1"> × {{ r.quantity }}</span></strong>
              <span class="small muted" style="display:block">{{ fmt(r.at) }}<span v-if="r.po"> · PO {{ r.po }}</span></span>
            </span>
            <span style="text-align:right">
              <span v-if="r.amountPence" class="tnum" style="display:block">{{ gbp(r.amountPence) }}</span>
              <span class="status-pill" :class="r.status">{{ r.status }}</span>
            </span>
          </div>
        </div>
      </section>

      <section class="stack-2">
        <span class="label">Credit history</span>
        <div class="list">
          <div v-for="l in data.ledger" :key="l.id" class="list-row spread">
            <span>
              <strong>{{ l.reason || 'credit' }}</strong>
              <span class="small muted" style="display:block">{{ fmt(l.at) }} · expires {{ fmt(l.expiresAt) }}</span>
            </span>
            <span class="tnum">{{ l.used }} / {{ l.granted }} used</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
