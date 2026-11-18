<script setup>
// One address, three screens (F19): /events/:id is the live page, /events/:id/present the
// projector page and /events/:id/print the poster. The router names only this small file, so
// the chunk list in the entry (which every public page loads) gains no new name; each screen
// loads from here when it is opened. (Plain import(), not defineAsyncComponent: that would
// pull its Vue code into the entry, which every public page loads.)
import { markRaw, shallowRef, watch } from "vue";
import { useRoute } from "vue-router";
document.title = "Event | Lanyard hosts";

const screens = {
  present: () => import("./HostPresent.vue"),
  print: () => import("./HostPrint.vue"),
  live: () => import("./HostLive.vue"),
  scan: () => import("./HostScanner.vue"), // F40: /scan/:token, the voucher scanner staff open (no account)
};
const route = useRoute();
const shown = shallowRef(null);
const which = () => (route.params.token ? "scan" : route.params.screen);
watch(which, async (s) => {
  const mod = await (screens[s] || screens.live)();
  shown.value = markRaw(mod.default);
}, { immediate: true });
</script>

<template>
  <component :is="shown" v-if="shown" :key="(route.params.id || route.params.token) + ':' + (which() || 'live')" />
</template>
