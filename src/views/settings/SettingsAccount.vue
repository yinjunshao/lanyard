<script setup>
// Account: who you are to Lanyard. Later features add their rows here (F11 mode).
import { computed } from "vue";
import { me } from "../../lib/store";
import Icon from "../../components/Icon.vue";
import EmailSetup from "../../components/EmailSetup.vue";

const signIn = computed(() => (me.user?.hasPasskey ? "Passkey saved" : me.user?.emailVerified ? "Email saved" : me.user?.hasRecovery ? "Recovery key saved" : me.user?.hasTotp ? "Authenticator app on" : "Not saved yet"));
</script>

<template>
  <div class="stack-2">
    <section class="panel stack">
      <EmailSetup />
      <p v-if="me.user?.recoveryEmail && !me.user?.emailVerified" class="small muted">Recovery email: {{ me.user.recoveryEmail }}</p>
    </section>

    <div class="list">
      <router-link to="/app/settings/security" class="list-row spread">
        <span><span class="label">Sign-in</span><br /><strong>{{ signIn }}</strong></span>
        <span class="muted" style="display:inline-flex"><Icon name="chevron" :size="18" /></span>
      </router-link>
      <router-link to="/app/profile" class="list-row spread">
        <span>Edit profile</span><span class="muted" style="display:inline-flex"><Icon name="chevron" :size="18" /></span>
      </router-link>
      <router-link to="/host" class="list-row spread">
        <span>Run events? Open the host portal</span>
        <span class="muted" style="display:inline-flex"><Icon name="chevron" :size="18" /></span>
      </router-link>
    </div>
  </div>
</template>
