<script setup>
// F32: "For you", on the event hub. The keys, codes, passwords and vouchers the organisers gave out at this
// event. Everything here is the signed-in person's own: the list shows titles and where each stands, and a key
// is fetched only when they press Show, then cleared when they press Hide, leave the page or switch away.
// Nothing is kept in storage, and nothing is drawn as HTML. A voucher opens as a sheet with the event, the
// title, the person's name and photo, a QR code and the same code as 6 digits; staff scan it with the scanner link
// the host sent them (F40), and the sheet updates when they do.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { api } from "../lib/api";
import { drawQR } from "../lib/qr";
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
const replacedOn = (ms) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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
const pass = ref(null); // { code, qr } for the voucher on screen
const passError = ref("");
const qrCanvas = ref(null);
const justUsed = ref(false);
let tick = null;
const current = computed(() => vouchers.value.find((v) => v.id === open.value) || null);
async function openVoucher(v, ev) {
  open.value = v.id; trigger.value = ev.currentTarget; pass.value = null; passError.value = ""; justUsed.value = false;
  try {
    pass.value = await api(`${base.value}/${encodeURIComponent(v.id)}/code`, "POST");
    await nextTick();
    if (qrCanvas.value) await drawQR(qrCanvas.value, pass.value.qr, 480);
  } catch (e) { passError.value = e.message; }
  // While it is on screen, look every few seconds, so a scan shows here as "Used" at once.
  clearInterval(tick);
  tick = setInterval(async () => {
    const before = current.value?.voucher.used || 0;
    await load();
    if ((current.value?.voucher.used || 0) > before) justUsed.value = true;
  }, 4000);
}
function closeVoucher() { open.value = null; pass.value = null; clearInterval(tick); }
const spaced = (c) => (c ? `${c.slice(0, 3)} ${c.slice(3)}` : "");
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
        <p v-if="d.replacedAt && d.state === 'have'" class="small drop-note" data-replaced>Your earlier one was replaced on {{ replacedOn(d.replacedAt) }}.</p>
        <template v-if="d.state === 'ready' || d.state === 'have'">
          <div v-if="shown[d.id] !== undefined" class="stack-2 drop-open">
            <div :id="'secret-' + d.id" class="secret tnum" data-secret>{{ shown[d.id] }}</div>
            <div class="btn-row">
              <button type="button" class="btn" @click="copy(d)"><span :key="copied === d.id" class="swap">{{ copied === d.id ? "Copied" : "Copy" }}</span></button>
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

    <UiSheet :open="!!current" :anchor="trigger" :label="data.event.name" modal @close="closeVoucher">
      <div v-if="current" class="voucher" data-voucher>
        <div class="voucher-head">
          <span class="label">Voucher</span>
          <h3 class="voucher-title">{{ current.title }}</h3>
          <p v-if="current.note" class="small muted voucher-note">{{ current.note }}</p>
        </div>
        <div class="voucher-who">
          <Avatar class="avatar voucher-photo" :src="data.me.photo" :alt="data.me.name || 'You'" />
          <strong class="voucher-name">{{ data.me.name || "You" }}</strong>
        </div>
        <div class="voucher-pass" :class="{ spent: current.state !== 'ready' }">
          <canvas v-show="pass" ref="qrCanvas" class="voucher-qr" role="img" :aria-label="`QR code for ${current.title}`" data-qr></canvas>
          <div v-if="!pass && !passError" class="voucher-qr sk" aria-hidden="true"></div>
          <p v-if="passError" class="error-text small" role="alert" style="margin:0">{{ passError }}</p>
          <span v-if="current.state !== 'ready'" class="voucher-stamp">{{ current.state === "used" ? "Used" : "Not open" }}</span>
        </div>
        <div v-if="pass" class="voucher-code">
          <span class="label">Or tell staff this code</span>
          <span class="voucher-digits tnum" data-code>{{ spaced(pass.code) }}</span>
        </div>
        <p class="voucher-left tnum" :class="{ gone: current.state === 'used' }" role="status">{{ justUsed && current.state !== 'used' ? "Scanned. " : "" }}{{ voucherLine(current) }}</p>
        <p v-if="current.voucher.usedAt.length" class="small muted tnum voucher-fine">
          Used: <span v-for="(t, i) in current.voucher.usedAt" :key="i">{{ i ? ", " : "" }}{{ clock(t) }}</span>
        </p>
        <p v-if="current.validUntil" class="small muted voucher-fine">Valid until {{ clock(current.validUntil) }}.</p>
        <p class="small muted voucher-fine">Show this to the staff. They scan the code to mark it used.</p>
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
.voucher { display: flex; flex-direction: column; align-items: center; gap: 18px; text-align: center; padding: 4px 0 8px; }
.voucher-head { display: flex; flex-direction: column; align-items: center; gap: 4px; max-width: 100%; }
.voucher-title { margin: 0; font-size: 26px; line-height: 1.15; overflow-wrap: anywhere; }
.voucher-note { margin: 0; }
.voucher-who { display: flex; align-items: center; justify-content: center; gap: 12px; max-width: 100%; }
.voucher-photo { width: 56px; height: 56px; flex: none; }
.voucher-name { font-size: 20px; line-height: 1.2; overflow-wrap: anywhere; text-align: left; }
.voucher-pass {
  position: relative; padding: 16px; background: #fff; border: var(--border-ink); border-radius: 12px;
  box-shadow: var(--shadow-2); line-height: 0;
}
.voucher-qr { display: block; width: min(220px, 60vw); height: min(220px, 60vw); aspect-ratio: 1; image-rendering: pixelated; }
.voucher-pass.spent .voucher-qr { opacity: .18; }
.voucher-stamp {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(-8deg);
  font-size: 30px; font-weight: 800; line-height: 1; letter-spacing: .06em; text-transform: uppercase;
  color: var(--strap-deep); border: 3px solid currentColor; border-radius: 8px; padding: 8px 14px; background: #fff;
}
.voucher-code { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.voucher-digits { font-size: 32px; font-weight: 800; letter-spacing: .14em; line-height: 1.1; }
.voucher-left { margin: 0; font-size: 18px; font-weight: 700; }
.voucher-left.gone { color: var(--graphite); }
.voucher-fine { margin: 0; max-width: 34ch; }
</style>
