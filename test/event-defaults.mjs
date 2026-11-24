// F64 (D056): a new event starts from the organisation's latest event's settings. The three switches (attendee room,
// Suggest people to each other, feedback) and "What this event collects" (the list, the email and card ticks, the why
// line) start on a fresh Create event form as they were on the organisation's most recently created event, with a line
// under each one that differs from the fixed default, and Review says so. A draft keeps its own values; "Start from an
// earlier event" takes them from that event. The defaults come from GET /api/host/me (`eventDefaults`), read through
// the real Worker with two organisations. What the eye sees is checked in a browser (see the plan note).
// Run: node test/event-defaults.mjs
import { readFileSync } from "node:fs";
import { createServer } from "vite";
import { renderToString } from "vue/server-renderer";
import { createSSRApp, h } from "vue";
import { makeEnv, check, summary, becomeHost } from "./harness.mjs";
import {
  blankForm, freshForm, startValues, startFromEvent, copiedKeys, reviewGroups, submitPlan, formFromDraft, START_KEYS,
  COPIED_LINE, COLLECT_LINE,
} from "../src/lib/eventsteps.js";
import { EVENT_DEFAULTS } from "../worker/hosts.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, "");
const SEVEN = ["collectCard", "collectEmail", "collectOn", "collectWhy", "directoryOn", "feedbackOn", "suggestOn"];
const keysOf = (o) => Object.keys(o || {}).sort().join();
const FIXED = { directoryOn: true, suggestOn: true, feedbackOn: true, collectOn: false, collectEmail: false, collectCard: false, collectWhy: "" };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const WHY = "So we can keep a register for fire safety and say thank you";
const WHY_B = "Organisation B keeps a register for the venue's own rules";

console.log("\n# The seven settings and the fixed defaults");
check("the settings that follow are exactly the seven", START_KEYS.slice().sort().join() === SEVEN.join(), START_KEYS);
check("the Worker's fixed defaults are the form's blank values for those seven (room, suggest and feedback on, collects off)",
  same(EVENT_DEFAULTS, FIXED) && same(Object.fromEntries(START_KEYS.map((k) => [k, blankForm()[k]])), FIXED));
check("no defaults (a first event, or an old Worker) give the fixed defaults, collects off", same(startValues(null), FIXED) && same(startValues(undefined), FIXED) && same(startValues({}), FIXED));
check("odd values fall back to the fixed default: collects are on only for a real true",
  startValues({ collectOn: "yes", suggestOn: 0, directoryOn: null, collectWhy: 5 }).collectOn === false && startValues({ suggestOn: 0 }).suggestOn === true && startValues({ collectWhy: 5 }).collectWhy === "");
check("with the list off, the email and card ticks and the why line are cleared too", same(startValues({ collectOn: false, collectEmail: true, collectCard: true, collectWhy: WHY }), FIXED));
check("only the seven are taken: nothing else in the answer reaches the form", keysOf(startValues({ ...FIXED, name: "x", venue: "y", perks: ["z"] })) === SEVEN.join());
{
  const f = freshForm({ ...FIXED, suggestOn: false, collectOn: true, collectEmail: true, collectWhy: WHY });
  const b = blankForm();
  check("a fresh form is the blank form with only those seven changed", Object.keys(b).every((k) => START_KEYS.includes(k) || same(f[k], b[k])) && keysOf(f) === keysOf(b));
}

