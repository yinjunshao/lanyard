// F60: intention at check-in and "Who to meet" for everyone checked in (D054). Each line of the plan's privacy and
// safety bar is a check here, with its negative cases. Run: node test/who-to-meet-all.mjs
import { readFileSync } from "node:fs";
import { makeEnv, makeDb, check, summary, becomeHost } from "./harness.mjs";
import { purgeExpired, eraseUser } from "../worker/purge.js";
import { eventEndsAt } from "../worker/presence.js";
import { SUGGEST_KEEP_MS, readChoice } from "../worker/suggest.js";
import { SUGGEST_NOTICE, SUGGEST_VERSION, INTENTION_MAX } from "../src/lib/suggest.js";
import { INTENTION_EXAMPLES } from "../src/lib/examples.js";

const T = await makeEnv();
const { client, q, q1, env } = T;
const raw = env.DB.raw;
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const H = 3600e3;
const t0 = Date.now();

let ipN = 1;
async function signup(name, extra = {}) {
  const c = client({ ip: `10.60.${Math.floor(ipN / 200)}.${(ipN++ % 200) + 1}` });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, course: "Maths", uni: "Test University", ...extra });
  if (r.status !== 201) throw new Error(r.text);
  const me = await c.get("/api/me");
  return { c, name, id: me.json.user.id };
}
const host = client({ ip: "10.60.250.1", site: "host" });
const hostInfo = await becomeHost(host, { kind: "company", name: "Suggest Test Co" });
raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES (?, ?, 80, 0, ?, ?)").run("cr-sug", hostInfo.org.json.id, "test", Date.now());
const mkEvent = async (body) => {
  const r = await host.post("/api/host/events", { startsAt: t0 - H, endsAt: t0 + 5 * H, ...body });
  if (r.status !== 201) throw new Error(r.text);
  return r.json;
};
const checkIn = async (p, ev, extra = { suggest: true }) => {
  const r = await p.c.post(`/api/e/${ev.code}/checkin`, extra);
  if (r.status !== 200) throw new Error(r.text);
  return r;
};
const row = (ev, p) => q1("SELECT * FROM event_suggest WHERE event_id = ? AND user_id = ?", ev.id, p.id);
const log = (ev, p) => q("SELECT action, ref, wording, version FROM consent_log WHERE user_id = ? AND scope = ? ORDER BY at", p.id, `event_suggest:${ev.id}`);

// ------------------------------------------------------------------ F60.1
console.log("\n# The migration is additive");
{
  const old = makeDb({ before: "0040" }).raw;
  old.exec("INSERT INTO events (id, code, name, created_at) VALUES ('e1', 'OLDEVT', 'Old night', 1)");
  const db = makeDb().raw;
  const cols = db.prepare("PRAGMA table_info(events)").all().map((c) => c.name);
  const ddl = read("migrations/0040_event_suggest.sql").replace(/--.*$/gm, "");
  check("0040 adds one column with a default and one table, and drops or changes nothing", /ALTER TABLE events ADD COLUMN suggest_on INTEGER NOT NULL DEFAULT 1/.test(ddl) && /CREATE TABLE IF NOT EXISTS event_suggest/.test(ddl) && !/^\s*(DROP|UPDATE|DELETE|INSERT)|(RENAME|DROP COLUMN)/im.test(ddl) && cols.includes("suggest_on"));
  check("an event made before it (or by the old code) has suggestions on, the owner's default", (() => { db.exec("INSERT INTO events (id, code, name, created_at) VALUES ('e2', 'NEWEVT', 'Night', 1)"); return db.prepare("SELECT suggest_on FROM events WHERE id = 'e2'").get().suggest_on === 1; })());
  check("both ids cascade, so the row goes with the account and the event", /user_id TEXT NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/.test(ddl) && /event_id TEXT NOT NULL REFERENCES events\(id\) ON DELETE CASCADE/.test(ddl));
}

