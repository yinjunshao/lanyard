// F63: the Create event form refresh. Motion (D045: CSS tokens only, transform and opacity only, nothing over 300 ms,
// the one reduced-motion block), every step still validating and keeping its focus rules, then (added by the later F63
// tasks) the food tick and diet options, the hidden Access field, and the perk rows.
// What the eye sees (the slide, the stacking at 375 px) is checked in a browser; see the plan note.
// Run: node test/event-form.mjs
import { readFileSync } from "node:fs";
import { createServer } from "vite";
import { renderToString } from "vue/server-renderer";
import { createSSRApp, h } from "vue";
import { check, summary } from "./harness.mjs";
import { STEPS, LAST, blankForm, validateStep, stepDirection } from "../src/lib/eventsteps.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, "");
const styles = (src) => [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
const ms = (v) => (v?.endsWith("ms") ? parseFloat(v) : v?.endsWith("s") ? parseFloat(v) * 1000 : NaN);

const css = read("src/styles/main.css");
const FORM_FILES = ["EventCreate", "EventStepBasics", "EventStepLook", "EventStepAtEvent", "EventStepQuestions", "EventCollects"].map((n) => `src/components/${n}.vue`);
const create = read("src/components/EventCreate.vue");
const createCss = styles(create);

console.log("\n# F63.1 Step motion follows D045");
check("a step change goes forward or back, and the first draw has no direction", stepDirection(1, 2) === "fwd" && stepDirection(3, 2) === "back" && stepDirection(5, 1) === "back" && stepDirection(undefined, 2) === "" && stepDirection(2, 2) === "");
check("the step content is keyed by the step, so a new step is a new element and its animation plays", /<div :key="step" class="ev-body"/.test(create) && /stepDirection\(o, n\)/.test(create));
check("forward slides in from one side and back from the other, with the tokens only", /\.ev-fwd \{ animation: m-step-fwd var\(--dur\) var\(--ease-out\); \}/.test(createCss) && /\.ev-back-dir \{ animation: m-step-back var\(--dur\) var\(--ease-out\); \}/.test(createCss));
check("the two directions are opposite (the same distance, one positive and one negative)", /@keyframes m-step-fwd \{ from \{ opacity: 0; transform: translateX\(calc\(var\(--shift\) \* 3\)\); \} \}/.test(css) && /@keyframes m-step-back \{ from \{ opacity: 0; transform: translateX\(calc\(var\(--shift\) \* -3\)\); \} \}/.test(css));
const frames = [...css.matchAll(/@keyframes (m-step-[\w-]+) \{([\s\S]*?\})\s*\}/g)];
check("both keyframes move only transform and opacity", frames.length === 2 && frames.every((m) => [...m[2].matchAll(/([\w-]+)\s*:/g)].every((x) => ["opacity", "transform"].includes(x[1]))), frames.map((m) => m[1]));
const rootBlock = /:root \{([\s\S]*?)\n\}/.exec(css)?.[1] || "";
const token = (n) => new RegExp(`--${n}:\\s*([^;]+);`).exec(rootBlock)?.[1].trim();
check("the step's time is the --dur token and it is 300 ms or less", ms(token("dur")) > 0 && ms(token("dur")) <= 300, token("dur"));
const reduceRoot = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{\s*:root \{([^}]*)\}\s*\}/g)];
check("there is still exactly one reduced-motion rule for the tokens, and it takes the distance to 0 so the step is a fade", reduceRoot.length === 1 && /--shift:\s*0px/.test(reduceRoot[0][1]) && ms(/--dur:\s*([^;]+);/.exec(reduceRoot[0][1])?.[1].trim()) <= 150);
check("the form adds no reduced-motion block of its own (the one block does it)", FORM_FILES.every((f) => !/prefers-reduced-motion/.test(read(f))));
const WRITTEN = FORM_FILES.flatMap((f) => [...styles(read(f)).matchAll(/(?:animation|transition)[\w-]*:[^;]*;/g)].map((m) => [f, m[0]]));
check("every animation or transition the form's files write uses the tokens, with no time written out", WRITTEN.length >= 2 && WRITTEN.every(([, d]) => /var\(--dur/.test(d) && !/\b\d+(ms|s)\b/.test(d.replace(/var\([^)]*\)/g, ""))), WRITTEN);
check("the form's files move only transform and opacity (no width, height, margin, top or left in a transition)", WRITTEN.every(([, d]) => !/(width|height|margin|top|left|padding)/.test(d)));
check("no Vue Transition and no animation library in the form (D045)", FORM_FILES.every((f) => !/<Transition|<transition|TransitionGroup|gsap|framer|animejs|motion-one|@vueuse\/motion/i.test(read(f))));
check("the disclosures use UiReveal (the collects options and the feedback editor)", /import UiReveal/.test(read("src/components/EventCollects.vue")) && /<UiReveal :open="form\.collectOn">/.test(read("src/components/EventCollects.vue")) && /<UiReveal :open="form\.feedbackOn">/.test(read("src/components/EventStepQuestions.vue")));

