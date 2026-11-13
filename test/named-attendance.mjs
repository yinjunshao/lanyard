// F31: named attendance with a check-in notice. Run: node test/named-attendance.mjs
// Each section says what it pins. The privacy bar (each line, with its negative cases) is
// listed in the F31 plan note's Log with the section of this file that tests it.
import { readFileSync } from "node:fs";
import { createBody, detailsBody, eventFromBody } from "../src/lib/eventform.js";
import { blankForm, submitPlan, validateStep, reviewGroups } from "../src/lib/eventsteps.js";
import { noticeOf, cleanWhy, whyProblem, EXTRA_KEYS, WHY_MAX } from "../src/lib/collects.js";
import { makeDb, migrationFiles, readMigration, makeEnv, becomeHost, check, summary } from "./harness.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

console.log("\n# Migration 0028 on a database that already has events, check-ins and consent records");
{
  const MIGRATION = migrationFiles().find((f) => f.startsWith("0028_"));
  const db = makeDb({ before: "0028" });
  const raw = db.raw;
  const n = (sql, ...p) => raw.prepare(sql).get(...p).n;
  const ts = Date.now();
  raw.prepare("INSERT INTO users (id, created_at, last_seen_at) VALUES ('u1', ?, ?)").run(ts, ts);
  raw.prepare("INSERT INTO events (id, code, name, created_at) VALUES ('e1', 'AB2CD', 'Old night', ?)").run(ts);
  raw.prepare("INSERT INTO checkins (event_id, user_id, created_at) VALUES ('e1', 'u1', ?)").run(ts);
  raw.prepare("INSERT INTO consent_log (id, user_id, scope, action, ref, at) VALUES ('c1', 'u1', 'terms:old', 'granted', NULL, ?)").run(ts);
  const counts = () => ["users", "events", "checkins", "consent_log"].map((t) => n(`SELECT COUNT(*) n FROM ${t}`));
  const before = counts();
  raw.exec(readMigration(MIGRATION));
  check("it applies on top of 0027", !!MIGRATION);
  check("no row in any existing table is lost or changed", JSON.stringify(counts()) === JSON.stringify(before) && n("SELECT COUNT(*) n FROM events WHERE name = 'Old night'") === 1);
  const ev = raw.prepare("SELECT collect_attendance, collect_items, collect_why FROM events WHERE id = 'e1'").get();
  check("an existing event has named attendance off, no items and no why line", ev.collect_attendance === 0 && ev.collect_items === "[]" && ev.collect_why === "", ev);
  const log = raw.prepare("SELECT wording, version FROM consent_log WHERE id = 'c1'").get();
  check("an existing consent record keeps NULL for the new wording and version columns", log.wording === null && log.version === null, log);
  check("the list table starts empty: nobody is on a list because a migration ran", n("SELECT COUNT(*) n FROM event_attendees") === 0);
  // The old code's statements still work on the new schema (the migration is safe to apply before the deploy).
  raw.prepare("INSERT INTO events (id, code, name, created_at) VALUES ('e2', 'ZZ9ZZ', 'Old code event', ?)").run(ts);
  raw.prepare("INSERT INTO consent_log (id, user_id, scope, action, ref, at) VALUES ('c2', 'u1', 'selfie', 'granted', NULL, ?)").run(ts);
  check("statements written for the old schema still run (an insert that names no new column)", n("SELECT COUNT(*) n FROM events WHERE collect_attendance = 0") === 2);
  raw.prepare("INSERT INTO event_attendees (event_id, user_id, items, notice_version, created_at, updated_at) VALUES ('e1', 'u1', '[]', 'v', ?, ?)").run(ts, ts);
  let dup = false;
  try { raw.prepare("INSERT INTO event_attendees (event_id, user_id, items, notice_version, created_at, updated_at) VALUES ('e1', 'u1', '[]', 'v', ?, ?)").run(ts, ts); } catch { dup = true; }
  check("one row per person per event", dup);
  raw.prepare("DELETE FROM events WHERE id = 'e1'").run();
  check("deleting the event deletes its list", n("SELECT COUNT(*) n FROM event_attendees") === 0);
  raw.prepare("INSERT INTO events (id, code, name, created_at) VALUES ('e3', 'YY8YY', 'Third', ?)").run(ts);
  raw.prepare("INSERT INTO event_attendees (event_id, user_id, items, notice_version, created_at, updated_at) VALUES ('e3', 'u1', '[]', 'v', ?, ?)").run(ts, ts);
  raw.prepare("DELETE FROM users WHERE id = 'u1'").run();
  check("deleting the account deletes the person's rows", n("SELECT COUNT(*) n FROM event_attendees") === 0);
  check("…and the consent record stays (it has no foreign key)", n("SELECT COUNT(*) n FROM consent_log WHERE user_id = 'u1'") === 2);
  const sql = readMigration(MIGRATION).replace(/--.*$/gm, "");
  const risky = [...sql.matchAll(/\b(DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+\w+|INSERT\s+INTO)\b/gi)].map((m) => m[0]);
  check("the migration only adds: no DROP, DELETE, UPDATE or INSERT", risky.length === 0, risky);
  check("a fresh database gets every migration", (() => { makeDb(); return true; })());
}

