<script setup>
// Shown to anyone with a profile who hasn't accepted the current Terms and
// Privacy Policy (existing accounts, or after the terms change).
import { ref } from "vue";
import { me, refreshMe } from "../lib/store";
import { Api } from "../lib/api";

const agreed = ref(false);
const busy = ref(false);
const error = ref("");

async function accept() {
  error.value = ""; busy.value = true;
  try { await Api.acceptTerms(); await refreshMe(); }
  catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="me.user?.needsTerms" class="tg-backdrop" role="dialog" aria-modal="true" aria-labelledby="tg-title">
      <div class="tg-sheet">
        <h2 id="tg-title">Our terms and privacy policy</h2>
        <p class="small muted">
          We've written down how Lanyard works and how we look after your data. Please read them and agree to keep using your card.
        </p>
        <p class="small">
          <router-link to="/terms" target="_blank">Terms of Service</router-link> ·
          <router-link to="/privacy" target="_blank">Privacy Policy</router-link>
        </p>
        <label class="checkbox-row">
          <input v-model="agreed" type="checkbox" />
          <span class="small">I'm 18 or over, and I agree to the Terms of Service and Privacy Policy.</span>
        </label>
        <p v-if="error" class="error-text" role="alert">{{ error }}</p>
        <button class="btn btn-primary" :disabled="!agreed || busy" @click="accept">
          {{ busy ? "Saving…" : "Agree and continue" }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style>
.tg-backdrop {
  position: fixed; inset: 0; z-index: 220; display: flex; align-items: flex-end; justify-content: center;
  background: rgba(20, 19, 17, 0.6); padding: 16px;
}
.tg-sheet {
  width: 100%; max-width: 440px; display: flex; flex-direction: column; gap: 14px;
  background: var(--paper-raised, #fffdf8); color: var(--ink, #1b1a17);
  border: var(--border-ink, 1.5px solid #1b1a17); border-radius: 8px; padding: 20px;
}
@media (min-width: 560px) { .tg-backdrop { align-items: center; } }
</style>
