<script setup>
// One page, a few ways in, all opening the same account. Passkey is the one-tap
// path; email is the one nobody has to remember anything for (we email a code,
// or they type the code from their authenticator app). A code from a signed-in
// device and a recovery key work when neither is at hand.
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { homePath, me, refreshMe } from "../lib/store";
import { Api } from "../lib/api";
import { loginPasskey, passkeysSupported } from "../lib/passkeys";
import { afterAccountPath } from "../lib/redeem";

const route = useRoute();
const router = useRouter();
const onHost = route.path.startsWith("/host");
const canPasskey = passkeysSupported();
const q = (k) => (typeof route.query[k] === "string" ? route.query[k] : "");

const busy = ref("");
const error = ref("");
const email = ref(q("email"));
const sent = ref(false);
const otp = ref(q("otp"));
const useApp = ref(false); // type an authenticator code instead of waiting for the email
const code = ref(q("code"));
const key = ref("");
const showMore = ref(!!q("code"));

async function done() {
  await refreshMe();
  router.replace(onHost ? "/host" : me.profile ? afterAccountPath("/app") : "/app/profile");
}

async function withPasskey() {
  error.value = ""; busy.value = "passkey";
  try {
    await loginPasskey();
    await done();
  } catch (e) {
    error.value = e?.name === "NotAllowedError" || /unknown passkey/.test(e?.message || "")
      ? "No passkey found for Lanyard here. Use your email instead."
      : e?.message || "Passkey sign-in failed.";
  } finally { busy.value = ""; }
}

async function sendEmail() {
  error.value = ""; busy.value = "send";
  try { await Api.emailStart(email.value.trim()); sent.value = true; }
  catch (e) { error.value = e.message; }
  finally { busy.value = ""; }
}

async function withEmailCode() {
  error.value = ""; busy.value = "otp";
  try {
    const who = email.value.trim();
    if (useApp.value) await Api.totpRedeem(who, otp.value);
    else await Api.emailVerify(who, otp.value);
    await done();
  } catch (e) { error.value = e.message; }
  finally { busy.value = ""; }
}

async function withCode() {
  error.value = ""; busy.value = "code";
  try { await Api.authRedeem(code.value); await done(); }
  catch (e) { error.value = e.message; }
  finally { busy.value = ""; }
}

async function withKey() {
  error.value = ""; busy.value = "key";
  try { await Api.recoveryRedeem(key.value); await done(); }
  catch (e) { error.value = e.message; }
  finally { busy.value = ""; }
}

onMounted(async () => {
  try { await refreshMe(); } catch { /* guest */ }
  // A scanned sign-in QR carries ?code=; an emailed link carries ?email=&otp=.
  if (code.value) withCode();
  else if (email.value && otp.value.length === 6) { sent.value = true; withEmailCode(); }
});
</script>

