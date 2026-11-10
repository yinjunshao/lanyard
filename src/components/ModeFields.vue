<script setup>
// The Student / Career switch and the fields under it, shared by Edit profile
// and the welcome steps (F11, F12, F14). It works on the form object it is given
// (mode, company, role, uni, institutionId, course, year), so each screen keeps
// its own save. Switching keeps what is typed in the other mode; only the chosen
// mode shows on the card.
import { computed, onMounted, ref, watch } from "vue";
import { me } from "../lib/store";
import { UiCombobox } from "./ui/UiSelect.vue";
import { institutionForDomain } from "../lib/institutions";

const props = defineProps({
  form: { type: Object, required: true },
  // Two big tiles (welcome) instead of the small switch (Edit profile).
  tiles: { type: Boolean, default: false },
});

// [value, small switch label, tile title, tile line]
const MODES = [
  ["student", "Student", "Student", "At university or college"],
  ["career", "Career", "Working", "In a job, or finished studying"],
];
const career = computed(() => props.form.mode === "career");
// Career mode: where you studied is optional and tucked away, unless it is already filled in.
const showStudied = ref(!!props.form.uni);
watch(() => props.form.uni, (u) => { if (u) showStudied.value = true; });

// The institution list is a separate chunk, fetched with a plain import() the
// first time the picker opens (D018). Typing your own works without it.
const institutions = ref([]);
let institutionsLoading = false;
function loadInstitutions() {
  if (institutionsLoading) return;
  institutionsLoading = true;
  import("../data/institutions-uk.json")
    .then((m) => { institutions.value = (m.default || m).institutions; })
    .catch(() => { institutionsLoading = false; });
}
const institutionOptions = computed(() => institutions.value.map((i) => ({ value: i.id, label: i.name, aliases: i.aliases })));
const customInstitution = (t) => `Not listed? Use ‘${t}’`;
// "Looks like you're at ..." from the domain of the account's verified email.
const emailDomain = computed(() => me.user?.emailDomain || "");
const suggestion = computed(() => {
  const inst = institutionForDomain(institutions.value, emailDomain.value);
  return inst && props.form.institutionId !== inst.id ? inst : null;
});
function useSuggestion() {
  const inst = suggestion.value; // read first: setting the id makes the suggestion go away
  props.form.institutionId = inst.id;
  props.form.uni = inst.name;
}
onMounted(() => { if (/(^|\.)ac\.uk$/i.test(emailDomain.value)) loadInstitutions(); });
</script>

<template>
  <!-- Switching keeps what is typed in the other mode; only the chosen mode shows on the card. -->
  <div class="field">
    <span id="mode-label" class="label-top">{{ tiles ? "Are you studying or working?" : "I am a" }}</span>
    <div v-if="tiles" class="tile-row" role="group" aria-labelledby="mode-label">
      <button v-for="m in MODES" :key="m[0]" type="button" class="tile" :class="{ on: form.mode === m[0] }"
              :aria-pressed="form.mode === m[0]" @click="form.mode = m[0]">
        <strong>{{ m[2] }}</strong>
        <span class="small">{{ m[3] }}</span>
      </button>
    </div>
    <div v-else class="seg" role="group" aria-labelledby="mode-label" style="align-self:flex-start">
      <button v-for="m in MODES" :key="m[0]" type="button" class="seg-btn"
              :class="{ on: form.mode === m[0] }" :aria-pressed="form.mode === m[0]"
              @click="form.mode = m[0]">{{ m[1] }}</button>
    </div>
  </div>

  <template v-if="!career">
    <div class="field"><label id="uni-l">University</label>
      <p v-if="suggestion" class="notice small" role="status" style="margin:0 0 8px">
        Looks like you're at {{ suggestion.name }}.
        <button type="button" class="link-btn small" @click="useSuggestion">Use it</button></p>
      <UiCombobox id="uni" v-model="form.institutionId" v-model:text="form.uni" labelledby="uni-l" :options="institutionOptions"
                  allow-custom clearable placeholder="Search for your university" search-placeholder="Type a name or short name"
                  :custom-label="customInstitution" @open="loadInstitutions" /></div>
    <div class="field"><label for="course">Course</label>
      <input id="course" v-model="form.course" type="text" placeholder="e.g. Computer Science" /></div>
    <div class="field"><label for="year">Year (optional)</label>
      <input id="year" v-model="form.year" type="text" /></div>
  </template>
  <template v-else>
    <div class="field"><label for="company">Company</label>
      <input id="company" v-model="form.company" type="text" maxlength="80" placeholder="Where you work" /></div>
    <div class="field"><label for="role">Role</label>
      <input id="role" v-model="form.role" type="text" maxlength="80" placeholder="e.g. Product designer" /></div>
    <button v-if="!showStudied" type="button" class="link-btn small" style="text-align:left" @click="showStudied = true">
      Add where you studied (optional)
    </button>
    <template v-else>
      <div class="field"><label id="uni-l">Studied at (optional)</label>
        <p v-if="suggestion" class="notice small" role="status" style="margin:0 0 8px">
          Looks like you're at {{ suggestion.name }}.
          <button type="button" class="link-btn small" @click="useSuggestion">Use it</button></p>
        <UiCombobox id="uni" v-model="form.institutionId" v-model:text="form.uni" labelledby="uni-l" :options="institutionOptions"
                    allow-custom clearable placeholder="Search for your university or school" search-placeholder="Type a name or short name"
                    :custom-label="customInstitution" @open="loadInstitutions" /></div>
    </template>
  </template>
</template>
