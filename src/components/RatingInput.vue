<script setup>
// 1-5 rating as a real radio group: arrow keys move, each option is labelled.
const props = defineProps({
  modelValue: { type: Number, default: null },
  label: { type: String, required: true },
  size: { type: String, default: "md" },
});
const emit = defineEmits(["update:modelValue"]);
const WORDS = ["Poor", "Not great", "OK", "Good", "Excellent"];
function pick(n) { emit("update:modelValue", n); }
function onKey(e, n) {
  if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); pick(Math.min(5, n + 1)); e.currentTarget.nextElementSibling?.focus(); }
  if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); pick(Math.max(1, n - 1)); e.currentTarget.previousElementSibling?.focus(); }
}
</script>

<template>
  <div class="rating" :class="size" role="radiogroup" :aria-label="label">
    <button
      v-for="n in 5"
      :key="n"
      type="button"
      role="radio"
      class="rating-btn"
      :class="{ on: props.modelValue && n <= props.modelValue }"
      :aria-checked="props.modelValue === n"
      :aria-label="`${n} of 5, ${WORDS[n - 1]}`"
      :tabindex="(props.modelValue || 1) === n ? 0 : -1"
      @click="pick(n)"
      @keydown="onKey($event, n)"
    >{{ n }}</button>
  </div>
  <p v-if="props.modelValue" class="small muted rating-word" aria-hidden="true">{{ WORDS[props.modelValue - 1] }}</p>
</template>

<style scoped>
.rating { display: flex; gap: 6px; }
.rating-btn {
  flex: 1; min-height: 48px; min-width: 44px;
  border: 1.5px solid var(--ink); border-radius: var(--radius);
  background: var(--paper-raised); color: var(--ink);
  font-weight: 800; font-size: 18px; cursor: pointer;
}
.rating.sm .rating-btn { min-height: 40px; font-size: 16px; }
.rating-btn.on { background: var(--ink); color: var(--paper); }
.rating-btn:focus-visible { outline: 2.5px solid var(--strap); outline-offset: 2px; }
.rating-word { margin: 4px 0 0; }
</style>
