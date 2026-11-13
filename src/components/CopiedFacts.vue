<script setup>
// F30: what a copy of an earlier event brings with it, shown (not editable) where the
// fields would be. Create sends only the name and times; the server copies the rest.
defineProps({
  facts: { type: Array, default: null },
  state: { type: String, default: "ok" }, // loading | error | ok
});
</script>

<template>
  <div class="notice stack" role="status">
    <strong>Copied from the earlier event</strong>
    <span v-if="state === 'loading'" class="small">Reading its details…</span>
    <span v-else-if="state === 'error' || !facts" class="small">Couldn't read its details to show them here. They are still copied when you create the event.</span>
    <template v-else>
      <span v-for="f in facts" :key="f[0]" class="small"><span class="muted">{{ f[0] }}:</span> {{ f[1] }}</span>
    </template>
    <span class="small muted">You can change any of this under Details once the event exists.</span>
  </div>
</template>
