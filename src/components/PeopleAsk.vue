<script setup>
// F24: "Do I know someone who...". A bottom sheet on People: describe who you need in your own words, press Search, and get
// up to five people you are already connected with, each with a one-line reason and where it matched. The Worker decides who
// is searched (only your connections, only what each shows you, nobody who switched AI search off) and checks the reply;
// this page only shows it. When the Worker says AI is not available (off, a limit, a failed reply) the page ranks the people
// it already holds by keyword, using src/lib/ask.js, and says so.
//
// Loaded with a plain import() from People.vue when the row is pressed, so it is in no page's first load (public-page JS
// budget, D024). It calls api() directly rather than adding to api.js. Everything is shown as plain text.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { api } from "../lib/api";
import { askTerms, rankRows } from "../lib/ask";
import { subtitleOf } from "../lib/profile";
import Icon from "./Icon.vue";
import Avatar from "./Avatar.vue";

const props = defineProps({ rows: { type: Array, required: true } }); // the people already loaded on the page
const emit = defineEmits(["close", "keyword"]);

const MAX = 200;
const EXAMPLES = ["can review my CV", "knows about fintech", "is hiring designers"];
const text = ref("");
const busy = ref(false);
const error = ref("");
const allowance = ref(null);
const result = ref(null); // { kind: "ai" | "keyword", asked, items: [{ row, reason, label }], message }

const root = ref(null);
const field = ref(null);

const typed = computed(() => text.value.trim());
const canAsk = computed(() => typed.value.length >= 3 && !busy.value);
const left = computed(() => {
  const a = allowance.value;
  if (!a || a.day == null) return "";
  if (a.day <= 0) return "No AI searches left today";
  return `${a.day} ${a.day === 1 ? "search" : "searches"} left today`;
});
const rowById = computed(() => new Map(props.rows.map((r) => [r.id, r])));

onMounted(async () => {
  document.addEventListener("keydown", onKey);
  await nextTick();
  field.value?.focus({ preventScroll: true });
  // What is left today. A person who cannot use AI gets null and still gets the keyword search.
  api("/api/ai/people-search").then((r) => { allowance.value = r.allowance; }).catch(() => {});
});
const opener = typeof document !== "undefined" ? document.activeElement : null;
onBeforeUnmount(() => { document.removeEventListener("keydown", onKey); opener?.focus?.({ preventScroll: true }); });

function onKey(e) {
  if (e.key === "Escape") { e.stopPropagation(); emit("close"); return; }
  if (e.key !== "Tab" || !root.value) return;
  const nodes = [...root.value.querySelectorAll("button:not([disabled]), a[href], textarea:not([disabled])")];
  if (!nodes.length) return;
  const [a, z] = [nodes[0], nodes[nodes.length - 1]];
  if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
  else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
}

const keywordItems = (q) => rankRows(props.rows, q).map((x) => ({ row: x.row, reason: "", label: x.label }));

async function search() {
  if (!canAsk.value) return;
  busy.value = true; error.value = "";
  const asked = typed.value;
  try {
    const r = await api("/api/ai/people-search", "POST", { query: asked });
    allowance.value = r.allowance ?? allowance.value;
    if (r.fallback) {
      result.value = { kind: "keyword", asked, items: keywordItems(asked), message: r.message || "" };
    } else {
      // A match is shown only if the person is on this page (it always is: both come from your connections).
      const items = r.matches.map((m) => ({ row: rowById.value.get(m.connectionId), reason: m.reason, label: m.matchedOn })).filter((x) => x.row);
      result.value = { kind: "ai", asked, items, message: "" };
    }
  } catch (e) {
    // Even a failed request is not a dead end: keywords need nothing from the server.
    error.value = e.message || "Something went wrong.";
    result.value = { kind: "keyword", asked, items: keywordItems(asked), message: "" };
  } finally {
    busy.value = false;
    await nextTick();
    root.value?.querySelector("#pa-results")?.focus({ preventScroll: true });
  }
}

