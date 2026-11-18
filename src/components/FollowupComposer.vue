<script setup>
// F22: "Draft a follow-up". A bottom sheet on a person you are connected with: pick where it will be sent, the tone and the
// goal, what to talk about (their side) and what you can offer (your side), add a line if you like, press Draft it, then
// edit the text and copy it or open it in your own app. Lanyard never sends anything.
//
// Loaded with a plain import() from CardConnection.vue when the button is pressed, so it is in no page's first load
// (public-page JS budget, D024). It calls api() directly rather than adding to api.js. The draft is plain text in a
// textarea and an input (v-model), never rendered as HTML. When the Worker answers with a fallback (AI off, a limit,
// a reply that failed its checks) the page shows the template from src/lib/followupTemplates.js with the message.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { api } from "../lib/api";
import Icon from "./Icon.vue";
import { useSheetExit } from "../lib/sheetMotion";
import Waiting from "./Waiting.vue";
import { CHANNELS, TONES, GOALS, templateDraft } from "../lib/followupTemplates";

const props = defineProps({
  connectionId: { type: String, required: true },
  links: { type: Object, default: () => ({}) }, // the links they show you (from the card page)
  first: { type: String, default: "them" },
});
const emit = defineEmits(["close", "followed-up"]);

// A count and nothing else is kept (what happened to a draft, for the admin page): no text, no person. Never blocks the page.
const tally = (kind) => { api("/api/ai/followup-count", "POST", { kind }).catch(() => {}); };

const loading = ref(true);
const loadError = ref("");
const opts = ref(null);
const busy = ref(false);
const error = ref("");

// ---- what the other person shared a link for decides which "Open in" buttons exist ----
const hostOf = (u) => { try { const x = new URL(u); return x.protocol === "https:" ? x.hostname.replace(/^www\./, "").toLowerCase() : ""; } catch { return ""; } };
const linkList = computed(() => Object.values(props.links || {}).filter((u) => typeof u === "string"));
const linkedinUrl = computed(() => linkList.value.find((u) => /(^|\.)linkedin\.com$/.test(hostOf(u))) || "");
// wa.me/<number> or api.whatsapp.com/send?phone=<number>: only the digits are kept, and the address is rebuilt.
const whatsappNumber = computed(() => {
  for (const u of linkList.value) {
    const h = hostOf(u);
    try {
      if (h === "wa.me") { const d = new URL(u).pathname.replace(/\D/g, ""); if (d.length >= 7 && d.length <= 15) return d; }
      if (/(^|\.)whatsapp\.com$/.test(h)) { const d = (new URL(u).searchParams.get("phone") || "").replace(/\D/g, ""); if (d.length >= 7 && d.length <= 15) return d; }
    } catch { /* not an address */ }
  }
  return "";
});
// Email is always offered: a person's card never holds an address, so the draft opens a blank email to paste into.
const channels = computed(() => CHANNELS.filter((c) => c.id === "email" || (c.id === "linkedin" && linkedinUrl.value) || (c.id === "whatsapp" && whatsappNumber.value)));

const channel = ref("email");
const tone = ref("friendly");
const goal = ref("stay_in_touch");
const talk = ref([]);
const offer = ref([]);
const useNote = ref(true);
const extra = ref("");
const EXTRA_MAX = 300;

const result = ref(null); // { source: "ai" | "template", subject, body, message }
const subject = ref("");
const body = ref("");
const allowance = ref(null);
const copied = ref("");
const marked = ref(false);

const maxTalk = computed(() => opts.value?.limits?.max?.talkAbout || 3);
const maxOffer = computed(() => opts.value?.limits?.max?.offer || 2);

const toggled = (list, item, max) => (list.includes(item) ? list.filter((x) => x !== item) : list.length < max ? [...list, item] : list);
const toggleTalk = (item) => { talk.value = toggled(talk.value, item, maxTalk.value); };
const toggleOffer = (item) => { offer.value = toggled(offer.value, item, maxOffer.value); };

