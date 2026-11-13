<script setup>
// F31: the lists of who checked in that you are on (Settings, Privacy and data). One block per event,
// each the same choices as on the event page. Shows nothing at all if you are on none.
import { onMounted, ref } from "vue";
import { api } from "../../lib/api";
import EventAttendanceChoices from "../../components/EventAttendanceChoices.vue";

const lists = ref([]);
onMounted(async () => {
  try { lists.value = (await api("/api/account/attendance")).lists || []; } catch { /* signed out, or no signal */ }
});
</script>

<template>
  <div v-if="lists.length" class="list stack-2" style="padding:16px">
    <span class="label">Lists of who checked in</span>
    <p class="small muted" style="margin:0">
      Some organisers keep a list of the people who checked in to their event. You are on these. Untick to come off a list at once.
    </p>
    <EventAttendanceChoices v-for="l in lists" :key="l.id" :event-id="l.id" :title="l.name" />
  </div>
</template>
