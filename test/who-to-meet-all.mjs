// F60: intention at check-in and "Who to meet" for everyone checked in (D054). Each line of the plan's privacy and
// safety bar is a check here, with its negative cases. Run: node test/who-to-meet-all.mjs
import { readFileSync } from "node:fs";
import { makeEnv, makeDb, check, summary, becomeHost, PNG } from "./harness.mjs";
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

// ------------------------------------------------------------------ F60.2
console.log("\n# F60.2 setup: a live event and the people around it");
const meet = await mkEvent({ name: "Meet night", directoryOn: true });
const other = await mkEvent({ name: "Other night", directoryOn: true });
const A = await signup("Amy Asker", { tags: ["Design"], headline: "Product designer" });
const B = await signup("Ben Banker", { tags: ["Finance"], headline: "Analyst in training" });
const C = await signup("Cat Quiet", { tags: ["Finance"], headline: "Finance person who unticked" });
const D = await signup("Dan Blocked", { tags: ["Finance"] });
const E = await signup("Eli Blocker", { tags: ["Finance"] });
const F = await signup("Fay Elsewhere", { tags: ["Finance"] });
const G = await signup("Gus Hidden", { mode: "career", company: "Acme", role: "Analyst", course: "SecretCourse", tags: ["HiddenTag"], headline: "Gus line" });
const N = await signup("Nia Nowhere"); // never checks in here
await checkIn(A, meet, { suggest: true, intention: "Meet people in finance" });
await checkIn(B, meet, { suggest: true }); // wrote no intention
await checkIn(C, meet, { suggest: false });
await checkIn(D, meet); await checkIn(E, meet); await checkIn(G, meet);
await checkIn(F, other);
const gCard = q1("SELECT id FROM cards WHERE user_id = ? AND is_default = 1", G.id).id;
raw.prepare("UPDATE cards SET tags = ? WHERE id = ?").run(JSON.stringify(["Chess"]), gCard); // the card G shares hides the profile tag
raw.prepare("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)").run(A.id, D.id, Date.now());
raw.prepare("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)").run(E.id, A.id, Date.now());
const list = (p, ev = meet) => p.c.post(`/api/e/${ev.id}/who-to-meet`, {});
const names = (r) => (r.json?.people || []).map((x) => x.name);

console.log("\n# Who may see the list");
{
  const anon = client({ ip: "10.60.252.1" });
  const a1 = await anon.post(`/api/e/${meet.id}/who-to-meet`, {});
  check("signed out: refused (401 or, once a guest exists, 403 not checked in), never a list", [401, 403].includes(a1.status) && !a1.json.people, a1.status);
  check("signed out: reading your choice is 401", (await client({ ip: "10.60.252.2" }).get(`/api/e/${meet.id}/suggest`)).status === 401);
  const n = await list(N);
  check("signed in but not checked in: 403 not_checked_in", n.status === 403 && n.json.code === "not_checked_in", n.json);
  const f = await list(F);
  check("checked in to another event only: 403", f.status === 403 && f.json.code === "not_checked_in");
  const fOwn = await list(F, other);
  check("another event's list never has this event's people", fOwn.status === 200 && !names(fOwn).some((x) => /Amy|Ben|Cat|Dan|Eli|Gus/.test(x)), names(fOwn));
  const c = await list(C);
  check("someone who unticked Suggest me sees no list either (403 suggest_me_off)", c.status === 403 && c.json.code === "suggest_me_off" && !c.json.people);
  check("an event that does not exist: 404", (await A.c.post("/api/e/nope/who-to-meet", {})).status === 404);
  const ended = await mkEvent({ name: "Done night", startsAt: t0 - 5 * H, endsAt: t0 - H });
  await checkIn(A, ended); await checkIn(B, ended);
  const e = await list(A, ended);
  check("an ended event shows none (403 not_ongoing)", e.status === 403 && e.json.code === "not_ongoing" && !e.json.people);
  const soon = await mkEvent({ name: "Soon night", startsAt: t0 + 3 * H, endsAt: t0 + 6 * H });
  await checkIn(A, soon); await checkIn(B, soon);
  check("an event that has not started shows none", (await list(A, soon)).json.code === "not_ongoing");
  const off = await mkEvent({ name: "Off night", suggestOn: false });
  await checkIn(A, off); await checkIn(B, off);
  raw.prepare("INSERT INTO event_suggest (id, event_id, user_id, suggest, intention, notice_version, created_at, updated_at) VALUES ('sx1', ?, ?, 1, 'Meet people', 'v', 1, 1), ('sx2', ?, ?, 1, '', 'v', 1, 1)").run(off.id, A.id, off.id, B.id);
  const o = await list(A, off);
  check("host switch off: 403 suggest_off and no people, even with rows in the table", o.status === 403 && o.json.code === "suggest_off" && !o.json.people);
  check("…and the hub's own state says so, so the section does not show", (await A.c.get(`/api/e/${off.id}/suggest`)).json.why === "suggest_off");
}

