<script setup>
// F36: what someone must see and agree to before Pay (Consumer Contracts Regulations 2013; F27).
// Who sells it, the full price, whether it renews, how to cancel, the 14-day right, and an
// unticked express-start box that must be ticked to continue. The server checks the tick too.
import { onMounted, ref } from "vue";

const props = defineProps({
  seller: { type: Object, required: true }, // { name, address } from the server
  price: { type: String, required: true },   // "£1.49 a month" or "£49.50"
  renews: { type: String, default: "" },     // "month" or "year"; empty for a one-off pack
  what: { type: String, required: true },    // "Lanyard Plus" or "5 events"
  busy: { type: Boolean, default: false },
  error: { type: String, default: "" },
});
const emit = defineEmits(["pay", "cancel"]);
const ticked = ref(false);
const id = `start-${Math.random().toString(36).slice(2, 8)}`;
// The box opens below the price that was pressed; bring it into view (on a phone it is off screen).
const root = ref(null);
onMounted(() => root.value?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }));
</script>

<template>
  <section ref="root" class="panel stack-2" aria-labelledby="paybox-h">
    <h3 id="paybox-h" style="margin:0">Before you pay</h3>
    <dl class="small paybox">
      <dt>Sold by</dt>
      <dd>{{ props.seller.name }}, {{ props.seller.address }}. Payment, tax and receipts are handled by our reseller, Polar Software, Inc.</dd>
      <dt>Price</dt>
      <dd><strong>{{ props.price }}</strong>. This is the full price.</dd>
      <template v-if="props.renews">
        <dt>Renewal</dt>
        <dd>Renews automatically every {{ props.renews }} until you cancel.</dd>
        <dt>Cancelling</dt>
        <dd>Cancel at any time in Settings, Plan, Manage or cancel. {{ props.what }} then runs to the end of the {{ props.renews }} you paid for.</dd>
      </template>
      <template v-else>
        <dt>Renewal</dt>
        <dd>A one-off payment. Nothing renews.</dd>
      </template>
      <dt>Your 14 days</dt>
      <dd v-if="props.renews">You can cancel within 14 days of starting and get a refund, minus the days you have used.</dd>
      <dd v-else>You can cancel within 14 days of paying and get a refund for the events you have not used.</dd>
    </dl>
    <label class="checkbox-row" :for="id">
      <input :id="id" v-model="ticked" type="checkbox" />
      <span class="small">
        <template v-if="props.renews">Start {{ props.what }} now. I understand that if I cancel within 14 days I'll get a refund minus the days I've used.</template>
        <template v-else>Add the events now. I understand that if I cancel within 14 days I'll get a refund for the events I haven't used.</template>
      </span>
    </label>
    <p v-if="props.error" class="error-text small" role="alert" style="margin:0">{{ props.error }}</p>
    <div class="btn-row">
      <button class="btn" type="button" @click="emit('cancel')">Not now</button>
      <button class="btn btn-primary" type="button" :disabled="!ticked || props.busy" @click="emit('pay')">
        {{ props.busy ? "Opening the payment page…" : `Pay ${props.price}` }}
      </button>
    </div>
    <p class="small muted" style="margin:0">You'll pay on Polar's secure page. We never see your card.</p>
  </section>
</template>

<style scoped>
.paybox { display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; margin: 0; }
.paybox dt { color: var(--graphite); font-weight: 600; }
.paybox dd { margin: 0; }
@media (max-width: 480px) { .paybox { grid-template-columns: 1fr; gap: 2px; } .paybox dd { margin-bottom: 6px; } }
</style>
