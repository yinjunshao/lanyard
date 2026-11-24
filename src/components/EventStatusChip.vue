<script setup>
// F68: the one status chip on every event list. The words carry the meaning (a dot only marks In progress);
// nothing moves, so there is nothing to stop under reduced motion.
import { STATUS_LABEL } from "../lib/eventtext";
defineProps({ status: { type: String, required: true } });
</script>

<template>
  <span class="status-chip" :class="status"><span v-if="status === 'ongoing'" class="status-dot" aria-hidden="true"></span>{{ STATUS_LABEL[status] }}</span>
</template>

<style scoped>
.status-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 8px; border: 1px solid var(--rule); border-radius: 4px;
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.13em; white-space: nowrap;
}
.status-chip.ongoing, .status-chip.upcoming { color: var(--strap-deep); }
.status-chip.ongoing { border-color: var(--strap); }
.status-chip.ended { color: var(--graphite); }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--strap); }
</style>
