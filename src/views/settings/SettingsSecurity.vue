<script setup>
// Sign-in and devices: every way back into the account. Later features add their rows below.
import { ref } from "vue";
import { me, refreshMe } from "../../lib/store";
import { registerPasskey, passkeysSupported } from "../../lib/passkeys";
import AuthenticatorSetup from "../../components/AuthenticatorSetup.vue";
import DevicesSheet from "../../components/DevicesSheet.vue";
import SignInOnAnotherDevice from "../../components/SignInOnAnotherDevice.vue";

const error = ref("");
async function addPasskey() {
  error.value = "";
  try {
    await registerPasskey();
    await refreshMe();
  } catch (e) {
    error.value = e?.name === "NotAllowedError" ? "Passkey setup was cancelled." : e?.message || "Passkey setup failed.";
  }
}
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
      <button v-if="!me.user?.hasPasskey && passkeysSupported()" class="btn" @click="addPasskey">Add a passkey</button>
    </section>

    <section class="panel stack"><AuthenticatorSetup /></section>

    <section class="panel stack"><DevicesSheet /></section>

    <section class="panel stack"><SignInOnAnotherDevice /></section>

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
  </div>
</template>
