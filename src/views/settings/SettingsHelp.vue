<script setup>
// Help and legal. "About Lanyard" opens the front page even when signed in (F02).
import { HELP_EMAIL } from "../../lib/contact";
import Icon from "../../components/Icon.vue";
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
  </div>
</template>