onMounted(() => { document.addEventListener("keydown", onKey); load(); });
async function load() {
  loading.value = true; loadError.value = "";
  try {
    opts.value = await api(`/api/ai/followup/${encodeURIComponent(props.connectionId)}`);
    allowance.value = opts.value.allowance;
    useNote.value = !!opts.value.hasNote;
    if (opts.value.talkAbout.length) talk.value = [opts.value.talkAbout[0].text]; // the top one is chosen for you
    channel.value = linkedinUrl.value ? "linkedin" : whatsappNumber.value ? "whatsapp" : "email";
  } catch (e) {
    loadError.value = e.message || "Couldn't load the options.";
  } finally {
    loading.value = false;
    await nextTick();
    root.value?.querySelector("button, textarea, input")?.focus({ preventScroll: true });
  }
}
const opener = typeof document !== "undefined" ? document.activeElement : null;
onBeforeUnmount(() => { document.removeEventListener("keydown", onKey); opener?.focus?.({ preventScroll: true }); });

const root = ref(null);
// F40: closing slides the sheet down first, then tells the page (D045); on a phone it can be swiped down.
const { leaving, close } = useSheetExit(emit, root);
function onKey(e) {
  if (e.key === "Escape") { e.stopPropagation(); close(); return; }
  if (e.key !== "Tab" || !root.value) return;
  const nodes = [...root.value.querySelectorAll("button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled])")];
  if (!nodes.length) return;
  const [a, z] = [nodes[0], nodes[nodes.length - 1]];
  if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
  else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
}

const topicForTemplate = computed(() => {
  const kinds = new Map((opts.value?.talkAbout || []).map((t) => [t.text, t.kind]));
  return talk.value.find((t) => kinds.get(t) === "tag") || "";
});
const starting = () => templateDraft({
  channel: channel.value, tone: tone.value, goal: goal.value,
  themFirst: opts.value?.themFirst || props.first, meFirst: opts.value?.meFirst || "", eventName: opts.value?.eventName || "",
  topic: topicForTemplate.value, offer: offer.value[0] || "",
});

function show(r) {
  result.value = r;
  subject.value = r.subject || "";
  body.value = r.body || "";
  copied.value = "";
  marked.value = false;
  nextTick(() => root.value?.querySelector("#fu-body")?.focus({ preventScroll: true }));
}

async function make(regenerate = false) {
  if (busy.value) return;
  busy.value = true; error.value = "";
  try {
    const r = await api(`/api/ai/followup/${encodeURIComponent(props.connectionId)}`, "POST", {
      channel: channel.value, tone: tone.value, goal: goal.value,
      talkAbout: talk.value, offer: offer.value, useNote: useNote.value && !!opts.value?.hasNote, extra: extra.value.trim(), regenerate,
    });
    allowance.value = r.allowance ?? allowance.value;
    if (r.fallback) show({ source: "template", message: r.message, reason: r.reason, ...starting() });
    else show({ source: "ai", ...r.draft });
  } catch (e) {
    // Even a failed request is not a dead end: the template needs nothing from the server.
    error.value = e.message || "Something went wrong.";
    show({ source: "template", message: "", ...starting() });
  } finally { busy.value = false; }
}

const left = computed(() => {
  const a = allowance.value;
  if (!a) return "";
  const day = a.day ?? Infinity, month = a.month ?? Infinity;
  const [n, when] = month < day ? [month, "this month"] : [day, "today"];
  if (n === Infinity) return "";
  if (n <= 0) return `No drafts left ${when}`;
  return `${n} ${n === 1 ? "draft" : "drafts"} left ${when}`;
});
const outOfDrafts = computed(() => !!allowance.value && Math.min(allowance.value.day ?? Infinity, allowance.value.month ?? Infinity) <= 0);