<template>
  <main class="app-col stack-2">
    <router-link v-if="onHost" to="/host" class="wordmark wordmark-host"><img src="/host-icon.svg" alt="" />lanyard<b>.</b><small>host</small></router-link>
    <router-link v-else :to="homePath()" class="wordmark">lanyard<b>.</b></router-link>
    <div>
      <h1>{{ onHost ? "Host sign in" : "Sign in" }}</h1>
      <p class="muted">Pick whichever is easiest. They all open the same account.</p>
    </div>

    <section v-if="canPasskey" class="panel stack">
      <span class="label">Fastest: passkey</span>
      <p class="small muted">Face ID, fingerprint or screen lock. One tap, nothing to type.</p>
      <button class="btn btn-primary" :disabled="!!busy" @click="withPasskey">
        {{ busy === "passkey" ? "Waiting for passkey…" : "Sign in with passkey" }}
      </button>
    </section>

    <section class="panel stack">
      <span class="label">Email</span>
      <form v-if="!sent" class="stack" @submit.prevent="sendEmail">
        <p class="small muted">We'll email you a 6-digit code. No password.</p>
        <input v-model="email" type="email" aria-label="Email" placeholder="you@example.com" autocomplete="email"
               autocapitalize="none" spellcheck="false" maxlength="254" />
        <button class="btn" :class="{ 'btn-primary': !canPasskey }" :disabled="!!busy || !email.includes('@')">
          {{ busy === "send" ? "Sending…" : "Email me a code" }}
        </button>
        <button type="button" class="small muted" style="background:none;border:none;padding:0;text-align:left;cursor:pointer"
                @click="sent = true; useApp = true">I use an authenticator app</button>
      </form>
      <form v-else class="stack" @submit.prevent="withEmailCode">
        <p class="small muted">
          <template v-if="useApp">Enter your email (or account ID) and the 6-digit code from your authenticator app.</template>
          <template v-else>If <strong>{{ email }}</strong> has a Lanyard account, a code is on its way. It lasts 10 minutes.</template>
        </p>
        <input v-if="useApp" v-model="email" aria-label="Email or account ID" placeholder="Email or account ID" autocapitalize="none"
               spellcheck="false" maxlength="254" />
        <input v-model="otp" aria-label="6-digit code" placeholder="123456" inputmode="numeric" autocomplete="one-time-code"
               maxlength="7" style="font-size:22px;letter-spacing:4px;text-align:center" />
        <button class="btn btn-primary" :disabled="!!busy || otp.replace(/\D/g, '').length < 6 || !email.trim()">
          {{ busy === "otp" ? "Checking…" : "Sign in" }}
        </button>
        <button type="button" class="small muted" style="background:none;border:none;padding:0;text-align:left;cursor:pointer"
                @click="useApp = !useApp; otp = ''; error = ''">
          {{ useApp ? "Email me a code instead" : "Use my authenticator app instead" }}
        </button>
        <button type="button" class="small muted" style="background:none;border:none;padding:0;text-align:left;cursor:pointer"
                @click="sent = false; useApp = false; otp = ''; error = ''">Use a different email</button>
      </form>
    </section>

    <section class="panel stack">
      <button type="button" class="label" style="background:none;border:none;padding:0;text-align:left;cursor:pointer"
              :aria-expanded="showMore" @click="showMore = !showMore">
        No email on your account? Other ways in {{ showMore ? "–" : "+" }}
      </button>
      <template v-if="showMore">
        <form class="stack" @submit.prevent="withCode">
          <span class="label">Code from your other device</span>
          <p class="small muted">On a device where you're signed in: Settings, then "Sign in on another device".</p>
          <input v-model="code" aria-label="Sign-in code" placeholder="ABCD-EFGH" autocomplete="one-time-code"
                 autocapitalize="characters" spellcheck="false" maxlength="12"
                 style="font-size:22px;letter-spacing:3px;text-transform:uppercase;text-align:center" />
          <button class="btn" :disabled="!!busy || code.replace(/[^a-z0-9]/gi, '').length < 8">
            {{ busy === "code" ? "Checking…" : "Sign in with code" }}
          </button>
        </form>
        <form class="stack" @submit.prevent="withKey">
          <span class="label">Recovery key</span>
          <p class="small muted">The 16-character key you saved when you set up your account.</p>
          <input v-model="key" aria-label="Recovery key" placeholder="XXXX-XXXX-XXXX-XXXX" autocapitalize="characters"
                 spellcheck="false" maxlength="24"
                 style="font-size:18px;letter-spacing:2px;text-transform:uppercase;text-align:center" />
          <button class="btn" :disabled="!!busy || key.replace(/[^a-z0-9]/gi, '').length < 16">
            {{ busy === "key" ? "Checking…" : "Sign in with recovery key" }}
          </button>
        </form>
      </template>
    </section>

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>

    <p class="small muted"><router-link to="/terms">Terms</router-link> · <router-link to="/privacy">Privacy</router-link></p>
    <p v-if="!onHost" class="small muted">
      New here? <router-link to="/app/profile">Make your card</router-link> and save it to this device later.
    </p>
  </main>
</template>