console.log("\n# F63.1 Every step still validates and keeps its focus rules");
const blank = (o = {}) => ({ ...blankForm(), ...o });
check("step 1 refuses an empty name and an end before the start", validateStep(1, blank()).name && validateStep(1, blank({ name: "x", startsAt: 2000, endsAt: 1000 })).endsAt);
check("step 3 refuses a bad sign-up number and a missing reason for a list", validateStep(3, blank({ rsvpCount: "-1" })).rsvpCount && validateStep(3, blank({ collectOn: true })).collectWhy);
check("step 4 refuses a feedback question with no text", !!validateStep(4, blank({ feedbackOn: true, feedbackQuestions: [{ type: "text", label: "" }] })).feedback0);
check("there are still five steps, in the same order", STEPS.map((s) => s.name).join() === "Basics,Look,At the event,Questions,Review" && LAST === 5);
check("focus goes to the step heading on every change and on opening, and to the first problem when there is one", /heading\.value\?\.focus\(\)/.test(create) && /onMounted\(\(\) => heading\.value\?\.focus\(\)\)/.test(create) && /querySelector\('\[aria-invalid="true"\]'\) \|\| root\.value\?\.querySelector\("\.error-text"\)/.test(create));
check("the heading stays outside the sliding body, so the slide never moves what has focus", create.indexOf('id="ev-step-h"') < create.indexOf('class="ev-body"') && /<h2 id="ev-step-h" ref="heading" tabindex="-1"/.test(create));
check("Enter is still Next (a real form with one submit button) and the sticky bar is kept", /<form ref="root"[^>]*@submit\.prevent="onSubmit"/.test(create) && /\.ev-bar \{\s*position: sticky; bottom: 0;/.test(createCss));

const vite = await createServer({
  configFile: "vite.config.js", root: process.cwd(), logLevel: "silent", appType: "custom",
  plugins: [{
    name: "stub-pickers", enforce: "pre",
    resolveId(id) { return /\/ui\/(UiSelect|UiDateTimePicker)\.vue$/.test(id) ? " stub-picker" : null; },
    load(id) { return id === " stub-picker" ? `import { h } from "vue"; export default { props: ["id", "modelValue", "options", "labelledby", "label", "clearable", "min", "suggest", "disabled"], render() { return h("button", { id: this.id, type: "button", role: "combobox" }, String(this.modelValue ?? "")); } };` : null; },
  }],
  server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true },
});
const load = async (p) => (await vite.ssrLoadModule("/" + p)).default;
const render = async (comp, props) => strip(await renderToString(createSSRApp({ render: () => h(comp, props) })));
try {
  const Create = await load("src/components/EventCreate.vue");
  const Basics = await load("src/components/EventStepBasics.vue");
  const AtEvent = await load("src/components/EventStepAtEvent.vue");
  const Questions = await load("src/components/EventStepQuestions.vue");

  console.log("\n# F63.1 The screens");
  const shown = { name: "Give the event a name.", endsAt: "The end time must be after the start." };
  const b = await render(Basics, { form: blank(), errors: shown, fromOptions: [], hasEvents: false });
  check("step 1 shows each problem beside its field, and marks the name invalid so focus can go to it", /id="ev-name"[^>]*aria-invalid="true"/.test(b) && /id="ev-name-e"[^>]*role="alert"[^>]*>Give the event a name\./.test(b) && /error-text[^>]*>The end time must be after the start\./.test(b));
  const a = await render(AtEvent, { form: blank({ collectOn: true }), errors: { rsvpCount: "Use a whole number, or leave it empty.", collectWhy: "Say why you collect this." } });
  check("step 3 shows its problems beside their fields", /id="ev-rsvp"[^>]*aria-invalid="true"/.test(a) && /id="collect-why"[^>]*aria-invalid="true"/.test(a));
  const q = await render(Questions, { form: blank({ feedbackQuestions: [{ type: "text", label: "" }] }), errors: { feedback0: "Question 1 has no text. Write it or remove it." } });
  check("step 4 shows its feedback problem", /error-text[^>]*>Question 1 has no text/.test(q));
  for (const [n, name] of [[1, "Basics"], [2, "Look"], [3, "At the event"], [4, "Questions"], [5, "Review"]]) {
    const html = await render(Create, { form: blank({ name: "N" }), step: n, hasEvents: true, fromOptions: [{ value: "", label: "A blank event" }] });
    check(`step ${n} (${name}) draws its labelled groups, the step heading and the Back and Next bar, with no slide on the first draw`, /id="ev-step-h"[^>]*tabindex="-1"/.test(html) && /class="ev-group[ "]/.test(html) && /class="ev-bar"/.test(html) && /class="ev-body"/.test(html) && !/ev-fwd|ev-back-dir/.test(html));
  }
  const names = await render(Create, { form: blank({ name: "N" }), step: 3 });
  check("the step names are a five-part progress row; the current one says so", (names.match(/<li[ >]/g) || []).length === 5 && /aria-current="step"/.test(names));
} finally {
  await vite.close();
}
summary();
