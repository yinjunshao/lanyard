<script setup>
// Sign-in and devices: every way back into the account. Later features add their rows below.
import { me } from "../../lib/store";
import AuthenticatorSetup from "../../components/AuthenticatorSetup.vue";
import DevicesSheet from "../../components/DevicesSheet.vue";
import PasskeyList from "../../components/PasskeyList.vue";
import SignInOnAnotherDevice from "../../components/SignInOnAnotherDevice.vue";
</script>

<template>
  <div class="stack-2">
    <section class="panel stack">
      <div class="spread">
        <span>
          <span class="label">Sign-in</span><br />
          <strong>{{ me.user?.hasPasskey ? "Passkey saved" : me.user?.emailVerified ? "Email saved" : me.user?.hasRecovery ? "Recovery key saved" : me.user?.hasTotp ? "Authenticator app on" : "Not saved yet" }}</strong>
        </span>
        <router-link v-if="!me.user?.hasPasskey || !me.user?.hasRecovery" to="/claim" class="btn btn-primary" style="width:auto">
          {{ me.user?.claimed ? "Add more" : "Save my card" }}
        </router-link>
      </div>
      <p v-if="!me.user?.claimed" class="small muted">
        Your card only lives in this browser until you save it. It takes one tap.
      </p>
    </section>

    <section class="panel stack"><PasskeyList /></section>

    <section class="panel stack"><AuthenticatorSetup /></section>

    <section class="panel stack"><DevicesSheet /></section>

    <section class="panel stack"><SignInOnAnotherDevice /></section>
  </div>
</template>
