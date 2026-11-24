// F15: the Events tab and the event hub. The status rule (Worker and app copies, clock edges),
// the my-events API, the one-event API and what it will and will not return, and source guards
// for the tab, the pages and the budget. Run: node test/events-hub.mjs
import { readFileSync } from "node:fs";
import { makeEnv, check, summary, becomeHost, PNG } from "./harness.mjs";
import { eventStatus as serverStatus, NO_END_GRACE_MS } from "../worker/eventstatus.js";
import { eventStatus as appStatus } from "../src/lib/eventstatus.js";

process.env.TZ = "Europe/London"; // the date checks below read the viewer's zone
const T0 = await makeEnv();
const { client, q1, env } = T0;
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const H = 3600e3;

console.log("\n# Status rule (one helper, Worker and app)");
{
  const same = read("worker/eventstatus.js") === read("src/lib/eventstatus.js");
  check("the Worker and app copies of the helper are identical", same);
  const T = Date.UTC(2026, 10, 4, 18, 0);
  const cases = [
    // [name, event, checkedInAt, now, expected]
    ["started, no end time, just checked in", { startsAt: T }, T + 4 * 60e3, T + 5 * 60e3, "ongoing"],
    ["no start and no end time, just checked in", {}, T, T + 60e3, "ongoing"],
    ["starts exactly now", { startsAt: T, endsAt: T + 2 * H }, T - H, T, "ongoing"],
    ["checked in an hour early", { startsAt: T, endsAt: T + 2 * H }, T - H, T - 1, "upcoming"],
    ["upcoming with no end time", { startsAt: T }, T - H, T - 60e3, "upcoming"],
    ["one millisecond before the end time", { startsAt: T, endsAt: T + 2 * H }, T, T + 2 * H - 1, "ongoing"],
    ["exactly at the end time", { startsAt: T, endsAt: T + 2 * H }, T, T + 2 * H, "ended"],
    ["after the end time", { startsAt: T, endsAt: T + 2 * H }, T, T + 3 * H, "ended"],
    ["the host ended it mid-event", { startsAt: T, endsAt: T + 2 * H, endedAt: T + H }, T, T + H + 1, "ended"],
    ["the host ended it with no end time set", { startsAt: T, endedAt: T + H }, T, T + H, "ended"],
    ["the host ended it before it started", { startsAt: T, endedAt: T - 5 * 60e3 }, T - H, T - 60e3, "ended"],
    ["no end time: exactly 12 hours after the start is still on", { startsAt: T }, T, T + NO_END_GRACE_MS, "ongoing"],
    ["no end time: 12 hours and a millisecond after the start", { startsAt: T }, T, T + NO_END_GRACE_MS + 1, "ended"],
    ["no end time: a late check-in counts from the check-in", { startsAt: T }, T + 20 * H, T + 31 * H, "ongoing"],
    ["no end time: 12 hours after a late check-in", { startsAt: T }, T + 20 * H, T + 32 * H + 1, "ended"],
    ["no start or end time: counts from the check-in", {}, T, T + NO_END_GRACE_MS + 1, "ended"],
    ["an end time stops the 12 hour rule", { startsAt: T, endsAt: T + 30 * H }, T, T + 20 * H, "ongoing"],
    ["null fields behave as unset", { startsAt: null, endsAt: null, endedAt: null }, T, T + H, "ongoing"],
    ["no event at all does not throw", undefined, T, T, "ongoing"],
  ];
  for (const [name, ev, at, t, want] of cases) {
    const a = serverStatus(ev, at, t), b = appStatus(ev, at, t);
    check(`${name}: ${want}`, a === want && b === want, { a, b });
  }
}