// ---------- a world to test in: two host organisations and a few attendees ----------
const T = await makeEnv();
const { client, q, q1, env } = T;
const WHY = "So we can keep a register for fire safety";
let credit = 0;
async function makeHost(ip, name) {
  const h = client({ ip, site: "host" });
  const info = await becomeHost(h, { kind: "company", name });
  env.DB.raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES (?, ?, 200, 0, 'test', ?)").run("cr-na-" + (++credit), info.org.json.id, Date.now());
  return h;
}
const H = await makeHost("10.31.1.1", "Quad Events");
const H2 = await makeHost("10.31.1.2", "Other Events");
const on = (extra = {}) => ({ attendance: true, items: ["email", "card"], why: WHY, ...extra });
const mk = async (body, host = H) => (await host.post("/api/host/events", { name: "Night", ...body }));
const row = (id) => q1("SELECT collect_attendance a, collect_items i, collect_why w FROM events WHERE id = ?", id);

console.log("\n# F31.2 The host's settings: a fixed list, a required why line, off by default");
{
  const plain = await mk({});
  check("an event made the old way has the list off, no items and no why line", plain.status === 201 && JSON.stringify(row(plain.json.id)) === JSON.stringify({ a: 0, i: "[]", w: "" }), row(plain.json.id));
  const e = await mk({ collect: on() });
  check("switching it on saves the items and the why line", e.status === 201 && row(e.json.id).a === 1 && row(e.json.id).i === '["email","card"]' && row(e.json.id).w === WHY, row(e.json.id));
  const bad = async (collect, label) => {
    const before = q1("SELECT COUNT(*) n FROM events").n;
    const r = await mk({ collect });
    check(label + ": refused with a plain message and no event made", r.status === 400 && typeof r.json.error === "string" && q1("SELECT COUNT(*) n FROM events").n === before, [r.status, r.json]);
    return r;
  };
  await bad(on({ why: "" }), "no why line");
  await bad(on({ why: "   " }), "a why line of only spaces");
  await bad(on({ why: "Too short" }), "a why line under 10 characters");
  await bad(on({ why: "x".repeat(WHY_MAX + 1) }), "a why line over 200 characters");
  await bad(on({ why: undefined }), "no why key at all");
  await bad(on({ why: 12345678901 }), "a why line that is not text");
  await bad(on({ items: ["phone"] }), "an item that is not on the fixed list");
  await bad(on({ items: ["email", "location"] }), "one good item and one unknown");
  await bad(on({ items: [{ key: "dietary", label: "Your dietary needs" }] }), "a free-text item the host made up");
  await bad(on({ items: "email" }), "items that are not a list");
  await bad(on({ items: ["__proto__"] }), "a prototype key as an item");
  await bad("yes please", "settings that are text, not an object");
  await bad([1], "settings that are a list");
  const ok = await mk({ collect: on({ why: "  Fire   safety\u0000 and​ thanks‮  after\n the event  ", items: ["card", "email", "card"] }) });
  check("the why line is cleaned (control, zero-width and direction characters go, spaces collapse) and items are de-duplicated in a fixed order", ok.status === 201 && row(ok.json.id).w === "Fire safety and thanks after the event" && row(ok.json.id).i === '["email","card"]', row(ok.json.id));
  const markup = await mk({ collect: on({ why: "Register <b>bold</b> & <script>alert(1)</script> ok", items: [] }) });
  check("markup in the why line is kept as text (it is shown as text, never as HTML)", markup.status === 201 && row(markup.json.id).w === "Register <b>bold</b> & <script>alert(1)</script> ok" && row(markup.json.id).i === "[]", row(markup.json.id));
  const off = await mk({ collect: { attendance: "true", items: ["email"], why: WHY } });
  check("only attendance: true switches it on (the string 'true' does not), and items sent without it are dropped", off.status === 201 && JSON.stringify(row(off.json.id)) === JSON.stringify({ a: 0, i: "[]", w: "" }), row(off.json.id));
  const justOn = await mk({ collect: { attendance: true, why: WHY } });
  check("items are optional: the list alone is allowed", justOn.status === 201 && row(justOn.json.id).i === "[]");
  check("every item the form can send is one the code honours", EXTRA_KEYS.join() === "email,card");
}