console.log("\n# GET /api/host/me: signed-in host only, own organisation only (the real Worker)");
const T = await makeEnv();
const { client, env, q1 } = T;
const raw = env.DB.raw;
const credit = (orgId) => raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES (?, ?, 50, 0, 'test', ?)").run("cr-" + orgId, orgId, Date.now());
async function attendee(name, ip) {
  const c = client({ ip });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true });
  if (r.status !== 201) throw new Error(r.text);
  return c;
}
const A = client({ ip: "10.64.0.1", site: "host" });
const aInfo = await becomeHost(A, { kind: "company", name: "Alpha Events" });
const aOrg = aInfo.org.json.id;
credit(aOrg);
const B = client({ ip: "10.64.0.2", site: "host" });
const bInfo = await becomeHost(B, { kind: "company", name: "Beta Events" });
const bOrg = bInfo.org.json.id;
credit(bOrg);
const me = async (c) => (await c.get("/api/host/me"));
const defs = async (c) => (await me(c)).json?.eventDefaults;
let made = 0;
const mk = async (c, body) => {
  made += 1;
  const r = await c.post("/api/host/events", { name: `Event ${made}`, ...body });
  if (r.status !== 201) throw new Error(r.text);
  return r.json;
};

{
  const out = client({ ip: "10.64.1.1", site: "host" });
  const r = await me(out);
  check("signed out: 401 and no defaults", r.status === 401 && !r.json?.eventDefaults, r.status);
  const ann = await attendee("Ann Attendee", "10.64.1.2");
  const leak = client({ ip: "10.64.1.3", site: "host" });
  leak.jar.set("lanyard_session", ann.jar.get("lanyard_session"));
  const r2 = await me(leak);
  check("an attendee session on the host site is refused (401) and gets no defaults", r2.status === 401 && !r2.json?.eventDefaults, r2.status);
  const r3 = await ann.get("/api/host/me");
  check("an attendee session on the main site is refused too (wrong site)", r3.status === 403 && !r3.json?.eventDefaults, r3.status);
  const half = client({ ip: "10.64.1.4", site: "host" });
  await becomeHost(half, { kind: null });
  const r4 = await me(half);
  check("a host with no organisation yet gets no defaults (there is nothing to scope them to)", r4.status === 200 && r4.json.step === "org" && !("eventDefaults" in r4.json), r4.json);
}

{
  const d = await defs(A);
  check("a first event: exactly the seven keys, with the fixed defaults, collects off", keysOf(d) === SEVEN.join() && same(d, FIXED), d);
}

// Organisation A: suggestions off, collects on with email. Organisation B: its own, different settings.
const a1 = await mk(A, { suggestOn: false, collect: { attendance: true, items: ["email"], why: WHY } });
const b1 = await mk(B, { directoryOn: false, feedbackOn: false, collect: { attendance: true, items: ["card"], why: WHY_B } });
{
  const d = await defs(A);
  check("after an event with suggestions off and collects on with email, the next form has suggestions off, collects and email on and the why line filled in",
    same(d, { directoryOn: true, suggestOn: false, feedbackOn: true, collectOn: true, collectEmail: true, collectCard: false, collectWhy: WHY }), d);
  check("…exactly the seven keys", keysOf(d) === SEVEN.join(), Object.keys(d));
  const db = await defs(B);
  check("organisation B gets its own latest event's settings, not A's", same(db, { directoryOn: false, suggestOn: true, feedbackOn: false, collectOn: true, collectEmail: false, collectCard: true, collectWhy: WHY_B }), db);
  check("…and A never gets B's (no B value in A's answer, no A value in B's)", !JSON.stringify(d).includes(WHY_B) && !JSON.stringify(db).includes(WHY) && d.collectCard === false && db.collectEmail === false);
}

// An attendee checks in to A's event and stays on the list: nothing about them reaches the defaults.
{
  const code = (await A.get(`/api/host/events/${a1.id}/live`)).json.event.code;
  const p = await attendee("Petra Present", "10.64.2.1");
  const pid = (await p.get("/api/me")).json.user.id;
  raw.prepare("UPDATE users SET recovery_email = ?, email_verified = 1 WHERE id = ?").run("petra@example.com", pid);
  const r = await p.post(`/api/e/${code}/checkin`, { collect: { attendance: true, email: true, card: true } });
  check("(an attendee is on A's list)", r.status === 200 && !!q1("SELECT 1 x FROM event_attendees WHERE event_id = ? AND user_id = ?", a1.id, pid));
  const d = await defs(A);
  const blob = JSON.stringify(d);
  check("the defaults say nothing about attendees: still the seven keys, no name, email, id or count", keysOf(d) === SEVEN.join() && !/Petra|petra@|example\.com/.test(blob) && !blob.includes(pid) && !/\d{2,}/.test(blob.replace(WHY, "")), blob);
}

