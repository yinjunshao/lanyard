<script setup>
// Step 6: the finished badge (the same Badge as My card), what to do with it, the
// install prompt on a phone, and the way on to a promo code if one is waiting.
import { computed, ref } from "vue";
import { defaultCard, me } from "../../lib/store";
import { pendingCode } from "../../lib/redeem";
import { subtitleParts, withSource } from "../../lib/profile";
import Badge from "../Badge.vue";
import InstallGuide, { offerInstall } from "../InstallGuide.vue";
import { dismissInstall } from "../../lib/install";

const card = computed(() => defaultCard());
const subtitle = computed(() => subtitleParts(card.value?.profile, { year: true }).join("  ·  "));
// The same address as the QR on My card: it says it was a QR code that opened it (F13).
const qrUrl = computed(() => (card.value ? withSource(`${location.origin}/c/${card.value.cardId}`, "q") : ""));
const code = pendingCode();

const showInstall = ref(false);
offerInstall(me.user).then((yes) => { showInstall.value = yes; });
function hideInstall() { dismissInstall(); showInstall.value = false; }
</script>

<template>
  <div class="stack-2">
    <h1>Your card is ready</h1>
    <p class="muted" style="margin:0">Show this at your next event. People scan it and connect.</p>

    <div class="done-badge"><Badge v-if="card" :view="card" :url="qrUrl" :subtitle="subtitle" /></div>

    <p v-if="code" class="notice small">You have a code waiting: <strong class="tnum">{{ code }}</strong>. Claim it now.</p>

    <section v-if="showInstall" class="panel" aria-label="Add to home screen">
      <InstallGuide heading="Open Lanyard in one tap" @done="hideInstall" />
      <button type="button" class="link-btn small" style="margin-top:8px" @click="hideInstall">Not now</button>
    </section>
    <p v-if="!me.user?.emailVerified && me.user?.pendingEmail" class="small muted" style="margin:0">
      Your card only lives in this browser until you confirm your email: open the link we sent to {{ me.user.pendingEmail }}.
    </p>
    <p v-else-if="!me.user?.emailVerified" class="small muted" style="margin:0">
      Your card only lives in this browser until you add an email.
      <router-link to="/app/welcome?step=5">Add it now</router-link>.
    </p>

    <div class="thumb-bar">
      <div class="inner">
        <router-link v-if="code" :to="`/redeem/${encodeURIComponent(code)}`" class="btn btn-primary">Claim your code</router-link>
        <router-link v-else to="/app" class="btn btn-primary">Open my card</router-link>
      </div>
    </div>
    <p v-if="code" style="margin:0"><router-link to="/app" class="link-btn small">Go to my card instead</router-link></p>
  </div>
</template>