console.log("\n# The list: everyone suggested, without AI, and nothing they do not show");
{
  const r = await list(A);
  check("A, who wrote 'Meet people in finance', sees Ben (tag Finance, no intention) with a reason about finance", r.status === 200 && r.json.ai === false && names(r).includes("Ben B.") && r.json.people.find((p) => p.name === "Ben B.").reason === "Into Finance", r.json);
  check("…and never Cat, who unticked", !names(r).some((x) => x.startsWith("Cat")));
  check("…never the viewer", !names(r).some((x) => x.startsWith("Amy")));
  check("blocks both ways: not Dan (A blocked him) nor Eli (he blocked A)", !names(r).some((x) => /^(Dan|Eli)/.test(x)));
  check("…and Amy is not in Dan's or Eli's list either", !names(await list(D)).includes("Amy A.") && !names(await list(E)).includes("Amy A."));
  const keys = r.json.people.map((p) => Object.keys(p).sort().join());
  check("each entry has exactly id, name, headline, tags, intention and reason (photo only with Be easy to find)", keys.length > 0 && keys.every((k) => k === "headline,id,intention,name,reason,tags"), keys);
  check("the top-level answer is { mode, ai, people } and nothing else", Object.keys(r.json).sort().join() === "ai,mode,people");
  const blob = JSON.stringify(r.json);
  check("no user id, card id, email, surname or link anywhere in the answer", ![A, B, C, D, E, G].some((p) => blob.includes(p.id)) && !q("SELECT id FROM cards").some((x) => blob.includes(x.id)) && !/@|https?:|Banker|Hidden\b|\/c\//.test(blob), blob.slice(0, 300));
  check("names are first name and last initial", names(r).every((n) => /^[A-Z][a-z]+ [A-Z]\.$/.test(n)), names(r));
  check("tags: at most three each", r.json.people.every((p) => Array.isArray(p.tags) && p.tags.length <= 3));
  const all = JSON.stringify([(await list(B)).json, (await list(D)).json, r.json]);
  check("a kept-but-hidden field never shows in anyone's list: Gus's course and the profile tag his card hides", !all.includes("SecretCourse") && !all.includes("HiddenTag"));
  const b = await list(B);
  check("Ben, who wrote no intention, still sees suggestions himself, with Amy in them", b.status === 200 && names(b).includes("Amy A."), names(b));
  const amyForBen = b.json.people.find((p) => p.name === "Amy A.");
  check("…and sees Amy's intention, and a reason drawn from it and his own card", amyForBen.intention === "Meet people in finance" && /finance/i.test(amyForBen.reason), amyForBen);
}

console.log("\n# A photo only for Be easy to find, and only to the people the list may show");
{
  const on = await B.c.put(`/api/e/${meet.id}/presence`, { consent: true, selfieDataUrl: PNG });
  check("(Ben turns on Be easy to find with a photo)", on.status === 200 && !!on.json.selfie, on.json);
  const r = await list(A);
  const ben = r.json.people.find((p) => p.name === "Ben B.");
  check("Ben's entry now has a photo; nobody else's does", ben.photo === on.json.selfie && r.json.people.filter((p) => p.name !== "Ben B.").every((p) => !("photo" in p)));
  check("Amy (Be easy to find off herself) may load it, because Ben is in her list now", (await A.c.get(ben.photo)).status === 200);
  check("Cat (unticked) may not; nor someone not checked in; nor signed out", (await C.c.get(ben.photo)).status === 404 && (await N.c.get(ben.photo)).status === 404 && (await client({ ip: "10.60.252.9" }).get(ben.photo)).status === 404);
  await B.c.put(`/api/e/${meet.id}/suggest`, { suggest: false });
  check("once Ben unticks Suggest me, Amy cannot load his photo through Who to meet", (await A.c.get(ben.photo)).status === 404);
  await B.c.put(`/api/e/${meet.id}/suggest`, { suggest: true });
  raw.prepare("UPDATE events SET directory_on = 0 WHERE id = ?").run(meet.id);
  check("the host's room off: no photo in entries", !(await list(A)).json.people.some((p) => "photo" in p));
  raw.prepare("UPDATE events SET directory_on = 1 WHERE id = ?").run(meet.id);
}

console.log("\n# Changing your mind: the hub and Settings, on the very next request");
{
  check("(Ben is in Amy's list)", names(await list(A)).includes("Ben B."));
  const off = await B.c.put(`/api/e/${meet.id}/suggest`, { suggest: false });
  check("Ben unticks on the hub: his own state says so", off.status === 200 && off.json.suggest === false);
  check("…and he is in nobody's list on the next request", !names(await list(A)).includes("Ben B.") && !names(await list(G)).includes("Ben B."));
  const l = log(meet, B);
  check("…recorded as withdrawn from the hub, with the words and version", l.at(-1).action === "withdrawn" && l.at(-1).ref === "hub" && l.at(-1).wording === SUGGEST_NOTICE && l.at(-1).version === SUGGEST_VERSION, l);
  const s = await B.c.get("/api/account/suggest");
  check("Settings lists the event with the tick off", s.json.events.some((e) => e.id === meet.id && e.suggest === false && e.name === "Meet night"));
  const n0 = log(meet, B).length;
  const back = await B.c.put(`/api/e/${meet.id}/suggest`, { suggest: true, from: "settings" });
  check("ticking it again from Settings puts him back, recorded as granted from settings", back.json.suggest === true && names(await list(A)).includes("Ben B.") && log(meet, B).at(-1).action === "granted" && log(meet, B).at(-1).ref === "settings");
  const same = await B.c.put(`/api/e/${meet.id}/suggest`, { suggest: true });
  check("a save that changes nothing writes no history row", same.status === 200 && log(meet, B).length === n0 + 1);
  const i = await A.c.put(`/api/e/${meet.id}/suggest`, { intention: "Find a summer internship" });
  check("editing the intention on the hub changes it, cleaned, with no consent row", i.json.intention === "Find a summer internship" && row(meet, A).intention === "Find a summer internship" && log(meet, A).length === 1);
  check("bad shapes are refused and change nothing", (await A.c.put(`/api/e/${meet.id}/suggest`, { suggest: "no" })).status === 400 && (await A.c.put(`/api/e/${meet.id}/suggest`, { intention: "x".repeat(121) })).status === 400 && row(meet, A).suggest === 1);
  check("not checked in: changing a choice is 403", (await N.c.put(`/api/e/${meet.id}/suggest`, { suggest: true })).status === 403 && !row(meet, N));
  // Someone who checked in without the notice (before F60): no row; the hub shows the notice and they choose.
  const P = await signup("Pre Fsixty");
  await checkIn(P, meet, {});
  check("someone with no choice yet reads suggest: null and is in nobody's list", (await P.c.get(`/api/e/${meet.id}/suggest`)).json.suggest === null && !names(await list(A)).includes("Pre F."));
  check("…an intention alone without a tick is refused, because they are being shown the notice now", (await P.c.put(`/api/e/${meet.id}/suggest`, { intention: "Hi" })).status === 400 && !row(meet, P));
  await P.c.put(`/api/e/${meet.id}/suggest`, { suggest: true });
  check("…ticking it from the hub puts them in, recorded as granted", names(await list(A)).includes("Pre F.") && log(meet, P)[0].action === "granted");
  await A.c.put(`/api/e/${meet.id}/suggest`, { intention: "Meet people in finance" });
}

console.log("\n# Report and block from the list");
{
  const r = await list(G);
  const amy = r.json.people.find((p) => p.name === "Amy A.");
  check("(Gus sees Amy)", !!amy, names(r));
  check("an id that is not in your list right now is 404 (an unticked person's id, a user id)", (await G.c.post(`/api/e/${meet.id}/who-to-meet/${row(meet, C).id}/report`, { block: true })).status === 404 && (await G.c.post(`/api/e/${meet.id}/who-to-meet/${A.id}/report`, { block: true })).status === 404);
  const someone = r.json.people.find((p) => p.name !== "Amy A.");
  check("a report needs a reason", (await G.c.post(`/api/e/${meet.id}/who-to-meet/${someone.id}/report`, {})).status === 400);
  const b = await G.c.post(`/api/e/${meet.id}/who-to-meet/${amy.id}/report`, { block: true });
  check("blocking works from the list, and both stop seeing each other on the next request", b.status === 200 && !names(await list(G)).includes("Amy A.") && !names(await list(A)).includes("Gus H."));
}

console.log("\n# Limits like F17's");
{
  const R = await signup("Rae Rate");
  await checkIn(R, meet);
  let last;
  for (let i = 0; i < 31; i++) last = await R.c.put(`/api/e/${meet.id}/suggest`, { intention: `Try ${i}` });
  check("30 changes an hour, then 429", last.status === 429 && row(meet, R).intention === "Try 29");
  for (let i = 0; i < 121; i++) last = await list(R);
  check("120 lists an hour, then 429", last.status === 429);
}

console.log("\n# Hosts see counts only, hidden under 3");
{
  const s = (await host.get(`/api/host/events/${meet.id}/live`)).json.suggestions;
  check("the live view has two counts, each a number from 3 up or null", Object.keys(s).sort().join() === "intentions,unticked" && (s.intentions === null || s.intentions >= 3) && (s.unticked === null || s.unticked >= 3), s);
  const tiny = await mkEvent({ name: "Tiny night" });
  const t1 = await signup("Tia One"), t2 = await signup("Tom Two");
  await checkIn(t1, tiny, { suggest: false, intention: "Meet people" }); await checkIn(t2, tiny, { suggest: true, intention: "Find a co-founder" });
  check("two intentions and one untick show as null", JSON.stringify((await host.get(`/api/host/events/${tiny.id}/live`)).json.suggestions) === '{"intentions":null,"unticked":null}');
  const t3 = await signup("Tess Three");
  await checkIn(t3, tiny, { suggest: true, intention: "Learn about careers in law" });
  check("three intentions show as 3", (await host.get(`/api/host/events/${tiny.id}/live`)).json.suggestions.intentions === 3);
  const hostBlob = [(await host.get(`/api/host/events/${tiny.id}/live`)).text, (await host.get(`/api/host/events/${tiny.id}/report`)).text, (await host.get(`/api/host/events/${tiny.id}/report.csv`)).text, (await host.get("/api/host/account/export")).text].join("\n");
  check("no intention, name or suggestion id reaches a host (live, report, CSV, host export)", !/Meet people|co-founder|careers in law|Tia|Tom Two|Tess/.test(hostBlob) && !q("SELECT id FROM event_suggest").some((x) => hostBlob.includes(x.id)));
  const hostFiles = ["worker/hosts.js", "worker/events.js", "worker/host-auth.js", "worker/hostorg.js", "worker/admin.js", "worker/feedback.js", "worker/integrations.js", "worker/eventmail.js", "worker/myevents.js", "worker/attendance.js"];
  const bad = hostFiles.filter((f) => /event_suggest|suggestCandidates|suggestApp|exportSuggest|\.intention\b|intention\s*FROM/i.test(read(f)));
  check("no host-facing file reads the table or an intention per person (events.js only writes at check-in; hosts.js only counts)", bad.length === 0 && /import \{ suggestCounts \} from "\.\/suggest\.js"/.test(read("worker/hosts.js")) && /import \{ readChoice, checkinSuggestStatements \} from "\.\/suggest\.js"/.test(read("worker/events.js")), bad);
  check("the counts are worked out in SQL and only counts leave suggestCounts", /SUM\(CASE WHEN intention != '' THEN 1 ELSE 0 END\)/.test(read("worker/suggest.js")) && /n >= 3 \? n : null/.test(read("worker/suggest.js")));
}

console.log("\n# The hub, the section and Settings (source guards)");
{
  const ui = read("src/components/EventWhoToMeet.vue"), hub = read("src/views/EventDetail.vue"), set = read("src/views/settings/SettingsPrivacy.vue") + read("src/views/settings/SuggestSetting.vue");
  check("the hub shows Who to meet near the top, above the people you met, only while the event is on", /<EventWhoToMeet v-if="status === 'ongoing'"/.test(hub) && hub.indexOf("<EventWhoToMeet") < hub.indexOf('id="hub-people"'));
  check("the section has the intention field with rotating examples, the same tick words and the small print", /<RotatingHint :pool="INTENTION_EXAMPLES"/.test(ui) && /SUGGEST_NOTICE/.test(ui) && /SUGGEST_DETAIL/.test(ui) && /data-suggest-me/.test(ui));
  check("an entry is a button that opens a sheet with no link to a card or contact detail", !/router-link|\/c\/|href=|mailto|cardId|userId/.test(ui) && /Find them in the room and scan their badge to connect\./.test(ui) && /Report or block/.test(ui));
  check("a photo only when the entry has one", /<Avatar v-if="p\.photo"/.test(ui));
  check("'Ranked with AI' only when the answer says ai", /v-if="list\?\.ai"[^>]*>[\s\S]{0,60}Ranked with AI/.test(ui));
  check("Settings, Privacy and data has the block", /<SuggestSetting \/>/.test(set) && /\/api\/account\/suggest/.test(set) && /from: "settings"/.test(set));
  check("no v-html for what people wrote", !/v-html|innerHTML/.test(ui + set));
  check("Be easy to find is now the photo only, and hides when suggestions are off", /Show my photo to people here/.test(read("src/components/EventPresence.vue")) && /!suggestOff/.test(hub));
  const entry = ["src/main.js", "src/App.vue", "src/router/index.js", "src/lib/store.js", "src/lib/api.js", "src/lib/profile.js", "src/lib/shell.js", "src/components/Icon.vue"].filter((f) => /WhoToMeet|who-to-meet|suggestApp|lib\/suggest|event_suggest/.test(read(f)));
  check("no shared or entry file knows about it (it stays in the hub chunk)", entry.length === 0, entry);
  check("the routes all need a signed-in person", (read("worker/suggestApp.js").match(/suggestApp\.(get|put|post|delete)\(/g) || []).length === (read("worker/suggestApp.js").match(/requireUser\(c\)/g) || []).length);
}

summary();
