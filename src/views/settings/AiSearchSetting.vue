<script setup>
// Settings, Privacy and data: "Let people I've connected with find me using AI search" (F21). On unless the
// person turns it off, and it takes effect at once. Lives in this lazy chunk, not in the shared API file.
import { onMounted, ref } from "vue";
import { api } from "../../lib/api";

const loaded = ref(false);
const on = ref(true);
const aiOn = ref(false);
const error = ref("");

onMounted(async () => {
  try {
    const s = await api("/api/ai/status");
    on.value = s.searchOk;
    aiOn.value = s.on;
  } catch { /* signed out: the Settings layout handles that */ }
  loaded.value = true;
});

async function change(ev) {
  const want = ev.target.checked;
  error.value = "";
  try {
    await api("/api/ai/search", "PUT", { ok: want });
    on.value = want;
  } catch (e) {
    error.value = e.status === 403 ? "Make your card first, then you can choose this." : e.message;
    ev.target.checked = on.value;
  }
}
</script>

<template>
  <section class="panel stack" aria-labelledby="ai-search-h">
    <span id="ai-search-h" class="label">AI and your card</span>
    <label class="small" style="display:flex;gap:10px;align-items:flex-start;min-height:44px">
      <input type="checkbox" :checked="on" :disabled="!loaded" style="margin-top:3px" @change="change" />
      <span><strong>Let people I've connected with find me using AI search</strong></span>
    </label>
    <p class="small muted" style="margin:0">
      When someone you've connected with asks an AI feature "do I know someone who...", your card can come up. It only ever uses what you already
      show that person, never your email, links or photo. Nothing runs unless they tap, and it takes effect as soon as you change this.
      Searching by keyword still works either way. Your settings for who sees what on your card are not affected.
    </p>
    <p v-if="loaded && !aiOn" class="small muted" style="margin:0">AI features are not switched on yet, so nothing uses this today.</p>
    <p v-if="error" class="error-text small" role="alert" style="margin:0">{{ error }}</p>
  </section>
</template>
