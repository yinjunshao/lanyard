<script setup>
// Plan: Free or Plus, the redeem link, and (F36) paying for Plus through Polar. What Plus includes and
// the prices come from the Worker (/api/billing/plans). While card payments are off (production until
// the F27 blockers are cleared) the page says "Paid plans are coming soon" and keeps the waitlist.
// Coming back from the payment page proves nothing: Plus starts when the provider's webhook says so.
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { me, refreshMe } from "../../lib/store";
import { Api, api } from "../../lib/api";
import AiAllowances from "./AiAllowances.vue";
import PayBox from "../../components/PayBox.vue";
import { useBusy } from "../../components/Waiting.vue";

const error = ref("");
const gbp = (pence) => `£${(pence / 100).toFixed(pence % 100 ? 2 : 0)}`;
const joining = ref(false);
const plans = ref(null);
const choice = ref(null); // the product picked for Pay
const busy = ref(false);
const payError = ref("");
const back = useRoute().query.checkout === "done";

const month = computed(() => plans.value?.products.find((p) => p.id === "plus_month"));
const year = computed(() => plans.value?.products.find((p) => p.id === "plus_year"));
const priceOf = (p) => `${gbp(p.pence)} a ${p.interval}`;

// F41: when the next bill is, or when Plus ends (from /api/billing/plans `mine`; dates in the person's own time).
const mine = computed(() => plans.value?.mine || null);
const dateOf = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const billLine = computed(() => {
  const m = mine.value;
  if (!m || m.tier !== "plus" || !m.until) return "";
  const date = dateOf(m.until);
  if (m.renews) {
    const pr = m.interval === "year" ? year.value : m.interval === "month" ? month.value : null;
    return `Next bill on ${date}${pr ? `, ${priceOf(pr)}` : ""}`;
  }
  if (m.cancelAtPeriodEnd) return `Plus ends on ${date}. You won't be charged again.`;
  return `Plus until ${date}, from a code.`;
});

onMounted(async () => {
  try { plans.value = await api("/api/billing/plans"); } catch { /* the page still shows the plan */ }
  if (back) await refreshMe().catch(() => {});
});

async function joinWaitlist() {
  joining.value = true;
  try {
    await Api.plusWaitlist();
    await refreshMe();
  } catch (e) {
    error.value = e.message;
  } finally {
    joining.value = false;
  }
}
async function pay() {
  payError.value = "";
  busy.value = true;
  try {
    const { url } = await api("/api/billing/checkout", "POST", { product: choice.value.id, startNow: true });
    window.location.assign(url);
  } catch (e) {
    payError.value = e.message;
    busy.value = false;
  }
}
const { working, once } = useBusy();
const manage = once(async () => {
  error.value = "";
  try {
    const { url } = await api("/api/billing/portal", "POST", {});
    window.location.assign(url);
  } catch (e) {
    error.value = e.message;
  }
});
</script>

<template>
  <div class="stack-2">
    <div v-if="back && me.plan.tier === 'free'" class="notice" role="status">
      Thanks. Plus starts as soon as the payment is confirmed, usually within a minute. Refresh this page to check.
    </div>
    <section id="plus" class="panel stack-2">
      <div class="spread">
        <span class="label">Your plan</span>
        <strong>{{ me.plan.label }}</strong>
      </div>
      <template v-if="me.plan.tier === 'free'">
        <h3>Lanyard Plus</h3>
        <p class="small muted">
          One paid plan, priced for students:
          <strong>{{ gbp(year?.pence || me.plan.plusPrice?.yearlyPence || 1199) }} a year</strong>
          or {{ gbp(month?.pence || me.plan.plusPrice?.monthlyPence || 149) }} a month.
          Everything you use today stays free.
        </p>
        <ul v-if="plans" class="small plan-list">
          <li v-for="i in plans.includes" :key="i.title"><strong>{{ i.title }}</strong>, {{ i.detail }}.</li>
        </ul>
        <router-link to="/redeem" class="small link-btn" style="text-align:left">Have a code? Redeem it</router-link>

        <template v-if="plans?.cardPayments">
          <div v-if="!choice" class="btn-row">
            <button class="btn btn-primary" @click="choice = year">Get Plus for {{ priceOf(year) }}</button>
            <button class="btn" @click="choice = month">{{ priceOf(month) }}</button>
          </div>
          <PayBox v-else :seller="plans.seller" :price="priceOf(choice)" :renews="choice.interval" what="Plus"
            :busy="busy" :error="payError" @pay="pay" @cancel="choice = null; payError = ''" />
        </template>
        <template v-else>
          <p class="small" style="margin:0"><strong>Paid plans are coming soon.</strong></p>
          <button v-if="!me.plan.onWaitlist" class="btn btn-primary" :disabled="joining" @click="joinWaitlist">
            {{ joining ? "Joining…" : "Tell me when Plus opens" }}
          </button>
          <p v-else class="success-text small">You're on the list. We'll email if you've added a recovery email, otherwise you'll see it here first.</p>
        </template>
      </template>
      <template v-else>
        <p class="small muted">Thanks for backing Lanyard. You have {{ me.plan.cards }} cards, custom colours and your own card codes.</p>
      </template>
      <p v-if="billLine" class="small" style="margin:0"><strong>{{ billLine }}</strong></p>
      <template v-if="mine?.managed">
        <button class="btn" style="align-self:flex-start" :disabled="!!working" @click="manage">{{ working === manage ? "Opening…" : "Manage billing" }}</button>
        <p class="small muted" style="margin:0">Change your card, see invoices or cancel on Polar's secure page.</p>
      </template>
    </section>
    <AiAllowances />
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
  </div>
</template>
