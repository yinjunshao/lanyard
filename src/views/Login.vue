<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { Api } from "../lib/api";
import { getToken, saveProfile } from "../lib/store";

const router = useRouter();
const code = ref("");
const birthday = ref("");
const busy = ref(false);
const err = ref("");

async function submit() {
  err.value = "";
  const c = code.value.trim().toUpperCase();
  if (!/^[A-Z2-9]{4}$/.test(c)) { err.value = "Your code is 4 characters — letters and digits 2–9."; return; }
  if (!birthday.value) { err.value = "Enter the birthday on your card."; return; }
  busy.value = true;
  try {
    const data = await Api.login(c, birthday.value, getToken());
    saveProfile(data.profile);
    router.replace("/qr");
  } catch (e) {
    err.value = e.message || "Couldn’t sign you in — check the code and birthday.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="container login-page">
    <div class="login-card card">
      <span class="eyebrow">Welcome back</span>
      <h1 class="page-title">Log in to your card.</h1>
      <p class="muted">
        Enter your <b>4-character code</b> and your <b>birthday</b> — the two things shown when
        you made your Lanyard. Your card, notes and network come back on this device.
      </p>

      <form class="login-form" @submit.prevent="submit">
        <label class="field">Your code</label>
        <input
          v-model="code"
          class="code-input"
          type="text"
          inputmode="latin"
          maxlength="4"
          autocomplete="off"
          spellcheck="false"
          placeholder="ABCD"
          @input="code = code.toUpperCase()"
        />

        <label class="field">Birthday</label>
        <input v-model="birthday" class="date-input" type="date" />

        <p v-if="err" class="login-err">{{ err }}</p>

        <button class="btn btn-primary btn-block" type="submit" :disabled="busy">
          {{ busy ? "Checking…" : "Open my Lanyard" }}
        </button>
      </form>

      <div class="login-foot">
        <span class="muted small">New here?</span>
        <router-link to="/onboard" class="edit-link">Make your card →</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page { max-width: 480px; padding-top: 24px; }
.login-card { padding: 30px 28px; }
.login-form { display: grid; gap: 8px; margin-top: 20px; }
.code-input {
  font-family: var(--font-mono);
  font-size: 34px;
  font-weight: 700;
  letter-spacing: .35em;
  text-align: center;
  text-transform: uppercase;
  padding: 12px;
  margin-bottom: 8px;
}
.date-input { padding: 12px 14px; font-size: 16px; }
.login-err { color: var(--red, #b3261e); font-size: 14px; margin: 6px 0 2px; }
.login-foot { display: flex; align-items: center; gap: 10px; margin-top: 20px; }
.edit-link { font-weight: 700; font-size: 14px; color: var(--accent-dark); }
.btn-block { width: 100%; margin-top: 10px; }
</style>