const fullText = computed(() => (channel.value === "email" && subject.value ? `${subject.value}\n\n${body.value}` : body.value));
async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = what;
    tally("copied");
  } catch {
    copied.value = "";
    error.value = "Couldn't copy. Select the text and copy it yourself.";
  }
}
const openHref = computed(() => {
  if (channel.value === "email") return `mailto:?subject=${encodeURIComponent(subject.value)}&body=${encodeURIComponent(body.value)}`;
  if (channel.value === "whatsapp" && whatsappNumber.value) return `https://wa.me/${whatsappNumber.value}?text=${encodeURIComponent(body.value)}`;
  if (channel.value === "linkedin" && linkedinUrl.value) return linkedinUrl.value;
  return "";
});
const openLabel = computed(() => (channel.value === "email" ? "Open in Mail" : channel.value === "whatsapp" ? "Open in WhatsApp" : "Open in LinkedIn"));
function opened() {
  // LinkedIn cannot be given text to fill in, so the draft is copied as the page opens.
  if (channel.value === "linkedin") navigator.clipboard?.writeText(body.value).then(() => { copied.value = "Copied, paste it in LinkedIn"; }).catch(() => {});
  tally("opened");
}
function markDone() { marked.value = true; emit("followed-up"); tally("marked"); }
</script>

