<script setup>
// Billing for hosts: balance, credit packs, invoice requests, history.
// A request creates an invoice (societies usually pay through union finance with a PO number).
// F36: when card payments are on (BILLING_ENABLED, off in production) a pack can also be paid by
// card through Polar, after the pre-contract box and the express-start tick; credits are added only
// when Polar's webhook confirms it, never by coming back to this page.
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute } from "vue-router";
import { HostApi } from "../lib/hostapi";
import HostRedeem from "../components/HostRedeem.vue";
import { api } from "../lib/api";
import Waiting from "../components/Waiting.vue";
document.title = "Billing | Lanyard hosts";

const data = ref(null);
const state = ref("loading");
const error = ref("");
const picked = ref(null); // { id, label, pence, quote }
const form = ref({ email: "", po: "", note: "", quantity: 1 });
const busy = ref(false);
const sent = ref(null);
const paying = ref(null); // the pack picked for Pay by card
// The box is loaded when Pay by card is pressed: a static import would add its chunk name to the
// host route table in the entry, which every public page loads (D024).
const PayBox = shallowRef(null);
async function openPay(s) {
  paying.value = s;
  picked.value = null;
  payError.value = "";
  if (!PayBox.value) PayBox.value = (await import("../components/PayBox.vue")).default;
}
const payBusy = ref(false);
const payError = ref("");
async function payCard() {
  payError.value = "";
  payBusy.value = true;
  try {
    const { url } = await api("/api/host/billing/checkout", "POST", { product: paying.value.id, startNow: true });
    window.location.assign(url);
  } catch (e) {
    payError.value = e.message;
    payBusy.value = false;
  }
}

// The same page serves /redeem (F20): promo codes live in HostRedeem, so no new route file is needed.
const route = useRoute();
const redeemMode = computed(() => route.path.startsWith("/redeem"));
const cameBack = route.query.checkout === "done";
onMounted(() => { if (!redeemMode.value) load(); });
watch(redeemMode, (on) => { if (!on) load(); });
async function load() {
  try {
    data.value = await HostApi.hostBilling();
    form.value.email = data.value.org.billingEmail || "";
    state.value = "ready";
  } catch (e) {
    state.value = ["signed_out", "details_required", "terms_required", "no_org"].includes(e.code) ? "account" : "error";
    error.value = e.message;
  }
}

