<script setup>
// F32: "For you", on the event hub. The keys, codes, passwords and vouchers the organisers gave out at this
// event. Everything here is the signed-in person's own: the list shows titles and where each stands, and a key
// is fetched only when they press Show, then cleared when they press Hide, leave the page or switch away.
// Nothing is kept in storage, and nothing is drawn as HTML. A voucher opens as a sheet with the event, the
// title, the person's first name and photo and a live clock; staff mark it used there (F32.4).
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { api } from "../lib/api";
import Avatar from "./Avatar.vue";
import UiSheet from "./ui/UiSheet.vue";

const props = defineProps({ eventId: { type: String, required: true } });
const base = computed(() => `/api/e/${encodeURIComponent(props.eventId)}/drops`);

const data = ref(null);
const shown = ref({}); // drop id -> the key, only while it is on screen
const errors = ref({});
const busy = ref("");
const copied = ref("");

async function load() {
  try { data.value = await api(base.value); } catch { data.value = null; /* a 403 or 404: nothing to show here */ }
}
function forget() { shown.value = {}; copied.value = ""; }
function onHidden() { if (document.hidden) forget(); }
onMounted(() => { load(); document.addEventListener("visibilitychange", onHidden); });
onBeforeUnmount(() => { document.removeEventListener("visibilitychange", onHidden); forget(); clearInterval(tick); });

async function show(d) {
  if (busy.value) return;
  busy.value = d.id; errors.value = { ...errors.value, [d.id]: "" };
  try {
    const r = await api(`${base.value}/${encodeURIComponent(d.id)}/reveal`, "POST");
    shown.value = { ...shown.value, [d.id]: r.value };
    await load();
  } catch (e) {
    errors.value = { ...errors.value, [d.id]: e.message };
    await load(); // "All given out" or "stopped" changes what the card says
  } finally { busy.value = ""; }
}
function hide(d) { const { [d.id]: _gone, ...rest } = shown.value; shown.value = rest; copied.value = ""; }
async function copy(d) {
  const text = shown.value[d.id];
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById("secret-" + d.id));
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    try { document.execCommand("copy"); } catch { /* the text is selected: they can copy it by hand */ }
  }
  copied.value = d.id;
  setTimeout(() => { if (copied.value === d.id) copied.value = ""; }, 2500);
}

const clock = (ms) => new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const note = (d) => ({
  out: "All given out. There are none left.",
  withdrawn: "The organisers withdrew this one.",
  soon: d.validFrom ? `Opens ${clock(d.validFrom)}.` : "Not started yet.",
  closed: "This has finished.",
  stopped: "The organisers have paused this. Check back later.",
}[d.state] || "");
const items = computed(() => (data.value?.drops || []).filter((d) => d.kind !== "voucher"));
const vouchers = computed(() => (data.value?.drops || []).filter((d) => d.kind === "voucher"));
const any = computed(() => (data.value?.drops || []).length > 0);

/* ----------------------------------- the voucher screen ----------------------------------- */
const open = ref(null); // the voucher on screen
const trigger = ref(null);
const nowMs = ref(Date.now());
let tick = null;
const current = computed(() => vouchers.value.find((v) => v.id === open.value) || null);
function openVoucher(v, ev) {
  open.value = v.id; trigger.value = ev.currentTarget; nowMs.value = Date.now();
  clearInterval(tick); tick = setInterval(() => { nowMs.value = Date.now(); }, 1000);
}
function closeVoucher() { open.value = null; clearInterval(tick); staffOpen.value = false; pin.value = ""; staffError.value = ""; marked.value = ""; }
// Staff mark a use by typing the PIN the host gave them, here, on the holder's own phone. The PIN is masked as it is
// typed, never stored, and cleared after every try.
const staffOpen = ref(false);
const pin = ref("");
const staffError = ref("");
const marked = ref("");
async function mark() {
  if (busy.value || !current.value) return;
  busy.value = "pin"; staffError.value = ""; marked.value = "";
  const v = current.value;
  try {
    await api(`${base.value}/${encodeURIComponent(v.id)}/use`, "POST", { pin: pin.value });
    marked.value = "Marked as used.";
    staffOpen.value = false;
  } catch (e) { staffError.value = e.message; }
  finally { pin.value = ""; busy.value = ""; await load(); }
}
const hms = computed(() => new Date(nowMs.value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
const today = computed(() => new Date(nowMs.value).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }));
const voucherLine = (v) => (v.state === "used" ? `Used${v.voucher.usedAt.length ? " " + clock(v.voucher.usedAt.at(-1)) : ""}` : v.state === "ready" ? `${v.voucher.left} of ${v.voucher.perPerson} left` : note(v));
</script>

