<script setup>
// The shared shell for the custom pickers (UiSelect, UiCombobox, UiDatePicker,
// UiTimePicker). Under 600 px it is a bottom sheet with a backdrop; from 600 px
// it is a popover under its anchor. The parent owns `open` and listens for `close`.
//
// Two focus models, chosen by the parent with `trap`:
//  - trap (always true for the phone sheet): focus moves in and is kept in,
//    everything behind is `inert`, Esc closes, focus goes back to where it was.
//  - no trap (a popover whose trigger keeps focus, like a select-only combobox):
//    focus stays where it is; Esc and a press outside still close it.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useSlots, watch } from "vue";
import Icon from "../Icon.vue";

const props = defineProps({
  open: Boolean,
  anchor: { type: Object, default: null },      // the trigger element, for the popover
  label: { type: String, default: "" },         // accessible name, and the sheet title
  dialog: { type: Boolean, default: true },     // wrap the content as role="dialog"
  trap: { type: Boolean, default: true },       // popover only; the phone sheet always traps
  focus: { type: String, default: "" },         // selector to focus first when trapping
  fit: { type: Boolean, default: false },       // popover: at least as wide as the anchor
  closeButton: { type: Boolean, default: true },// show a Close button in the phone sheet
});
const emit = defineEmits(["close"]);
// The content is drawn by calling the slot function directly. A compiled <slot> pulls
// renderSlot into the shared Vue chunk that public pages load; this does not.
const slots = useSlots();
const Body = () => slots.default?.({ sheet: isSheet.value });

// ---- phone or not: one shared media query ----
const phone = ref(false);
let mq = null;
function watchPhone() {
  if (mq || typeof window === "undefined" || !window.matchMedia) return;
  mq = window.matchMedia("(max-width: 599px)");
  phone.value = mq.matches;
  mq.addEventListener("change", (e) => { phone.value = e.matches; });
}
watchPhone();

const isSheet = computed(() => phone.value);
const trapping = computed(() => isSheet.value || props.trap);

const panel = ref(null);
const portal = ref(null);
const pos = ref({});
let opener = null;
let lockedBy = false;

// ---- document-level state shared by every open layer ----
const stack = (globalThis.__uiLayers ||= []);
const inertCount = (globalThis.__uiInert ||= { n: 0 });
function setBehind(on) {
  const app = document.getElementById("app");
  if (on) {
    inertCount.n++;
    app?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
  } else {
    inertCount.n = Math.max(0, inertCount.n - 1);
    if (!inertCount.n) { app?.removeAttribute("inert"); document.body.style.overflow = ""; }
  }
}

function place() {
  const a = props.anchor;
  const p = panel.value;
  if (isSheet.value || !a || !p) { pos.value = {}; return; }
  const r = a.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const gap = 4;
  const width = Math.max(p.offsetWidth, props.fit ? r.width : 0);
  const below = vh - r.bottom - gap - 8;
  const above = r.top - gap - 8;
  const h = p.scrollHeight;
  const up = h > below && above > below;
  const left = Math.min(Math.max(8, r.left), Math.max(8, vw - width - 8));
  pos.value = {
    left: left + "px",
    minWidth: props.fit ? r.width + "px" : undefined,
    maxHeight: Math.max(160, up ? above : below) + "px",
    ...(up ? { bottom: vh - r.top + gap + "px" } : { top: r.bottom + gap + "px" }),
  };
}