const gbp = (pence) => `£${(pence / 100).toFixed(pence % 100 ? 2 : 0)}`;
const fmt = (t) => (t ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "No expiry");
const reasonLabel = (r) => (/^promo:/.test(r || "") ? `Promo code ${r.slice(6)}` : r || "credit");
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
    const res = await HostApi.hostBillingRequest({
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
  <HostRedeem v-if="redeemMode" />
  <div v-else class="wide-col stack-3" style="max-width:760px">
    <div class="page-head">
      <router-link to="/" class="small muted">‹ Host portal</router-link>
      <h1 style="margin-top:8px">Billing</h1>
      <p v-if="data" class="sub">{{ data.org.name }}</p>
    </div>

    <Waiting v-if="state === 'loading'" shape="panel" :rows="3" label="Loading billing" :retry="load" />
    <div v-else-if="state === 'account'" class="notice">
      Finish setting up in the host portal first. <router-link to="/" style="text-decoration:underline">Go to the host portal</router-link>
    </div>
    <p v-else-if="state === 'error'" class="error-text">{{ error }}</p>

    <template v-else-if="data">
      <div v-if="data.org.status === 'pending'" class="notice">
        Your application is still being reviewed. You can buy event packs once it's approved.
      </div>
      <div v-else-if="data.org.status === 'rejected'" class="notice">
        Your application wasn't approved{{ data.org.reviewNote ? ': ' + data.org.reviewNote : '.' }}
      </div>

      <div v-if="data.freeTier" class="panel">
        <span class="label">Student society plan</span>
        <p style="margin:6px 0 0"><strong>Free:</strong> {{ data.freeTier.eventsPerWeek }} event a week, up to {{ data.freeTier.checkinCap }} check-ins each.
          Need more? Society packs below are our cheapest prices.</p>
      </div>

      <div class="panel spread">
        <div>
          <span class="label">{{ data.freeTier ? 'Paid events banked' : 'Event credits left' }}</span>
          <div class="tnum" style="font-size:32px;font-weight:700">{{ data.credits.remaining }}</div>
          <span v-if="data.credits.nextExpiry" class="small muted">next expire {{ fmt(data.credits.nextExpiry) }}</span>
        </div>
        <span class="small muted" style="max-width:240px;text-align:right">
          1 credit = 1 event of up to {{ data.cap }} check-ins{{ data.freeTier ? ' (a hard limit for societies)' : '' }}.
        </span>
      </div>

      <p class="small" style="margin:0"><router-link to="/redeem" style="text-decoration:underline">Have a promo code?</router-link></p>

      <div v-if="data.heldPromos && data.heldPromos.length" class="notice" role="status">
        <strong>Held until your organisation is approved.</strong>
        <span v-for="h in data.heldPromos" :key="h.code" class="small" style="display:block">
          {{ h.credits }} free event{{ h.credits === 1 ? "" : "s" }} from a promo code. They are added as soon as you're approved.
        </span>
      </div>

      <div v-if="cameBack" class="notice" role="status">
        Thanks. Your events are added as soon as the payment is confirmed, usually within a minute. Refresh this page to check.
      </div>

      <div v-if="sent" class="notice success-text">
        Request received for {{ gbp(sent.amountPence) }}. We'll email an invoice to the billing address,
        and your credits are added once it's paid.
      </div>

      <section class="stack-2">
        <span class="label">{{ data.audience === 'society' ? 'Student society prices' : data.audience === 'institution' ? 'Education prices' : 'Event credits' }}</span>
        <div class="price-grid">
          <div v-for="s in data.skus" :key="s.id" class="price-card" :class="{ featured: s.id.endsWith('_5') }">
            <strong>{{ s.label }}</strong>
            <span class="price tnum">{{ gbp(s.pence) }}</span>
            <span class="per">{{ perEvent(s) || (s.credits >= 99 ? 'Unlimited events for a term' : 'One-off') }}</span>
            <button v-if="s.card" class="btn btn-primary" style="margin-top:8px" :disabled="data.org.status !== 'approved'" @click="openPay(s)">Pay by card</button>
            <button class="btn" style="margin-top:8px" :disabled="data.org.status !== 'approved'" @click="pick(s); paying = null">Request invoice</button>
          </div>
        </div>
        <p v-if="data.audience === 'standard'" class="small muted">
          Student societies and educational institutions have their own, lower prices. They apply for approval
          when creating their organisation.
        </p>
        <p class="small muted">
          <template v-if="data.audience === 'society'">Society events are capped at {{ data.cap }} check-ins.</template>
          <template v-else>Events over {{ data.cap }} check-ins use a second credit up to 1,000; bigger than that, ask for a quote.</template>
          <template v-if="data.cardPayments">{{ " " }}Pay by card, or ask for an invoice and quote a purchase order number.</template>
          <template v-else>{{ " " }}Card payments are coming soon. For now we invoice, and you can quote a purchase order number.</template>
        </p>
      </section>

      <component :is="PayBox" v-if="paying && data.seller && PayBox" :seller="data.seller" :price="gbp(paying.pence)" :what="paying.label"
        :busy="payBusy" :error="payError" @pay="payCard" @cancel="paying = null; payError = ''" />

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
              <strong>{{ reasonLabel(l.reason) }}</strong>
              <span class="small muted" style="display:block">{{ fmt(l.at) }} · expires {{ fmt(l.expiresAt) }}</span>
            </span>
            <span class="tnum">{{ l.used }} / {{ l.granted }} used</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
