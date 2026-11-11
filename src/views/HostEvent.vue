<script setup>
// One address, three screens (F19): /events/:id is the live page, /events/:id/present the
// projector page and /events/:id/print the poster. The router names only this small file, so
// the chunk list in the entry (which every public page loads) gains no new name; each screen
// loads from here when it is opened. (Plain import(), not defineAsyncComponent: that would
// pull its Vue code into the entry, which every public page loads.)
import { markRaw, shallowRef, watch } from "vue";
import { useRoute } from "vue-router";

const screens = {
  present: () => import("./HostPresent.vue"),
  print: () => import("./HostPrint.vue"),
  live: () => import("./HostLive.vue"),
};
const route = useRoute();
const shown = shallowRef(null);
watch(() => route.params.screen, async (s) => {
  const mod = await (screens[s] || screens.live)();
  shown.value = markRaw(mod.default);
}, { immediate: true });
</script>

<template>
  <component :is="shown" v-if="shown" :key="route.params.id + ':' + (route.params.screen || 'live')" />
</template>