// ---------------------------------------------------------------- the API
async function signup(name, ip) {
  const c = client({ ip });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, course: "Maths", uni: "Test University" });
  if (r.status !== 201) throw new Error(r.text);
  const me = await c.get("/api/me");
  return { c, name, id: me.json.user.id, card: me.json.cards[0].cardId };
}
const host = client({ ip: "10.15.0.1", site: "host" });
const hostInfo = await becomeHost(host, { kind: "company", name: "Hub Test Co" });
env.DB.raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES (?, ?, 20, 0, ?, ?)").run("cr-hub", hostInfo.org.json.id, "test", Date.now());
const mkEvent = async (body) => {
  const r = await host.post("/api/host/events", body);
  if (r.status !== 201) throw new Error(r.text);
  return r.json;
};
const checkIn = async (p, ev, extra = {}) => {
  const r = await p.c.post(`/api/e/${ev.code}/checkin`, extra);
  if (r.status !== 200) throw new Error(r.text);
};
const connect = async (from, to, body = {}) => {
  const r = await from.c.post("/api/connect", { cardId: to.card, ...body });
  if (r.status !== 200) throw new Error(r.text);
  return r.json.connectionId;
};
const A = await signup("Alice Hub", "10.15.1.1"), B = await signup("Bea Hub", "10.15.1.2");
const C = await signup("Cal Hub", "10.15.1.3"), D = await signup("Dee Hub", "10.15.1.4");
const t0 = Date.now();
const live = await mkEvent({ name: "Running now", startsAt: t0 - H, endsAt: t0 + 2 * H, venue: "Hall 1", directoryOn: true });
const past = await mkEvent({ name: "Over already", startsAt: t0 - 30 * H, endsAt: t0 - 28 * H });
const later = await mkEvent({ name: "Starts later", startsAt: t0 + 3 * H, endsAt: t0 + 6 * H });
const open = await mkEvent({ name: "No end time", startsAt: t0 - H });
for (const p of [A, B, C]) await checkIn(p, live, { directoryConsent: true });
for (const ev of [past, later, open]) await checkIn(A, ev);

console.log("\n# GET /api/my/events");
{
  const unsigned = await client({ ip: "10.15.9.1" }).get("/api/my/events");
  check("signed-out people are refused", unsigned.status === 401, unsigned.status);
  const r = await A.c.get("/api/my/events");
  const by = Object.fromEntries(r.json.events.map((e) => [e.name, e]));
  check("each event has a status for me", by["Running now"].status === "ongoing" && by["Over already"].status === "ended" && by["Starts later"].status === "upcoming" && by["No end time"].status === "ongoing", r.json.events.map((e) => [e.name, e.status]));
  check("it returns the times and when I checked in", by["Running now"].startsAt === t0 - H && by["Running now"].endsAt === t0 + 2 * H && by["Running now"].endedAt === null && typeof by["Running now"].checkedInAt === "number", by["Running now"]);
  check("it returns the server clock", Math.abs(r.json.now - Date.now()) < 5000);
  check("with no connections every count is 0", r.json.events.every((e) => e.connectionCount === 0));
}

console.log("\n# Connections made at an event");
const cAB = await connect(A, B, { eventId: live.id, via: "qr", selfieDataUrl: PNG, consent: true });
const cAC = await connect(A, C, { via: "code" }); // both checked in lately: the server files it under the event
const cAD = await connect(A, D, { via: "link" }); // D never checked in: no event
check("the server filed A-B and A-C under the event and A-D under none", q1("SELECT event_id FROM connections WHERE id = ?", cAB).event_id === live.id && q1("SELECT event_id FROM connections WHERE id = ?", cAC).event_id === live.id && q1("SELECT event_id FROM connections WHERE id = ?", cAD).event_id === null);
{
  const list = (await A.c.get("/api/my/events")).json.events;
  check("the count is my connections made at this event only", list.find((x) => x.id === live.id).connectionCount === 2 && list.find((x) => x.id === past.id).connectionCount === 0, list.map((x) => [x.name, x.connectionCount]));
  const hub = await A.c.get(`/api/my/events/${live.id}`);
  const j = hub.json;
  check("the hub returns the event, status and my check-in time", hub.status === 200 && j.event.name === "Running now" && j.event.venue === "Hall 1" && j.status === "ongoing" && typeof j.checkedInAt === "number", j);
  check("the connection count equals the people listed, and the list's count", j.connectionCount === j.connections.length && j.connections.length === 2 && j.connectionCount === list.find((x) => x.id === live.id).connectionCount, { n: j.connectionCount, len: j.connections.length });
  const row = j.connections.find((x) => x.peer.name === "Bea Hub");
  check("a person here has a name, subtitle fields, the card, how and when", row && row.peer.course === "Maths" && row.peer.uni === "Test University" && row.cardId === B.card && row.via === "qr" && typeof row.metAt === "number" && row.id === cAB, row);
  check("the selfie I took shows as mine", row.selfie && row.selfie.startsWith("/media/"), row.selfie);
  const bhub = (await B.c.get(`/api/my/events/${live.id}`)).json;
  const arow = bhub.connections.find((x) => x.peer.name === "Alice Hub");
  check("the other person sees the same connection from their side", arow && arow.id === cAB && arow.via === "qr" && bhub.connectionCount === bhub.connections.length);
  check("a selfie I have not accepted is not shown to me", arow.selfie === null, arow.selfie);
  const ids = j.connections.map((x) => x.peer.id).sort();
  check("only people I connected with here are listed (not D, who did not check in)", JSON.stringify(ids) === JSON.stringify([B.id, C.id].sort()), ids);
  check("no email, about text, links or notes are returned about anyone", !/@|"about"|"links"|"note"|"email"|"tags"/.test(JSON.stringify(j)));
  const dhub = await D.c.get(`/api/my/events/${live.id}`);
  check("D, who did not check in, cannot see any of it", dhub.status === 404 && !dhub.text.includes("Bea"), dhub.status);
  const chub = (await C.c.get(`/api/my/events/${live.id}`)).json;
  check("C sees only C's own connection (with A), not A's others", chub.connections.length === 1 && chub.connections[0].peer.id === A.id, chub.connections.map((x) => x.peer.name));
}