console.log("\n# The words and the examples");
{
  check("the notice is the plan's sentence, word for word, with a version", SUGGEST_NOTICE === "Suggest me to people here. Others checked in see your name, headline and tags, and your intention if you write one." && /^\d{4}-\d{2}-\d{2}$/.test(SUGGEST_VERSION));
  check("the intention examples are the plan's five and more, none over 120 characters, none repeated", ["Meet people who work in finance", "Find a summer internship", "Find a co-founder", "Learn about careers in law", "Meet other designers"].every((x) => INTENTION_EXAMPLES.includes(x)) && INTENTION_EXAMPLES.every((x) => x.length <= INTENTION_MAX) && new Set(INTENTION_EXAMPLES).size === INTENTION_EXAMPLES.length && INTENTION_MAX === 120);
  check("reading a choice: only a real true or false counts; an intention is one cleaned line of up to 120", readChoice({ suggest: "yes" }).error && readChoice({ suggest: 1 }).error && readChoice({ suggest: false }).suggest === false
    && readChoice({ intention: "  Find\u0000 a  co-founder " }).intention === "Find a co-founder" && readChoice({ intention: "x".repeat(121) }).error && readChoice({ intention: 5 }).error && readChoice({}).suggest === undefined);
}

console.log("\n# Check-in records the intention and the tick, with the words and version");
const live = await mkEvent({ name: "Suggest night", directoryOn: true });
{
  const A = await signup("Ada Lovell");
  await checkIn(A, live, { suggest: true, intention: "  Meet people in   finance " });
  const r = row(live, A);
  check("ticked at check-in: a row with Suggest me on, the cleaned intention and the version", r && r.suggest === 1 && r.intention === "Meet people in finance" && r.notice_version === SUGGEST_VERSION && r.id.length === 20 && r.id !== A.id, r);
  const l = log(live, A);
  check("…and one history row, granted at check-in, with the exact words and their version", l.length === 1 && l[0].action === "granted" && l[0].ref === "checkin" && l[0].wording === SUGGEST_NOTICE && l[0].version === SUGGEST_VERSION, l);
  await checkIn(A, live, { suggest: false, intention: "Changed my mind" });
  check("checking in again does not change the row or add a history row (the hub and Settings do that)", row(live, A).suggest === 1 && row(live, A).intention === "Meet people in finance" && log(live, A).length === 1);

  const C = await signup("Cy Untick");
  await checkIn(C, live, { suggest: false });
  check("unticked at check-in: a row with Suggest me off, recorded as refused", row(live, C).suggest === 0 && log(live, C)[0].action === "refused" && log(live, C)[0].wording === SUGGEST_NOTICE);

  for (const [label, body] of [["no tick sent (an old page or a script)", {}], ["a string", { suggest: "true" }], ["a number", { suggest: 1 }], ["null", { suggest: null }], ["only an intention", { intention: "Hello" }]]) {
    const p = await signup(`Nob ${label.slice(0, 6)}`);
    await checkIn(p, live, body);
    check(`${label}: checked in, nothing about suggestions recorded, so nobody is assumed in`, !row(live, p) && log(live, p).length === 0);
  }
  const L = await signup("Lon Gwords");
  const long = await L.c.post(`/api/e/${live.code}/checkin`, { suggest: true, intention: "x".repeat(121) });
  check("an intention over 120 characters is refused before anything is written (no check-in, no row)", long.status === 400 && long.json.code === "bad_suggest" && !q1("SELECT 1 x FROM checkins WHERE event_id = ? AND user_id = ?", live.id, L.id) && !row(live, L), long.json);

  const off = await mkEvent({ name: "Quiet night", suggestOn: false });
  const O = await signup("Oli Offon");
  await checkIn(O, off, { suggest: true, intention: "Meet people" });
  check("an event with the host's switch off records nothing, whatever the request says", !row(off, O) && log(off, O).length === 0);
  const pub = await client({ ip: "10.60.251.1" }).get(`/api/e/${off.code}`);
  const pubOn = await client({ ip: "10.60.251.2" }).get(`/api/e/${live.code}`);
  check("the check-in page data says suggestOn: false only when it is off, and nothing new otherwise", pub.json.event.suggestOn === false && !("suggestOn" in pubOn.json.event), [pub.json.event.suggestOn, Object.keys(pubOn.json.event)]);
}