<template>
  <section v-if="any" class="stack for-you" aria-labelledby="for-you-h" data-drops>
    <h2 id="for-you-h" class="label">For you</h2>
    <p class="small muted" style="margin:0">From the organisers of this event. Each one is shown only to the person it was given to, so don't pass yours on.</p>

    <div class="list">
      <div v-for="d in items" :key="d.id" class="list-row drop-row" :data-drop="d.id">
        <div class="drop-head">
          <strong class="drop-title">{{ d.title }}</strong>
          <span v-if="d.note" class="small muted">{{ d.note }}</span>
        </div>
        <template v-if="d.state === 'ready' || d.state === 'have'">
          <div v-if="shown[d.id] !== undefined" class="stack-2 drop-open">
            <div :id="'secret-' + d.id" class="secret tnum" data-secret>{{ shown[d.id] }}</div>
            <div class="btn-row">
              <button type="button" class="btn" @click="copy(d)">{{ copied === d.id ? "Copied" : "Copy" }}</button>
              <button type="button" class="btn" @click="hide(d)">Hide</button>
            </div>
            <p class="small muted" style="margin:0" role="status">{{ copied === d.id ? "Copied. Paste it where you need it." : "Only you can see this. Hide it before you hand your phone to anyone." }}</p>
          </div>
          <button v-else type="button" class="btn btn-primary" :disabled="busy === d.id" @click="show(d)">{{ busy === d.id ? "Opening…" : d.state === "have" ? "Show mine" : "Show" }}</button>
        </template>
        <p v-else class="small drop-note">{{ note(d) }}</p>
        <p v-if="errors[d.id]" class="error-text small" role="alert" style="margin:0">{{ errors[d.id] }}</p>
      </div>

      <div v-for="v in vouchers" :key="v.id" class="list-row drop-row" :data-drop="v.id">
        <div class="drop-head">
          <strong class="drop-title">{{ v.title }}</strong>
          <span class="small muted">{{ v.note || "Voucher" }}</span>
        </div>
        <p class="small drop-note tnum">{{ voucherLine(v) }}</p>
        <button v-if="v.state === 'ready' || v.state === 'used'" type="button" class="btn" :class="{ 'btn-primary': v.state === 'ready' }" aria-haspopup="dialog" @click="openVoucher(v, $event)">Show voucher</button>
      </div>
    </div>

    <UiSheet :open="!!current" :anchor="trigger" :label="current ? current.title : 'Voucher'" fit @close="closeVoucher">
      <div v-if="current" class="voucher stack-2" data-voucher>
        <span class="label">{{ data.event.name }}</span>
        <h3 class="voucher-title">{{ current.title }}</h3>
        <div class="voucher-who">
          <Avatar class="avatar voucher-photo" :src="data.me.photo" :alt="data.me.firstName || 'You'" />
          <strong class="voucher-name">{{ data.me.firstName || "You" }}</strong>
        </div>
        <div class="voucher-clock tnum" role="timer" aria-label="The time now" data-clock>{{ hms }}</div>
        <span class="small muted">{{ today }}</span>
        <p class="voucher-left tnum" :class="{ gone: current.state === 'used' }">{{ voucherLine(current) }}</p>
        <p v-if="current.voucher.usedAt.length" class="small muted tnum" style="margin:0">
          Used: <span v-for="(t, i) in current.voucher.usedAt" :key="i">{{ i ? ", " : "" }}{{ clock(t) }}</span>
        </p>
        <p v-if="current.validUntil" class="small muted" style="margin:0">Valid until {{ clock(current.validUntil) }}.</p>
        <p class="small muted" style="margin:0">Show this screen to the staff. The clock is live, so a screenshot won't work.</p>
        <p v-if="marked" class="success-text" role="status">{{ marked }}</p>
        <div v-if="current.state === 'ready'" class="staff stack-2">
          <button v-if="!staffOpen" type="button" class="btn" @click="staffOpen = true">Staff: mark as used</button>
          <form v-else class="stack-2" @submit.prevent="mark">
            <div class="field" style="margin:0">
              <label for="staff-pin">Staff PIN</label>
              <input id="staff-pin" v-model="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" autocapitalize="off" spellcheck="false" required />
            </div>
            <button type="submit" class="btn btn-primary" :disabled="busy === 'pin' || pin.length !== 6">Mark as used</button>
          </form>
          <p v-if="staffError" class="error-text small" role="alert" style="margin:0">{{ staffError }}</p>
        </div>
      </div>
    </UiSheet>
  </section>
</template>

<style scoped>
.drop-row { display: flex; flex-direction: column; align-items: stretch; gap: 10px; }
.drop-head { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.drop-title { overflow-wrap: anywhere; }
.drop-note { margin: 0; }
.drop-open { min-width: 0; }
.secret {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 17px; line-height: 1.4;
  padding: 12px; border: var(--border-ink); border-radius: var(--radius); background: var(--paper-raised);
  overflow-wrap: anywhere; word-break: break-all; user-select: all;
}
.voucher { text-align: center; align-items: center; padding: 4px 0 8px; }
.voucher-title { margin: 0; font-size: 26px; overflow-wrap: anywhere; }
.voucher-who { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.voucher-photo { width: 96px; height: 96px; }
.voucher-name { font-size: 24px; }
.voucher-clock { font-size: 44px; font-weight: 800; letter-spacing: .02em; line-height: 1; }
.voucher-left { margin: 0; font-size: 20px; font-weight: 700; }
.staff { width: 100%; text-align: left; }
.voucher-left.gone { color: var(--graphite); text-decoration: line-through; }
</style>
