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
  // F60's Suggest me tick (pre-ticked by the owner's decision, D054, pinned in test/who-to-meet-all.mjs) is its own section; it is left out here.
  const inputs = [...html.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map((m) => m[0]).filter((t) => !/data-suggest-me/.test(t));
  const rows = [...html.matchAll(/class="[^"]*collect-row[^"]*"/g)];
  check("the heading, the organiser's name, the why line and a Privacy Policy link are on the page", html.includes("This event collects") && html.includes("<strong") && html.includes("Quad Events") && html.includes(WHY) && /<a href="\/privacy"[^>]*>Privacy Policy<\/a>/.test(html));
  // F40 (owner's request): one tick covers everything the host asks for; the info button opens exactly what that is.
  check("there is one tick for all of it, and the details list every item in order, each with its exact label", rows.length === 1 && inputs.length === 1 && wordings.items.every((i) => html.includes(i.label)) && html.indexOf(wordings.items[0].label) < html.indexOf(wordings.items[1].label) && html.indexOf(wordings.items[1].label) < html.indexOf(wordings.items[2].label));
  check("the one tick starts ticked (owner's decision, D038), is not disabled, and says it agrees to share with the organiser", /checked/.test(inputs[0]) && !/disabled/.test(inputs[0]) && /I agree to share/.test(html), inputs);
  const src = readFileSync(new URL("../src/components/EventPage.vue", import.meta.url), "utf8");
  check("the row is the full width and at least 44 px tall (a rule in the page's own styles)", /\.collect-row\s*\{[^}]*width:\s*100%/.test(src) && /\.collect-row\s*\{[^}]*min-height:\s*(4[4-9]|[5-9]\d)px/.test(src));
  check("an info button beside the tick opens a dialog that lists what is collected and why", /aria-haspopup="dialog"/.test(html) && /<dialog[^>]*data-collect-info/.test(html) && /showModal/.test(src));
  check("the page says the tick is optional and that you can still check in", /untick it/.test(html) && /still check in/.test(html));
  check("the old sentence that says hosts see only totals is not on a page that keeps a list", !html.includes("anonymous totals") && !html.includes("aggregate numbers only") && html.includes("never who you connect with"));
  check("the check-in button is still there", html.includes(">Check in<"));
  // Text, never HTML.
  const evil = { ...wordings, organiser: "<img src=x onerror=alert(1)>", why: "<script>alert(1)</script> &amp; \"quotes\"" };
  const h2 = await render({ event: { ...baseEvent, collects: evil }, form: pform() });
  check("the organiser's name and the why line are escaped: shown as text, never as HTML", !h2.includes("<img src=x") && !h2.includes("<script>alert") && h2.includes("&lt;img src=x onerror=alert(1)&gt;") && h2.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  check("the page source has no v-html", !/v-html/.test(src) && !/innerHTML/.test(src));
  const u = await render({ event: { ...baseEvent, collects: wordings }, form: pform({ collect: { attendance: false, email: true, card: true } }) });
  const tag = (html) => html.match(/<input[^>]*data-item="all"[^>]*>/)[0];
  check("with attendance unticked the one tick shows unticked", !/checked/.test(tag(u)));
  const ne = await render({ event: { ...baseEvent, collects: wordings }, form: pform({ hasEmail: false }) });
  check("a person with no verified email is told in the details that no email is shared; the tick stays on", /no verified email/.test(ne) && /checked/.test(tag(ne)));
  check("ticking shares every item (email only with a verified one), unticking shares none", /function tickAll\(on\)/.test(src) && /on && !noEmail\(i\.key\)/.test(src));
  const sp = await render({ event: { ...baseEvent, collects: wordings }, sponsors: [{ id: "s1", name: "Acme", perk: "Pens" }], form: pform({ sponsorConsent: {} }) });
  check("sponsor ticks stay unticked: sponsors are still never pre-ticked", /Never pre-ticked/.test(sp) && ![...sp.matchAll(/<input[^>]*>/g)].some((m) => !/data-item|data-suggest-me/.test(m[0]) && /checked/.test(m[0].replace(/aria-checked/, ""))) && [...sp.matchAll(/<input[^>]*name="?sponsor|<input[^>]*type="checkbox"[^>]*>/g)].filter((m) => !/data-item|data-suggest-me/.test(m[0])).length >= 1);
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
  // F51 (the owner's request): a first-timer's 18+ and Terms tick became a line directly above Check in. That is the
  // one change allowed: the old tick taken out of the saved markup, and the new line out of today's, must leave the same bytes.
  const OLD_TICK = /<label class="checkbox-row"><input type="checkbox"><span class="small"> I&#39;m 18 or over and I agree to the <a href="\/terms" target="_blank">Terms<\/a> and <a href="\/privacy" target="_blank">Privacy Policy<\/a>\. <\/span><\/label>/g;
  const NEW_LINE = /<p class="consent-line"> By pressing Check in, you confirm you&#39;re 18 or over and agree to the <a href="\/terms" target="_blank">Terms<\/a> and <a href="\/privacy" target="_blank">Privacy Policy<\/a>\. <\/p>(?=<button class="btn btn-primary">Check in<\/button>)/g;
  const count = (s, re) => (s.match(re) || []).length;
  // F63 (the owner's request): Access info is hidden from attendees, so the saved page's Access row is the other allowed
  // change: taken out of the saved markup it must leave today's bytes, and today's page must not have it.
  const OLD_ACCESS = /<dt class="label">Access<\/dt><dd>Step-free<\/dd>/g;
  check("F63: the saved page showed Access once and today's page shows it nowhere", count(norm(golden.full), OLD_ACCESS) === 1 && Object.values(got).every((x) => count(norm(x), OLD_ACCESS) === 0 && !/>Access</.test(x)));
  // F60 (the owner's request): the page now asks what you hope to get from the event and shows the Suggest me tick, in one
  // section of its own, exactly once on every page. That section taken out of today's markup must leave the old bytes.
  const SUGGEST = /<section class="panel stack-2" aria-labelledby="suggest-h" data-suggest>[\s\S]*?<\/section>/g;
  check("F60: each page has the intention and Suggest me section exactly once", Object.values(got).every((x) => count(norm(x), SUGGEST) === 1));
  for (const k of Object.keys(got)) got[k] = norm(got[k]).replace(SUGGEST, "");
  check("F51: the page that asked for the Terms had exactly one tick and now has no tick but exactly one line, right before Check in", count(norm(golden.full), OLD_TICK) === 1 && count(norm(got.full), OLD_TICK) === 0 && count(norm(got.full), NEW_LINE) === 1 && count(norm(got.full), /type="checkbox"/g) === count(norm(golden.full), /type="checkbox"/g) - 1);
  check("F51: the pages that did not ask have no line", count(norm(got.bare), NEW_LINE) === 0 && count(norm(got.busy), NEW_LINE) === 0 && !/consent-line/.test(got.bare + got.busy));
  for (const k of Object.keys(golden)) check(`the markup for ${k} is identical to what it was before F31 (comments aside; saved from commit 0e8d599; F51's line in place of the tick; F63's Access row gone)`, norm(got[k]).replace(NEW_LINE, "") === norm(golden[k]).replace(OLD_TICK, "").replace(OLD_ACCESS, ""), [norm(got[k]).length, norm(golden[k]).length]);
  check("…and none of them mentions what the event collects or draws a tick", Object.values(got).every((x) => !/This event collects|collect-row/.test(x)));
}
await vite.close();

// ---------- F31.4 the host's list, the CSV, the exports, the purge and the reset ----------
const HOST_ORIGIN = "https://host.lanyard.test";
const setCard = (id) => env.DB.raw.prepare("UPDATE profiles SET headline = 'Robotics and coffee', course = 'Engineering', uni = 'Test University', links = ? WHERE user_id = ?")
  .run(JSON.stringify({ Site: "https://ann.example.com", Bad: "javascript:alert(1)" }), id);
const F = await mk({ collect: on(), venue: "Hall 2" });
const Fid = F.json.id;
const Fcode = (await H.get("/api/host/events/" + Fid + "/live")).json.event.code;
const names = {};
{
  const mkp = async (label, name, choices, { email, verified = true } = {}) => {
    const p = await person(name);
    if (email) env.DB.raw.prepare("UPDATE users SET recovery_email = ?, email_verified = ? WHERE id = ?").run(email, verified ? 1 : 0, p.id);
    await p.post(`/api/e/${Fcode}/checkin`, { collect: choices });
    names[label] = p;
    return p;
  };
  const ann = await mkp("all", "Ann All", ALL, { email: "ann.all@example.com" });
  setCard(ann.id);
  await mkp("cardOnly", "Cat Card", { attendance: true, email: false, card: true }, { email: "cat.secret@example.com" });
  await mkp("emailOnly", "Eli Email", { attendance: true, email: true, card: false }, { email: "eli@example.com" });
  await mkp("listOnly", "Lou List", { attendance: true, email: false, card: false }, { email: "lou.secret@example.com" });
  await mkp("out", "Ollie Out", { attendance: false, email: true, card: true }, { email: "ollie.secret@example.com" });
  await mkp("noFields", "Nora NoFields", undefined, { email: "nora.secret@example.com" });
  await mkp("unverified", "Una Unverified", ALL, { email: "una.unverified@example.com", verified: false });
  await mkp("formula", "=HYPERLINK(\"http://evil.example\",\"x\")", { attendance: true, email: false, card: false });
}

console.log("\n# F31.4 The host's list shows only people who left the tick on, and only what they left ticked");
const get = (h, path) => h.get(path);
{
  const r = await H.get(`/api/host/events/${Fid}/attendees`);
  const L = r.json;
  const by = (n) => L.attendees.find((a) => a.name === n);
  check("the host's own list answers, uncached", r.status === 200 && r.headers.get("cache-control") === "no-store" && L.items.join() === "email,card", [r.status, L.items]);
  check("it names exactly the people who left the attendance tick on, and counts them", L.count === 6 && L.attendees.map((a) => a.name).sort().join("|") === ["=HYPERLINK(\"http://evil.example\",\"x\")", "Ann All", "Cat Card", "Eli Email", "Lou List", "Una Unverified"].sort().join("|"), L.attendees.map((a) => a.name));
  check("it is in check-in order, each with the time they checked in", L.attendees.every((a, i, arr) => typeof a.checkedInAt === "number" && (i === 0 || a.checkedInAt >= arr[i - 1].checkedInAt)));
  check("a person who unticked attendance is not in it (their name is nowhere in the answer)", !by("Ollie Out") && !r.text.includes("Ollie"), null);
  check("…nor a person whose request had no choices at all", !by("Nora NoFields") && !r.text.includes("Nora"));
  check("a person who left everything on shows their verified email and their card (headline, the line under their name, and only web links)", by("Ann All").email === "ann.all@example.com" && by("Ann All").card.headline === "Robotics and coffee" && by("Ann All").card.line === "Engineering · Test University" && JSON.stringify(by("Ann All").card.links) === '[{"label":"Site","url":"https://ann.example.com"}]', by("Ann All"));
  check("a person who unticked the email shows no email key at all, and their address is nowhere in the answer", !("email" in by("Cat Card")) && by("Cat Card").card && !r.text.includes("cat.secret@example.com"));
  check("a person who unticked the card shows no card key", !("card" in by("Eli Email")) && by("Eli Email").email === "eli@example.com");
  check("a person who left only the list on shows a name and a time and nothing else", JSON.stringify(Object.keys(by("Lou List")).sort()) === '["checkedInAt","name"]' && !r.text.includes("lou.secret@example.com"));
  check("an email that was never verified is not given out, even when ticked", "email" in by("Una Unverified") && by("Una Unverified").email === null && !r.text.includes("una.unverified@example.com"));
  const ids = Object.values(names).map((p) => p.id);
  check("the answer holds no user id, no check-in answer, no connection or how-you-met field", !ids.some((id) => r.text.includes(id)) && !/"(answers|via|connections|userId|user_id|photo|selfie|tags)"/.test(r.text), null);
  const csv = await H.get(`/api/host/events/${Fid}/attendees.csv`);
  const lines = csv.text.replace(/^﻿/, "").split("\r\n");
  check("the CSV is a download named for the event, uncached, with a header and one line per person", csv.status === 200 && /^text\/csv/.test(csv.headers.get("content-type")) && /attachment; filename="lanyard-attendees-Night\.csv"/.test(csv.headers.get("content-disposition")) && csv.headers.get("cache-control") === "no-store" && lines[0] === "Name,Checked in (UTC),Email,Card headline,Card line,Card links" && lines.length === 7, [lines[0], lines.length]);
  check("a name that starts with = is neutralised so it cannot run as a formula", lines.some((l) => l.startsWith("\"'=HYPERLINK(")) && !lines.some((l) => /^=/.test(l)));
  check("the CSV holds the same people and nothing the JSON does not", !csv.text.includes("Ollie") && !csv.text.includes("Nora") && !csv.text.includes("cat.secret") && csv.text.includes("ann.all@example.com") && csv.text.includes("Site: https://ann.example.com"));
}

console.log("\n# Who may open it");
{
  const nobody = client({ ip: "10.31.3.1", site: "host" });
  for (const p of ["attendees", "attendees.csv"]) {
    const path = `/api/host/events/${Fid}/${p}`;
    check(`${p}: a signed-out visitor to the host site is refused (401)`, (await nobody.get(path)).status === 401);
    check(`${p}: another organisation's host gets 404 and learns nothing`, (await H2.get(path)).status === 404 && !(await H2.get(path)).text.includes("Ann"));
    const A = names.all;
    const asAttendee = await A.req("GET", path, undefined, { origin: HOST_ORIGIN });
    check(`${p}: an attendee's cookie on the main site is refused (the host API is not served there)`, [401, 403, 404].includes(asAttendee.status) && !asAttendee.text.includes("Ann"), asAttendee.status);
    const crossed = client({ ip: "10.31.3.2", site: "host" });
    for (const [k, v] of A.jar) crossed.jar.set(k, v);
    const onHost = await crossed.get(path);
    check(`${p}: an attendee's cookie sent to the host site is refused (401)`, onHost.status === 401 && !onHost.text.includes("Ann"), onHost.status);
    check(`${p}: the host's own cookie on the host site works`, (await H.get(path)).status === 200);
  }
  const plainId = (await mk({})).json.id;
  const off = await H.get(`/api/host/events/${plainId}/attendees`);
  check("an event that does not keep a list: the host gets 404 and a plain message, and no CSV either", off.status === 404 && off.json.code === "list_off" && (await H.get(`/api/host/events/${plainId}/attendees.csv`)).status === 404);
  check("an event that does not exist: 404", (await H.get("/api/host/events/nope/attendees")).status === 404);
  // The route does not exist on the main site at all.
  const main = await names.all.get(`/api/host/events/${Fid}/attendees`);
  check("on the main site the host route is refused", main.status >= 400 && !main.text.includes("Ann"), main.status);
}

console.log("\n# Everything else a host sees stays aggregate (D004, narrowed to this one list)");
{
  const live = await H.get(`/api/host/events/${Fid}/live`);
  const report = await H.get(`/api/host/events/${Fid}/report`);
  const rcsv = await H.get(`/api/host/events/${Fid}/report.csv`);
  const me = await H.get("/api/host/me");
  const blob = [live.text, report.text, rcsv.text, me.text].join("\n");
  const people = Object.values(names);
  check("the live view, the report, its CSV and the dashboard name nobody, even on an event that keeps the list", [live, report, rcsv, me].every((x) => x.status === 200) && !/Ann All|Cat Card|Eli|Lou List|Ollie|Nora|Una|HYPERLINK/.test(blob) && !people.some((p) => blob.includes(p.id)) && !/@example\.com/.test(blob.replace(/host\d+@work\d+\.example\.com/g, "")), null);
  check("…but count them", live.json.checkins === 8);
  const golden = JSON.parse(readFileSync(new URL("./fixtures/off-event-shapes.json", import.meta.url), "utf8"));
  const { paths } = await import("./fixtures/off-event-shapes.mjs");
  // The same scenario the fixture was made from (same event body, same two check-ins), with the list on.
  const cmp = await mk({ name: "Shape night", venue: "Hall", startsAt: Date.now() + 3600e3, perks: ["Tea"], questions: [{ key: "extra1", label: "Course" }], collect: on() });
  const cmpLive0 = (await H.get(`/api/host/events/${cmp.json.id}/live`)).json;
  const watcher = client({ ip: "10.31.4.1" });
  const evBefore = (await watcher.get(`/api/e/${cmpLive0.event.code}`)).json;
  for (const n of ["Ann Shape", "Ben Shape"]) { const c = await person(n); await c.post(`/api/e/${cmp.json.code || cmpLive0.event.code}/checkin`, { answers: { extra1: "Maths" }, directoryConsent: true, collect: ALL }); }
  const cl = (await H.get(`/api/host/events/${cmp.json.id}/live`)).json, cr = (await H.get(`/api/host/events/${cmp.json.id}/report`)).json;
  const crc = (await H.get(`/api/host/events/${cmp.json.id}/report.csv`)).text.split("\r\n").map((r) => r.split(",").slice(0, 2).join("|")).filter((r) => !/^(Event\|(Name|Code|Starts)|Privacy)/.test(r));
  const added = (now, before) => paths(now).filter((p) => !before.includes(p));
  const missing = (now, before) => before.filter((p) => !paths(now).includes(p));
  // F60 adds two counts to every live view (how many wrote an intention, how many unticked Suggest me; each null under 3).
  check("the live view has gained only the event's collect settings (no name, no list) and F60's two counts, and lost nothing", JSON.stringify(added(cl, golden.live)) === '[".event.collect",".event.collect.attendance",".event.collect.items",".event.collect.organiser",".event.collect.why",".suggestions",".suggestions.intentions",".suggestions.unticked"]' && missing(cl, golden.live).length === 0 && cl.suggestions.intentions === null && cl.suggestions.unticked === null, [added(cl, golden.live), missing(cl, golden.live)]);
  check("the report is field for field the report it was, with the list on", added(cr, golden.report).length === 0 && missing(cr, golden.report).length === 0, [added(cr, golden.report), missing(cr, golden.report)]);
  check("the report's CSV has the same sections and items it had", JSON.stringify(crc) === JSON.stringify(golden.csv), crc);
  const evAfter = (await watcher.get(`/api/e/${cmpLive0.event.code}`)).json;
  check("the attendee's page data has gained only the event's notice (before and after check-in)", JSON.stringify(added(evBefore, golden.eventBefore)) === '[".event.collects",".event.collects.items",".event.collects.items[].key",".event.collects.items[].label",".event.collects.organiser",".event.collects.why"]' && missing(evBefore, golden.eventBefore).length === 0 && JSON.stringify(added(evAfter, golden.eventAfter)) === JSON.stringify(added(evBefore, golden.eventBefore)), [added(evBefore, golden.eventBefore), missing(evBefore, golden.eventBefore)]);
  const present = read("src/views/HostPresent.vue") + read("src/views/HostPrint.vue") + read("src/lib/presentui.js") + read("src/lib/presentpoll.js");
  check("the Present page and the poster read only the live route and never the list (source guard)", !/attendees|HostAttendees|collect/i.test(present) && /hostLive/.test(present));
  const hostApi = read("src/lib/hostapi.js");
  check("only the host's event page asks for the list", [...["src/views/HostPresent.vue", "src/views/HostPrint.vue", "src/views/HostDashboard.vue", "src/views/Hosts.vue"]].every((f) => !/\/attendees|hostAttendees|HostAttendees/.test(read(f))) && /\/attendees/.test(hostApi) && /HostAttendees/.test(read("src/views/HostLive.vue")));
}

console.log("\n# The list is in the host's data download; each person's choices are in theirs");
{
  const ex = await H.get("/api/host/account/export");
  const lists = ex.json.attendeeLists;
  check("the host's download has the list with its CSV for the event that keeps one", ex.status === 200 && lists.length >= 2 && lists.some((l) => l.eventId === Fid && l.count === 6 && l.attendees.some((a) => a.name === "Ann All" && a.email === "ann.all@example.com") && l.csv.includes("Ann All") && !l.csv.includes("Ollie")), lists?.map((l) => [l.eventName, l.count]));
  check("…and nobody else's host sees it in theirs", !("attendeeLists" in (await H2.get("/api/host/account/export")).json));
  const golden = JSON.parse(readFileSync(new URL("./fixtures/off-event-shapes.json", import.meta.url), "utf8"));
  const H3 = await makeHost("10.31.1.3", "Quiet Events");
  await H3.post("/api/host/events", { name: "Quiet" });
  check("a host with no event that keeps a list gets the download it always got (same keys)", JSON.stringify(Object.keys((await H3.get("/api/host/account/export")).json).sort()) === JSON.stringify(golden.hostExport));
  const mine = (await names.all.get("/api/account/export")).json;
  const na = mine.namedAttendance;
  check("a person's download says which lists they are on and what they share", na.onLists.length === 1 && na.onLists[0].eventId === Fid && na.onLists[0].sharing.join() === "email,card" && na.onLists[0].wording === "2026-11-13");
  check("…and every choice with the exact words shown and their version", na.choices.length === 3 && na.choices.every((c) => c.action === "granted" && c.eventId === Fid && c.version === "2026-11-13" && c.wording.includes("Quad Events") && c.wording.includes(WHY)) && na.choices.map((c) => c.scope.split(":")[0]).sort().join() === "event_attendance,event_share_card,event_share_email", na.choices);
  const out = (await names.out.get("/api/account/export")).json.namedAttendance;
  check("a person who unticked everything still has their choices there, as refused, and is on no list", out.onLists.length === 0 && out.choices.length === 3 && out.choices.every((c) => c.action === "refused"), out);
  const quiet = await person("Quiet Person");
  const gotExport = (await quiet.get("/api/account/export")).json;
  check("a person who was never offered a list gets the download they always got (same keys)", JSON.stringify(Object.keys(gotExport).sort()) === JSON.stringify(golden.userExport));
}

console.log("\n# The list goes: account deletion, switching it off, an item removed, the purge");
{
  const G = await mk({ collect: on() });
  const gcode = (await H.get("/api/host/events/" + G.json.id + "/live")).json.event.code;
  const p1 = await person("Gus Gone"), p2 = await person("Gail Stays");
  setEmail(p1.id, "gus@example.com"); setEmail(p2.id, "gail@example.com");
  for (const p of [p1, p2]) await p.post(`/api/e/${gcode}/checkin`, { collect: ALL });
  const listOf = async () => (await H.get(`/api/host/events/${G.json.id}/attendees`)).json;
  check("both are on it", (await listOf()).count === 2);
  const { eraseUser } = await import("../worker/purge.js");
  await eraseUser(env, p1.id);
  const afterDelete = await listOf();
  check("deleting an account removes the person from the host's list on the very next request, and their row is gone", afterDelete.count === 1 && afterDelete.attendees[0].name === "Gail Stays" && !JSON.stringify(afterDelete).includes("Gus") && q("SELECT 1 FROM event_attendees WHERE user_id = ?", p1.id).length === 0);
  check("…while the record of what they chose stays (it has no foreign key, as for every consent)", q("SELECT 1 FROM consent_log WHERE user_id = ? AND scope LIKE 'event_attendance:%'", p1.id).length === 1);
  await H.put("/api/host/events/" + G.json.id, { collect: on({ items: ["card"] }) });
  const noEmail = await listOf();
  check("when the host stops asking for the email, it disappears from the list at once (the person's old tick no longer counts)", noEmail.items.join() === "card" && !("email" in noEmail.attendees[0]) && !JSON.stringify(noEmail).includes("gail@example.com"));
  await H.put("/api/host/events/" + G.json.id, { collect: { attendance: false } });
  check("switching the list off deletes the list (the rows go)", q("SELECT 1 FROM event_attendees WHERE event_id = ?", G.json.id).length === 0 && (await H.get(`/api/host/events/${G.json.id}/attendees`)).status === 404);
  await H.put("/api/host/events/" + G.json.id, { collect: on() });
  check("switching it on again does not bring anyone back", (await listOf()).count === 0);
}
// ---------- F31.5 changing your mind: the event hub and Settings ----------
console.log("\n# F31.5 Unticking later takes a person off the host's list on the very next request");
{
  const K = await mk({ collect: on(), directoryOn: false });
  const kcode = (await H.get("/api/host/events/" + K.json.id + "/live")).json.event.code;
  const kid = K.json.id;
  const mkp = async (n, email) => { const p = await person(n); if (email) setEmail(p.id, email); await p.post(`/api/e/${kcode}/checkin`, { collect: ALL }); return p; };
  const amy = await mkp("Amy Mind", "amy@example.com"), bob = await mkp("Bob Mind", "bob@example.com"), cy = await mkp("Cy Mind", "cy@example.com");
  const listNames = async () => (await H.get(`/api/host/events/${kid}/attendees`)).json.attendees.map((a) => a.name).sort().join("|");
  check("all three are on the host's list to begin with", await listNames() === "Amy Mind|Bob Mind|Cy Mind");

  const hub = (await amy.get(`/api/my/events/${kid}`)).json;
  check("the event hub says the organisers keep a list, and offers the choices even with the room off and no sponsors", hub.event.namedAttendance === true && hub.event.hasChoices === true && hub.event.directoryOn === false, hub.event);
  const st = (await amy.get(`/api/e/${kid}/attendance`)).json;
  check("the choices show where she stands, with the organiser, the why line and the exact words of each item", st.on === true && st.attendance === true && st.organiser === "Quad Events" && st.why === WHY && st.label === wordings.items[0].label && st.items.map((i) => [i.key, i.on, i.label].join("=")).join("|") === `email=true=${wordings.items[1].label}|card=true=${wordings.items[2].label}`, st);

  const off = await amy.put(`/api/e/${kid}/attendance`, { attendance: false, email: true, card: true });
  check("unticking the first row answers at once with her new standing", off.status === 200 && off.json.attendance === false && off.json.items.every((i) => i.on === false), off.json);
  check("the host's very next request no longer shows her, and her name is not in it", await listNames() === "Bob Mind|Cy Mind" && !(await H.get(`/api/host/events/${kid}/attendees`)).text.includes("Amy") && !(await H.get(`/api/host/events/${kid}/attendees.csv`)).text.includes("Amy"));
  const lg = logs(amy.id, kid);
  check("it is in consent_log as withdrawn, for the list and for each item, with the wording", lg.filter((x) => x.action === "withdrawn").length === 3 && lg.every((x) => x.wording && x.version === "2026-11-13"), lg.map((x) => x.action));
  check("her row is deleted, not just hidden", q("SELECT 1 FROM event_attendees WHERE event_id = ? AND user_id = ?", kid, amy.id).length === 0);
  check("she is still checked in: the hub still works for her", (await amy.get(`/api/my/events/${kid}`)).status === 200);
  const again = await amy.put(`/api/e/${kid}/attendance`, { attendance: false });
  check("saying the same thing again changes nothing and writes no new record", again.status === 200 && logs(amy.id, kid).length === lg.length);
  const back = await amy.put(`/api/e/${kid}/attendance`, { attendance: true, email: false, card: true });
  check("she can tick it again later: on the list with the card only, the email recorded as not shared", back.json.attendance === true && (await H.get(`/api/host/events/${kid}/attendees`)).json.attendees.find((a) => a.name === "Amy Mind") && !("email" in (await H.get(`/api/host/events/${kid}/attendees`)).json.attendees.find((a) => a.name === "Amy Mind")) && logs(amy.id, kid).filter((x) => x.action === "granted").length === 5, logs(amy.id, kid).map((x) => x.action));

  await bob.put(`/api/e/${kid}/attendance`, { attendance: true, email: false, card: true });
  const bobRow = (await H.get(`/api/host/events/${kid}/attendees`)).json.attendees.find((a) => a.name === "Bob Mind");
  check("unticking only the email takes the email away from the host's next look, and leaves him on the list", !("email" in bobRow) && !!bobRow.card && !(await H.get(`/api/host/events/${kid}/attendees`)).text.includes("bob@example.com"));
  check("…and only the email is logged as withdrawn", logs(bob.id, kid).filter((x) => x.action === "withdrawn").map((x) => x.scope.split(":")[0]).join() === "event_share_email");

  // A missing value is never a tick, on a change as on a check-in.
  const none = await cy.put(`/api/e/${kid}/attendance`, {});
  check("a change that carries no values takes the person off (missing means not ticked, never ticked)", none.json.attendance === false && await listNames() === "Amy Mind|Bob Mind");
  for (const body of [{ attendance: "true" }, { attendance: 1 }, { attendance: "yes", email: true }, { email: true, card: true }]) {
    const r = await cy.put(`/api/e/${kid}/attendance`, body);
    check(`${JSON.stringify(body)}: does not put anyone on the list`, r.status === 200 && r.json.attendance === false && !(await listNames()).includes("Cy"));
  }

  // Who may do it.
  const stranger = await person("Sam Stranger");
  check("someone who did not check in cannot read or change the choices (404) and changes nobody else's", (await stranger.get(`/api/e/${kid}/attendance`)).status === 404 && (await stranger.put(`/api/e/${kid}/attendance`, { attendance: true, email: true, card: true })).status === 404 && !(await listNames()).includes("Sam"));
  check("signed out: reading is refused (401), and changing does nothing (a visitor with no check-in gets 404)", (await client({ ip: "10.31.5.1" }).get(`/api/e/${kid}/attendance`)).status === 401 && [401, 404].includes((await client({ ip: "10.31.5.3" }).put(`/api/e/${kid}/attendance`, { attendance: true })).status) && !(await listNames()).includes("Cy"));
  const hostTries = await H.req("PUT", `/api/e/${kid}/attendance`, { attendance: true }, { origin: HOST_ORIGIN });
  check("the host site does not serve it at all (the host cannot tick for anyone)", hostTries.status >= 400 && !(await listNames()).includes("Cy"), hostTries.status);
  const plain = await mk({ perks: ["Tea"] });
  const pcode2 = (await H.get("/api/host/events/" + plain.json.id + "/live")).json.event.code;
  await amy.post(`/api/e/${pcode2}/checkin`, {});
  check("on an event that keeps no list, there is nothing to read or change, and the hub is as it was", (await amy.get(`/api/e/${plain.json.id}/attendance`)).json.on === false && (await amy.put(`/api/e/${plain.json.id}/attendance`, { attendance: true })).status === 404 && !("namedAttendance" in (await amy.get(`/api/my/events/${plain.json.id}`)).json.event) && q("SELECT 1 FROM event_attendees WHERE event_id = ?", plain.json.id).length === 0);
  const golden = JSON.parse(readFileSync(new URL("./fixtures/off-event-shapes.json", import.meta.url), "utf8"));
  const { paths } = await import("./fixtures/off-event-shapes.mjs");
  const offHub = paths((await amy.get(`/api/my/events/${plain.json.id}`)).json);
  check("the hub for an event without a list has exactly the fields it always had", JSON.stringify(offHub) === JSON.stringify(golden.hub), offHub.filter((p) => !golden.hub.includes(p)));

  console.log("\n# Settings, Privacy and data");
  const mine = (await amy.get("/api/account/attendance")).json.lists;
  check("Settings lists the events whose list she is on, with the same choices", mine.length === 1 && mine[0].id === kid && mine[0].name === "Night" && mine[0].attendance === true && mine[0].items.length === 2, mine);
  await amy.put(`/api/e/${kid}/attendance`, { attendance: false });
  check("after unticking there it is no longer listed, and the host's next request does not show her", (await amy.get("/api/account/attendance")).json.lists.length === 0 && !(await listNames()).includes("Amy"));
  check("a person on no list gets an empty answer; signed out is refused", (await stranger.get("/api/account/attendance")).json.lists.length === 0 && (await client({ ip: "10.31.5.2" }).get("/api/account/attendance")).status === 401);
  const cons = (await amy.get("/api/account/consents")).json.history;
  check("her consent history (Settings) shows the changes, newest first", cons.some((c) => c.scope === `event_attendance:${kid}` && c.action === "withdrawn"));
  const src = (f) => read(f);
  check("the event hub offers the list's choices only for an event that keeps one, and Settings shows the block", /v-if="event\.namedAttendance"/.test(src("src/views/EventDetail.vue")) && /<AttendanceSetting\s*\/>/.test(src("src/views/settings/SettingsPrivacy.vue")));
  check("the choices are rows at least 44 px tall, ticked or not as the server says, each saved at once", /\.att-row\s*\{[^}]*min-height:\s*(4[4-9]|[5-9]\d)px/.test(src("src/components/EventAttendanceChoices.vue")) && /@change="setAll/.test(src("src/components/EventAttendanceChoices.vue")));
  const cv = src("src/components/ConsentHistory.vue");
  check("Settings words the new records: the list, the email and the card, and a refusal reads as declined", /event_attendance:/.test(cv) && /event_share_email:/.test(cv) && /event_share_card:/.test(cv) && /refused/.test(cv));
  check("no shared file knows about any of it (api.js, store.js, profile.js, Icon, Badge, CardView, the entry, either router table)", ["src/lib/api.js", "src/lib/store.js", "src/lib/profile.js", "src/components/Icon.vue", "src/components/Badge.vue", "src/components/CardView.vue", "src/main.js", "src/App.vue", "src/router/index.js", "src/router/routes.attendee.js", "src/router/routes.host.js"].every((f) => !/attendance|collects|HostAttendees|EventCollects|named attendance/i.test(src(f))));
}

console.log("\n# F31.6 The policy, the words, and the files (source guards)");
{
  const pol = read("src/views/Privacy.vue"), terms = read("src/views/Terms.vue");
  check("the Privacy Policy has a named-attendance section: what organisers receive, the basis, how to untick or withdraw later, how long it is kept", /<h2>8d\. An organiser's list of who checked in<\/h2>/.test(pol) && /What the organiser receives/.test(pol) && /Our basis/.test(pol) && /Changing your mind/.test(pol) && /Your choices at this event/.test(pol) && /12 months after the event ends/.test(pol));
  check("it is in the data table, the lawful bases, the 'who sees your data' list and the retention table", /<tr><td>Users who check in to an event whose organiser keeps a list<\/td>/.test(pol) && /an event organiser's list of who came/.test(pol) && /except at an event whose organiser has switched on a list/.test(pol) && /<tr><td>An organiser's list of who checked in, and what you share on it<\/td>/.test(pol));
  check("it says plainly that the email and card items are pre-ticked and need a lawful basis confirmed before launch (an operator note)", /\[Operator: [^\]]*pre-ticked[^\]]*not valid consent[^\]]*lawyer[^\]]*\]/.test(pol));
  check("the Terms say what they now allow (a list, with the untick) and ask hosts to look after what they hold; the Terms version is the one F50 set (2026-11-22)", /keep a list of who came/.test(terms) && /take someone off at once if they ask/.test(terms) && /TERMS_VERSION = "2026-11-22"/.test(read("worker/legal.js")));
  const all = ["src/lib/collects.js", "src/components/EventCollects.vue", "src/components/HostAttendees.vue", "src/components/EventAttendanceChoices.vue", "src/views/settings/AttendanceSetting.vue", "worker/attendance.js", "worker/attendanceApp.js"].map(read).join("\n");
  check("no emoji and no hard-coded colour in anything new (Design System: tokens only)", !/\p{Extended_Pictographic}/u.test(all) && !/#[0-9a-f]{3,8}\b/i.test(all.replace(/&#\d+;/g, "")));
  check("nothing new uses v-html or innerHTML: every word from a host is shown as text", !/v-html|innerHTML|insertAdjacentHTML/.test(all + read("src/components/EventPage.vue")));
  check("collects.js has no imports (the Worker, the page and the host form all read it), and no new route or lazy chunk was added: no import() or defineAsyncComponent in the new files", !/^import /m.test(read("src/lib/collects.js")) && !/\bimport\(|defineAsyncComponent/.test(all) && !/attendan|collect/i.test(read("src/router/routes.host.js") + read("src/router/routes.attendee.js") + read("src/views/HostEvent.vue")));
  check("the new host screens ride in the existing host event chunk: HostLive imports HostAttendees and EventCollects statically", /import HostAttendees from/.test(read("src/views/HostLive.vue")) && /import EventCollects from/.test(read("src/views/HostLive.vue")));
  check("the check-in page notice is part of EventPage (the check-in page's own chunk), not a shared file", /data-collects/.test(read("src/components/EventPage.vue")));
  const c = read("src/lib/collects.js");
  check("the wording of each item and the version are in one place", /NOTICE_VERSION = "2026-11-13"/.test(c) && /Your name and check-in time, on a list the organisers keep of who came/.test(c) && /Your email address, so the organisers can contact you after the event/.test(c) && /Your card, shared with the organisers/.test(c));
  check("only the host event page and the host API file name the host list route", ["worker/events.js", "worker/myevents.js", "worker/host-auth.js"].every((f) => !/hostAttendees|attendees\.csv/.test(read(f))) && /hostAttendees/.test(read("worker/hosts.js")));
  check("worker/hosts.js itself reads no attendee table (the list is read in attendance.js, which hosts.js calls): the host-code guards in hostsecurity.mjs still hold", !/\b(FROM|JOIN)\s+(users|consents|cards)\b/i.test(read("worker/hosts.js")) && read("worker/hosts.js").match(/event_attendees/g).length === 1);
  check("the Worker only reads an attendee's email through the list's CASE, never a plain column select for the host", /CASE WHEN \?2 = 1 AND ea\.items LIKE '%"email"%' AND u\.email_verified = 1 THEN u\.recovery_email END/.test(read("worker/attendance.js")) && (read("worker/attendance.js").match(/recovery_email/g) || []).length === 1);
}

// ---------- last: these run the clock years ahead, which also expires every host session ----------
{
  // The 12-month rule on a simulated clock (the same end rule as the event's status).
  const { purgeExpired } = await import("../worker/purge.js");
  const { purgeAttendees, ATTENDEES_KEEP_MS } = await import("../worker/attendance.js");
  const DAY = 86400_000, YEAR = 365 * DAY, T0 = Date.UTC(2027, 0, 10, 12, 0, 0);
  const raw = env.DB.raw;
  const user = (id) => raw.prepare("INSERT OR IGNORE INTO users (id, created_at, last_seen_at, is_guest) VALUES (?, ?, ?, 0)").run(id, T0, T0);
  const mkEvent = (id, cols) => {
    raw.prepare("INSERT INTO events (id, code, name, created_at, collect_attendance, collect_items, collect_why, starts_at, ends_at, ended_at) VALUES (?, ?, ?, ?, 1, '[]', 'To keep a register', ?, ?, ?)")
      .run(id, "P" + id.slice(-4).toUpperCase(), "Purge " + id, T0, cols.starts ?? null, cols.ends ?? null, cols.ended ?? null);
    user("pu-" + id);
    raw.prepare("INSERT INTO checkins (event_id, user_id, created_at) VALUES (?, ?, ?)").run(id, "pu-" + id, cols.checkin ?? cols.starts ?? T0);
    raw.prepare("INSERT INTO event_attendees (event_id, user_id, items, notice_version, created_at, updated_at) VALUES (?, ?, '[]', 'v', ?, ?)").run(id, "pu-" + id, cols.checkin ?? cols.starts ?? T0, T0);
  };
  const has = (id) => raw.prepare("SELECT 1 FROM event_attendees WHERE event_id = ?").all(id).length > 0;
  check("the retention period is 12 months (365 days) and the daily purge runs it", ATTENDEES_KEEP_MS === YEAR && /purgeAttendees/.test(read("worker/purge.js")));
  mkEvent("pe-endsat", { starts: T0, ends: T0 + 5 * 3600_000 });
  mkEvent("pe-hostended", { starts: T0, ends: T0 + 30 * DAY, ended: T0 + 2 * 3600_000 });
  mkEvent("pe-noend", { starts: T0, checkin: T0 + 3600_000 });
  mkEvent("pe-future", { starts: T0 + 2 * YEAR, ends: T0 + 2 * YEAR + 3600_000, checkin: T0 });
  const endsAt = T0 + 5 * 3600_000, hostEnded = T0 + 2 * 3600_000, noEnd = T0 + 3600_000 + 12 * 3600_000 + 1;
  await purgeExpired(env, hostEnded + YEAR - 1);
  check("one millisecond before 12 months after the earliest end, every list is still there", has("pe-endsat") && has("pe-hostended") && has("pe-noend") && has("pe-future"));
  await purgeExpired(env, hostEnded + YEAR);
  check("an event the host ended early is held to the moment they ended it (not the planned end): its list goes, the others stay", !has("pe-hostended") && has("pe-endsat") && has("pe-noend"));
  await purgeExpired(env, endsAt + YEAR - 1);
  check("an event with an end time keeps its list until 12 months after that time", has("pe-endsat"));
  await purgeExpired(env, endsAt + YEAR);
  check("…and 12 months after its end time the list is deleted", !has("pe-endsat") && has("pe-noend"));
  await purgeExpired(env, noEnd + YEAR - 1);
  check("an event with no end time ends 12 hours after the later of its start and the person's check-in; one millisecond before 12 months after that it is still there", has("pe-noend"));
  const gone = await purgeExpired(env, noEnd + YEAR);
  check("…and at that moment it goes; the purge says how many it deleted", !has("pe-noend") && gone.attendees === 1, gone.attendees);
  check("an event that has not happened yet keeps its list however long the clock runs on", has("pe-future") && (await purgeAttendees(env.DB, T0 + YEAR)) === 0 && has("pe-future"));
  check("the purge is safe to run twice: a second run deletes nothing more", (await purgeAttendees(env.DB, noEnd + 2 * YEAR)) === 0 && has("pe-future"));
  check("the purge leaves the record of what each person chose (consent_log) alone", q("SELECT 1 FROM consent_log WHERE scope LIKE 'event_attendance:%'").length > 0);

}

console.log("\n# The host reset wipes the lists");
{
  const reset = await import("../scripts/reset-hosts.mjs");
  const r = makeDb().raw;
  r.exec(`INSERT INTO users (id, created_at, last_seen_at) VALUES ('ru1', 1, 1);
    INSERT INTO orgs (id, name, plan, org_type, verification_status, created_at) VALUES ('ro1', 'Reset Org', 'starter', 'company', 'approved', 1);
    INSERT INTO events (id, org_id, code, name, created_at, collect_attendance, collect_items, collect_why) VALUES ('re1', 'ro1', 'RS2RS', 'Reset night', 1, 1, '["email"]', 'To keep a register');
    INSERT INTO checkins (event_id, user_id, created_at) VALUES ('re1', 'ru1', 1);
    INSERT INTO event_attendees (event_id, user_id, items, notice_version, created_at, updated_at) VALUES ('re1', 'ru1', '["email"]', 'v', 1, 1);
    INSERT INTO consent_log (id, user_id, scope, action, ref, at, wording, version) VALUES ('rl1', 'ru1', 'event_attendance:re1', 'granted', 're1', 1, 'words', 'v');`);
  const before = r.prepare(reset.COUNT_SQL).get();
  check("the dry run counts the lists", before.event_attendees === 1 && reset.WIPED.includes("event_attendees") && reset.WIPED.indexOf("event_attendees") < reset.WIPED.indexOf("events"), before.event_attendees);
  r.exec("BEGIN"); r.exec(reset.wipeSql(before, 1794300000000)); r.exec("COMMIT");
  const after = r.prepare(reset.COUNT_SQL).get();
  check("after the wipe there are no lists and the script's own check passes", after.event_attendees === 0 && reset.verify(before, after).length === 0, reset.verify(before, after));
  check("the attendee keeps their account and the record of what they chose (consent_log is kept)", after.users_kept === 1 && after.consent_log_kept >= before.consent_log_kept && r.prepare("SELECT wording FROM consent_log WHERE id = 'rl1'").get().wording === "words");
  check("a database without migration 0028 is refused by the script's schema check", makeDb({ before: "0028" }).raw.prepare(reset.SCHEMA_SQL).get().n === 6 && makeDb().raw.prepare(reset.SCHEMA_SQL).get().n === 9 && makeDb({ before: "0029" }).raw.prepare(reset.SCHEMA_SQL).get().n === 7); // 0029 (F32) adds the eighth table, 0040 (F60) the ninth
  check("the script's header and its refusal message name 0028", /0018, 0023, 0025, 0027, 0028, 0029 and 0040/.test(read("scripts/reset-hosts.mjs")) && /0027, 0028, 0029 and 0040 are not all applied/.test(read("scripts/reset-hosts.mjs")));
}

summary();
process.exit(process.exitCode || 0);