const pick = (example) => { text.value = example; field.value?.focus({ preventScroll: true }); };
const byKeyword = () => emit("keyword", askTerms(result.value?.asked || typed.value).join(" "));
const fmt = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const linkOf = (r) => (r.cardId ? `/c/${r.cardId}` : `/app/people/${r.id}`);
</script>

<template>
  <div class="sheet-backdrop" @click.self="emit('close')">
    <section ref="root" class="sheet" role="dialog" aria-modal="true" aria-labelledby="pa-title">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="stack-2">
        <div class="sheet-head">
          <div>
            <span class="label">People you know</span>
            <h2 id="pa-title">Do I know someone who…</h2>
          </div>
          <button class="icon-btn" type="button" aria-label="Close" @click="emit('close')"><Icon name="close" :size="20" /></button>
        </div>

        <form class="stack-2" @submit.prevent="search">
          <div class="field" style="margin-bottom:0">
            <label for="pa-q">Who are you looking for?</label>
            <textarea id="pa-q" ref="field" v-model="text" :maxlength="MAX" rows="3" placeholder="works in climate policy"
                      @keydown.enter.exact.prevent="search"></textarea>
            <span class="small muted" style="align-self:flex-end">{{ text.length }}/{{ MAX }}</span>
          </div>
          <div class="chip-row" role="group" aria-label="Examples">
            <button v-for="e in EXAMPLES" :key="e" type="button" class="chip" @click="pick(e)">{{ e }}</button>
          </div>
          <div class="stack-1">
            <button type="submit" class="btn btn-primary" :disabled="!canAsk">{{ busy ? "Searching…" : "Search" }}</button>
            <p class="small muted" style="margin:0;text-align:center" role="status">
              <template v-if="left">{{ left }}. </template>Only looks through people you're connected with.
            </p>
          </div>
        </form>

        <p v-if="error" class="error-text" role="alert">{{ error }}</p>

        <div v-if="result" id="pa-results" class="stack-2" tabindex="-1" aria-live="polite">
          <p v-if="result.kind === 'ai'" class="notice small">
            Found by AI from people you know. It only uses what they've shared with you.
          </p>
          <p v-else class="notice small">
            <strong>Showing a keyword search instead.</strong>{{ " " }}{{ result.message }}
          </p>

          <div v-if="!result.items.length" class="empty stack" role="status">
            <span class="label">{{ result.kind === "ai" ? "Nobody fits yet" : "No one matches those words" }}</span>
            <p>{{ result.kind === "ai" ? "Try different words." : "Try different words, or search a name or a skill on the People page." }}</p>
          </div>
          <div v-else class="list">
            <router-link v-for="it in result.items" :key="it.row.id" :to="linkOf(it.row)" class="list-row">
              <Avatar class="avatar" :src="it.row.selfie || it.row.peer.photo" :alt="it.row.peer.name" />
              <span style="flex:1;min-width:0">
                <strong>{{ it.row.peer.name }}</strong>
                <span class="small muted" style="display:block">{{ subtitleOf(it.row.peer) || it.row.peer.headline }}</span>
                <span v-if="it.reason" class="small" style="display:block;margin-top:2px">{{ it.reason }}</span>
                <span v-if="it.label" class="small muted" style="display:block">Matched on: {{ it.label }}</span>
                <span class="small muted" style="display:block">{{ it.row.eventName ? it.row.eventName + " · " : "" }}Met {{ fmt(it.row.metAt) }}</span>
              </span>
            </router-link>
          </div>

          <button v-if="result.kind === 'ai'" type="button" class="link-btn" style="align-self:flex-start" @click="byKeyword">Not right? Search by keyword</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* The results are focused when they arrive so a screen reader reads them; no ring round a block of text. */
#pa-results:focus { outline: none; }
</style>