console.log("\n# People here (the room size)");
{
  check("it counts the others who chose to be in the room, not me", (await A.c.get(`/api/my/events/${live.id}`)).json.roomCount === 2);
  await C.c.put(`/api/e/${live.id}/choices`, { directory: false });
  check("someone who withdraws drops out of the count at once", (await A.c.get(`/api/my/events/${live.id}`)).json.roomCount === 1);
  const blk = await A.c.post(`/api/connections/${cAB}/report`, { reason: "test", block: true });
  check("a person I blocked is not counted", blk.status === 200 && (await A.c.get(`/api/my/events/${live.id}`)).json.roomCount === 0, blk.status);
  const noDir = await mkEvent({ name: "Directory off", startsAt: t0 - H, endsAt: t0 + H, directoryOn: false });
  await checkIn(A, noDir);
  check("with the directory off the figure is null, so the page leaves it out", (await A.c.get(`/api/my/events/${noDir.id}`)).json.roomCount === null);
}

console.log("\n# Who can open the hub");
{
  const unsigned = await client({ ip: "10.15.9.2" }).get(`/api/my/events/${live.id}`);
  check("signed out: 401", unsigned.status === 401, unsigned.status);
  const bogus = await A.c.get("/api/my/events/nonexistent");
  check("an event that does not exist: 404", bogus.status === 404, bogus.status);
  const upc = await A.c.get(`/api/my/events/${later.id}`);
  check("an upcoming event I checked in to early opens, as upcoming", upc.status === 200 && upc.json.status === "upcoming", upc.json);
}

console.log("\n# Ended");
{
  const before = (await A.c.get(`/api/my/events/${open.id}`)).json;
  const end = await host.post(`/api/host/events/${open.id}/end`);
  const after = (await A.c.get(`/api/my/events/${open.id}`)).json;
  const list = (await A.c.get("/api/my/events")).json.events.find((x) => x.id === open.id);
  check("an event the host ends reads Ended on the very next request, in the hub and the list", before.status === "ongoing" && end.status === 200 && after.status === "ended" && list.status === "ended" && after.event.endedAt === list.endedAt && after.event.endedAt > 0, { before: before.status, after: after.status });
  check("an event whose end time has passed is Ended", (await A.c.get(`/api/my/events/${past.id}`)).json.status === "ended");
  const h = await host.get(`/api/host/events/${live.id}/live`);
  const hr = await host.get(`/api/host/events/${live.id}/report`);
  check("hosts get no connection ids, names or methods for the hub", ![h.text, hr.text].some((t) => t.includes(cAB) || t.includes("Bea Hub") || t.includes('"via"')));
}

console.log("\n# An event that no longer exists");
{
  // What the F10 host reset does: the events go and connections keep their row with the event cleared.
  const gone = await mkEvent({ name: "To be reset", startsAt: t0 - H, endsAt: t0 + H });
  await checkIn(A, gone); await checkIn(D, gone);
  const cn = await connect(D, A, { eventId: gone.id, via: "link" });
  check("the connection was filed under it", q1("SELECT event_id FROM connections WHERE id = ?", cn).event_id === gone.id);
  env.DB.raw.prepare("UPDATE connections SET event_id = NULL WHERE event_id = ?").run(gone.id);
  env.DB.raw.prepare("DELETE FROM checkins WHERE event_id = ?").run(gone.id);
  env.DB.raw.prepare("DELETE FROM events WHERE id = ?").run(gone.id);
  const list = await A.c.get("/api/my/events");
  const hub = await A.c.get(`/api/my/events/${gone.id}`);
  check("it drops out of the list, the others stay, nothing errors", list.status === 200 && !list.json.events.some((e) => e.id === gone.id) && list.json.events.some((e) => e.id === live.id));
  check("its hub is a plain 404 with a message", hub.status === 404 && typeof hub.json.error === "string", hub.status);
  const people = (await A.c.get("/api/connections")).json.connections.find((x) => x.id === cn);
  check("the connection itself stays in People, without the event", people && people.eventId === null && people.eventName === "" && people.via === "link", people);
}

