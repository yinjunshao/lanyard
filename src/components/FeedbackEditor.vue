<script setup>
// The host's own feedback questions (up to 5), added after the three standard
// ones every event gets. Locked once answers come in.
import { computed, ref } from "vue";
import UiSelect from "./ui/UiSelect.vue";

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  locked: { type: Boolean, default: false },
  max: { type: Number, default: 5 },
});
const emit = defineEmits(["update:modelValue"]);

const STANDARD = ["Overall, how was it? (1 to 5)", "Would you come to another one? (yes, maybe, no)", "One thing that would make it better (optional text)"];
const TYPES = [
  { value: "rating", label: "Rating 1 to 5" },
  { value: "single", label: "Pick one" },
  { value: "multi", label: "Pick any" },
  { value: "text", label: "Short text" },
];
const TEMPLATES = {
  "Society social": [
    { type: "rating", label: "How easy was it to meet new people?" },
    { type: "single", label: "How did you hear about this event?", options: ["Instagram", "WhatsApp", "A friend", "Union website", "Other"] },
  ],
  "Talk or panel": [
    { type: "rating", label: "How useful were the speakers?" },
    { type: "text", label: "Who should we invite next?" },
  ],
  "Careers fair": [
    { type: "rating", label: "How useful were the employers you spoke to?" },
    { type: "multi", label: "What are you looking for?", options: ["Internship", "Graduate job", "Placement year", "Just exploring"] },
  ],
  Hackathon: [
    { type: "rating", label: "How were the mentors?" },
    { type: "rating", label: "How fair was the judging?" },
    { type: "text", label: "What should we change next time?" },
  ],
};
// Special category data (UK GDPR Art. 9) must not be collected through feedback.
const SENSITIVE = /\b(health|medical|disab|religio|faith|ethnic|race|racial|sexual|sexuality|gay|lesbian|trans\b|gender identity|politic|union member|criminal|pregnan)/i;

const qs = computed(() => props.modelValue);
const update = (list) => emit("update:modelValue", list.map((q) => ({ ...q })));
function add(q = { type: "rating", label: "" }) {
  if (qs.value.length >= props.max) return;
  update([...qs.value, { ...q, options: q.options ? [...q.options] : undefined }]);
}
function remove(i) { update(qs.value.filter((_, j) => j !== i)); }
function set(i, patch) { update(qs.value.map((q, j) => (j === i ? { ...q, ...patch } : q))); }
function setType(i, type) {
  const q = qs.value[i];
  const needsOptions = type === "single" || type === "multi";
  set(i, { type, options: needsOptions ? (q.options?.length ? q.options : ["", ""]) : undefined });
}
function setOption(i, k, v) { const o = [...(qs.value[i].options || [])]; o[k] = v; set(i, { options: o }); }
function addOption(i) { const o = [...(qs.value[i].options || [])]; if (o.length < 6) set(i, { options: [...o, ""] }); }
function removeOption(i, k) { set(i, { options: qs.value[i].options.filter((_, j) => j !== k) }); }
const template = ref("");
const TEMPLATE_OPTIONS = [{ value: "", label: "Start from a template…" }, ...Object.keys(TEMPLATES)];
function useTemplate() {
  const t = TEMPLATES[template.value];
  if (t) update(t.slice(0, props.max).map((q) => ({ ...q, options: q.options ? [...q.options] : undefined })));
  template.value = "";
}
const warn = (q) => SENSITIVE.test([q.label, ...(q.options || [])].join(" "));
</script>

<template>
  <div class="stack-2">
    <div>
      <span class="label">Everyone is asked</span>
      <ol class="small muted std-list">
        <li v-for="s in STANDARD" :key="s">{{ s }}</li>
      </ol>
    </div>

    <p v-if="locked" class="notice small">
      People have started answering, so these questions are locked. That keeps the results comparable.
    </p>

    <template v-else>
      <div class="spread" style="align-items:flex-end">
        <span class="label">Your questions ({{ qs.length }}/{{ max }})</span>
        <UiSelect v-model="template" style="max-width:220px" label="Start from a template" :options="TEMPLATE_OPTIONS" @change="useTemplate" />
      </div>
    </template>

    <div v-for="(q, i) in qs" :key="i" class="q-card stack">
      <div class="spread">
        <span class="label">Question {{ i + 1 }}</span>
        <button v-if="!locked" type="button" class="link-btn" @click="remove(i)">Remove</button>
      </div>
      <div class="field" style="margin:0">
        <label :for="`fq-label-${i}`" class="visually-hidden">Question {{ i + 1 }} text</label>
        <input :id="`fq-label-${i}`" :value="q.label" type="text" maxlength="120" :disabled="locked"
               placeholder="What would you like to know?" @input="set(i, { label: $event.target.value })" />
      </div>
      <UiSelect :model-value="q.type" :disabled="locked" :label="`Question ${i + 1} answer type`" :options="TYPES" @update:model-value="setType(i, $event)" />
      <div v-if="q.type === 'single' || q.type === 'multi'" class="stack">
        <div v-for="(o, k) in q.options || []" :key="k" class="row">
          <label :for="`fq-${i}-opt-${k}`" class="visually-hidden">Option {{ k + 1 }}</label>
          <input :id="`fq-${i}-opt-${k}`" :value="o" type="text" maxlength="40" :disabled="locked"
                 :placeholder="`Option ${k + 1}`" @input="setOption(i, k, $event.target.value)" />
          <button v-if="!locked && (q.options || []).length > 2" type="button" class="icon-btn"
                  :aria-label="`Remove option ${k + 1}`" @click="removeOption(i, k)">×</button>
        </div>
        <button v-if="!locked && (q.options || []).length < 6" type="button" class="link-btn" @click="addOption(i)">+ Add option</button>
      </div>
      <p v-if="warn(q)" class="error-text" role="alert">
        This looks like it asks about health, religion, ethnicity, sexuality or politics. Don't collect that through
        feedback: it's special category data under UK GDPR and the Host Terms don't allow it.
      </p>
    </div>

    <button v-if="!locked && qs.length < max" type="button" class="btn" @click="add()">+ Add a question</button>
  </div>
</template>

<style scoped>
.std-list { margin: 6px 0 0; padding-left: 20px; }
.q-card { border: var(--border); border-radius: var(--radius); padding: 12px; background: var(--paper-raised); }
.q-card input { width: 100%; }
.row input { flex: 1; }
</style>
