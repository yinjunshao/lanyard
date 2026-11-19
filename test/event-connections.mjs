// Event analytics: every connection made during an event by two people who both checked in to it is counted for that
// event (worker/eventConnections.js, migration 0033), whatever order the scan and the check-ins happen in.
import { makeEnv, check, summary, becomeHost, readMigration } from "./harness.mjs";

const T = await makeEnv();
const { client, env } = T;
const raw = env.DB.raw;
const H = 3600e3;

async function signup(name, ip) {
  const c = client({ ip });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, course: "Maths", uni: "Test University" });
  if (r.status !== 201) throw new Error(r.text);
  const me = await c.get("/api/me");
  return { c, name, id: me.json.user.id, card: me.json.cards[0].cardId };
}
const host = client({ ip: "10.33.0.1", site: "host" });
const hostInfo = await becomeHost(host, { kind: "company", name: "Analytics Test Co" });
raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES (?, ?, 50, 0, ?, ?)").run("cr-ec", hostInfo.org.json.id, "test", Date.now());
const mkEvent = async (body) => {
  const r = await host.post("/api/host/events", body);
  if (r.status !== 201) throw new Error(r.text);
  return r.json;
};
const checkIn = async (p, ev) => {
  const r = await p.c.post(`/api/e/${ev.code}/checkin`, {});
  if (r.status !== 200) throw new Error(r.text);
};
const connect = async (p, q, ev) => {
  const r = await p.c.post("/api/connect", { cardId: q.card, via: "qr", ...(ev ? { eventId: ev.id } : {}) });
  if (r.status !== 200 && r.status !== 201) throw new Error(r.text);
  return r.json.connectionId;
};
const live = async (ev) => (await host.get(`/api/host/events/${ev.id}/live`)).json.connections;
const report = async (ev) => (await host.get(`/api/host/events/${ev.id}/report`)).json.totals.connections;
const t0 = Date.now();

console.log("\n# Counted while the event is on");
const A = await mkEvent({ name: "Night A", startsAt: t0 - H, endsAt: t0 + 4 * H, directoryOn: true });
const [ann, ben, cat, dan] = [await signup("Ann", "10.33.1.1"), await signup("Ben", "10.33.1.2"), await signup("Cat", "10.33.1.3"), await signup("Dan", "10.33.1.4")];
for (const p of [ann, ben, cat]) await checkIn(p, A);
await connect(ann, ben, A);
check("two checked-in people connecting during the event count for it, on the live screen and the report", (await live(A)) === 1 && (await report(A)) === 1);
await connect(ann, cat); // no event hint from the page
check("a connection with no event hint still counts, because both checked in and it is in the window", (await live(A)) === 2);
await connect(ann, dan);
check("someone who has not checked in does not count (yet)", (await live(A)) === 2);
await checkIn(dan, A);
check("a scan just before the check-in counts once they check in", (await live(A)) === 3);
await connect(dan, ann);
check("scanning the same person again at the same event is not counted twice", (await live(A)) === 3);

console.log("\n# A second meeting at a later event");
const B = await mkEvent({ name: "Night B", startsAt: t0 - H, endsAt: t0 + 4 * H, directoryOn: true });
await checkIn(ann, B); await checkIn(ben, B);
check("people who already connected and both checked in to a new event count there from their check-in", (await live(B)) === 1);
await connect(ben, ann, B);
check("connecting again at it keeps it at one, and the first event keeps its count", (await live(B)) === 1 && (await live(A)) === 3);

console.log("\n# Outside the event's time");
const Old = await mkEvent({ name: "Last week", startsAt: t0 - 7 * 24 * H, endsAt: t0 - 7 * 24 * H + 3 * H, directoryOn: true });
const [eve, fay] = [await signup("Eve", "10.33.1.5"), await signup("Fay", "10.33.1.6")];
await checkIn(eve, Old); await checkIn(fay, Old);
await connect(eve, fay, Old);
check("a connection made a week after the event ended does not count for it", (await live(Old)) === 0);

console.log("\n# Leaving an event");
const left = await cat.c.del(`/api/my/events/${A.id}`);
check("leaving takes that person's connections out of the event's figures", left.status === 200 && (await live(A)) === 2, left.text);

console.log("\n# The migration backfills earlier connections");
{
  const C = await mkEvent({ name: "Night C", startsAt: t0 - 2 * H, endsAt: t0 + 2 * H, directoryOn: true });
  const [gus, hal] = [await signup("Gus", "10.33.1.7"), await signup("Hal", "10.33.1.8")];
  await checkIn(gus, C); await checkIn(hal, C);
  const cn = await connect(gus, hal, C);
  raw.prepare("DELETE FROM event_connections WHERE connection_id = ?").run(cn);
  raw.prepare("UPDATE connections SET event_id = NULL WHERE id = ?").run(cn);
  check("(set-up) the row is gone", (await live(C)) === 0);
  const sql = readMigration("0033_event_connections.sql");
  raw.exec(sql.slice(sql.indexOf("INSERT OR IGNORE")));
  check("running the backfill finds a connection made during an event both checked in to", (await live(C)) === 1 && (await live(A)) === 2 && (await live(Old)) === 0);
}

summary();