console.log("\n# Words and dates on the pages");
{
  const tx = await import("../src/lib/eventtext.js");
  const checkedIn = Date.UTC(2026, 10, 4, 18, 4); // 18:04 in London in November
  check("the attended date is day, date and year", tx.dateOf(checkedIn) === "Wed 4 Nov 2026", tx.dateOf(checkedIn));
  check("the check-in time is 24-hour", tx.timeOfDay(checkedIn) === "18:04", tx.timeOfDay(checkedIn));
  check("no time reads as nothing, not 'Invalid Date'", tx.dateOf(null) === "" && tx.timeOfDay(undefined) === "");
  check("connections are counted in words, 1 and 0 included", tx.connectionsText(1) === "1 connection" && tx.connectionsText(0) === "0 connections" && tx.connectionsText(5) === "5 connections" && tx.connectionsText(undefined) === "0 connections");
  check("the status is a word, not only a colour", tx.statusText("ongoing", {}) === "In progress" && tx.statusText("ended", {}) === "Ended");
  const soon = Date.now() + 3600e3;
  check("an upcoming event reads 'Starts 18:00', with the day if it is not today", /^Starts \d\d:\d\d$/.test(tx.statusText("upcoming", { startsAt: Date.now() + 1000 })) && /^Starts \w{3} \d+ \w{3} \d{4}, \d\d:\d\d$/.test(tx.statusText("upcoming", { startsAt: soon + 3 * 86400e3 })), tx.statusText("upcoming", { startsAt: soon + 3 * 86400e3 }));
}

