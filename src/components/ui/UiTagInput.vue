<script setup>
// F53: tags as boxes. Type a topic and press Enter (or type a comma, or Tab) and it becomes a box; paste
// "a, b, c" and you get three; a repeat (ignoring case) is skipped; Backspace on an empty field highlights the
// last box and a second Backspace removes it; every box has a button named "Remove <tag>". Enter never submits
// the surrounding form. The model is an array of strings; the forms turn it into the comma text they always sent.
// Motion is the pop token on a new box and a fade for a removed one (transform and opacity only, D045).
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { addTags, removeTagAt } from "../../lib/tags";

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  id: { type: String, default: undefined },
  max: { type: Number, default: 12 },
  maxLength: { type: Number, default: 24 },
  placeholder: { type: String, default: "Type a topic and press Enter" },
});

const emit = defineEmits(["update:modelValue"]);

// The list is kept here as well as in the parent: a parent only hands a new list back when it next draws, so
// two boxes made in the same moment (fast typing, a paste with commas) must each build on the one before.
const tags = ref([...props.modelValue]);
watch(() => props.modelValue, (v) => { if (JSON.stringify(v) !== JSON.stringify(tags.value)) tags.value = [...v]; });
function setTags(v) { tags.value = v; emit("update:modelValue", v); }

const input = ref(null);
const text = ref("");
const selected = ref(false);   // the last box is highlighted, ready for a second Backspace
const ready = ref(false);      // boxes that are there at the start do not animate
const ghosts = ref([]);        // boxes that were just removed, fading out where they were
let gid = 0;
const timers = new Set();

const opts = computed(() => ({ max: props.max, maxLength: props.maxLength }));
const full = computed(() => tags.value.length >= props.max);
const rows = computed(() => {
  // A key is the tag itself (and which repeat it is, for text that came in with repeats), so a box that stays is
  // never redrawn, and never pops in again, when another is removed.
  const seen = {};
  const out = tags.value.map((t, i) => { const k = t.toLowerCase(); seen[k] = (seen[k] || 0) + 1; return { t, i, key: `t${seen[k]}:${k}` }; });
  for (const g of [...ghosts.value].sort((a, b) => a.at - b.at)) out.splice(g.at, 0, { t: g.t, ghost: true, key: "g" + g.id });
  return out;
});
const lastIndex = computed(() => tags.value.length - 1);
const note = computed(() => (selected.value && tags.value.length ? `${tags.value[lastIndex.value]} is highlighted. Press Backspace again to remove it.` : ""));

function commit(raw) {
  if (!String(raw ?? "").trim()) return;
  const r = addTags(tags.value, raw, opts.value);
  if (r.added) setTags(r.tags);
  // Keep what was typed only when nothing could be added because the list is full.
  if (r.added || !r.full) text.value = "";
}
function remove(i) {
  const t = tags.value[i];
  if (t === undefined) return;
  const g = { id: ++gid, t, at: i };
  ghosts.value = [...ghosts.value, g];
  const timer = setTimeout(() => { timers.delete(timer); ghosts.value = ghosts.value.filter((x) => x.id !== g.id); }, 140);
  timers.add(timer);
  setTags(removeTagAt(tags.value, i));
  selected.value = false;
  nextTick(() => input.value?.focus?.());
}
function onInput(e) {
  const v = e.target.value;
  selected.value = false;
  // A comma (or a pasted line break, or a phone keyboard that sends no key code) turns what is before it into boxes.
  if (/[,\n\r]/.test(v)) { text.value = ""; e.target.value = ""; commit(v); } else text.value = v;
}
function onKeydown(e) {
  if (e.isComposing) return;
  if (e.key === "Enter") { e.preventDefault(); commit(text.value); return; }
  if (e.key === "Tab" && !e.shiftKey && text.value.trim()) { e.preventDefault(); commit(text.value); return; }
  if (e.key === "Backspace" && !text.value && tags.value.length) {
    e.preventDefault();
    if (selected.value) remove(lastIndex.value); else selected.value = true;
    return;
  }
  if (!["Shift", "Control", "Alt", "Meta", "Tab", "Backspace"].includes(e.key)) selected.value = false;
}
function onPaste(e) {
  const pasted = e.clipboardData?.getData("text") || "";
  if (!/[,\n\r]/.test(pasted)) return; // one piece pastes as text, as usual
  e.preventDefault();
  const at = e.target;
  commit(text.value + pasted);
  if (at) at.value = text.value;
}
function onBlur() { selected.value = false; commit(text.value); }
function focusInput(e) { if (!e.target.closest?.("button")) input.value?.focus?.(); }

onMounted(() => { ready.value = true; });
onBeforeUnmount(() => { for (const t of timers) clearTimeout(t); });
defineExpose({ focus: () => input.value?.focus?.() });
</script>

<template>
  <div>
    <div class="tag-input" :class="{ ready }" @click="focusInput">
      <template v-for="r in rows" :key="r.key">
        <span v-if="r.ghost" class="tag-box tag-gone" aria-hidden="true"><span class="tag-text">{{ r.t }}</span></span>
        <span v-else class="tag-box" :class="{ sel: selected && r.i === lastIndex }">
          <span class="tag-text">{{ r.t }}</span>
          <button type="button" class="tag-x" :aria-label="`Remove ${r.t}`" @click.stop="remove(r.i)">×</button>
        </span>
      </template>
      <input :id="id" ref="input" type="text" class="tag-field" :value="text" :maxlength="maxLength"
             :placeholder="tags.length ? 'Add another' : placeholder" enterkeyhint="enter" autocomplete="off"
             @input="onInput" @keydown="onKeydown" @paste="onPaste" @blur="onBlur" />
    </div>
    <span class="visually-hidden" role="status">{{ note }}</span>
    <span v-if="full" class="small muted tag-limit" role="status">That's the most you can add ({{ max }}). Remove one to add another.</span>
  </div>
</template>