console.log("\n# The host's switch: on by default, in Create event and Details, copied by a copy");
{
  const ev = await mkEvent({ name: "Default night" });
  check("a new event has suggestions on", q1("SELECT suggest_on FROM events WHERE id = ?", ev.id).suggest_on === 1);
  const off = await mkEvent({ name: "Switched off", suggestOn: false });
  check("Create with suggestOn: false switches it off", q1("SELECT suggest_on FROM events WHERE id = ?", off.id).suggest_on === 0);
  const l1 = await host.get(`/api/host/events/${off.id}/live`), l2 = await host.get(`/api/host/events/${ev.id}/live`);
  check("the live view says suggestOn: false only when it is off", l1.json.event.suggestOn === false && !("suggestOn" in l2.json.event));
  await host.put(`/api/host/events/${ev.id}`, { suggestOn: false });
  check("Details switches it off", q1("SELECT suggest_on FROM events WHERE id = ?", ev.id).suggest_on === 0);
  await host.put(`/api/host/events/${ev.id}`, { name: "Renamed" });
  check("a Details save that leaves it out changes nothing", q1("SELECT suggest_on FROM events WHERE id = ?", ev.id).suggest_on === 0);
  await host.put(`/api/host/events/${ev.id}`, { suggestOn: true });
  check("…and back on", q1("SELECT suggest_on FROM events WHERE id = ?", ev.id).suggest_on === 1);
  const cp = await host.post(`/api/host/events/${off.id}/duplicate`, { name: "Copy" });
  check("a copy keeps the earlier event's setting, like the attendee room", cp.status === 201 && q1("SELECT suggest_on FROM events WHERE id = ?", cp.json.id).suggest_on === 0);
  const steps = read("src/components/EventStepAtEvent.vue"), details = read("src/views/HostLive.vue"), form = read("src/lib/eventform.js");
  check("step 3 and Details both have the switch, worded the same", /v-model="form\.suggestOn"/.test(steps) && /v-model="d\.suggestOn"/.test(details) && /Suggest people to each other/.test(steps) && /Suggest people to each other/.test(details) && /SUGGEST_HOST_HELP/.test(steps) && /SUGGEST_HOST_HELP/.test(details));
  check("Create sends suggestOn only when it is off; Details always says which", /f\.suggestOn === false \? \{ suggestOn: false \}/.test(form) && /suggestOn: d\.suggestOn !== false/.test(form));
}

console.log("\n# The check-in page (and the host's preview, the same component)");
{
  const page = read("src/components/EventPage.vue"), join = read("src/views/EventJoin.vue");
  check("the page asks what you hope to get, optional, with the rotating examples and the 120 limit", /INTENTION_LABEL/.test(page) && /\(optional\)/.test(page) && /<RotatingHint :pool="INTENTION_EXAMPLES"/.test(page) && /:maxlength="INTENTION_MAX"/.test(page));
  check("the tick shows the notice's own words, is on to start with, and the small print says you can still check in", /SUGGEST_NOTICE/.test(page) && /SUGGEST_DETAIL/.test(page) && /props\.form\.suggest = true/.test(page) && /suggest: true, intention: ""/.test(join) && /you can still check in/.test(read("src/lib/suggest.js")));
  check("the section shows unless the host switched suggestions off", /v-if="event\.suggestOn !== false"/.test(page));
  check("EventJoin sends the tick as a plain true or false and the trimmed intention, only for an event with it on", /event\.value\.suggestOn !== false \? \{ suggest: form\.suggest === true, intention: String\(form\.intention \|\| ""\)\.trim\(\) \}/.test(join));
  check("the preview reads the same rule (eventFromBody says suggestOn: false only when it is off)", /b\.suggestOn === false \? \{ suggestOn: false \}/.test(read("src/lib/eventform.js")));
  check("no v-html for anything a person typed", !/v-html/.test(page));
}