console.log("\n# Events page (source guards)");
{
  const page = read("src/views/Events.vue"), tx0 = await import("../src/lib/eventtext.js");
  check("it has In progress, Upcoming and Past events groups (F68)", page.includes('title: "In progress"') && page.includes('title: "Upcoming"') && page.includes("Past events"));
  check("a past event shows 'Attended <date>', its connection count and the word Ended", /Attended \{\{ dateOf\(e\.checkedInAt\) \}\}/.test(page) && /connectionsText\(e\.connectionCount\)/.test(page) && /<EventStatusChip :status="status"/.test(page) && tx0.STATUS_LABEL.ended === "Ended");
  check("an event that is on says so in words from the one status helper", /statusText\(status, e\)/.test(page) && /useEventClock/.test(page) && !/from "\.\.\/lib\/eventstatus/.test(page));
  check("the empty state still says to scan an event QR", page.includes("Scan an event QR to check in"));
  check("status text colours use tokens", !/#[0-9a-f]{3,8}\b/i.test(page.slice(page.indexOf("<style"))));
  check("the page asks for the list once and tells the tab dot", (page.match(/Api\.myEvents\(\)/g) || []).length === 1 && page.includes("setLive("));
}

console.log("\n# Event hub (source guards)");
{
  const hubSrc = read("src/views/EventDetail.vue");
  check("the hub asks for its own event, not the whole list", hubSrc.includes("/api/my/events/${encodeURIComponent(id)}") && !/Api\.myEvents|\/api\/my\/events["'`]/.test(hubSrc));
  check("the hub's request does not add a method to the shared api.js (it is in every page's first load)", !/myEvent\b/.test(read("src/lib/api.js")));
  check("the back arrow goes to My card, or to the Events list only if you came from it", /router\.push\("\/app"\)/.test(hubSrc) && /history\.state\?\.back === "\/app\/events"/.test(hubSrc) && /aria-label="backLabel\(\)"|:aria-label="backLabel\(\)"/.test(hubSrc));
  check("the hub has the stats row, People you met here and its empty text", hubSrc.includes("Connections") && hubSrc.includes("Checked in") && hubSrc.includes("People here") && hubSrc.includes("People you met here") && hubSrc.includes("No connections at this event yet. Scan someone's badge to connect."));
  check("the how-we-met words come from connectedShort, without the event name", /connectedShort\(\{ via: c\.via \}\)/.test(hubSrc));
  check("the stats show the count the server sent, the same number the list is built from", /\{\{ hub\.connectionCount \}\}/.test(hubSrc) && /hub\.value\?\.connections/.test(hubSrc));
  check("the hub says plainly when the event is gone", hubSrc.includes("gone") && hubSrc.includes("it has been removed"));
  check("the room, album and perks tabs are still there", ["Room", "Album", "Perks"].every((t) => hubSrc.includes(`>${t}</button>`)));
  check("choices open in a sheet, and the sheet is the last child of the root", /<UiSheet[^>]*label="Your choices at this event"/.test(hubSrc) && /<\/UiSheet>\s*<\/div>\s*<\/template>/.test(hubSrc));
  check("the choices component no longer draws its own panel", !/class="panel/.test(read("src/components/EventChoices.vue")));
  check("the room tab and the stats keep to tokens (no hard-coded colours)", !/#[0-9a-f]{3,8}\b/i.test(hubSrc.slice(hubSrc.indexOf("<style"))));
  const routes = read("src/router/routes.attendee.js");
  check("both pages stay lazy /app routes", /path: "\/app\/events", component: \(\) => import\("\.\.\/views\/Events\.vue"\), meta: \{ app: true \}/.test(routes) && /path: "\/app\/events\/:id", component: \(\) => import\("\.\.\/views\/EventDetail\.vue"\), meta: \{ app: true \}/.test(routes));
  const entryUsers = ["src/main.js", "src/App.vue", "src/router/index.js", "src/lib/store.js", "src/lib/api.js", "src/lib/profile.js", "src/lib/shell.js"].filter((f) => /eventlive|eventtext|eventstatus/.test(read(f)));
  check("no shared or entry file imports the events code (it stays in /app chunks)", entryUsers.length === 0, entryUsers);
}

console.log("\n# Sheet content flag from the API");
{
  const hub = (await A.c.get(`/api/my/events/${live.id}`)).json;
  check("an event with the room on says it has choices", hub.event.hasChoices === true);
  const quiet = await mkEvent({ name: "No choices", startsAt: t0 - H, endsAt: t0 + H, directoryOn: false });
  await checkIn(B, quiet);
  check("an event with the room off and no sponsors has none, so the hub shows no row", (await B.c.get(`/api/my/events/${quiet.id}`)).json.event.hasChoices === false);
  env.DB.raw.prepare("INSERT INTO sponsors (id, event_id, name, perk) VALUES ('sp-hub', ?, 'Acme', '')").run(quiet.id);
  check("a named sponsor makes it true", (await B.c.get(`/api/my/events/${quiet.id}`)).json.event.hasChoices === true);
}


console.log("\n# Leaving an event");
{
  const ev = await mkEvent({ name: "Leave me", startsAt: Date.now() - H, endsAt: Date.now() + H, directoryOn: true });
  const L1 = await signup("Lee Leave", "10.15.2.1"), L2 = await signup("Lou Stay", "10.15.2.2");
  await checkIn(L1, ev, { directoryConsent: true });
  await checkIn(L2, ev, { directoryConsent: true });
  const cn = await connect(L1, L2, { eventId: ev.id, via: "qr" });
  env.DB.raw.prepare("INSERT INTO event_presence (id, event_id, user_id, selfie_key, intro, looking_for, created_at, updated_at) VALUES ('pl1', ?, ?, NULL, 'hi', '', ?, ?)").run(ev.id, L1.id, Date.now(), Date.now());
  const before = (await host.get(`/api/host/events/${ev.id}/live`)).json;
  const other = await L2.c.del(`/api/my/events/${past.id}`);
  check("you cannot leave an event you never checked in to", other.status === 404, other.status);
  const r = await L1.c.del(`/api/my/events/${ev.id}`);
  check("leaving answers ok", r.status === 200 && r.json.ok, r.text);
  check("the check-in and presence are gone", !q1("SELECT 1 x FROM checkins WHERE event_id = ? AND user_id = ?", ev.id, L1.id) && !q1("SELECT 1 x FROM event_presence WHERE event_id = ? AND user_id = ?", ev.id, L1.id));
  check("every consent for this event is withdrawn and logged", !q1("SELECT 1 x FROM consents WHERE user_id = ? AND granted = 1 AND scope LIKE ?", L1.id, `%:${ev.id}`) && !!q1("SELECT 1 x FROM consent_log WHERE user_id = ? AND action = 'withdrawn' AND scope = ?", L1.id, `event_directory:${ev.id}`));
  check("the connection stays but no longer counts for the event", q1("SELECT event_id FROM connections WHERE id = ?", cn)?.event_id === null);
  const after = (await host.get(`/api/host/events/${ev.id}/live`)).json;
  check("the host's figures drop by one check-in and one connection", after.checkins === before.checkins - 1 && after.connections === before.connections - 1, { before, after });
  check("it is off my events list and the hub is 404", !(await L1.c.get("/api/my/events")).json.events.some((e) => e.id === ev.id) && (await L1.c.get(`/api/my/events/${ev.id}`)).status === 404);
  check("the other person is still checked in", !!q1("SELECT 1 x FROM checkins WHERE event_id = ? AND user_id = ?", ev.id, L2.id));
}

summary();
