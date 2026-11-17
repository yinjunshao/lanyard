<script setup>
// Old connection page: a connection now lives on the person's card page
// (/c/:cardId), which shows the card, the shared selfie and your notes together.
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Api } from "../lib/api";
import Waiting from "../components/Waiting.vue";

const route = useRoute();
const router = useRouter();
const failed = ref(false);
async function load() {
  failed.value = false;
  try {
    const d = await Api.connection(route.params.id);
    if (d.cardId) return router.replace(`/c/${d.cardId}`);
  } catch { /* shown below */ }
  // Don't bounce silently back to the list: say what happened.
  failed.value = true;
}
onMounted(load);
</script>

<template>
  <div v-if="failed" class="empty stack" role="status">
    <span class="label">Couldn't open this connection</span>
    <p>It may have been removed. Try again from People.</p>
    <router-link to="/app/people" class="btn" style="margin-top:8px">Back to People</router-link>
  </div>
  <Waiting v-else :rows="2" label="Opening this connection" :retry="load" />
</template>