console.log("\n# Changing it on the Details tab, and what the host's live view says");
{
  const e = await mk({});
  const id = e.json.id;
  const live0 = (await H.get("/api/host/events/" + id + "/live")).json;
  const code = live0.event.code;
  check("an event with the list off has no collect field in the live view at all", !("collect" in live0.event), Object.keys(live0.event));
  const put = await H.put("/api/host/events/" + id, { collect: on({ items: ["email"] }) });
  const live1 = (await H.get("/api/host/events/" + id + "/live")).json;
  check("switching it on from Details works, and the live view says what is on and the organisation's name", put.status === 200 && live1.event.collect?.attendance === true && live1.event.collect.items.join() === "email" && live1.event.collect.why === WHY && live1.event.collect.organiser === "Quad Events", live1.event.collect);
  const noWord = await H.put("/api/host/events/" + id, { name: "Renamed night" });
  check("an edit that says nothing about it leaves it as it was", noWord.status === 200 && row(id).a === 1 && row(id).w === WHY);
  const badPut = await H.put("/api/host/events/" + id, { name: "Never saved", collect: on({ why: "short" }) });
  check("a refused change saves nothing else either", badPut.status === 400 && q1("SELECT name FROM events WHERE id = ?", id).name === "Renamed night" && row(id).w === WHY, badPut.json);
  check("the attendee's page for it carries the notice: the items in order", (await client({ ip: "10.31.1.9" }).get("/api/e/" + code)).json.event.collects?.items.map((i) => i.key).join() === "attendance,email");
  const offPut = await H.put("/api/host/events/" + id, { collect: { attendance: false } });
  check("switching it off from Details clears the items and the why line", offPut.status === 200 && JSON.stringify(row(id)) === JSON.stringify({ a: 0, i: "[]", w: "" }));
  check("…and the attendee's page no longer has a notice", !("collects" in (await client({ ip: "10.31.1.9" }).get("/api/e/" + code)).json.event));
  const other = await H2.put("/api/host/events/" + id, { collect: on() });
  check("another organisation's host cannot change it (404) and nothing changes", other.status === 404 && row(id).a === 0, other.status);
  const A = client({ ip: "10.31.1.8" });
  await A.post("/api/profile", { name: "Attendee A", acceptTerms: true, over18: true });
  const cookieOnHost = await A.req("PUT", "/api/host/events/" + id, { collect: on() }, { origin: "https://host.lanyard.test" });
  check("an attendee cookie cannot change it (refused, 401 or 403)", [401, 403].includes(cookieOnHost.status) && row(id).a === 0, cookieOnHost.status);
}

console.log("\n# A copy of an earlier event never carries the list over");
{
  const src = await mk({ collect: on() });
  const copy = await H.post("/api/host/events/" + src.json.id + "/duplicate", { name: "Copy" });
  check("duplicating an event that has the list on makes one with it off", copy.status === 201 && JSON.stringify(row(copy.json.id)) === JSON.stringify({ a: 0, i: "[]", w: "" }), row(copy.json.id));
  const copy2 = await H.post("/api/host/events/" + src.json.id + "/duplicate", { name: "Copy two", collect: on({ items: ["card"], why: "Because the host chose it again" }) });
  check("…unless the host chooses it again while copying", copy2.status === 201 && row(copy2.json.id).a === 1 && row(copy2.json.id).i === '["card"]');
  const copy3 = await H.post("/api/host/events/" + src.json.id + "/duplicate", { name: "Copy three", collect: on({ why: "no" }) });
  check("a bad choice while copying is refused", copy3.status === 400);
}

