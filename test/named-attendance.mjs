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

summary();
process.exit(process.exitCode || 0);
