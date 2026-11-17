<script setup>
// F23: the AI summary of an event's written feedback, at the top of the Feedback tab and in the report. It only
// draws what the Worker sends: the model's words, how many people stand behind each point, the quotes (checked to
// be word for word) and the figures (all worked out by the Worker). Everything is shown as plain text, never as HTML.
// Host pages only: nothing public or shared imports this file.
import { computed, onMounted, ref } from "vue";
import { HostApi } from "../lib/hostapi";
import Waiting from "./Waiting.vue";

const props = defineProps({ eventId: { type: String, required: true } });
const d = ref(null);
const error = ref("");
const busy = ref(false);
const copied = ref(false);
const notice = ref("");

async function load() {
  try { d.value = await HostApi.feedbackSummary(props.eventId); }
  catch (e) { error.value = e.message; }
}
async function write() {
  busy.value = true; error.value = ""; notice.value = "";
  try {
    d.value = await HostApi.makeFeedbackSummary(props.eventId);
    if (d.value.fallback) notice.value = d.value.fallback.message;
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
onMounted(load);

const s = computed(() => d.value?.summary || null);
const f = computed(() => d.value?.figures || null);
const left = computed(() => d.value?.allowance?.left ?? null);
const outOfGoes = computed(() => left.value === 0);
const day = (ms) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const people = (n) => `about ${n} ${n === 1 ? "person" : "people"}`;

// The figures sentence is built here from the Worker's numbers: the model has no part in it.
const figures = computed(() => {
  if (!f.value) return "";
  const parts = [];
  if (f.value.rating?.average != null) parts.push(`${f.value.rating.average} out of 5 on average from ${f.value.rating.answered} ${f.value.rating.answered === 1 ? "person" : "people"}`);
  if (f.value.again) parts.push(`${f.value.again.percent}% would come to another one`);
  return parts.length ? parts.join(". ") + "." : "";
});

const footer = computed(() => `Written by AI from ${s.value.basedOn} written answers on ${day(s.value.createdAt)}.`);

function plainText() {
  const x = s.value;
  const out = [];
  if (figures.value) out.push(figures.value);
  if (x.paragraph) out.push(x.paragraph);
  if (x.worked.length) out.push("What worked:\n" + x.worked.map((p) => `- ${p.text} (${people(p.count)})`).join("\n"));
  if (x.change.length) out.push("What to change:\n" + x.change.map((p) => `- ${p.text} (${people(p.count)})`).join("\n"));
  if (x.quotes.length) out.push("In their words:\n" + x.quotes.map((t) => `- "${t.text}"`).join("\n"));
  out.push(`${footer.value} It can be wrong; check it against the answers.`);
  return out.join("\n\n");
}
async function copy() {
  try { await navigator.clipboard.writeText(plainText()); copied.value = true; setTimeout(() => (copied.value = false), 1600); } catch { /* the browser said no: nothing to do */ }
}
</script>

<template>
  <section class="fs stack-2" aria-labelledby="fs-h">
    <h2 id="fs-h" class="fs-h">Summary of written answers</h2>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <Waiting v-if="!d && !error" :rows="3" label="Loading the summary" :retry="load" />

    <template v-if="d">
      <!-- Not enough answers: nothing is written, and nothing is sent anywhere -->
      <template v-if="!d.eligible">
        <p>Summary appears after {{ d.needed }} written answers.</p>
        <p class="small muted">
          It needs {{ d.needed }} people to have written an answer to the same question, so it can't point at one person.
          <template v-if="d.mostAnswered">The most so far for one question is {{ d.mostAnswered }}.</template>
        </p>
      </template>

      <template v-else>
        <p v-if="notice" class="notice small" role="status">{{ notice }} The figures and answers below are not affected.</p>

        <template v-if="s">
          <p v-if="figures" class="fs-figures tnum">{{ figures }}</p>
          <p v-if="s.paragraph" class="fs-para">{{ s.paragraph }}</p>

          <div v-if="s.worked.length" class="fs-block">
            <span class="label">What worked</span>
            <ul class="fs-list">
              <li v-for="p in s.worked" :key="p.text">{{ p.text }} <span class="small muted tnum">({{ people(p.count) }})</span></li>
            </ul>
          </div>
          <div v-if="s.change.length" class="fs-block">
            <span class="label">What to change</span>
            <ul class="fs-list">
              <li v-for="p in s.change" :key="p.text">{{ p.text }} <span class="small muted tnum">({{ people(p.count) }})</span></li>
            </ul>
          </div>
          <div v-if="s.quotes.length" class="fs-block">
            <span class="label">In their words</span>
            <figure v-for="t in s.quotes" :key="t.text" class="fs-quote">
              <blockquote>{{ t.text }}</blockquote>
              <figcaption v-if="t.question" class="small muted">{{ t.question }}</figcaption>
            </figure>
          </div>

          <p class="small muted fs-foot">
            {{ footer }} The counts and figures are worked out by Lanyard, not by the AI, and quotes are word for word.
            It can still be wrong, so check it against <a href="#fs-answers">all the answers below</a> before you share it.
          </p>
          <p v-if="s.newer" class="small fs-newer" role="status">Newer answers have arrived since this was written.</p>
        </template>

        <p v-else class="small muted">
          A short summary written by AI from the written answers, with names and contact details taken out first.
          Counts and figures are worked out by Lanyard, and quotes are word for word.
        </p>

        <div class="fs-actions no-print">
          <button class="btn" type="button" :disabled="busy || outOfGoes" @click="write">
            {{ busy ? "Writing…" : s ? "Regenerate" : "Write a summary" }}
          </button>
          <button v-if="s" class="btn" type="button" @click="copy">{{ copied ? "Copied" : "Copy" }}</button>
        </div>
        <p v-if="left !== null" class="small muted no-print" role="status">
          <template v-if="outOfGoes">No summaries left today. They are back tomorrow.</template>
          <template v-else>{{ left }} of {{ d.allowance.of }} left today.</template>
        </p>
      </template>
    </template>
  </section>
</template>

<style scoped>
.fs { gap: 12px; }
.fs-h { margin: 0; }
.fs-figures { margin: 0; font-weight: 700; }
.fs-para { margin: 0; max-width: 64ch; }
.fs-block { display: flex; flex-direction: column; gap: 4px; }
.fs-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
.fs-quote { margin: 0; padding-left: 12px; border-left: 3px solid var(--rule); display: flex; flex-direction: column; gap: 2px; }
.fs-quote blockquote { margin: 0; }
.fs-foot { margin: 0; max-width: 64ch; }
.fs-foot a { text-decoration: underline; color: inherit; }
.fs-newer { margin: 0; }
.fs-actions { display: flex; gap: var(--space); flex-wrap: wrap; }
.fs-actions .btn { width: auto; min-width: 140px; }
@media (max-width: 480px) { .fs-actions .btn { flex: 1; } }
</style>