<template>
  <div class="sheet-backdrop" :class="{ 'is-leaving': leaving }" @click.self="close()">
    <section ref="root" class="sheet" role="dialog" aria-modal="true" aria-labelledby="fu-title">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="stack-2">
        <div class="sheet-head">
          <div>
            <span class="label">Draft a follow-up</span>
            <h2 id="fu-title">A message to {{ opts?.themFirst || first }}</h2>
          </div>
          <button class="icon-btn" type="button" aria-label="Close" @click="close()"><Icon name="close" :size="20" /></button>
        </div>

        <Waiting v-if="loading" :rows="3" label="Loading" :retry="load" />
        <div v-else-if="loadError" class="stack" role="alert">
          <p class="error-text">{{ loadError }}</p>
          <button type="button" class="btn" @click="close()">Close</button>
        </div>

        <!-- The choices -->
        <form v-else-if="!result" class="stack-2" @submit.prevent="make(false)">
          <p class="small muted" style="margin:0">
            This makes a draft for you to check and change before you send it yourself. Lanyard doesn't send anything.
          </p>

          <fieldset class="fu-set">
            <legend class="label">Send it on</legend>
            <div class="chip-row">
              <button v-for="c in channels" :key="c.id" type="button" class="chip chip-toggle" :class="{ on: channel === c.id }" :aria-pressed="channel === c.id" @click="channel = c.id">{{ c.label }}</button>
            </div>
            <p v-if="channels.length === 1" class="small muted" style="margin:6px 0 0">{{ first }} hasn't shared a LinkedIn or WhatsApp link, so you can copy the text or open an email.</p>
          </fieldset>

          <fieldset class="fu-set">
            <legend class="label">Tone</legend>
            <div class="chip-row">
              <button v-for="t in TONES" :key="t.id" type="button" class="chip chip-toggle" :class="{ on: tone === t.id }" :aria-pressed="tone === t.id" @click="tone = t.id">{{ t.label }}</button>
            </div>
          </fieldset>

          <fieldset class="fu-set">
            <legend class="label">Goal</legend>
            <div class="chip-row">
              <button v-for="g in GOALS" :key="g.id" type="button" class="chip chip-toggle" :class="{ on: goal === g.id }" :aria-pressed="goal === g.id" @click="goal = g.id">{{ g.label }}</button>
            </div>
          </fieldset>

          <fieldset v-if="opts.talkAbout.length" class="fu-set">
            <legend class="label">Talk about (up to {{ maxTalk }})</legend>
            <div class="chip-row">
              <button v-for="t in opts.talkAbout" :key="t.text" type="button" class="chip chip-toggle" :class="{ on: talk.includes(t.text) }" :aria-pressed="talk.includes(t.text)"
                      @click="toggleTalk(t.text)">{{ t.text }}</button>
            </div>
          </fieldset>

          <fieldset v-if="opts.offer.length" class="fu-set">
            <legend class="label">You can offer (up to {{ maxOffer }})</legend>
            <div class="chip-row">
              <button v-for="t in opts.offer" :key="t" type="button" class="chip chip-toggle" :class="{ on: offer.includes(t) }" :aria-pressed="offer.includes(t)"
                      @click="toggleOffer(t)">{{ t }}</button>
            </div>
          </fieldset>

          <label v-if="opts.hasNote" class="checkbox-row">
            <input v-model="useNote" type="checkbox" />
            <span class="small">Use my private note about {{ opts.themFirst }}. It is yours, and nobody else sees it.</span>
          </label>

          <div class="field" style="margin-bottom:0">
            <label for="fu-extra">Anything to add? (optional)</label>
            <textarea id="fu-extra" v-model="extra" :maxlength="EXTRA_MAX" placeholder="I'll send the article on battery recycling we talked about."></textarea>
            <span class="small muted" style="align-self:flex-end">{{ extra.length }}/{{ EXTRA_MAX }}</span>
          </div>

          <p v-if="error" class="error-text" role="alert">{{ error }}</p>
          <div class="stack-1">
            <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? "Drafting…" : "Draft it" }}</button>
            <p v-if="left" class="small muted" style="margin:0;text-align:center" role="status">{{ left }}<template v-if="outOfDrafts">. You will get a starting point instead.</template></p>
          </div>
        </form>

        <!-- The draft -->
        <div v-else class="stack-2">
          <p v-if="result.source === 'ai'" class="notice small">
            A draft written by AI from what you and {{ opts.themFirst }} have shared. Check it and change it before you send it.
          </p>
          <div v-else class="notice small" role="status">
            <strong>Here's a starting point.</strong>{{ " " }}{{ result.message ? result.message + " " : "" }}Check it and change it before you send it.
          </div>

          <div v-if="channel === 'email'" class="field" style="margin-bottom:0">
            <label for="fu-subject">Subject</label>
            <input id="fu-subject" v-model="subject" type="text" maxlength="100" />
          </div>
          <div class="field" style="margin-bottom:0">
            <label for="fu-body">Message</label>
            <textarea id="fu-body" v-model="body" class="fu-body" maxlength="1200" rows="10"></textarea>
          </div>

          <p v-if="copied" class="success-text small" role="status">{{ copied }}</p>
          <p v-if="error" class="error-text" role="alert">{{ error }}</p>

          <div class="btn-row">
            <button type="button" class="btn btn-primary" @click="copy(fullText, 'Copied')">Copy</button>
            <a v-if="openHref" class="btn" :href="openHref" target="_blank" rel="noopener noreferrer" @click="opened">{{ openLabel }}</a>
          </div>
          <div class="btn-row">
            <button v-if="result.source === 'ai'" type="button" class="btn" :disabled="busy || outOfDrafts" @click="make(true)">{{ busy ? "Drafting…" : "Try again" }}</button>
            <button type="button" class="btn" @click="result = null; copied = ''">Change the choices</button>
          </div>
          <p v-if="left" class="small muted" style="margin:0" role="status">{{ left }}<template v-if="result.source === 'ai' && !outOfDrafts">. Trying again uses one.</template></p>
          <button type="button" class="btn" :disabled="marked" @click="markDone">{{ marked ? "Marked as followed up" : "Mark as followed up" }}</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.fu-set { border: 0; padding: 0; margin: 18px 0 0; min-width: 0; }
.fu-set legend { padding: 0; margin-bottom: 8px; }
.fu-body { min-height: 210px; line-height: 1.5; }
</style>
