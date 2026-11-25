// F30: Create event in steps. What matters most: the stepper must send exactly what the old single
// form sent, and the event it makes must read back the same. The rest is the stepper's own rules
// (checks per step, the address, the draft) and source guards. The click-through in a browser is
// recorded in the plan note; here there is no browser, so the screens are rendered on the server
// (Vue SSR through Vite) and the pure parts are run directly.
import { readFileSync, readdirSync } from "node:fs";
import { createServer } from "vite";
import { renderToString } from "vue/server-renderer";
import { createSSRApp, h } from "vue";
import { check, summary, makeEnv, becomeHost } from "./harness.mjs";
globalThis.location ??= new URL("https://host.lanyard.test/"); // F65: the Look step now draws the card swatches, which read the store and so the site address
import { createBody } from "../src/lib/eventform.js";
import {
  STEPS, LAST, blankForm, formFromDraft, submitPlan, validateStep, firstBadStep, serverErrorField, stepFromQuery, copyFacts, reviewGroups,
} from "../src/lib/eventsteps.js";
import { clearAllDrafts, clearDraft, loadDraft, saveDraft } from "../src/lib/eventdraft.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, "");

// ---------- the old single form, kept here word for word (HostDashboard.vue before F30) ----------
const OLD_BLANK = () => ({
  from: "", name: "", venue: "", startsAt: null, endsAt: null, theme: "default", strapColor: "",
  perksText: "", directoryOn: true, q1: "", q2: "",
  rsvpCount: "", access: "", food: "", feedbackOn: true, feedbackQuestions: [],
});
// What the old create() sent: [route, id, body].
function oldCreate(f) {
  if (f.from) return { copy: true, from: f.from, body: { name: f.name.trim() || undefined, startsAt: f.startsAt, endsAt: f.endsAt } };
  return { copy: false, body: createBody(f) };
}