// A team member of A gets A's settings: the latest event is per organisation, not per person.
{
  const inv = await A.post("/api/host/team/invite", {});
  const staff = client({ ip: "10.64.3.1", site: "host" });
  await becomeHost(staff, { kind: null });
  const j = await staff.post("/api/host/team/join", { code: inv.json.code });
  const d = await defs(staff);
  check("a team member who joins A starts from A's latest event, made by someone else", j.status === 200 && same(d, await defs(A)) && d.collectOn === true, [j.status, d]);
  await mk(staff, { feedbackOn: false });
  const after = await defs(A);
  check("…and an event the team member makes is A's latest for everyone in A (collects off on it, so off now)", same(after, { ...FIXED, feedbackOn: false }), after);
}

// Latest means most recently created, not the latest start time.
{
  const t = Date.now();
  await mk(B, { startsAt: t + 30 * 86400e3, endsAt: t + 30 * 86400e3 + 7200e3, suggestOn: false });
  await mk(B, { startsAt: t - 30 * 86400e3, endsAt: t - 30 * 86400e3 + 7200e3, directoryOn: false });
  const d = await defs(B);
  check("the event made last wins even when another one starts later", same(d, { ...FIXED, directoryOn: false }), d);
  const lastMade = raw.prepare("SELECT id FROM events WHERE org_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(bOrg).id;
  raw.prepare("UPDATE events SET created_at = (SELECT MAX(created_at) FROM events WHERE org_id = ?) WHERE org_id = ?").run(bOrg, bOrg);
  const tie = await defs(B);
  check("two events made in the same millisecond: the one inserted last wins", same(tie, { ...FIXED, directoryOn: false }) && !!lastMade, tie);
}

// A host who has never switched collects on starts with it off, whatever else they changed.
{
  const C = client({ ip: "10.64.4.1", site: "host" });
  const cInfo = await becomeHost(C, { kind: "company", name: "Gamma Events" });
  credit(cInfo.org.json.id);
  await mk(C, { suggestOn: false });
  await mk(C, { directoryOn: false, feedbackOn: false });
  const d = await defs(C);
  check("a host who never switched collects on starts with it off (the email and card ticks off, no why line)", d.collectOn === false && d.collectEmail === false && d.collectCard === false && d.collectWhy === "" && d.directoryOn === false && d.feedbackOn === false, d);
  const f = freshForm(d);
  check("…and the fresh form sends no collect at all", !("collect" in submitPlan({ ...f, name: "Next" }).body));
}

// An organisation whose events are all gone (events are only ever removed outright) gets the fixed defaults.
{
  raw.prepare("DELETE FROM event_attendees WHERE event_id IN (SELECT id FROM events WHERE org_id = ?)").run(aOrg);
  raw.prepare("DELETE FROM sponsors WHERE event_id IN (SELECT id FROM events WHERE org_id = ?)").run(aOrg);
  raw.prepare("DELETE FROM events WHERE org_id = ?").run(aOrg);
  const d = await defs(A);
  check("all of A's events deleted: the fixed defaults, collects off", same(d, FIXED), d);
  check("…while B still gets its own", (await defs(B)).directoryOn === false);
}

console.log("\n# Start from an earlier event: the event chosen, not the latest");
{
  const D = client({ ip: "10.64.5.1", site: "host" });
  const dInfo = await becomeHost(D, { kind: "company", name: "Delta Events" });
  credit(dInfo.org.json.id);
  const older = await mk(D, { feedbackOn: false, collect: { attendance: true, items: ["card"], why: WHY } });
  await mk(D, { suggestOn: false, directoryOn: false });
  const latest = await defs(D);
  const live = (await D.get(`/api/host/events/${older.id}/live`)).json;
  const v = startFromEvent(live.event);
  check("the chosen event's seven come from its own live route: collects on with card, feedback off, suggestions on", same(v, { directoryOn: true, suggestOn: true, feedbackOn: false, collectOn: true, collectEmail: false, collectCard: true, collectWhy: WHY }), v);
  check("…which is not what the latest event would give", latest.collectOn === false && latest.suggestOn === false && !same(v, latest));
  check("an event with the list off gives collects off", startFromEvent({ directoryOn: true, feedbackOn: true }).collectOn === false && same(startFromEvent({ directoryOn: true, feedbackOn: true }), FIXED));
  const form = { ...freshForm(latest), from: older.id, name: "", ...v };
  const plan = submitPlan(form);
  check("Create for the copy sends the chosen event's collects (D038 kept: the server copies none by itself)", plan.copy && same(plan.body.collect, { attendance: true, items: ["card"], why: WHY }), plan.body);
  const r = await D.post(`/api/host/events/${older.id}/duplicate`, plan.body);
  const copy = (await D.get(`/api/host/events/${r.json.id}/live`)).json.event;
  check("the copy has the chosen event's settings, not the latest's", r.status === 201 && copy.collect?.items.join() === "card" && copy.collect?.why === WHY && copy.feedbackOn === false && copy.suggestOn !== false && copy.directoryOn === true, copy);
  const bare = await D.post(`/api/host/events/${older.id}/duplicate`, {});
  check("a copy request with no collect still gets no list (the Worker rule is unchanged)", !(await D.get(`/api/host/events/${bare.json.id}/live`)).json.event.collect);
}

console.log("\n# Which settings say they were copied");
{
  const last = { ...FIXED, suggestOn: false, collectOn: true, collectEmail: true, collectWhy: WHY };
  const start = { values: startValues(last), by: "last" };
  const f = freshForm(last);
  check("only the settings that differ from the fixed default are flagged (room and feedback are on as usual, so no line)", copiedKeys(f, start).sort().join() === "collectEmail,collectOn,collectWhy,suggestOn", copiedKeys(f, start));
  check("a setting the host changed back is no longer flagged", !copiedKeys({ ...f, suggestOn: true }, start).includes("suggestOn"));
  check("unticking the list drops its email tick and why line too", copiedKeys({ ...f, collectOn: false }, start).length === 1);
  check("a first event (fixed defaults) flags nothing", copiedKeys(freshForm(null), { values: startValues(null), by: "last" }).length === 0);
  check("no start (a copy still being read) flags nothing", copiedKeys(f, null).length === 0);
  const rows = Object.fromEntries(reviewGroups({ ...f, name: "Next" }, null, start).flatMap((g) => g.rows));
  check("Review says which settings are as on the last event", rows["Suggest people to each other"] === "No (as on your last event)" && /^On: names and check-in times, with email address for people who leave that tick on \(as on your last event\)$/.test(rows["Attendance list"]) && rows["Why you say you collect it"] === `${WHY} (as on your last event)` && rows["Attendee room"] === "Yes" && rows["Feedback after the event"] === "Asked, with the three standard questions", rows);
  const plain = Object.fromEntries(reviewGroups({ ...f, name: "Next" }, null, null).flatMap((g) => g.rows));
  check("…and without a start nothing is marked", !JSON.stringify(plain).includes("as on"));
  const copyRows = Object.fromEntries(reviewGroups({ ...f, name: "", from: "x" }, null, { values: startValues(last), by: "copy" }).flatMap((g) => g.rows));
  check("a copy's Review says the event you started from", / \(as on the event you started from\)$/.test(copyRows["Attendance list"]), copyRows);
  check("the words, as the plan says them", COPIED_LINE.last === "As on your last event" && COLLECT_LINE.last === "On because your last event collected names. Untick to stop." && /event you started from/.test(COLLECT_LINE.copy));
}

console.log("\n# A draft keeps its own values");
{
  const draft = { ...blankForm(), name: "Half made", suggestOn: true, collectOn: false };
  const later = { ...FIXED, suggestOn: false, collectOn: true, collectEmail: true, collectWhy: WHY };
  const back = formFromDraft(JSON.parse(JSON.stringify(draft)));
  check("reading a draft gives the draft's own switches and collects, whatever the latest event says", back.suggestOn === true && back.collectOn === false && back.name === "Half made" && !same(startValues(later), Object.fromEntries(START_KEYS.map((k) => [k, back[k]]))));
  const dash = read("src/views/HostDashboard.vue");
  check("the dashboard fills only a fresh form with the defaults: a draft is read as it is, no draft is fresh", /const saved = loadDraft\(\.\.\.draftIds\(\)\);\s*const form = saved \? formFromDraft\(saved\) : freshForm\(\);/.test(dash));
  check("the defaults come from the host's own me response and nowhere else", /eventDefaults\.value = d\.eventDefaults \|\| null;/.test(dash) && /const freshForm = \(\) => freshFrom\(eventDefaults\.value\);/.test(dash) && !/eventDefaults/.test(read("src/lib/hostapi.js")));
  check("Cancel and Create start the next form fresh (Create after reading the defaults again, so from the event just made)", /function cancel\(\) \{\s*clearDraft\(\.\.\.draftIds\(\)\);\s*f\.value = freshForm\(\);/.test(dash) && /await load\(\);\s*f\.value = freshForm\(\);/.test(dash));
  check("a form still as it started is not kept as a draft, so the next visit starts fresh again", /now === blank \|\| now === JSON\.stringify\(freshForm\(\)\)\) clearDraft/.test(dash));
  check("changing Start from on the form sets the seven from the chosen event once read (off until then), or the latest again for a blank one; a draft or fresh form put in is left alone",
    /const picked = !!prev && prev\[0\] === form;/.test(dash) && /if \(picked\) setStart\(form, startValues\(id \? null : eventDefaults\.value\)\);/.test(dash) && /if \(picked\) setStart\(form, startFromEvent\(r\.event\)\);/.test(dash));
  check("the form is told where the seven came from: the copy once read, the last event otherwise", /by: "copy"/.test(dash) && /by: "last"/.test(dash) && /:start="start"/.test(dash));
}

console.log("\n# The Worker reads it through the existing organisation helper");
{
  const src = read("worker/hosts.js");
  const route = src.slice(src.indexOf('hostApp.get("/api/host/me"'), src.indexOf('hostApp.post("/api/host/orgs"'));
  const fn = src.slice(src.indexOf("async function eventDefaults"), src.indexOf("const accountJson"));
  check("the me route finds the organisation with findOrg (the account's own membership) and passes its id", /const org = await findOrg\(db, me\.id\);/.test(route) && /eventDefaults: await eventDefaults\(db, org\.id\)/.test(route));
  check("the read is one query on that organisation's events, newest made first, and selects only the six setting columns", /WHERE org_id = \? ORDER BY created_at DESC, rowid DESC LIMIT 1/.test(fn) && /SELECT directory_on, suggest_on, feedback_on, collect_attendance, collect_items, collect_why FROM events/.test(fn) && !/event_attendees|checkins|users|profiles/.test(fn));
  check("no new route: hostsecurity's 401-on-every-route sweep covers the me route already", !/hostApp\.get\("\/api\/host\/events\/defaults"/.test(src));
}

console.log("\n# The form says so: lines under the copied settings (rendered on the server)");
const stubPickers = {
  name: "stub-pickers", enforce: "pre",
  resolveId(id) { return /\/ui\/(UiSelect|UiDateTimePicker)\.vue$/.test(id) ? " stub-picker" : null; },
  load(id) {
    return id === " stub-picker"
      ? `import { h } from "vue"; export default { props: ["id", "modelValue", "options", "labelledby", "label", "clearable", "min", "suggest", "disabled"], render() { return h("button", { id: this.id, type: "button", role: "combobox" }, String(this.modelValue ?? "")); } };`
      : null;
  },
};
const vite = await createServer({
  configFile: "vite.config.js", root: process.cwd(), logLevel: "silent", appType: "custom", plugins: [stubPickers],
  server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true },
});
try {
  const load = async (p) => (await vite.ssrLoadModule("/" + p)).default;
  const EventCreate = await load("src/components/EventCreate.vue");
  const EventCollects = await load("src/components/EventCollects.vue");
  const render = (comp, props) => renderToString(createSSRApp({ render: () => h(comp, props) })).then(strip);
  const props = (step, form, start) => ({ form, step, fromOptions: [{ value: "", label: "A blank event" }], hasEvents: true, start });
  const copiedOn = (html) => [...html.matchAll(/data-copied="(\w+)"/g)].map((m) => m[1]).sort().join();
  const last = { ...FIXED, suggestOn: false, collectOn: true, collectEmail: true, collectWhy: WHY };
  const start = { values: startValues(last), by: "last" };
  const f = { ...freshForm(last), name: "Next one" };
  const s3 = await render(EventCreate, props(3, f, start));
  check("step 3: the suggest switch is off and says As on your last event; the room switch (as usual) says nothing",
    /<input type="checkbox"[^>]*data-suggest-on[^>]*>/.test(s3) && !/<input type="checkbox"[^>]*checked[^>]*data-suggest-on/.test(s3) && /data-copied="suggestOn"[^>]*>As on your last event</.test(s3) && !s3.includes('data-copied="directoryOn"'));
  check("step 3: the collects switch says On because your last event collected names. Untick to stop.", /data-copied="collectOn"[^>]*>On because your last event collected names\. Untick to stop\.</.test(s3));
  check("step 3: the email tick and the why line say As on your last event; the card tick (off) does not", copiedOn(s3) === "collectEmail,collectOn,collectWhy,suggestOn" && s3.includes(`value="${WHY}"`), copiedOn(s3));
  const s4 = await render(EventCreate, props(4, { ...freshForm({ ...FIXED, feedbackOn: false }), name: "x" }, { values: startValues({ ...FIXED, feedbackOn: false }), by: "last" }));
  check("step 4: feedback off from the last event says so", /data-copied="feedbackOn"[^>]*>As on your last event</.test(s4));
  const first = await render(EventCreate, props(3, { ...freshForm(null), name: "First" }, { values: startValues(null), by: "last" }));
  check("a brand-new organisation's first event: no line anywhere, collects off", !/data-copied/.test(first) && !/As on your last event|collected names/.test(first));
  const rv = await render(EventCreate, props(5, f, start));
  check("Review lists the copied settings with (as on your last event)", rv.includes("Suggest people to each other:</span> No (as on your last event)") && /Attendance list:<\/span> On: names and check-in times, with email address[^<]*\(as on your last event\)/.test(rv) && rv.includes(`${WHY} (as on your last event)`));
  const cp = await render(EventCreate, props(3, { ...f, from: "ev-old" }, { values: startValues(last), by: "copy" }));
  check("a copy: the collects switch says the event you started from, not your last event", cp.includes("On because the event you started from collected names. Untick to stop.") && !cp.includes("your last event"));
  const details = await render(EventCollects, { form: { collectOn: true, collectEmail: true, collectCard: false, collectWhy: WHY } });
  check("the Details tab (no start given) shows no such line", !/data-copied/.test(details));
  check("no emoji and plain words in the new lines", ![COPIED_LINE.last, COPIED_LINE.copy, COLLECT_LINE.last, COLLECT_LINE.copy].some((t) => /\p{Extended_Pictographic}/u.test(t)));
} finally {
  await vite.close();
}

summary();
