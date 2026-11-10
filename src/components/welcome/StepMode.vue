<script setup>
// Step 2: student or working, then where. The same fields as Edit profile (F11, F12).
import { ref } from "vue";
import { Api } from "../../lib/api";
import { me, refreshMe } from "../../lib/store";
import ModeFields from "../ModeFields.vue";

const p = me.profile || {};
const f = ref({
  mode: p.mode === "career" ? "career" : "student", company: p.company || "", role: p.role || "",
  uni: p.uni || "", institutionId: p.institution_id || null, course: p.course || "", year: p.year || "",
});

async function save() {
  const v = f.value;
  await Api.updateProfile({ mode: v.mode, company: v.company, role: v.role, uni: v.uni, institutionId: v.institutionId, course: v.course, year: v.year });
  await refreshMe();
}
defineExpose({ ready: true, save });
</script>

<template>
  <div class="stack-2">
    <h1>Student or working?</h1>
    <p class="muted" style="margin:0">So your card says the right thing under your name.</p>
    <ModeFields :form="f" tiles />
  </div>
</template>