console.log("\n# F30.1 The stepper sends what the single form sent");
// F31 adds four keys to the form, all off. Everything F30 pinned is checked with them off.
const F31_OFF = { collectOn: false, collectEmail: false, collectCard: false, collectWhy: "" };
// F60 adds one key, on by default; a form with it on sends exactly what the old form sent (checked below), off adds `suggestOn: false`.
const F60_ON = { suggestOn: true };
// F63 adds the food tick and the diet ticks, off. A form with food typed now needs the tick on (an unticked form sends no food).
const F63_OFF = { perks: [], foodOn: false, diet: [] };
const F65_OFF = { strapInk: "" }; // F65: the text colour on the strap, Automatic until chosen
// F63: the perks are rows of { name, details } (sent as "Name (Details)"), not one text; `rows` makes them from lines.
const rows = (t) => t.split("\n").map((s) => s.trim()).filter(Boolean).map((name) => ({ name, details: "" }));
const { perksText: _oldPerks, ...OLD_NO_PERKS } = OLD_BLANK();
const blank = (o = {}) => ({ ...OLD_NO_PERKS, ...F31_OFF, ...F60_ON, ...F63_OFF, ...F65_OFF, ...o });
const FORMS = {
  "blank except a name": blank({ name: "Only a name" }),
  "everything filled in (theme, colour, perks, questions)": blank({
    name: "  Spring night ", venue: "Room 4", startsAt: Date.UTC(2026, 10, 20, 18, 0), endsAt: Date.UTC(2026, 10, 20, 21, 0), theme: "formal", strapColor: "#2a6f4e",
    perks: rows("Free coffee\n  Raffle entry  \n\n"), q1: "Course", q2: "What are you looking for?", access: "Step-free", food: "Pizza", foodOn: true, diet: ["vegan"], rsvpCount: "40", directoryOn: false,
    feedbackOn: true, feedbackQuestions: [{ type: "rating", label: "How easy was it to meet people?" }, { type: "single", label: "How did you hear?", options: ["Instagram", "A friend"] }],
  }),
  "night with a brand colour, feedback off": blank({ name: "Late one", theme: "night", strapColor: "#FFAA00", feedbackOn: false }),
  "only the second check-in question": blank({ name: "Q2", q2: "Only two" }),
  "zero sign-ups": blank({ name: "Zero", rsvpCount: 0 }),
  "a copy of an earlier event, nothing else": blank({ name: "", from: "ev-old" }),
  "a copy with a new name and times": blank({ name: " Copy night ", from: "ev-old", startsAt: Date.UTC(2026, 11, 1, 18, 0), endsAt: Date.UTC(2026, 11, 1, 20, 0), theme: "night", perks: rows("ignored"), q1: "ignored" }),
  "markup in the words": blank({ name: "<b>Bold</b> & co", venue: "\"Quoted\" <i>room</i>", perks: rows("<script>x</script>") }),
};
const sorted = (o) => JSON.stringify(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
check("the blank form is the old blank form, key for key, plus F31's four keys, all off, F60's switch, on, F63's food tick and diet list, off, and F65's text colour on the strap, Automatic", sorted(blankForm()) === sorted({ ...OLD_NO_PERKS, ...F31_OFF, ...F60_ON, ...F63_OFF, ...F65_OFF }));
check("F60: with suggestions switched off, Create sends the same body plus suggestOn: false, and nothing else", JSON.stringify(createBody(blank({ name: "Off", suggestOn: false }))) === JSON.stringify({ ...createBody(blank({ name: "Off" })), suggestOn: false }));
for (const [label, f] of Object.entries(FORMS)) {
  const a = submitPlan(f), b = oldCreate(f);
  check(`the request is the old request: ${label}`, JSON.stringify(a) === JSON.stringify(b), [a, b]);
}
check("a copy sends only the name and the times, whatever else was typed", JSON.stringify(Object.keys(submitPlan(FORMS["a copy with a new name and times"]).body)) === JSON.stringify(["name", "startsAt", "endsAt"]));
check("a new event sends createBody and nothing more (no sponsors, no from)", JSON.stringify(submitPlan(FORMS["everything filled in (theme, colour, perks, questions)"]).body) === JSON.stringify(createBody(FORMS["everything filled in (theme, colour, perks, questions)"])));
{
  const dash = read("src/views/HostDashboard.vue");
  check("the dashboard sends only what submitPlan returns, to the same two routes as before", /const plan = submitPlan\(f\.value\)/.test(dash) && /plan\.copy \? await HostApi\.hostDuplicateEvent\(plan\.from, plan\.body\) : await HostApi\.hostCreateEvent\(plan\.body\)/.test(dash));
  check("…and nothing else calls a create route", (dash.match(/hostCreateEvent|hostDuplicateEvent/g) || []).length === 2);
}

console.log("\n# F30.1 …and the event it makes reads back the same (the real Worker)");
const T = await makeEnv();
const host = T.client({ ip: "10.30.0.1", site: "host" });
const info = await becomeHost(host, { kind: "company", name: "Steps Co" });
T.env.DB.raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES (?, ?, 200, 0, ?, ?)").run("cr-st", info.org.json.id, "test", Date.now());
const main = T.client({ ip: "10.30.0.2" });
const cols = (id) => { const r = { ...T.q1("SELECT * FROM events WHERE id = ?", id) }; for (const k of ["id", "code", "created_at"]) delete r[k]; return r; };
const view = async (id, code) => {
  const live = (await host.get(`/api/host/events/${id}/live`)).json;
  const pub = (await main.get(`/api/e/${code}`)).json;
  const fb = (await host.get(`/api/host/events/${id}/feedback`)).json;
  const { id: _i, code: _c, ...liveEvent } = live.event; const { id: _pi, code: _pc, ...pubEvent } = pub.event || {};
  return { liveEvent, sponsors: live.sponsors.map((s) => [s.name, s.perk]), pubEvent, fb: JSON.stringify(fb.questions ?? fb) };
};
for (const [label, f] of Object.entries(FORMS)) {
  if (f.from) continue;
  const oldR = oldCreate(f), newR = submitPlan(f);
  const a = await host.post("/api/host/events", oldR.body), b = await host.post("/api/host/events", newR.body);
  const same = a.status === 201 && b.status === 201
    && JSON.stringify(cols(a.json.id)) === JSON.stringify(cols(b.json.id))
    && JSON.stringify(await view(a.json.id, a.json.code)) === JSON.stringify(await view(b.json.id, b.json.code));
  check(`created through the stepper and through the old form: the same stored event and the same reads: ${label}`, same, [a.status, b.status]);
}
{
  // Start from an earlier event: the copy comes out the same whichever built the body. The earlier event has
  // every kind of setting and two sponsors (inserted straight into the database: no route makes sponsors).
  const src = FORMS["everything filled in (theme, colour, perks, questions)"];
  const e = await host.post("/api/host/events", createBody(src));
  T.env.DB.raw.prepare("INSERT INTO sponsors (id, event_id, name, perk) VALUES (?, ?, ?, ?)").run("sp-1", e.json.id, "Acme", "Free pens");
  T.env.DB.raw.prepare("INSERT INTO sponsors (id, event_id, name, perk) VALUES (?, ?, ?, ?)").run("sp-2", e.json.id, "Beta", "Stickers");
  for (const label of ["a copy of an earlier event, nothing else", "a copy with a new name and times"]) {
    const f = { ...FORMS[label], from: e.json.id };
    const o = oldCreate(f), n = submitPlan(f);
    const a = await host.post(`/api/host/events/${o.from}/duplicate`, o.body), b = await host.post(`/api/host/events/${n.from}/duplicate`, n.body);
    const va = await view(a.json.id, a.json.code), vb = await view(b.json.id, b.json.code);
    check(`a copy through the stepper reads back like one through the old form: ${label}`, a.status === 201 && b.status === 201
      && JSON.stringify(cols(a.json.id)) === JSON.stringify(cols(b.json.id)) && JSON.stringify(va) === JSON.stringify(vb), [a.status, b.status]);
    check("   with its theme, colour, perks, questions, feedback form and both sponsors copied", va.liveEvent.theme === "formal" && va.liveEvent.strapColor === "#2a6f4e"
      && va.liveEvent.perks.length === 2 && va.liveEvent.questions.length === 2 && va.sponsors.length === 2 && JSON.parse(va.fb).length >= 1, va);
  }
  // What the Review and the copy summary say is what the server holds.
  const live = (await host.get(`/api/host/events/${e.json.id}/live`)).json;
  const facts = copyFacts(live);
  check("the copy summary reads the earlier event as saved (theme, colour, perks, questions, sponsors, room)", facts.look[0][1].startsWith("Formal") && facts.look[1][1] === "#2a6f4e"
    && facts.event[0][1] === "Free coffee, Raffle entry" && facts.questions[0][1] === "Course, What are you looking for?" && facts.questions[2][1] === "Acme, Beta" && facts.event[3][1] === "No" && !facts.event.some((r) => /Access/.test(r[0])), facts);
}

console.log("\n# F30.2 Checks per step (a convenience; the server stays the source of truth)");
{
  check("step 1: a new event needs a name; a copy does not", validateStep(1, blank()).name && !validateStep(1, blank({ from: "x" })).name);
  check("step 1: a name of spaces is no name", !!validateStep(1, blank({ name: "   " })).name);
  check("step 1: the end must be after the start; equal is not after; one of them alone is fine",
    !!validateStep(1, blank({ name: "a", startsAt: 5, endsAt: 5 })).endsAt && !!validateStep(1, blank({ name: "a", startsAt: 5, endsAt: 4 })).endsAt
    && !validateStep(1, blank({ name: "a", startsAt: 5, endsAt: 6 })).endsAt && !validateStep(1, blank({ name: "a", endsAt: 6 })).endsAt);
  check("step 2 has nothing to refuse (a theme and a colour cannot be wrong)", Object.keys(validateStep(2, blank({ theme: "formal", strapColor: "#123456" }))).length === 0);
  check("step 3: sign-ups must be a whole number, or empty", !!validateStep(3, blank({ rsvpCount: "-1" })).rsvpCount && !!validateStep(3, blank({ rsvpCount: "2.5" })).rsvpCount
    && !validateStep(3, blank({ rsvpCount: "" })).rsvpCount && !validateStep(3, blank({ rsvpCount: "0" })).rsvpCount && !validateStep(3, blank({ rsvpCount: 12 })).rsvpCount);
  check("step 3: more than ten perks is a problem; ten is not (the server keeps ten and drops the rest without a word)",
    !!validateStep(3, blank({ perks: rows(Array.from({ length: 11 }, (_, i) => `p${i}`).join("\n")) })).perks && !validateStep(3, blank({ perks: rows(Array.from({ length: 10 }, (_, i) => `p${i}`).join("\n")) })).perks);
  check("step 4: a feedback question with no text, or a pick list with under two options, is a problem (the server drops them silently)",
    !!validateStep(4, blank({ feedbackQuestions: [{ type: "rating", label: " " }] })).feedback0
    && !!validateStep(4, blank({ feedbackQuestions: [{ type: "single", label: "Pick", options: ["a", "a", ""] }] })).feedback0
    && !validateStep(4, blank({ feedbackQuestions: [{ type: "multi", label: "Pick", options: ["a", "b"] }, { type: "text", label: "Why" }] })).feedback0
    && !validateStep(4, blank({ feedbackOn: false, feedbackQuestions: [{ type: "rating", label: "" }] })).feedback0);
  check("a copy has no checks on steps 2 to 4 (its values are not the form's)", [2, 3, 4].every((n) => Object.keys(validateStep(n, blank({ from: "x", rsvpCount: "-4", feedbackQuestions: [{ label: "" }] }))).length === 0));
  check("only that step's fields are checked: an empty name is not a problem on step 3", Object.keys(validateStep(3, blank())).length === 0);
  check("firstBadStep: step 1 is bad without a name; none before step 1; all good gives 0", firstBadStep(4, blank()) === 1 && firstBadStep(1, blank()) === 0 && firstBadStep(5, blank({ name: "ok" })) === 0
    && firstBadStep(5, blank({ name: "ok", rsvpCount: "x" })) === 3);
  check("a server refusal is sent back to the step of its field", JSON.stringify(serverErrorField("The end time must be after the start.")) === JSON.stringify({ step: 1, field: "endsAt" })
    && JSON.stringify(serverErrorField("Add a name for the event.")) === JSON.stringify({ step: 1, field: "name" }) && serverErrorField("No event credits left. Buy more from Billing.") === null && serverErrorField("") === null);
  // …and those are the words the real server uses.
  const noName = await host.post("/api/host/events", { ...createBody(blank({ name: "  " })) });
  const badEnd = await host.post("/api/host/events", createBody(blank({ name: "x", startsAt: 2000, endsAt: 1000 })));
  check("the server's own refusals for a missing name and a bad end time map to steps 1 (name) and 1 (end)", noName.status === 400 && serverErrorField(noName.json.error)?.field === "name"
    && badEnd.status === 400 && serverErrorField(badEnd.json.error)?.field === "endsAt", [noName.json, badEnd.json]);
  const before = T.q1("SELECT COUNT(*) AS n FROM events").n;
  check("(sanity) those refusals made no event", before === T.q1("SELECT COUNT(*) AS n FROM events").n);
}

console.log("\n# F30.2 The address: ?step=N");
{
  check("steps are 1 to 5: Basics, Look, At the event, Questions, Review", LAST === 5 && STEPS.map((s) => s.name).join() === "Basics,Look,At the event,Questions,Review");
  check("?step=2 is step 2; anything else is no step (the list)", stepFromQuery("2") === 2 && stepFromQuery(["3", "4"]) === 3 && [undefined, "", "0", "6", "x", "1.5", "-1"].every((v) => stepFromQuery(v) === 0));
  const routes = read("src/router/routes.host.js"), dash = read("src/views/HostDashboard.vue");
  check("no new route: the host router table has no step in it and the same view imports", !/step/i.test(routes) && [...routes.matchAll(/import\("\.\.\/views\/(\w+)\.vue"\)/g)].map((m) => m[1]).sort().join() === "HostAccount,HostBilling,HostDashboard,HostEvent,HostSignOut");
  check("the dashboard reads the step from the address and moves with router.push (so Back goes back a step); Cancel and Create replace",
    /route\.query\.step/.test(dash) && /const go = \(n\) => router\.push\(\{ query: \{ step: n \} \}\)/.test(dash) && /const leave = \(\) => router\.replace\(/.test(dash));
  check("a later step reached without the earlier ones goes to the first step with a problem (replace, so Back does not loop)", /firstBadStep\(step\.value, f\.value\)/.test(dash) && /router\.replace\(\{ query: \{ step: bad \} \}\)/.test(dash));
  check("a copy whose earlier event is gone starts blank again", /form\.from && !events\.value\.some/.test(dash));
}

console.log("\n# F30.2 The draft survives a refresh, and belongs to one host and one organisation");
{
  const mem = new Map();
  const fake = { get length() { return mem.size; }, key: (i) => [...mem.keys()][i] ?? null, getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } };
  globalThis.sessionStorage = fake;
  const f = blank({ name: "Draft night", startsAt: 1700000000000, perks: rows("a\nb"), feedbackQuestions: [{ type: "single", label: "Q", options: ["x", "y"] }], theme: "night" });
  saveDraft("Me@Host.com", "org1", f);
  const back = formFromDraft(loadDraft("me@host.com", "org1"));
  check("what was typed comes back after a refresh (the email's case does not matter)", sorted(back) === sorted(f), back);
  check("another organisation of the same host sees no draft, and its read removed this one", loadDraft("me@host.com", "org2") === null && mem.size === 0);
  saveDraft("a@host.com", "org1", f);
  check("another host on the same tab sees no draft", loadDraft("b@host.com", "org1") === null);
  saveDraft("a@host.com", "org1", f); saveDraft("b@host.com", "org1", f);
  clearAllDrafts();
  check("sign-out clears every draft in the tab", mem.size === 0);
  saveDraft("a@host.com", "org1", f); mem.set("something-else", "keep");
  clearDraft("a@host.com", "org1");
  check("Create and Cancel clear this draft and touch nothing else", mem.size === 1 && mem.get("something-else") === "keep");
  clearAllDrafts();
  check("sign-out leaves other keys alone", mem.get("something-else") === "keep");
  mem.set("lanyard:host:event-draft:x@y.com:o", "{ not json");
  check("a broken draft is no draft, not an error", loadDraft("x@y.com", "o") === null);
  mem.set("lanyard:host:event-draft:x@y.com:o", JSON.stringify({ v: 2, form: { name: "future" } }));
  check("a draft from another version is no draft", loadDraft("x@y.com", "o") === null);
  const odd = formFromDraft({ name: 5, startsAt: "soon", endsAt: NaN, theme: null, directoryOn: "yes", perksText: ["x"], feedbackQuestions: "nope", extra: 1, rsvpCount: { a: 1 }, q1: "ok" });
  check("a draft with the wrong types falls back field by field and drops unknown keys", odd.name === "" && odd.startsAt === null && odd.endsAt === null && odd.theme === "default" && odd.directoryOn === true
    && odd.perks.length === 0 && Array.isArray(odd.feedbackQuestions) && odd.feedbackQuestions.length === 0 && !("extra" in odd) && odd.rsvpCount === "" && odd.q1 === "ok", odd);
  check("no draft at all gives the blank form", JSON.stringify(formFromDraft(null)) === JSON.stringify(blankForm()) && JSON.stringify(formFromDraft("x")) === JSON.stringify(blankForm()));
  // Storage that is off, full or blocked must not break the form.
  const boom = () => { throw new Error("blocked"); };
  for (const [label, s] of [["getItem, setItem and removeItem throw", { length: 0, key: boom, getItem: boom, setItem: boom, removeItem: boom }], ["length throws", { get length() { throw new Error("x"); }, key: boom, getItem: boom, setItem: boom, removeItem: boom }]]) {
    globalThis.sessionStorage = s;
    let ok = true;
    try { saveDraft("a@b.c", "o", f); loadDraft("a@b.c", "o"); clearDraft("a@b.c", "o"); clearAllDrafts(); } catch { ok = false; }
    check(`storage that fails never throws: ${label}`, ok);
  }
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get() { throw new Error("denied"); } });
  let ok = true;
  try { saveDraft("a@b.c", "o", f); loadDraft("a@b.c", "o"); clearDraft("a@b.c", "o"); clearAllDrafts(); } catch { ok = false; }
  check("…and no storage at all (the property itself throws) is fine too", ok);
  delete globalThis.sessionStorage;
  ok = true;
  try { saveDraft("a@b.c", "o", f); loadDraft("a@b.c", "o"); clearAllDrafts(); } catch { ok = false; }
  check("…and a browser with none is fine", ok);

  const ds = read("src/lib/eventdraft.js"), code = ds.replace(/\/\/.*$/gm, "");
  check("every use of session storage is inside try/catch", (code.match(/sessionStorage/g) || []).length === 1 && /const store = \(\) => \{ try \{ return globalThis\.sessionStorage/.test(code)
    && !/^\s*(const|let)?\s*\w*\s*=?\s*store\(\)\??\./m.test(code.replace(/try \{[\s\S]*?\} catch/g, "")));
  check("the draft module imports nothing, so host sign-out can use it without loading anything", !/^import /m.test(ds));
  const dash = read("src/views/HostDashboard.vue"), api = read("src/lib/hostapi.js");
  check("Create clears the draft, Cancel clears it, and the key is this host's email and organisation", /clearDraft\(\.\.\.draftIds\(\)\);\s*f\.value = blankForm\(\);\s*leave\(\);/.test(dash) && /function cancel\(\) \{\s*clearDraft\(\.\.\.draftIds\(\)\)/.test(dash) && /draftIds = \(\) => \[account\.value\?\.email, org\.value\?\.id\]/.test(dash));
  check("host sign-out clears every draft before it ends the session (hostSignOutAndReload; every host sign-out button goes through it)", /clearAllDrafts\(\);[^\n]*\n\s*await HostApi\.logout\(\);/.test(api)
    && ["src/views/HostDashboard.vue", "src/views/HostAccount.vue", "src/views/HostSignOut.vue", "src/components/HostSetup.vue"].every((p) => /hostSignOutAndReload/.test(read(p)) && !/HostApi\.logout\(/.test(read(p))));
  check("nothing is sent to the server until Create: the draft code calls no API", !/api|fetch/i.test(code));
}

console.log("\n# F30.2 The screens (rendered on the server)");
// The pickers need a real document (they are checked in test/pickers.mjs and in the browser); here each is a
// plain button with the same id, so the screens' own structure can be rendered on the server.
const stubPickers = {
  name: "stub-pickers", enforce: "pre",
  resolveId(id) { return /\/ui\/(UiSelect|UiDateTimePicker)\.vue$/.test(id) ? " stub-picker" : null; },
  load(id) {
    return id === " stub-picker"
      ? `import { h } from "vue"; export default { props: ["id", "modelValue", "options", "labelledby", "label", "clearable", "min", "suggest", "disabled"], render() { return h("button", { id: this.id, type: "button", role: "combobox" }, String(this.modelValue ?? "")); } };`
      : null;
  },
};
const vite = await createServer({
  configFile: "vite.config.js", root: process.cwd(), logLevel: "silent", appType: "custom", plugins: [stubPickers],
  server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true },
});
const load = async (p) => (await vite.ssrLoadModule("/" + p)).default;
const render = (comp, props, slots) => renderToString(createSSRApp({ render: () => h(comp, props, slots) }));
try {
  const EventCreate = await load("src/components/EventCreate.vue");
  const props = (step, form, extra = {}) => ({ form, step, fromOptions: [{ value: "", label: "A blank event" }, { value: "ev-old", label: "A copy of Old" }], hasEvents: true, ...extra });
  const ids = (html) => [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const page = async (n, form = blank({ name: "N" }), extra) => strip(await render(EventCreate, props(n, form, extra)));
  const P = { 1: await page(1), 2: await page(2), 3: await page(3), 4: await page(4), 5: await page(5) };
  const has = (n, list) => list.every((i) => ids(P[n]).includes(i));
  const none = (n, list) => list.every((i) => !ids(P[n]).includes(i));
  check("step 1 has the earlier-event picker, name, start, end and venue, and nothing from later steps", has(1, ["ev-from", "ev-name", "ev-start", "ev-end", "ev-venue"]) && none(1, ["ev-theme", "ev-strap", "ev-perks-h", "ev-q1", "ev-rsvp"]));
  check("step 2 has the theme and the brand colour only", has(2, ["ev-theme", "ev-strap"]) && none(2, ["ev-name", "ev-perks-h", "ev-q1"]));
  check("step 3 has perks, the food tick, sign-ups and the attendee room tick only (no access field since F63)", has(3, ["ev-perks-h", "ev-food-on", "ev-rsvp"]) && none(3, ["ev-access"]) && /attendee room/.test(P[3]) && none(3, ["ev-name", "ev-theme", "ev-q1"]));
  check("step 4 has both check-in questions, the feedback tick and the feedback editor only", has(4, ["ev-q1", "ev-q2"]) && /anonymous feedback/.test(P[4]) && /Everyone is asked/.test(P[4]) && none(4, ["ev-name", "ev-perks-h", "ev-theme"]));
  check("every old field is on exactly one step (nothing was dropped)", ["ev-from", "ev-name", "ev-start", "ev-end", "ev-venue", "ev-theme", "ev-strap", "ev-perks-h", "ev-food-on", "ev-rsvp", "ev-q1", "ev-q2"].every((i) => [1, 2, 3, 4].filter((n) => ids(P[n]).includes(i)).length === 1));
  const dashSrc = read("src/views/HostDashboard.vue");
  check("every option list is kept: the theme picker (F65: a grid of radio swatches from the shared list) has Default, Formal and Night first; the earlier-event picker has a blank event and one entry per event",
    /<EventLook :form="form" prefix="ev" \/>/.test(read("src/components/EventStepLook.vue")) && /v-for="\(th, i\) in EVENT_THEMES"/.test(read("src/components/EventLook.vue")) && /role="radio"/.test(read("src/components/EventLook.vue")) && /export const THEME_OPTIONS = EVENT_THEMES\.map\(/.test(read("src/lib/eventform.js")) && /id: "default"[\s\S]*id: "formal"[\s\S]*id: "night"/.test(read("src/lib/eventthemes.js"))
    && /const FROM_OPTIONS = computed\(\(\) => \[\{ value: "", label: "A blank event" \}, \.\.\.events\.value\.map/.test(dashSrc) && /:from-options="FROM_OPTIONS"/.test(dashSrc));
  check("each screen says where you are: Step N of 5, the names, aria-current on this one, and the heading has the step in it", [1, 2, 3, 4, 5].every((n) => P[n].includes(`Step ${n} of 5`) && P[n].includes(`aria-current="step"`) && new RegExp(`id="ev-step-h"[^>]*>(<span[^>]*>)?Step ${n} of 5`).test(P[n])));
  check("the heading can take focus (tabindex -1) and the form is a real form with one submit button, so Enter is Next", [1, 2, 3, 4, 5].every((n) => /id="ev-step-h"[^>]*tabindex="-1"/.test(P[n]) && /<form[^>]*novalidate/.test(P[n]) && (P[n].match(/type="submit"/g) || []).length === 1));
  check("steps 2 to 5 have Back; step 1 does not (it has Cancel); every screen has Cancel", [2, 3, 4, 5].every((n) => />Back</.test(P[n])) && !/>Back</.test(P[1]) && [1, 2, 3, 4, 5].every((n) => />Cancel</.test(P[n])));
  check("the button says what comes next, and the last one says Create", />Next: Look</.test(P[1]) && />Next: At the event</.test(P[2]) && />Next: Questions</.test(P[3]) && />Next: Review</.test(P[4]) && />Create event</.test(P[5]) && (await page(5, blank({ name: "x" }), { busy: true })).includes("Creating…"));
  check("only one primary action on each screen", [1, 2, 3, 4, 5].every((n) => (P[n].match(/btn-primary/g) || []).length === 1));
  check("earlier steps can be reached from the names; later ones cannot", (P[3].match(/<button[^>]*class="link-btn"[^>]*>(Basics|Look)</g) || []).length === 2 && !/<button[^>]*class="link-btn"[^>]*>(Questions|Review)</.test(P[3]), P[3].slice(P[3].indexOf("ev-names"), P[3].indexOf("ev-names") + 700));
  // Errors show by the field, not before Next is pressed.
  check("no problem is shown before Next is pressed", !/error-text/.test(strip(await render(EventCreate, props(1, blank())))));
  check("a refusal from the server is a prop of the stepper (checked in the browser: it is shown at the field once its step is open)", /serverError/.test(read("src/components/EventCreate.vue")) && /fieldError\.value = \{ \.\.\.hit, message: e\.message \}; go\(hit\.step\)/.test(read("src/views/HostDashboard.vue")));
  check("no native select, date or time input, and no emoji, on any step", [1, 2, 3, 4, 5].every((n) => !/<select|type="(date|time|datetime-local)"/.test(P[n]) && !/\p{Extended_Pictographic}/u.test(P[n])));
  // The slot for F31.
  check("F31 fills the slot on step 3 (What this event collects, off until switched on), and no other step has it", /data-slot="f31-collects"/.test(read("src/components/EventStepAtEvent.vue")) && /<EventCollects\b/.test(read("src/components/EventStepAtEvent.vue"))
    && ["EventStepBasics", "EventStepLook", "EventStepQuestions", "EventCreate"].every((n) => !/f31-collects|EventCollects/.test(read(`src/components/${n}.vue`))) && P[3].includes("What this event collects") && !P[3].includes("collect-why") && [1, 2, 4].every((n) => !P[n].includes("What this event collects")));
  // Review.
  const rev = await page(5, blank({ name: "Review night", venue: "Hall", theme: "formal", strapColor: "#2a6f4e", perks: rows("Tea\nCake"), foodOn: true, food: "Soup", diet: ["vegan", "halal"], rsvpCount: "12", q1: "Course", directoryOn: false,
    feedbackQuestions: [{ type: "rating", label: "Good?" }, { type: "text", label: "" }] }), { createLabel: "Create event (uses 1 credit)", needsCredits: true });
  check("Review lists every choice by group, each group has a Change link back to its step", ["Basics", "Look", "At the event", "Questions"].every((t) => rev.includes(`>${t}</h3>`)) && (rev.match(/>Change</g) || []).length === 4
    && ["Review night", "Hall", "Formal", "#2a6f4e", "Tea, Cake", "Soup. Options: Vegan, Halal", "12", "Course", "Asked, with 1 of your own question"].every((t) => rev.includes(t)) && rev.includes("Attendee room:</span> No"));
  check("…and says the cost and has the one Create button, with nothing saved until it is pressed", rev.includes("This uses 1 event credit.") && rev.includes("Create event (uses 1 credit)") && rev.includes("Nothing is saved until you press the button"));
  check("the Review rows come from one function the tests can run", reviewGroups(blank({ name: "x" }), null).length === 4 && reviewGroups(blank({ name: "x", from: "e" }), null).length === 4);
  // A copy.
  const live = { event: { name: "Old", venue: "Hall 2", theme: "night", strapColor: "#2a6f4e", perks: ["Free tea"], directoryOn: true, info: { access: "Ramp", food: "Pizza" }, rsvpCount: 40, feedbackOn: true, questions: [{ label: "Course" }] }, sponsors: [{ name: "Acme" }] };
  const facts = copyFacts(live);
  const C = {};
  for (const n of [1, 2, 3, 4, 5]) C[n] = strip(await render(EventCreate, props(n, blank({ from: "ev-old" }), { facts, factsState: "ok" })));
  check("a copy: step 1 shows the name, times and no venue box; steps 2 to 4 show what comes with it and have no inputs to edit",
    ids(C[1]).includes("ev-name") && !ids(C[1]).includes("ev-venue") && C[1].includes("Venue:</span> Hall 2") && [2, 3, 4].every((n) => !/<input|<textarea|ev-theme|ev-perks/.test(C[n].replace(/<section[^>]*data-collects[\s\S]*?<\/section>/, "")) && C[n].includes("Copied from the earlier event"))
    && C[2].includes("Night") && C[3].includes("Free tea") && C[3].includes("Pizza") && C[4].includes("Acme") && C[4].includes("Course"));
  check("a copy's Review shows the same values, 'Same name as the earlier event' when no name is typed, and its own Create label", C[5].includes("Same name as the earlier event") && C[5].includes("Free tea") && C[5].includes("Acme"));
  check("a copy that cannot be read says so and still copies; one being read says so", strip(await render(EventCreate, props(2, blank({ from: "e" }), { factsState: "error" }))).includes("still copied") && strip(await render(EventCreate, props(2, blank({ from: "e" }), { factsState: "loading" }))).includes("Reading its details"));
} finally {
  await vite.close();
}

console.log("\n# F30.3 The preview stays with the form on every step; Review shows the page in full");
{
  const ep = read("src/components/EventPreview.vue"), dash = read("src/views/HostDashboard.vue");
  check("one preview wraps the stepper, so it is beside the form from 1000 px on every step", /<EventPreview v-if="creating"[\s\S]*<EventCreate\b[\s\S]*<\/EventPreview>/.test(dash) && /min-width: 1000px/.test(ep) && /grid-template-columns: minmax\(0, 1fr\) 375px/.test(ep));
  check("below 1000 px it stays a Preview button, except on Review where the whole page is drawn under the form", /:inline="step === 5"/.test(dash) && /\.pv-inline \.pv-side \{ display: block/.test(ep) && /\.pv-inline \.pv-open \{ display: none/.test(ep));
  check("it is still the real check-in page from the same body the Create button sends (nothing new in what it reads but the earlier event's own details)", /eventFromBody\(createBody\(f\.value\)[,)]/.test(dash) && !/fetch\(|HostApi/.test(ep.replace(/\/\/.*$/gm, "")));
  check("a copy shows the preview from its own details, with its sponsors, and no theme strip", /:sponsors="f\.from \? \(source\?\.sponsors \|\| \[\]\) : \[\]"/.test(dash) && /:strip="!f\.from"/.test(dash));
}

console.log("\n# F30 stays on the host site (no public page, shared file, route or chunk list changes)");
{
  const shared = ["src/main.js", "src/App.vue", "src/router/index.js", "src/router/routes.attendee.js", "src/router/routes.host.js", "src/lib/api.js", "src/lib/store.js", "src/lib/profile.js", "src/components/Icon.vue", "src/components/Badge.vue", "src/components/CardView.vue", "src/views/PublicCard.vue", "src/views/EventJoin.vue"];
  const mine = /eventsteps|eventdraft|EventCreate|EventStep|CopiedFacts/;
  check("no shared or public file knows about the stepper", shared.every((f) => !mine.test(read(f))), shared.filter((f) => mine.test(read(f))));
  const users = readdirSync(new URL("../src", import.meta.url), { recursive: true }).filter((f) => /\.(vue|js)$/.test(f)).map((f) => "src/" + String(f).replace(/\\/g, "/")).filter((f) => mine.test(read(f)) && !/(eventsteps|eventdraft)\.js$|EventCreate|EventStep|CopiedFacts/.test(f));
  check("only the host dashboard and host API file use it", users.sort().join() === "src/lib/hostapi.js,src/views/HostDashboard.vue", users);
  const dash = read("src/views/HostDashboard.vue");
  check("the stepper is loaded with the dashboard (static imports): no new lazy chunk, so no new name in the entry's list", /^import EventCreate from "\.\.\/components\/EventCreate\.vue";/m.test(dash) && (dash.match(/import\("/g) || []).length === 1 && /import\("\.\.\/data\/institutions\.js"\)/.test(dash));
  check("Edit (the Details tab) stays one page: it does not use the stepper", !mine.test(read("src/views/HostLive.vue")));
  check("the host chunk's step components use the pickers, not native controls", ["EventStepBasics", "EventStepLook"].every((n) => !/<select|type="datetime-local"|type="date"|type="time"/.test(read(`src/components/${n}.vue`))));
}

summary();
