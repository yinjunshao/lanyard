<script setup>
// F18: what attendees will see, beside the host's event form (host pages only).
// It draws the real check-in page (EventPage) from the form, so the two cannot drift apart.
// It saves nothing and calls nothing: the page is inert and nobody else can open it. From
// 1000 px it sits beside the form; below that a Preview button opens the same panel full screen.
//
// The form goes in the default slot. v-model:theme and v-model:strap-color are the same
// two settings the form has, so the strip under the preview changes the form as well.
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import EventPage from "./EventPage.vue";

const props = defineProps({
  // What the page is given (lib/eventform.js: eventFromBody).
  event: { type: Object, required: true },
  sponsors: { type: Array, default: () => [] },
  // Draw only the form (when there is nothing to preview, such as a copy of another event).
  off: { type: Boolean, default: false },
  // The theme strip changes the form's theme and colour; a copy of an earlier event keeps its own, so it has none.
  strip: { type: Boolean, default: true },
  // Below 1000 px, draw the preview in the page under the form instead of behind a Preview button (the
  // Create event Review step: the host should see the whole page before pressing Create).
  inline: { type: Boolean, default: false },
});
const theme = defineModel("theme", { type: String, default: "default" });
const strap = defineModel("strapColor", { type: String, default: "" });

// Typing updates the preview a moment later, not on every key.
const shown = ref(props.event);
let timer = null;
watch(() => props.event, (e) => { clearTimeout(timer); timer = setTimeout(() => { shown.value = e; }, 150); });

// A first-timer is asked for a name and the Terms tick; someone who has a card is not.
const firstTime = ref(true);
// `collect` is the pre-ticked state of the notice an event with named attendance shows (F31).
const form = reactive({ name: "", answers: {}, sponsorConsent: {}, directoryConsent: false, agreed: false, collect: { attendance: true, email: true, card: true } });
const THEMES = [["default", "Default"], ["formal", "Formal"], ["night", "Night"]];

