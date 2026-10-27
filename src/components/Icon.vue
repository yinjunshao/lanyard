<script setup>
defineProps({ name: { type: String, required: true }, size: { type: [Number, String], default: 24 } });
const paths = {
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><circle cx="8" cy="7" r=".6" fill="currentColor"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><path d="M16 5.5a3 3 0 0 1 0 5M17.5 15.5c2 .6 3.2 2.1 3.5 4.5"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  external: '<path d="M7 17 17 7"/><path d="M9 7h8v8"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7l1.3-2h5.4L16 7"/><circle cx="12" cy="13.5" r="3.2"/>',
  download: '<path d="M12 4v12"/><path d="M7.5 11.5 12 16l4.5-4.5"/><path d="M5 20h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  note: '<path d="M5 5h14v10l-5 5H5z"/><path d="M14 20v-5h5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
};
</script>
<template>
  <svg viewBox="0 0 24 24" :width="size" :height="size" fill="none" stroke="currentColor"
       stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
       v-html="paths[name]"></svg>
</template>
