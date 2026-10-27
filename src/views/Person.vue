<script setup>
// Old connection page: a connection now lives on the person's card page
// (/c/:cardId), which shows the card, the shared selfie and your notes together.
import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Api } from "../lib/api";

const route = useRoute();
const router = useRouter();
onMounted(async () => {
  try {
    const d = await Api.connection(route.params.id);
    router.replace(d.cardId ? `/c/${d.cardId}` : "/app/people");
  } catch {
    router.replace("/app/people");
  }
});
</script>

<template>
  <p class="muted" role="status">Opening…</p>
</template>
