<script setup>
// Help and legal. "About Lanyard" opens the front page even when signed in (F02).
import { HELP_EMAIL } from "../../lib/contact";
import { ref } from "vue";
import { api } from "../../lib/api";
import { forgetStages } from "../../lib/stagesState";
import Icon from "../../components/Icon.vue";

// F59: tips (short tutorials that point at a feature when it becomes useful) show once. This starts them again, for this account only.
const tipsBusy = ref(false);
const tipsNote = ref("");
const tipsError = ref("");
async function showTipsAgain() {
  if (tipsBusy.value) return;
  tipsBusy.value = true; tipsNote.value = ""; tipsError.value = "";
  try {
    await api("/api/stages", "DELETE");
    forgetStages();
    tipsNote.value = "Done. Tips will show again as you use Lanyard, one a day at most.";
  } catch (e) { tipsError.value = e.message; }
  finally { tipsBusy.value = false; }
}
</script>

<template>
  <div class="stack-2">
    <div class="list">
      <a class="list-row spread" :href="`mailto:${HELP_EMAIL}`">
        <span>Get help <span class="small muted">· {{ HELP_EMAIL }}</span></span><span class="muted" style="display:inline-flex"><Icon name="chevron" :size="18" /></span>
      </a>
      <router-link to="/terms" class="list-row spread">
        <span>Terms</span><span class="muted" style="display:inline-flex"><Icon name="chevron" :size="18" /></span>
      </router-link>
      <router-link to="/privacy" class="list-row spread">
        <span>Privacy policy</span><span class="muted" style="display:inline-flex"><Icon name="chevron" :size="18" /></span>
      </router-link>
      <router-link to="/?about=1" class="list-row spread">
        <span>About Lanyard</span><span class="muted" style="display:inline-flex"><Icon name="chevron" :size="18" /></span>
      </router-link>
    </div>
    <div class="list stack-2" style="padding:16px">
      <span class="label">Tips</span>
      <p class="small muted" style="margin:0">Lanyard shows a short tip the first time a feature becomes useful, one a day at most. Each shows once.</p>
      <button type="button" class="btn" style="width:auto" :disabled="tipsBusy" @click="showTipsAgain">{{ tipsBusy ? "Working…" : "Show tips again" }}</button>
      <p v-if="tipsError" class="error-text" role="alert">{{ tipsError }}</p>
      <p v-if="tipsNote" class="success-text" role="status">{{ tipsNote }}</p>
    </div>
  </div>
</template>