console.log("\n# The form: what the stepper and the preview send and show");
{
  const f = { ...blankForm(), name: "Quiet night" };
  check("with the list off, Create sends no collect key, nor does Details or a copy", !("collect" in createBody(f)) && !("collect" in detailsBody({ name: "x", venue: "", perksText: "", rsvpCount: "" })) && !("collect" in submitPlan({ ...f, from: "e1" }).body));
  const g = { ...f, collectOn: true, collectEmail: true, collectCard: false, collectWhy: WHY };
  check("with it on, Create sends the choices; a copy sends them too", JSON.stringify(createBody(g).collect) === JSON.stringify({ attendance: true, items: ["email"], why: WHY }) && JSON.stringify(submitPlan({ ...g, from: "e1" }).body.collect) === JSON.stringify({ attendance: true, items: ["email"], why: WHY }));
  check("Details sends 'off' once when it was on and is being switched off, and nothing for an event that never had it", JSON.stringify(detailsBody({ name: "x", collectWas: true, collectOn: false }).collect) === '{"attendance":false}' && !("collect" in detailsBody({ name: "x", collectWas: false, collectOn: false })));
  check("step 3 asks for the why line when it is on, for a new event and for a copy; nothing is asked when it is off", validateStep(3, g).collectWhy === undefined && !!validateStep(3, { ...g, collectWhy: "" }).collectWhy && !!validateStep(3, { ...g, from: "e1", collectWhy: "short" }).collectWhy && Object.keys(validateStep(3, { ...f })).length === 0);
  const rows3 = (x) => reviewGroups(x).find((r) => r.step === 3).rows;
  check("Review says Off, or On with the extras and the why line", JSON.stringify(rows3(f).at(-1)) === '["Attendance list","Off"]' && rows3(g).some((r) => r[0] === "Why you say you collect it" && r[1] === WHY) && rows3(g).some((r) => /email address/.test(r[1])));
  // The preview's notice is the one the attendee's page gets.
  for (const [label, body] of Object.entries({
    "email and card": { attendance: true, items: ["email", "card"], why: WHY },
    "the list alone": { attendance: true, items: [], why: WHY },
    "a messy why line": { attendance: true, items: ["card"], why: "  Spaced​   out\u0000 line for the organisers  " },
  })) {
    const made = await mk({ collect: body });
    const real = (await client({ ip: "10.31.1.7" }).get("/api/e/" + made.json.code)).json.event.collects;
    const prev = eventFromBody({ name: "Night", collect: body }, [], "Quad Events").collects;
    check("the host's preview builds the same notice as the saved event serves: " + label, JSON.stringify(real) === JSON.stringify(prev), [real, prev]);
  }
  check("a form with the list off gives the preview no notice", !("collects" in eventFromBody(createBody(f), undefined, "Quad Events")));
  check("noticeOf names 'The organisers' when the organisation has no name, and gives nothing when off", noticeOf({ attendance: true, items: [], why: WHY }, "").organiser === "The organisers" && noticeOf({ attendance: false, why: WHY }) === null && noticeOf(null) === null);
  check("whyProblem: required, 10 to 200 characters", !!whyProblem("") && !!whyProblem("123456789") && !whyProblem("1234567890") && !whyProblem("x".repeat(200)) && !!whyProblem("x".repeat(201)) && cleanWhy(null) === "");
}

// ---------- F31.3 the check-in page: the notice, the ticks, and what is recorded ----------
let ipn = 20;
async function person(name, { email } = {}) {
  const c = client({ ip: `10.31.2.${ipn++}` });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true });
  const id = (await c.get("/api/me")).json.user.id;
  if (email) q("UPDATE users SET recovery_email = ?, email_verified = 1 WHERE id = ?", email, id) && 0;
  return Object.assign(c, { id, name, status: r.status });
}
const setEmail = (id, email) => env.DB.raw.prepare("UPDATE users SET recovery_email = ?, email_verified = 1 WHERE id = ?").run(email, id);
const listRow = (eventId, userId) => q1("SELECT items, notice_version v FROM event_attendees WHERE event_id = ? AND user_id = ?", eventId, userId);
const logs = (userId, eventId) => q("SELECT scope, action, ref, wording, version FROM consent_log WHERE user_id = ? AND scope LIKE '%:' || ? ORDER BY scope", userId, eventId);
const ALL = { attendance: true, email: true, card: true };
const E = await mk({ collect: on(), venue: "Hall 1" });
const Ecode = (await H.get("/api/host/events/" + E.json.id + "/live")).json.event.code;
const Eid = E.json.id;
const wordings = (await client({ ip: "10.31.2.1" }).get("/api/e/" + Ecode)).json.event.collects;