console.log("\n# Retention: 48 hours after the event ends (fixed clock), the account, the export");
{
  const T1 = Date.UTC(2026, 10, 24, 18, 0);
  const ended = await mkEvent({ name: "Ends", startsAt: T1, endsAt: T1 + 2 * H });
  const P = await signup("Pat Purge");
  await checkIn(P, ended, { suggest: true, intention: "Find a co-founder" });
  raw.prepare("UPDATE checkins SET created_at = ? WHERE event_id = ? AND user_id = ?").run(T1 + 10 * 60e3, ended.id, P.id);
  const end = eventEndsAt({ starts_at: T1, ends_at: T1 + 2 * H }, T1);
  await purgeExpired(env, end + SUGGEST_KEEP_MS - 1);
  check("one millisecond before 48 hours after the end, the intention and the choice are still there", !!row(ended, P));
  await purgeExpired(env, end + SUGGEST_KEEP_MS);
  check("at 48 hours after the end, the row is gone (intention and choice)", !row(ended, P));
  check("…and the record of the choice stays, as for every choice (6 years)", log(ended, P).length === 1);
  const hostEnd = await mkEvent({ name: "Host ended", startsAt: T1, endsAt: T1 + 10 * H });
  await checkIn(P, hostEnd);
  raw.prepare("UPDATE events SET ended_at = ? WHERE id = ?").run(T1 + H, hostEnd.id);
  await purgeExpired(env, T1 + H + SUGGEST_KEEP_MS - 1);
  const keptA = !!row(hostEnd, P);
  await purgeExpired(env, T1 + H + SUGGEST_KEEP_MS);
  check("an event the host ended early: 48 hours after the host ended it", keptA && !row(hostEnd, P));
  const noEnd = await mkEvent({ name: "No end", startsAt: T1, endsAt: null });
  await checkIn(P, noEnd);
  raw.prepare("UPDATE checkins SET created_at = ? WHERE event_id = ? AND user_id = ?").run(T1, noEnd.id, P.id);
  const e3 = eventEndsAt({ starts_at: T1 }, T1);
  await purgeExpired(env, e3 + SUGGEST_KEEP_MS - 1);
  const keptB = !!row(noEnd, P);
  await purgeExpired(env, e3 + SUGGEST_KEEP_MS);
  check("an event with no end time: by the same end rule as the status", keptB && !row(noEnd, P));
  const stillOn = await mkEvent({ name: "Still on" });
  await checkIn(P, stillOn);
  await purgeExpired(env, Date.now());
  check("never while the event is on", !!row(stillOn, P));

  const X = await signup("Xan Export");
  check("a person never shown the notice gets the download they always got (no eventSuggestions key)", !("eventSuggestions" in (await X.c.get("/api/account/export")).json));
  await checkIn(X, live, { suggest: true, intention: "Learn about careers in law" });
  const ex = (await X.c.get("/api/account/export")).json.eventSuggestions;
  check("the download has their row (event, the choice, the intention) and every choice with its words and version", ex && ex.events.length === 1 && ex.events[0].eventId === live.id && ex.events[0].suggestMe === true && ex.events[0].intention === "Learn about careers in law" && ex.choices.length === 1 && ex.choices[0].wording === SUGGEST_NOTICE && ex.choices[0].version === SUGGEST_VERSION, ex);
  check("…and nothing about anyone else", !JSON.stringify(ex).includes("Meet people in finance"));
  await eraseUser(env, X.id);
  check("account deletion takes the rows with it", q("SELECT * FROM event_suggest WHERE user_id = ?", X.id).length === 0);
}

console.log("\n# The host reset wipes the rows with the events");
{
  const { WIPED, SCHEMA_SQL } = await import("../scripts/reset-hosts.mjs");
  check("event_suggest is wiped before the events, and the script needs 0040", WIPED.indexOf("event_suggest") !== -1 && WIPED.indexOf("event_suggest") < WIPED.indexOf("events") && /event_suggest/.test(SCHEMA_SQL) && makeDb({ before: "0040" }).raw.prepare(SCHEMA_SQL).get().n === 8 && makeDb().raw.prepare(SCHEMA_SQL).get().n === 9);
}

summary();
