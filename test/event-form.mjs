// F63: the Create event form refresh. Motion (D045: CSS tokens only, transform and opacity only, nothing over 300 ms,
// the one reduced-motion block), every step still validating and keeping its focus rules, then (added by the later F63
// tasks) the food tick and diet options, the hidden Access field, and the perk rows.
// What the eye sees (the slide, the stacking at 375 px) is checked in a browser; see the plan note.
// Run: node test/event-form.mjs
import { readFileSync } from "node:fs";
import { createServer } from "vite";
import { renderToString } from "vue/server-renderer";
import { createSSRApp, h } from "vue";
import { check, summary, makeEnv, becomeHost } from "./harness.mjs";
import { STEPS, LAST, blankForm, validateStep, stepDirection } from "../src/lib/eventsteps.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, "");
const styles = (src) => [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
const ms = (v) => (v?.endsWith("ms") ? parseFloat(v) : v?.endsWith("s") ? parseFloat(v) * 1000 : NaN);

const css = read("src/styles/main.css");
const FORM_FILES = ["EventCreate", "EventStepBasics", "EventStepLook", "EventStepAtEvent", "EventStepQuestions", "EventCollects", "EventFood", "PerkRows"].map((n) => `src/components/${n}.vue`);
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
const render = async (comp, props) => strip(await renderToString(createSSRApp({ render: () => h(comp, props) }))).replace(/ data-v-[0-9a-f]+/g, "");
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
  // ---------------------------------------------------------------------------------------------------------
  console.log("\n# F63.2 Food and drink: a tick, text and diet options, stored in `info`");
  const { DIET_IDS, dietLabel, foodLine, infoRows } = await import("../src/lib/eventinfo.js");
  const { cleanInfo, foodTicked } = await import("../src/lib/eventinfoclean.js");
  const { createBody, detailsBody, eventFromBody } = await import("../src/lib/eventform.js");
  const { reviewGroups, copyFacts, formFromDraft } = await import("../src/lib/eventsteps.js");
  check("the six diet ids are exactly vegetarian, vegan, halal, kosher, gluten-free and dairy-free, in that order", DIET_IDS.join() === "vegetarian,vegan,halal,kosher,gluten-free,dairy-free", DIET_IDS);
  check("unknown ids are dropped", JSON.stringify(cleanInfo({ foodOn: true, diet: ["vegan", "beef"] }).diet) === '["vegan"]');
  check("diet is dropped when foodOn is not true (missing, false, the string 'true', 1)", [undefined, false, "true", 1, null].every((v) => !("diet" in cleanInfo({ foodOn: v, diet: ["vegan"] })) && !("foodOn" in cleanInfo({ foodOn: v, diet: ["vegan"] }))));
  check("at most six are kept, repeats count once, and a diet that is not a list is nothing", cleanInfo({ foodOn: true, diet: [...DIET_IDS, ...DIET_IDS, "x", "y"] }).diet.length === 6 && !("diet" in cleanInfo({ foodOn: true, diet: "vegan" })) && !("diet" in cleanInfo({ foodOn: true, diet: [{ id: "vegan" }, 5, null] })));
  check("access is still kept and cleaned by cleanInfo (hidden in the app, not removed)", cleanInfo({ access: "  Step-free  " }).access === "Step-free" && cleanInfo({ access: "x".repeat(300) }).access.length === 200);
  check("an old event with food text and no foodOn keeps its text, shows it, and opens the form ticked", cleanInfo({ food: "Pizza" }).food === "Pizza" && foodTicked({ food: "Pizza" }) === true && foodTicked({}) === false && foodTicked({ foodOn: true }) === true && infoRows({ food: "Pizza" })[0].join("|") === "Food and drink|Pizza");
  check("the line reads 'Pizza. Options: Vegan, Halal', in the same order whatever order they were ticked", foodLine({ food: "Pizza", diet: ["halal", "vegan"] }) === "Pizza. Options: Vegan, Halal" && foodLine({ food: "Pizza.", diet: ["vegan"] }) === "Pizza. Options: Vegan" && foodLine({ diet: ["kosher"] }) === "Options: Kosher" && foodLine({ food: "Soup" }) === "Soup" && foodLine({}) === "");
  check("the rows never include Access, and come in the order dress code, food, good to know", JSON.stringify(infoRows({ access: "Lift", dress: "Smart", food: "Tea", other: "Quiet room" })) === JSON.stringify([["Dress code", "Smart"], ["Food and drink", "Tea"], ["Good to know", "Quiet room"]]) && infoRows({ access: "Lift" }).length === 0);
  check("the labels on the page are plain words", DIET_IDS.map(dietLabel).join() === "Vegetarian,Vegan,Halal,Kosher,Gluten-free,Dairy-free");

  const fb = (o) => blank({ name: "N", ...o });
  check("an unticked form sends no food and no foodOn, even with text typed (ticking off then saving clears it)", JSON.stringify(createBody(fb({ food: "Pizza", diet: ["vegan"] })).info) === '{"access":"","food":""}');
  check("a ticked form sends the text, foodOn and the ticked ids", JSON.stringify(createBody(fb({ foodOn: true, food: "Pizza", diet: ["vegan", "halal"] })).info) === '{"access":"","food":"Pizza","foodOn":true,"diet":["vegan","halal"]}');
  check("the Details form sends access back unchanged, plus dress code, notes and the food fields", JSON.stringify(detailsBody({ name: "x", access: "Lift", dress: "Smart", other: "Q", foodOn: true, food: "Tea", diet: ["vegan"], perksText: "" }).info) === '{"access":"Lift","dress":"Smart","other":"Q","food":"Tea","foodOn":true,"diet":["vegan"]}');
  check("the preview reads the body the way the Worker does", JSON.stringify(eventFromBody(createBody(fb({ foodOn: true, food: "Pizza", diet: ["halal", "beef", "vegan"] }))).info) === '{"food":"Pizza","foodOn":true,"diet":["vegan","halal"]}');
  const foodRow = (f) => reviewGroups(f, null)[2].rows.find((r) => r[0] === "Food and drink")[1];
  check("Review says what there is and the options, or None, or Provided with nothing typed", foodRow(fb({ foodOn: true, food: "Pizza", diet: ["vegan", "halal"] })) === "Pizza. Options: Vegan, Halal" && foodRow(fb({ foodOn: false, food: "Pizza" })) === "None" && foodRow(fb({ foodOn: true })) === "Provided");
  check("Review and the copy summary no longer list Access info", !reviewGroups(fb({ access: "Ramp" }), null).some((g) => g.rows.some((r) => /Access/.test(r[0]))) && !copyFacts({ event: { info: { access: "Ramp", food: "Soup" } } }).event.some((r) => /Access/.test(r[0])) && copyFacts({ event: { info: { food: "Soup", foodOn: true, diet: ["halal"] } } }).event.find((r) => r[0] === "Food and drink")[1] === "Soup. Options: Halal");
  check("a saved draft keeps the tick and the ids, and drops an id that is not one", JSON.stringify(formFromDraft({ foodOn: true, diet: ["vegan", "beef", "kosher"] }).diet) === '["vegan","kosher"]' && formFromDraft({ foodOn: true }).foodOn === true && formFromDraft({ diet: "vegan" }).diet.length === 0);
  check("an old draft that holds only food text opens with the tick off and the text still there", (() => { const d = formFromDraft({ food: "Pizza" }); return d.food === "Pizza" && d.foodOn === false; })());

  console.log("\n# F63.2 The screens: no Access field, a food tick that opens");
  const Food = await load("src/components/EventFood.vue");
  const off = await render(Food, { form: blank(), prefix: "ev" });
  check("unticked: the tick is there, with its words, and no text box and no options", /id="ev-food-on"/.test(off) && off.includes("Food or drinks provided") && !/id="ev-food"/.test(off) && !/Vegetarian/.test(off));
  const on = await render(Food, { form: blank({ foodOn: true, food: "Pizza", diet: ["vegan"] }), prefix: "d" });
  check("ticked: What there is, then six option ticks with their words, the right ones ticked, ids that do not clash", /id="d-food-on"[^>]*checked/.test(on) && /<label for="d-food">What there is/.test(on) && DIET_IDS.every((id) => on.includes(`>${dietLabel(id)}<`)) && (on.match(/type="checkbox"/g) || []).length === 7 && /value="vegan"[^>]*checked|checked[^>]*value="vegan"/.test(on) && !/value="halal"[^>]*checked|checked[^>]*value="halal"/.test(on), on);
  check("the option ticks are in one labelled group", /<fieldset class="diet"><legend[^>]*>Options covered</.test(on));
  check("the food details ease open with UiReveal and the tick names what it opens", /<UiReveal :open="!!form\.foodOn">/.test(read("src/components/EventFood.vue")) && /:aria-controls="id\('food-more'\)"/.test(read("src/components/EventFood.vue")));
  const step3 = await render(AtEvent, { form: blank(), errors: {} });
  check("Create event step 3 has the food tick and no Access field", /id="ev-food-on"/.test(step3) && !/ev-access|Access info/.test(step3));
  const live = read("src/views/HostLive.vue");
  check("the Details tab has the food tick and no Access field, and keeps the stored access to send back", /<EventFood :form="d" prefix="d" \/>/.test(live) && !/d-access|>Access</.test(live) && /access: e\.info\?\.access \|\| ""/.test(live) && /foodOn: foodTicked\(e\.info\)/.test(live));
  const EventPage = await load("src/components/EventPage.vue");
  const pageEv = (info) => ({ name: "Spring night", questions: [], directoryOn: false, feedbackOn: false, info });
  const pageForm = () => ({ name: "", answers: {}, sponsorConsent: {}, directoryConsent: false, collect: null, hasEmail: true });
  const pg = await render(EventPage, { event: pageEv(cleanInfo({ food: "Pizza", foodOn: true, diet: ["vegan", "halal"], access: "Step-free" })), form: pageForm() });
  check("the check-in page says 'Food and drink' then 'Pizza. Options: Vegan, Halal', and never the access text", /<dt class="label">Food and drink<\/dt><dd>Pizza\. Options: Vegan, Halal<\/dd>/.test(pg) && !pg.includes("Step-free") && !/>Access</.test(pg), pg.slice(0, 600));
  const pgOld = await render(EventPage, { event: pageEv({ food: "Soup", access: "Lift" }), form: pageForm() });
  check("an old event's food text still shows on the check-in page", /<dd>Soup<\/dd>/.test(pgOld) && !pgOld.includes("Lift"));
  const pgAccessOnly = await render(EventPage, { event: pageEv({ access: "Lift" }), form: pageForm() });
  check("an event with only Access leaves no empty info panel", !pgAccessOnly.includes("event-info") && !pgAccessOnly.includes("Lift"));
  const hub = read("src/views/EventDetail.vue");
  check("the event hub shows the same rows (from infoRows) and not Access", /import \{ infoRows \} from "\.\.\/lib\/eventinfo"/.test(hub) && /const rows = computed\(\(\) => infoRows\(event\.value\?\.info\)\)/.test(hub) && !/info\.access|>Access</.test(hub));
  check("the public check-in page and the hub import only the small wording file, never the host's cleaning code", /from "\.\.\/lib\/eventinfo"/.test(read("src/components/EventPage.vue")) && !/eventinfoclean/.test(read("src/components/EventPage.vue")) && !/eventinfoclean/.test(hub) && /^import \{ cleanInfo \} from "\.\.\/src\/lib\/eventinfoclean\.js";/m.test(read("worker/feedback.js")) && !/^import /m.test(read("src/lib/eventinfo.js")));
  check("the check-in page has no label table of its own any more (INFO_LABELS is gone)", !/INFO_LABELS/.test(read("src/components/EventPage.vue")));

  console.log("\n# F63.2 The Worker: stored, accepted and returned, cleaned the same way");
  const T = await makeEnv();
  const host = T.client({ ip: "10.63.0.1", site: "host" });
  const org = await becomeHost(host, { kind: "company", name: "Form Co" });
  T.env.DB.raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES ('cr-f63', ?, 80, 0, 'test', ?)").run(org.org.json.id, Date.now());
  const main = T.client({ ip: "10.63.0.2" });
  const make = async (info, extra = {}) => host.post("/api/host/events", { name: "Night", info, ...extra });
  const stored = (id) => JSON.parse(T.q1("SELECT info FROM events WHERE id = ?", id).info);
  const codeOf = async (id) => (await host.get(`/api/host/events/${id}/live`)).json.event.code;
  const a1 = await make({ food: "Pizza", foodOn: true, diet: ["vegan", "beef"] });
  check("a request with diet [vegan, beef] saves only vegan", a1.status === 201 && JSON.stringify(stored(a1.json.id)) === '{"food":"Pizza","foodOn":true,"diet":["vegan"]}', stored(a1.json.id));
  const a2 = await make({ food: "Pizza", diet: ["vegan"] });
  check("with no foodOn it saves no diet (and the text stays, as an old event had it)", JSON.stringify(stored(a2.json.id)) === '{"food":"Pizza"}', stored(a2.json.id));
  const a3 = await make({ foodOn: true, diet: [...DIET_IDS, "kosher", "x"] });
  check("more entries than there are ids save at most six", stored(a3.json.id).diet.length === 6, stored(a3.json.id));
  const a4 = await make({ access: "Step-free entrance", dress: "Smart", food: "Tea", other: "Quiet room 106", junk: "x" });
  check("access is still accepted and stored (hidden in the app, not removed), unknown keys are dropped", stored(a4.json.id).access === "Step-free entrance" && !("junk" in stored(a4.json.id)) && stored(a4.json.id).dress === "Smart", stored(a4.json.id));
  check("the API still returns access (the public event route and the host's live route)", (await main.get(`/api/e/${await codeOf(a4.json.id)}`)).json.event.info.access === "Step-free entrance" && (await host.get(`/api/host/events/${a4.json.id}/live`)).json.event.info.access === "Step-free entrance");
  const up = await host.put(`/api/host/events/${a4.json.id}`, { info: { access: "Step-free entrance", food: "", dress: "Smart" } });
  check("saving Details with access sent back keeps it; food left out clears it", up.status === 200 && stored(a4.json.id).access === "Step-free entrance" && !("food" in stored(a4.json.id)), [up.status, stored(a4.json.id)]);
  const up2 = await host.put(`/api/host/events/${a1.json.id}`, { info: { food: "Pizza", foodOn: true, diet: ["halal", "vegan"] } });
  check("Details saves the ticked options in the same shape", up2.status === 200 && JSON.stringify(stored(a1.json.id)) === '{"food":"Pizza","foodOn":true,"diet":["vegan","halal"]}', stored(a1.json.id));
  const dup = await host.post(`/api/host/events/${a1.json.id}/duplicate`, {});
  check("a copy of an event carries the tick and the options", dup.status === 201 && JSON.stringify(stored(dup.json.id)) === '{"food":"Pizza","foodOn":true,"diet":["vegan","halal"]}', dup.status);
  const pub = (await main.get(`/api/e/${await codeOf(a1.json.id)}`)).json.event;
  check("the check-in page's data carries foodOn and diet, and the page's rows read them", pub.info.foodOn === true && JSON.stringify(pub.info.diet) === '["vegan","halal"]' && infoRows(pub.info)[0][1] === "Pizza. Options: Vegan, Halal", pub.info);
  await main.post("/api/profile", { name: "Fay Food", acceptTerms: true, over18: true });
  const ck = await main.post(`/api/e/${await codeOf(a1.json.id)}/checkin`, {});
  const hubJson = (await main.get(`/api/my/events/${a1.json.id}`)).json;
  check("the event hub's data carries the food and options once checked in", ck.status === 200 && hubJson.event.info?.foodOn === true && infoRows(hubJson.event.info)[0][1] === "Pizza. Options: Vegan, Halal", hubJson.event);
  const plain = await make({});
  await main.post(`/api/e/${await codeOf(plain.json.id)}/checkin`, {});
  check("an event with no notes answers the hub with no info key, as it did before", !("info" in (await main.get(`/api/my/events/${plain.json.id}`)).json.event));

  // ---------------------------------------------------------------------------------------------------------
  console.log("\n# F63.3 Perks as name and details rows, saved in the string format they always had");
  const { perkParts } = await import("../src/lib/eventtext.js");
  const { PERK_MAX, NAME_MAX, DETAILS_MAX, perkRows, perkLines, perkProblems, blankPerk } = await import("../src/lib/perkrows.js");
  const row = (name, details = "") => ({ name, details });
  check("the limits are 10 rows, a name of 60 and details of 230", PERK_MAX === 10 && NAME_MAX === 60 && DETAILS_MAX === 230);
  check("a row becomes 'Name (Details)', or 'Name' with no details", JSON.stringify(perkLines({ perks: [row("Free coffee", "At the bar before 11am"), row("Raffle entry")] })) === '["Free coffee (At the bar before 11am)","Raffle entry"]');
  check("spaces are trimmed, a row with no name sends nothing, and blank rows are dropped", JSON.stringify(perkLines({ perks: [row("  Tea  ", "  hot  "), row(""), row("", ""), row("Cake", "   ")] })) === '["Tea (hot)","Cake"]');
  check("a form with no rows sends no perks", JSON.stringify(perkLines({ perks: [] })) === "[]" && JSON.stringify(perkLines({})) === "[]");
  check("at most ten are sent", perkLines({ perks: Array.from({ length: 14 }, (_, i) => row(`p${i}`)) }).length === 10);
  check("reading a saved perk back gives the same rows (the round trip)", JSON.stringify(perkRows(["Free coffee (At the bar before 11am)", "Raffle entry"])) === '[{"name":"Free coffee","details":"At the bar before 11am"},{"name":"Raffle entry","details":""}]');
  const trips = [row("Free coffee", "At the bar before 11am"), row("Raffle entry"), row("Lunch", "Foyer (ground floor) at 1pm"), row("Pass", "(nested (twice))"), row("Drink", "a, b; c: d!")];
  check("a row survives being written and read again, even with brackets inside the details", JSON.stringify(perkRows(perkLines({ perks: trips }))) === JSON.stringify(trips), perkRows(perkLines({ perks: trips })));
  check("the attendee's button for the first perk opens 'At the bar before 11am'", (() => { const p = perkParts("Free coffee (At the bar before 11am)"); return p.label === "Free coffee" && p.detail === "At the bar before 11am"; })());
  check("an old perk with brackets in the middle splits on the last group at the very end only", JSON.stringify(perkParts("Free (large) coffee (At the bar)")) === '{"label":"Free (large) coffee","detail":"At the bar"}' && JSON.stringify(perkParts("Free (large) coffee")) === '{"label":"Free (large) coffee","detail":""}' && JSON.stringify(perkParts("Tea (a) and (b) too")) === '{"label":"Tea (a) and (b) too","detail":""}');
  check("an unclosed or empty bracket, or brackets with no name, stay a plain line", ["Tea (hot", "Tea hot)", "Tea ()", "(only details)", "Tea ( )", "))"].every((t) => perkParts(t).detail === "" && perkParts(t).label === t), ["Tea (hot", "Tea hot)", "Tea ()", "(only details)"].map(perkParts));
  check("a name with brackets in the middle of an old perk opens as a row, and the step then asks for it to be fixed", (() => { const rows = perkRows(["Free (large) coffee"]); return rows[0].name === "Free (large) coffee" && !!perkProblems(rows)["perk0-name"]; })());
  check("the old button parsing is unchanged for the plain cases", perkParts("Free coffee (Show this at the bar before 11am)").detail === "Show this at the bar before 11am" && perkParts("Raffle entry").label === "Raffle entry" && perkParts("Raffle entry").detail === "" && perkParts("").label === "");

  const prob = (rows) => perkProblems(rows);
  check("a name with ( or ) is refused with a plain message that names the perk and says what to do", /^Perk 1: the name can't have brackets\. Put extra words in Details\.$/.test(prob([row("Coffee (hot)")])["perk0-name"]) && !!prob([row("Fine"), row("Bad)")])["perk1-name"] && !!prob([row("(x")])["perk0-name"]);
  check("details with no name are refused; a row with nothing in it is not", /needs a name/.test(prob([row("", "At the bar")])["perk0-name"]) && Object.keys(prob([row(""), row("", "  ")])).length === 0);
  check("a name over 60 characters and details over 230 are refused; exactly 60 and 230 are fine", !!prob([row("x".repeat(61))])["perk0-name"] && !!prob([row("a", "y".repeat(231))])["perk0-details"] && Object.keys(prob([row("x".repeat(60), "y".repeat(230))])).length === 0);
  check("details whose brackets do not match are refused, because reading them back would split in the wrong place", !!prob([row("a", "see (here")])["perk0-details"] && !!prob([row("a", "here) or (there")])["perk0-details"] && Object.keys(prob([row("a", "see (here) and (there)")])).length === 0);
  check("eleven rows with names are refused, ten are fine, and empty rows do not count", prob(Array.from({ length: 11 }, (_, i) => row(`p${i}`))).perks === "Ten perks at most. Remove a few." && Object.keys(prob(Array.from({ length: 10 }, (_, i) => row(`p${i}`)))).length === 0 && Object.keys(prob([...Array.from({ length: 10 }, (_, i) => row(`p${i}`)), row("")])).length === 0);
  check("a refused name stops step 3 (Next) and the problem is named by row and box so focus can go to it", validateStep(3, blank({ perks: [row("A"), row("B)", "x")] }))["perk1-name"] && Object.keys(validateStep(3, blank({ perks: [row("A", "x")] }))).length === 0);
  check("a refused perk does not need the server: the longest allowed perk is 293 characters, inside the Worker's 300", perkLines({ perks: [row("n".repeat(60), "d".repeat(230))] })[0].length === 293);
  check("a draft saved before F63 with the perks as one text opens as rows", JSON.stringify(formFromDraft({ perksText: "Free coffee (At the bar)\nRaffle entry\n\n" }).perks) === '[{"name":"Free coffee","details":"At the bar"},{"name":"Raffle entry","details":""}]');
  check("a saved draft's rows are strings of name and details only, ten at most, and a wrong type is nothing", (() => { const d = formFromDraft({ perks: [{ name: "A", details: "b", junk: 1 }, null, 5, { name: 7 }, ...Array.from({ length: 20 }, () => ({ name: "x" }))] }); return d.perks.length === 10 && JSON.stringify(d.perks[0]) === '{"name":"A","details":"b"}' && d.perks[1].name === "7"; })() && formFromDraft({ perks: "x" }).perks.length === 0);
  check("Review lists the perks as they will be sent", reviewGroups(fb({ perks: [row("Tea", "hot"), row("Cake")] }), null)[2].rows[0].join("|") === "Perks|Tea (hot), Cake");

  console.log("\n# F63.3 The perk rows on the screens");
  const PerkRows = await load("src/components/PerkRows.vue");
  const none = await render(PerkRows, { form: blank(), prefix: "ev" });
  check("no rows: a plain line saying so and an Add a perk button, no boxes", /No perks yet/.test(none) && />Add a perk</.test(none) && !/<input/.test(none));
  const two = await render(PerkRows, { form: blank({ perks: [row("Free coffee", "At the bar before 11am"), row("Raffle entry")] }), prefix: "d" });
  check("a row is a narrow 'Perk' box then a wide 'Details (optional)' box, name first, each labelled for its own input", /<label for="d-perk0-name">Perk<\/label>[\s\S]*<label for="d-perk0-details">Details \(optional\)<\/label>/.test(two) && /id="d-perk1-name"/.test(two) && /value="Free coffee"/.test(two) && /value="At the bar before 11am"/.test(two));
  check("each row has a Remove button with its own accessible name, and the list has an Add a perk button", /aria-label="Remove Free coffee"/.test(two) && /aria-label="Remove Raffle entry"/.test(two) && /aria-label="Remove perk 2"/.test(await render(PerkRows, { form: blank({ perks: [row("A"), row("")] }), prefix: "d" })) && />Add a perk</.test(two));
  const ten = await render(PerkRows, { form: blank({ perks: Array.from({ length: 10 }, (_, i) => row(`p${i}`)) }), prefix: "ev" });
  check("at ten rows Add a perk is disabled and says why", /<button[^>]*disabled[^>]*>Ten perks is the most</.test(ten) || /<button[^>]*class="btn perk-add"[^>]*disabled/.test(ten));
  const bad = await render(PerkRows, { form: blank({ perks: [row("A"), row("B)", "x")] }), errors: { "perk1-name": "Perk 2: the name can't have brackets. Put extra words in Details." }, prefix: "ev" });
  check("a problem shows beside its box, marks only that box invalid, and is announced", /id="ev-perk1-name"[^>]*aria-invalid="true"/.test(bad) && !/id="ev-perk0-name"[^>]*aria-invalid/.test(bad) && /id="ev-perk1-name-e"[^>]*role="alert"[^>]*>Perk 2: the name can&#39;t have brackets/.test(bad));
  const prSrc = read("src/components/PerkRows.vue");
  const prCss = styles(prSrc);
  check("under 480 px the two boxes stack with the name first; from 480 px the name is the narrow box and the details the wide one (1fr and 2fr)", /\.perk-row \{ display: grid; grid-template-columns: minmax\(0, 1fr\);/.test(prCss) && /@container \(min-width: 480px\) \{\s*\.perk-row \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, 2fr\) auto; \}/.test(prCss) && /container-type: inline-size/.test(prCss) && prSrc.indexOf('class="field perk-name"') < prSrc.indexOf('class="field perk-details"'));
  check("a new row eases in and a removed row fades out first, on the tokens", /\.perk-row\.fresh \{ animation: m-rise var\(--dur\) var\(--ease-out\) backwards; \}/.test(prCss) && /\.perk-row\.gone \{ animation: m-fade-out var\(--dur-out\) var\(--ease-in\) forwards;/.test(prCss) && /clearTimeout\(timer\)/.test(prSrc) && /:inert="leaving === i/.test(prSrc));
  check("the boxes stop a long entry (maxlength a little over the limit, so a paste is caught by the message, not cut silently)", /:maxlength="NAME_MAX \+ 20"/.test(prSrc) && /:maxlength="DETAILS_MAX \+ 20"/.test(prSrc));
  check("focus stays in the list when a row is added or removed", /focusName\(fresh\.value\)/.test(prSrc) && /addBtn\.value\?\.focus\(\)/.test(prSrc));
  const at3 = await render(AtEvent, { form: blank({ perks: [row("A", "b")] }), errors: {} });
  check("Create event step 3 uses the rows, and the old textarea is gone", /data-perk-rows/.test(at3) && /id="ev-perk0-name"/.test(at3) && !/id="ev-perks"|<textarea/.test(at3));
  check("the Details tab uses the rows with its own ids, shows problems only after Save, and stops a save with a problem", /<PerkRows :form="d" :errors="perkErrors" prefix="d" \/>/.test(live) && !/d-perks"|<textarea id="d-perks/.test(live) && /perkTried\.value \? perkProblems\(d\.value\.perks\) : \{\}/.test(live) && /const pp = perkProblems\(d\.value\.perks\);\s*if \(Object\.keys\(pp\)\.length\) \{ detailsErr\.value = Object\.values\(pp\)\[0\]; return; \}/.test(live) && /perks: perkRows\(e\.perks\)/.test(live));
  check("nothing reads the old perksText any more", !/perksText/.test(read("src/lib/eventform.js") + read("src/components/EventStepAtEvent.vue") + live + read("src/components/PerkRows.vue")) && !/perksText/.test(read("src/lib/eventsteps.js").replace(/d\.perksText/g, "")));

  console.log("\n# F63.3 The Worker keeps the string format, and the attendee's button opens the details");
  const p1 = await host.post("/api/host/events", createBody(fb({ perks: [row("Free coffee", "At the bar before 11am"), row("Raffle entry")] })));
  const storedPerks = (id) => JSON.parse(T.q1("SELECT perks FROM events WHERE id = ?", id).perks);
  check("two rows 'Free coffee' / 'At the bar before 11am' and 'Raffle entry' / (empty) save as the two strings", p1.status === 201 && JSON.stringify(storedPerks(p1.json.id)) === '["Free coffee (At the bar before 11am)","Raffle entry"]', storedPerks(p1.json.id));
  const live1 = (await host.get(`/api/host/events/${p1.json.id}/live`)).json.event;
  check("reopening Details shows the same two rows", JSON.stringify(perkRows(live1.perks)) === '[{"name":"Free coffee","details":"At the bar before 11am"},{"name":"Raffle entry","details":""}]');
  const pubPerks = (await main.get(`/api/e/${live1.code}`)).json.event.perks;
  check("the attendee's Free coffee button opens 'At the bar before 11am' and Raffle entry is a plain line", perkParts(pubPerks[0]).label === "Free coffee" && perkParts(pubPerks[0]).detail === "At the bar before 11am" && perkParts(pubPerks[1]).detail === "" && perkParts(pubPerks[1]).label === "Raffle entry");
  check("the check-in page's preview of a body is the same strings", JSON.stringify(eventFromBody(createBody(fb({ perks: [row("Free coffee", "At the bar before 11am"), row("Raffle entry")] }))).perks) === JSON.stringify(pubPerks));
  const p2 = await host.put(`/api/host/events/${p1.json.id}`, detailsBody({ name: "Night", venue: "", startsAt: null, endsAt: null, theme: "default", directoryOn: true, rsvpCount: "", perks: perkRows(live1.perks).concat([row("Tote bag", "Collect from the desk")]) }));
  check("saving Details with the rows read back, plus one more, keeps the others and adds the new string", p2.status === 200 && JSON.stringify(storedPerks(p1.json.id)) === '["Free coffee (At the bar before 11am)","Raffle entry","Tote bag (Collect from the desk)"]', storedPerks(p1.json.id));
  const longest = await host.post("/api/host/events", createBody(fb({ perks: [row("n".repeat(60), "d".repeat(230))] })));
  check("the longest allowed perk is saved whole", storedPerks(longest.json.id)[0].length === 293);
  const dupP = await host.post(`/api/host/events/${p1.json.id}/duplicate`, {});
  check("a copy of the event carries the same perk strings", dupP.status === 201 && JSON.stringify(storedPerks(dupP.json.id)) === JSON.stringify(storedPerks(p1.json.id)));

} finally {
  await vite.close();
}
summary();