function focusables() {
  if (!panel.value) return [];
  return [...panel.value.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

function onKeydownPanel(e) {
  if (e.key !== "Tab" || !trapping.value) return;
  const list = focusables();
  if (!list.length) { e.preventDefault(); panel.value?.focus(); return; }
  const first = list[0];
  const last = list[list.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === panel.value)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
}

const token = {};
function onDocKey(e) {
  if (e.key !== "Escape" || stack[stack.length - 1] !== token) return;
  e.preventDefault();
  e.stopPropagation();
  emit("close");
}
function onDocPointer(e) {
  if (isSheet.value || stack[stack.length - 1] !== token) return;
  const t = e.target;
  if (panel.value?.contains(t) || props.anchor?.contains?.(t)) return;
  emit("close");
}
function onResize() { place(); }

async function opened() {
  opener = document.activeElement;
  stack.push(token);
  document.addEventListener("keydown", onDocKey, true);
  document.addEventListener("pointerdown", onDocPointer, true);
  window.addEventListener("resize", onResize);
  window.addEventListener("scroll", onResize, true);
  await nextTick();
  place();
  if (trapping.value) {
    lockedBy = true;
    setBehind(true);
    const target = (props.focus && panel.value?.querySelector(props.focus)) || focusables()[0] || panel.value;
    target?.focus({ preventScroll: true });
  }
}

function closed() {
  const i = stack.indexOf(token);
  if (i >= 0) stack.splice(i, 1);
  document.removeEventListener("keydown", onDocKey, true);
  document.removeEventListener("pointerdown", onDocPointer, true);
  window.removeEventListener("resize", onResize);
  window.removeEventListener("scroll", onResize, true);
  if (lockedBy) {
    lockedBy = false;
    setBehind(false);
    const back = opener && opener !== document.body && document.contains(opener) ? opener : props.anchor;
    // Wait a tick so the layer is gone and the page is no longer inert.
    nextTick(() => back?.focus?.({ preventScroll: true }));
  }
  opener = null;
}

watch(isSheet, () => { if (props.open) nextTick(place); });
watch(() => props.open, (v) => (v ? opened() : closed()), { immediate: true, flush: "post" });
onMounted(() => { document.body.appendChild(portal.value); });
onBeforeUnmount(() => { if (props.open) closed(); portal.value?.remove(); });

defineExpose({ place, panel });
</script>

<template>
  <!-- The root is moved to <body> when mounted (see onMounted), so a picker can sit inside
       any container. Vue's own Teleport is not used: it would add to the shared Vue
       chunk that public pages load. Put this as the last child of its parent. -->
  <div ref="portal" class="ui-portal">
    <div v-if="open" class="ui-layer" :class="{ 'is-sheet': isSheet }"
         @pointerdown.self="isSheet && emit('close')">
      <div ref="panel" class="ui-panel" tabindex="-1"
           :class="{ 'is-fit': fit }"
           :role="dialog && trapping ? 'dialog' : undefined"
           :aria-modal="dialog && trapping ? 'true' : undefined"
           :aria-label="dialog && trapping ? label || undefined : undefined"
           :style="pos"
           @keydown="onKeydownPanel">
        <template v-if="isSheet">
          <div class="ui-handle" aria-hidden="true"></div>
          <div v-if="label || closeButton" class="ui-sheet-head">
            <span class="label" aria-hidden="true">{{ label }}</span>
            <button v-if="closeButton" type="button" class="icon-btn ui-close" aria-label="Close" @click="emit('close')">
              <Icon name="close" :size="20" />
            </button>
          </div>
        </template>
        <component :is="Body" />
      </div>
    </div>
  </div>
</template>

<style>
/* The layer is a fixed frame. Under 600 px it dims the page and holds the sheet
   at the bottom; from 600 px it has no box of its own, the panel floats. */
.ui-layer { position: fixed; inset: 0; z-index: 120; pointer-events: none; }
.ui-layer.is-sheet {
  pointer-events: auto;
  background: rgba(20, 19, 17, 0.55);
  display: flex; align-items: flex-end; justify-content: center;
  animation: ui-fade 120ms linear;
}
.ui-panel {
  pointer-events: auto;
  position: fixed;
  background: var(--paper);
  color: var(--ink);
  border: var(--border-ink);
  border-radius: var(--radius);
  overflow-y: auto;
  overscroll-behavior: contain;
  animation: ui-fade 120ms linear;
}
.ui-panel:focus { outline: none; }
.ui-panel.is-fit { min-width: 220px; }
.is-sheet .ui-panel {
  position: relative;
  width: 100%; max-width: var(--app-w, 480px);
  max-height: 85vh; max-height: 85dvh;
  border-bottom: none;
  border-radius: 14px 14px 0 0;
  padding: 10px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  animation: ui-rise 120ms linear;
}
.ui-handle { width: 40px; height: 4px; border-radius: 2px; background: var(--rule); margin: 0 auto 10px; }
.ui-sheet-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; margin-bottom: 8px; }
.ui-close { width: 44px; height: 44px; }
.ui-close:focus-visible { outline: 2.5px solid var(--strap); outline-offset: 1px; }
@keyframes ui-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes ui-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .ui-layer.is-sheet, .ui-panel, .is-sheet .ui-panel { animation: none; }
}

/* The trigger every picker shares: it looks like the form's text inputs. */
.ui-trigger {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  width: 100%; min-height: var(--tap);
  padding: 12px 14px;
  border: var(--border); border-radius: var(--radius);
  background: var(--paper-raised); color: var(--ink);
  box-shadow: var(--inset-shadow);
  font: inherit; font-size: 16px; text-align: left;
  cursor: pointer;
}
.ui-trigger:focus-visible { outline: 2.5px solid var(--strap); outline-offset: 1px; }
.ui-trigger[disabled] { opacity: 0.5; cursor: default; }
.ui-trigger .ui-value { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-trigger .ui-placeholder { color: color-mix(in srgb, var(--graphite) 80%, transparent); }
.ui-chevron {
  flex: none; width: 8px; height: 8px; margin: -4px 2px 0 0;
  border-right: 1.75px solid var(--graphite); border-bottom: 1.75px solid var(--graphite);
  transform: rotate(45deg);
}
.ui-trigger[aria-expanded="true"] .ui-chevron { transform: rotate(-135deg); margin-top: 2px; }

/* The list every picker shares. */
.ui-list { list-style: none; margin: 0; padding: 4px; }
.ui-list:focus { outline: none; }
.ui-option {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  min-height: 44px; padding: 10px 12px;
  border-radius: 4px;
  font-size: 16px; line-height: 1.3;
  cursor: pointer;
}
.ui-option[aria-selected="true"] { font-weight: 700; }
.ui-option[aria-disabled="true"] { color: var(--graphite); opacity: 0.55; cursor: default; }
.ui-option.is-active { outline: 2px solid var(--strap); outline-offset: -2px; }
.ui-option mark { background: transparent; color: inherit; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
.ui-empty { padding: 12px; color: var(--graphite); font-size: 15px; }
</style>
