<script setup>
// Plan: Free or Plus, and the redeem link. F27 adds "Manage subscription" here.
import { ref } from "vue";
import { me, refreshMe } from "../../lib/store";
import { Api } from "../../lib/api";

const error = ref("");
const gbp = (pence) => `£${(pence / 100).toFixed(pence % 100 ? 2 : 0)}`;
const joining = ref(false);
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
</script>

<template>
  <div class="stack-2">
    <section id="plus" class="panel stack-2">
      <div class="spread">
        <span class="label">Your plan</span>
        <strong>{{ me.plan.label }}</strong>
      </div>
      <template v-if="me.plan.tier === 'free'">
        <h3>Lanyard Plus</h3>
        <p class="small muted">
          One paid plan, priced for students:
          <strong>{{ gbp(me.plan.plusPrice?.yearlyPence || 1199) }} a year</strong>
          or {{ gbp(me.plan.plusPrice?.monthlyPence || 149) }} a month.
          Everything you use today stays free.
        </p>
        <ul class="small plan-list">
          <li><strong>Up to 12 cards</strong>, one for each room you walk into (Free: {{ me.plan.freeCards || 3 }}).</li>
          <li><strong>Custom strap colours</strong> on every card.</li>
          <li><strong>Choose your own card code</strong>, like your name, and change it once a week.</li>
          <li><strong>Coming first:</strong> card views and connection stats, CSV and vCard export of your people, your own link name, follow-up reminders.</li>
        </ul>
        <router-link to="/redeem" class="small link-btn" style="text-align:left">Have a code? Redeem it</router-link>
        <button v-if="!me.plan.onWaitlist" class="btn btn-primary" :disabled="joining" @click="joinWaitlist">
          Tell me when Plus opens
        </button>
        <p v-else class="success-text small">You're on the list. We'll email if you've added a recovery email, otherwise you'll see it here first.</p>
      </template>
      <p v-else class="small muted">Thanks for backing Lanyard. You have {{ me.plan.cards }} cards, custom colours and your own card codes.</p>
    </section>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
  </div>
</template>