console.log("\n# F31.3 What the check-in page is given, and what is recorded for each choice");
{
  check("the page's data names the organiser, the why line and one item per tick, the list itself first", wordings.organiser === "Quad Events" && wordings.why === WHY && wordings.items.map((i) => i.key).join() === "attendance,email,card" && wordings.items.every((i) => typeof i.label === "string" && i.label.length > 10), wordings);
  const a = await person("Ann Ticks");
  setEmail(a.id, "ann@example.com");
  const r = await a.post(`/api/e/${Ecode}/checkin`, { collect: ALL });
  check("checking in with every tick left on puts the person on the list with both extras", r.status === 200 && listRow(Eid, a.id)?.items === '["email","card"]', listRow(Eid, a.id));
  const l = logs(a.id, Eid);
  check("each item is in consent_log as granted, for this event, with the exact wording shown and the version", l.length === 3 && l.every((x) => x.action === "granted" && x.ref === Eid && x.version === "2026-11-13" && x.wording.includes(wordings.organiser) && x.wording.includes(WHY)) && l.some((x) => x.scope === "event_attendance:" + Eid && x.wording.startsWith(wordings.items[0].label)) && l.some((x) => x.scope === "event_share_email:" + Eid && x.wording.startsWith(wordings.items[1].label)) && l.some((x) => x.scope === "event_share_card:" + Eid && x.wording.startsWith(wordings.items[2].label)), l);

  const b = await person("Ben Opts Out");
  await b.post(`/api/e/${Ecode}/checkin`, { collect: { attendance: false, email: true, card: true } });
  const lb = logs(b.id, Eid);
  check("unticking attendance: nobody is on the list, whatever the other two say", !listRow(Eid, b.id) && lb.length === 3 && lb.every((x) => x.action === "refused"), lb);
  const bb = await b.get(`/api/e/${Ecode}`);
  check("…and the person is still checked in (the tick is not a condition of checking in)", bb.json.checkedIn === true);

  const c = await person("Cat Cards Only");
  await c.post(`/api/e/${Ecode}/checkin`, { collect: { attendance: true, email: false, card: true } });
  const lc = logs(c.id, Eid);
  check("unticking only the email: on the list with the card only; the email is recorded as refused", listRow(Eid, c.id)?.items === '["card"]' && lc.find((x) => x.scope.startsWith("event_share_email")).action === "refused" && lc.find((x) => x.scope.startsWith("event_share_card")).action === "granted" && lc.find((x) => x.scope.startsWith("event_attendance")).action === "granted", lc);

  // Negative cases: a missing value is never a grant.
  const none = await person("Dee No Fields");
  const rn = await none.post(`/api/e/${Ecode}/checkin`, { answers: {}, directoryConsent: true });
  check("a check-in request with no choices at all checks in, puts nobody on the list and writes no consent record", rn.status === 200 && !listRow(Eid, none.id) && logs(none.id, Eid).length === 0);
  for (const [label, collect] of Object.entries({
    "an empty object": {},
    "the strings 'true'": { attendance: "true", email: "true", card: "true" },
    "the number 1": { attendance: 1, email: 1, card: 1 },
    "'yes'": { attendance: "yes", email: "yes", card: "yes" },
    "null values": { attendance: null, email: null, card: null },
    "only the extras": { email: true, card: true },
    "a list": [true, true, true],
    "text": "attendance",
    "a number": 1,
    "true": true,
  })) {
    const p = await person("Neg " + label);
    const rr = await p.post(`/api/e/${Ecode}/checkin`, { collect });
    check(`${label} sent as the choices: checks in but is not on the list and nothing is granted`, rr.status === 200 && !listRow(Eid, p.id) && logs(p.id, Eid).every((x) => x.action !== "granted"), [rr.status, logs(p.id, Eid)]);
  }
  const keys = await person("Key games");
  await keys.post(`/api/e/${Ecode}/checkin`, { collect: { ...ALL, phone: true, __proto__: { attendance: true }, "attendance ": true } });
  check("keys the event does not offer are ignored: only the offered items are recorded", logs(keys.id, Eid).length === 3 && listRow(Eid, keys.id)?.items === '["email","card"]');

  // Re-check-in.
  const again = await person("Eve Again");
  await again.post(`/api/e/${Ecode}/checkin`, { collect: ALL });
  await again.post(`/api/e/${Ecode}/checkin`, { answers: {} });
  check("checking in again with no choices leaves the earlier choices as they were", listRow(Eid, again.id)?.items === '["email","card"]' && logs(again.id, Eid).length === 3);
  await again.post(`/api/e/${Ecode}/checkin`, { collect: { attendance: true, email: false, card: false } });
  const la = logs(again.id, Eid);
  check("checking in again with new choices changes the row and logs what was withdrawn", listRow(Eid, again.id)?.items === "[]" && la.filter((x) => x.action === "withdrawn").length === 2 && la.filter((x) => x.action === "granted").length === 4, la.map((x) => x.action));
  await again.post(`/api/e/${Ecode}/checkin`, { collect: { attendance: false } });
  check("…and unticking attendance on a later request takes them off the list", !listRow(Eid, again.id));

  // An event that does not collect.
  const plain = await mk({});
  const pcode = (await H.get("/api/host/events/" + plain.json.id + "/live")).json.event.code;
  const q1p = await person("Pat Plain");
  const rp = await q1p.post(`/api/e/${pcode}/checkin`, { collect: ALL });
  check("on an event that does not collect, sent choices are ignored: nothing recorded, nobody listed", rp.status === 200 && q1("SELECT COUNT(*) n FROM event_attendees WHERE event_id = ?", plain.json.id).n === 0 && q("SELECT 1 FROM consent_log WHERE scope LIKE '%:' || ?", plain.json.id).length === 0);
  // Switching the list on after someone checked in does not list them.
  const late = await mk({});
  const lcode = (await H.get("/api/host/events/" + late.json.id + "/live")).json.event.code;
  const early = await person("Early Bird");
  await early.post(`/api/e/${lcode}/checkin`, { collect: ALL });
  await H.put("/api/host/events/" + late.json.id, { collect: on() });
  check("someone who checked in before the host switched the list on is not on it", !listRow(late.json.id, early.id));
}