// Below 1000 px the panel is full screen while `open`.
// F40: it slides in from the right and back out, so closing waits for the exit (`leaving`) before it hides it.
const open = ref(false);
const leaving = ref(false);
let leaveTimer = 0;
const panel = ref(null);
const closeBtn = ref(null);
let opener = null, wide = null;
const onWide = (e) => { if (e.matches) { clearTimeout(leaveTimer); open.value = leaving.value = false; } };
onMounted(() => { wide = window.matchMedia("(min-width: 1000px)"); wide.addEventListener("change", onWide); });
onBeforeUnmount(() => { clearTimeout(timer); clearTimeout(leaveTimer); wide?.removeEventListener("change", onWide); });
async function show() {
  clearTimeout(leaveTimer);
  leaving.value = false;
  if (!open.value) opener = document.activeElement;
  open.value = true;
  await nextTick();
  closeBtn.value?.focus();
}
function hide() {
  if (!open.value || leaving.value) return;
  leaving.value = true;
  leaveTimer = setTimeout(() => {
    open.value = leaving.value = false;
    nextTick(() => opener?.focus?.()); // focus goes back to the Preview button once the panel has gone
  }, 220);
}
function onKey(e) {
  if (!open.value) return;
  if (e.key === "Escape") { e.stopPropagation(); hide(); }
  // Keep Tab inside the panel while it is a dialog.
  if (e.key === "Tab" && panel.value) {
    const els = [...panel.value.querySelectorAll("button, input:not([disabled])")].filter((x) => !x.closest("[inert]"));
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}
</script>

<template>
  <div :class="{ 'pv-split': !off, 'pv-inline': inline && !off }">
    <div class="pv-form">
      <div v-if="!off" class="pv-open">
        <button type="button" class="btn" @click="show">Preview what attendees see</button>
      </div>
      <slot />
    </div>

    <aside v-if="!off" ref="panel" class="pv-side" :class="{ open, 'is-leaving': leaving }" :role="open ? 'dialog' : null" :aria-modal="open ? 'true' : null"
           aria-label="Preview of the check-in page" @keydown="onKey">
      <div class="pv-bar">
        <span class="label">Preview</span>
        <button ref="closeBtn" type="button" class="btn pv-close" @click="hide">Close</button>
      </div>
      <div class="pv-body">
        <h3 class="label pv-inline-label">What attendees will see</h3>
        <div class="pv-head">
          <div class="seg" role="group" aria-label="Who is looking">
            <button type="button" class="seg-btn" :class="{ on: firstTime }" :aria-pressed="firstTime" @click="firstTime = true">First time</button>
            <button type="button" class="seg-btn" :class="{ on: !firstTime }" :aria-pressed="!firstTime" @click="firstTime = false">Has a card</button>
          </div>
        </div>
        <div class="pv-frame" data-preview-frame>
          <p class="pv-tag small">Preview only. Nothing here is saved or sent, and nobody else can open it.</p>
          <div class="pv-page" inert aria-hidden="true">
            <EventPage :event="shown" :sponsors="sponsors" :form="form" :show-name="firstTime" :needs-agree="firstTime" />
          </div>
        </div>
        <div v-if="strip" class="pv-strip" role="group" aria-label="Theme">
          <button v-for="t in THEMES" :key="t[0]" type="button" class="chip chip-toggle" :class="{ on: theme === t[0] }"
                  :aria-pressed="theme === t[0]" @click="theme = t[0]">{{ t[1] }}</button>
          <label class="pv-brand chip" :class="{ on: !!strap }">
            <span>Brand colour</span>
            <input type="color" :value="strap || '#d9502b'" aria-label="Brand colour for the strap" @input="strap = $event.target.value" />
          </label>
          <button v-if="strap" type="button" class="link-btn small" @click="strap = ''">Reset colour</button>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.pv-form { min-width: 0; }
.pv-open { margin-bottom: 16px; }
.pv-open .btn { width: auto; }
.pv-bar { display: none; }
.pv-inline-label { display: none; margin: 0 0 10px; }
.pv-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.pv-frame {
  position: relative;
  width: 100%; max-width: 375px; height: 740px; margin: 0 auto;
  overflow: auto; overscroll-behavior: contain;
  border: var(--border-ink); border-radius: 18px; background: var(--paper);
  box-shadow: var(--shadow-2);
}
.pv-tag {
  position: sticky; top: 0; z-index: 2; margin: 0; padding: 6px 12px;
  background: var(--ink); color: var(--paper); text-align: center;
}
.pv-page { padding: 20px 20px 0; }
/* The bar that sticks to the bottom of a phone is part of the frame here, not the window. */
.pv-page :deep(.thumb-bar) { position: sticky; bottom: 0; margin: 24px -20px 0; box-shadow: none; }
.pv-strip { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; justify-content: center; }
.pv-brand { gap: 8px; cursor: pointer; }
.pv-brand input { width: 28px; height: 28px; padding: 0; border: 0; background: none; }

@media (max-width: 999px) {
  .pv-side { display: none; }
  .pv-side.open { display: flex; flex-direction: column; position: fixed; inset: 0; z-index: 200; background: var(--paper); animation: m-side-in var(--dur-sheet) var(--ease-out); }
  .pv-side.open.is-leaving { pointer-events: none; animation: m-side-out var(--dur-sheet-out) var(--ease-in) forwards; }
  .pv-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: var(--border); }
  .pv-close { width: auto; }
  .pv-body { flex: 1; overflow: auto; padding: 16px; }
  .pv-frame { height: min(740px, calc(100vh - 230px)); min-height: 360px; }
  /* Review step: the whole preview sits under the form, no button, no dialog. */
  .pv-inline .pv-open { display: none; }
  .pv-inline .pv-side { display: block; margin-top: 24px; }
  .pv-inline .pv-bar { display: none; }
  .pv-inline .pv-inline-label { display: block; }
  .pv-inline .pv-frame { height: 740px; }
}
@media (min-width: 1000px) {
  .pv-split {
    display: grid; grid-template-columns: minmax(0, 1fr) 375px; gap: 32px; align-items: start;
    width: min(1180px, calc(100vw - 64px)); position: relative; left: 50%; transform: translateX(-50%);
  }
  .pv-open { display: none; }
  .pv-side { position: sticky; top: 16px; }
  .pv-frame { height: min(740px, calc(100vh - 150px)); min-height: 360px; }
}
</style>