console.log("\n# The check-in page draws the notice (rendered on the server)");
const { createServer } = await import("vite");
const { renderToString } = await import("vue/server-renderer");
const { createSSRApp, h } = await import("vue");
const vite = await createServer({ configFile: "vite.config.js", root: process.cwd(), logLevel: "silent", appType: "custom", server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true } });
const EventPage = (await vite.ssrLoadModule("/src/components/EventPage.vue")).default;
const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, "");
async function render(props) {
  const app = createSSRApp({ render: () => h(EventPage, props) });
  app.component("router-link", { props: ["to"], render() { return h("a", { href: this.to, target: "_blank" }, this.$slots.default?.()); } });
  return strip(await renderToString(app));
}
const pform = (extra = {}) => ({ name: "", answers: {}, sponsorConsent: {}, directoryConsent: false, agreed: false, ...extra });
const baseEvent = { name: "Notice night", venue: "Hall 1", questions: [], directoryOn: false, feedbackOn: true, info: {} };
let html;
{
  html = await render({ event: { ...baseEvent, collects: wordings }, form: pform() });
  const inputs = [...html.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map((m) => m[0]);
  const rows = [...html.matchAll(/<label[^>]*collect-row[^>]*>/g)];
  check("the heading, the organiser's name, the why line and a Privacy Policy link are on the page", html.includes("This event collects") && html.includes("<strong") && html.includes("Quad Events") && html.includes(WHY) && /<a href="\/privacy"[^>]*>Privacy Policy<\/a>/.test(html));
  check("there is one row for each item, in order, each with its exact label", rows.length === 3 && wordings.items.every((i) => html.includes(i.label)) && html.indexOf(wordings.items[0].label) < html.indexOf(wordings.items[1].label) && html.indexOf(wordings.items[1].label) < html.indexOf(wordings.items[2].label));
  check("every item is pre-ticked (owner's decision, D038), none is disabled, and each can be unticked", inputs.length === 3 && inputs.every((i) => /checked/.test(i) && !/disabled/.test(i)), inputs);
  const src = readFileSync(new URL("../src/components/EventPage.vue", import.meta.url), "utf8");
  check("each row is the full width and at least 44 px tall (a rule in the page's own styles)", /\.collect-row\s*\{[^}]*width:\s*100%/.test(src) && /\.collect-row\s*\{[^}]*min-height:\s*(4[4-9]|[5-9]\d)px/.test(src));
  check("nothing is hidden behind a 'more' control: the rows are in the page, not in a details or dialog", !/<details|aria-hidden="true"|display:\s*none/.test(html.slice(html.indexOf("This event collects"), html.indexOf("Privacy Policy"))));
  check("the page says it is all ticked and can be unticked, and that you can still check in", /ticked to start with/.test(html) && /Untick anything/.test(html) && /still check in/.test(html));
  check("the old sentence that says hosts see only totals is not on a page that keeps a list", !html.includes("anonymous totals") && !html.includes("aggregate numbers only") && html.includes("never who you connect with"));
  check("the check-in button is still there", html.includes(">Check in<"));
  // Text, never HTML.
  const evil = { ...wordings, organiser: "<img src=x onerror=alert(1)>", why: "<script>alert(1)</script> &amp; \"quotes\"" };
  const h2 = await render({ event: { ...baseEvent, collects: evil }, form: pform() });
  check("the organiser's name and the why line are escaped: shown as text, never as HTML", !h2.includes("<img src=x") && !h2.includes("<script>alert") && h2.includes("&lt;img src=x onerror=alert(1)&gt;") && h2.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  check("the page source has no v-html", !/v-html/.test(src) && !/innerHTML/.test(src));
  const u = await render({ event: { ...baseEvent, collects: wordings }, form: pform({ collect: { attendance: false, email: true, card: true } }) });
  const tag = (html, k) => html.match(new RegExp(`<input[^>]*data-item="${k}"[^>]*>`))[0].replace(/data-item="w+"/, "");
  check("with attendance unticked the other two show unticked and locked (they only ever appear on the list)", !/checked/.test(tag(u, "attendance")) && ["email", "card"].every((k) => !/checked/.test(tag(u, k)) && /disabled/.test(tag(u, k))));
  const ne = await render({ event: { ...baseEvent, collects: wordings }, form: pform({ hasEmail: false }) });
  check("a person with no verified email sees the email row unticked and locked, with the reason; the others stay ticked", /no verified email/.test(ne) && !/checked/.test(tag(ne, "email")) && /disabled/.test(tag(ne, "email")) && /checked/.test(tag(ne, "attendance")) && /checked/.test(tag(ne, "card")));
  const sp = await render({ event: { ...baseEvent, collects: wordings }, sponsors: [{ id: "s1", name: "Acme", perk: "Pens" }], form: pform({ sponsorConsent: {} }) });
  check("sponsor ticks stay unticked: sponsors are still never pre-ticked", /Never pre-ticked/.test(sp) && ![...sp.matchAll(/<input[^>]*>/g)].some((m) => !/data-item/.test(m[0]) && /checked/.test(m[0].replace(/aria-checked/, ""))));
}

console.log("\n# An event without named attendance: the check-in page is the page it was");
{
  const golden = JSON.parse(readFileSync(new URL("./fixtures/checkin-page-unchanged.json", import.meta.url), "utf8"));
  const norm = (s) => s.replace(/ data-v-[0-9a-f]+/g, "");
  const ev = { name: "Spring night", venue: "Room 4", startsAt: Date.UTC(2026, 10, 20, 18, 0), info: { access: "Step-free", food: "Pizza" }, questions: [{ key: "extra1", label: "Course" }], directoryOn: true, feedbackOn: true, theme: "formal", strapColor: "#2a6f4e" };
  const got = {
    full: await render({ event: ev, form: pform({ answers: { extra1: "" } }), sponsors: [{ id: "s1", name: "Acme", perk: "Free pens" }], showName: true, needsAgree: true }),
    bare: await render({ event: { name: "Bare", questions: [], directoryOn: false, feedbackOn: false, info: {} }, form: pform() }),
    busy: await render({ event: { ...ev, theme: "default", strapColor: null }, form: pform({ answers: { extra1: "" } }), busy: true, error: "Oops" }),
  };
  for (const k of Object.keys(golden)) check(`the markup for ${k} is identical to what it was before F31 (comments aside; saved from commit 0e8d599)`, norm(got[k]) === norm(golden[k]), [norm(got[k]).length, norm(golden[k]).length]);
  check("…and none of them mentions what the event collects or draws a tick", Object.values(got).every((x) => !/This event collects|collect-row/.test(x)));
}
await vite.close();

summary();
process.exit(process.exitCode || 0);
