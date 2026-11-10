// F13: connection provenance (how a connection was made). Migration 0021 on old
// rows, the whitelist and first-write-only rule on POST /api/connect, what the
// people list, one person and the card page return, export, deletion, and that
// hosts never see it. The URL, wording and screen checks come with later tasks.
// Run: node test/provenance.mjs
import { makeEnv, makeDb, readMigration, check, summary, becomeHost } from "./harness.mjs";
import { eraseUser } from "../worker/purge.js";
import { readFileSync } from "node:fs";

const T = await makeEnv();
const { client, q1, q, env } = T;

async function signup(name, ip) {
  const c = client({ ip });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true });
  if (r.status !== 201) throw new Error(r.text);
  const me = await c.get("/api/me");
  return { c, id: me.json.user.id, card: me.json.cards[0].cardId };
}
const viaInDb = (id) => q1("SELECT via FROM connections WHERE id = ?", id).via;

console.log("\n# Migration 0021 on connections in the old shape");
{
  const db = makeDb({ before: "0021" });
  db.exec("INSERT INTO users (id, created_at) VALUES ('u1', 1), ('u2', 1)");
  db.exec("INSERT INTO connections (id, user_a, user_b, created_at) VALUES ('c1', 'u1', 'u2', 5)");
  db.exec(readMigration("0021_connection_via.sql"));
  const r = await db.prepare("SELECT via, created_at FROM connections WHERE id = 'c1'").first();
  check("an existing connection keeps its date and has no provenance (NULL, not a guess)", r.via === null && r.created_at === 5, r);
  const sql = readMigration("0021_connection_via.sql").replace(/--.*$/gm, "").trim();
  check("the migration is one additive ADD COLUMN, safe to apply before the new code", /^ALTER TABLE connections ADD COLUMN via TEXT;$/.test(sql), sql);
}

console.log("\n# Recording how a connection was made");
const A = await signup("Alice", "10.13.0.1");
const via = async (v, ip, extra = {}) => {
  const p = await signup("P" + Math.random().toString(16).slice(2, 6), ip);
  const body = { cardId: A.card, ...extra };
  if (v !== undefined) body.via = v;
  const r = await p.c.post("/api/connect", body);
  return { p, r, id: r.json?.connectionId };
};
{
  const qr = await via("qr", "10.13.1.1");
  const code = await via("code", "10.13.1.2");
  const link = await via("link", "10.13.1.3");
  check("qr, code and link are stored as sent", qr.r.status === 200 && viaInDb(qr.id) === "qr" && viaInDb(code.id) === "code" && viaInDb(link.id) === "link");
  const none = await via(undefined, "10.13.1.4");
  check("no value counts as a link", none.r.status === 200 && viaInDb(none.id) === "link");
  for (const [i, bad] of ["QR", "scan", "", null, 7, { x: 1 }, ["qr"], "qr; DROP TABLE connections"].entries()) {
    const b = await via(bad, `10.13.2.${i + 1}`);
    check(`an unknown value (${JSON.stringify(bad)}) counts as a link and is not stored as sent`, b.r.status === 200 && viaInDb(b.id) === "link");
  }
  check("the connections table is still there", !!q1("SELECT count(*) n FROM connections"));
}

console.log("\n# Only the first connection sets it");
{
  const first = await via("qr", "10.13.3.1");
  const again = await first.p.c.post("/api/connect", { cardId: A.card, via: "code" });
  check("a second scan by the same person does not change it", again.status === 200 && again.json.connectionId === first.id && viaInDb(first.id) === "qr");
  const back = await A.c.post("/api/connect", { cardId: (await first.p.c.get("/api/me")).json.cards[0].cardId, via: "link" });
  check("nor does the other person scanning back", back.status === 200 && back.json.connectionId === first.id && viaInDb(first.id) === "qr");
  env.DB.raw.prepare("UPDATE connections SET via = NULL WHERE id = ?").run(first.id);
  await first.p.c.post("/api/connect", { cardId: A.card, via: "qr" });
  check("an old connection with no provenance stays unknown after a re-scan (nothing is invented)", viaInDb(first.id) === null);
}

console.log("\n# What the API returns");
{
  const B = await signup("Bea", "10.13.4.1");
  const r = await B.c.post("/api/connect", { cardId: A.card, via: "code" });
  const id = r.json.connectionId;
  const list = (await B.c.get("/api/connections")).json.connections.find((x) => x.id === id);
  check("the people list returns via", list && list.via === "code" && "eventName" in list && typeof list.metAt === "number", list);
  const one = (await B.c.get(`/api/connections/${id}`)).json;
  check("one person returns via, the event name and the time", one.via === "code" && one.eventName === "" && typeof one.metAt === "number", one);
  const card = (await B.c.get(`/api/c/${A.card}`)).json;
  check("the card page returns via on the connection", card.viewer.connection.via === "code" && card.viewer.connection.metAt === one.metAt, card.viewer.connection);
  const theirs = (await A.c.get(`/api/connections/${id}`)).json;
  check("the other person sees the same provenance", theirs.via === "code" && theirs.metAt === one.metAt);
  const stranger = await signup("Eve", "10.13.4.2");
  check("someone outside the connection cannot read it", (await stranger.c.get(`/api/connections/${id}`)).status === 404);
  const pub = (await stranger.c.get(`/api/c/${A.card}`)).json;
  check("a card page for a non-connection carries no connection", pub.viewer.connection === null);
  env.DB.raw.prepare("UPDATE connections SET via = NULL WHERE id = ?").run(id);
  const old = (await B.c.get(`/api/connections/${id}`)).json;
  check("an old connection returns via null, never undefined", old.via === null && "via" in old);
  check("and null in the people list and on the card page", (await B.c.get("/api/connections")).json.connections.find((x) => x.id === id).via === null
    && (await B.c.get(`/api/c/${A.card}`)).json.viewer.connection.via === null);
}

console.log("\n# At an event, and when the event has gone");
{
  const H = client({ ip: "10.13.5.1", site: "host" });
  await becomeHost(H, { kind: "company", name: "ProvCo", email: "h@provco.test" });
  const ev = (await H.post("/api/host/events", { name: "Spring networking night", startsAt: Date.now() - 3600e3, endsAt: Date.now() + 3600e3 })).json;
  const P = await signup("Pia", "10.13.5.2");
  const Q = await signup("Quin", "10.13.5.3");
  await P.c.post(`/api/e/${ev.code}/checkin`, {});
  await Q.c.post(`/api/e/${ev.code}/checkin`, {});
  const r = await Q.c.post("/api/connect", { cardId: P.card, via: "qr", eventId: ev.id });
  const id = r.json.connectionId;
  const mine = (await Q.c.get(`/api/connections/${id}`)).json;
  const theirs = (await P.c.get(`/api/connections/${id}`)).json;
  check("both people get the method and the event name", mine.via === "qr" && mine.eventName === "Spring networking night" && theirs.via === "qr" && theirs.eventName === "Spring networking night", { mine, theirs });
  check("the people list has the event name too", (await Q.c.get("/api/connections")).json.connections.find((x) => x.id === id).eventName === "Spring networking night");
  // F10's host reset sets event_id to NULL; an event can also be deleted.
  env.DB.raw.prepare("UPDATE connections SET event_id = NULL WHERE id = ?").run(id);
  const gone = (await Q.c.get(`/api/connections/${id}`)).json;
  check("with the event gone the method stays and the event reads as empty", gone.via === "qr" && gone.eventName === "" && gone.event === undefined, gone);
  const cardGone = (await Q.c.get(`/api/c/${P.card}`)).json.viewer.connection;
  check("the card page agrees (via kept, no event)", cardGone.via === "qr" && cardGone.event === null);
  env.DB.raw.prepare("UPDATE connections SET event_id = ? WHERE id = ?").run("0000000000", id);
  const ghost = (await Q.c.get(`/api/connections/${id}`)).json;
  check("an event id that points at nothing reads as no event, not an error", ghost.eventName === "" && ghost.via === "qr");
  check("the host reset script does not touch via", !/\bvia\b/.test(readFileSync("scripts/reset-hosts.mjs", "utf8")));
}

console.log("\n# Export and deletion");
{
  const B = await signup("Cy", "10.13.6.1");
  const D = await signup("Di", "10.13.6.2");
  const r = await B.c.post("/api/connect", { cardId: D.card, via: "qr" });
  const id = r.json.connectionId;
  const mine = (await B.c.get("/api/account/export")).json.connections.find((x) => x.id === id);
  const theirs = (await D.c.get("/api/account/export")).json.connections.find((x) => x.id === id);
  check("each person's data download has via and the time they connected", mine?.via === "qr" && typeof mine.metAt === "number" && theirs?.via === "qr", { mine, theirs });
  env.DB.raw.prepare("UPDATE connections SET via = NULL WHERE id = ?").run(id);
  check("an old connection exports as null", (await B.c.get("/api/account/export")).json.connections.find((x) => x.id === id).via === null);
  env.DB.raw.prepare("UPDATE connections SET via = 'qr' WHERE id = ?").run(id);

  const del = await B.c.del(`/api/connections/${id}`);
  check("deleting the connection removes the row and so the provenance", del.status === 200 && !q1("SELECT 1 x FROM connections WHERE id = ?", id));
  check("and it is gone from the other person's download", !(await D.c.get("/api/account/export")).json.connections.some((x) => x.id === id));

  const E = await signup("Ed", "10.13.6.3");
  const F = await signup("Flo", "10.13.6.4");
  const r2 = await E.c.post("/api/connect", { cardId: F.card, via: "code" });
  await eraseUser(env, E.id);
  check("deleting an account removes its connections and their provenance", !q1("SELECT 1 x FROM connections WHERE id = ?", r2.json.connectionId));
  check("no row anywhere keeps a method for a deleted person", q("SELECT id FROM connections WHERE user_a = ? OR user_b = ?", E.id, E.id).length === 0);
}

console.log("\n# Hosts never see it (D004)");
{
  const hostCode = ["worker/hosts.js", "worker/events.js", "worker/host-auth.js", "worker/hostorg.js", "worker/admin.js", "worker/feedback.js", "worker/integrations.js", "worker/eventmail.js"]
    .map((f) => [f, readFileSync(f, "utf8")]);
  const bad = hostCode.filter(([, s]) => /\bcn?\.via\b|connections\.via|\.via\b|\bvia\s*[,)]|["'`]via["'`]/.test(s)).map(([f]) => f);
  check("no host, admin, report, webhook or event mail code reads connections.via", bad.length === 0, bad);
  const H = client({ ip: "10.13.7.1", site: "host" });
  await becomeHost(H, { kind: "company", name: "SeeCo", email: "h@seeco.test" });
  const ev = (await H.post("/api/host/events", { name: "See Night", startsAt: Date.now() - 3600e3, endsAt: Date.now() + 3600e3 })).json;
  const X = await signup("Xan", "10.13.7.2");
  const Y = await signup("Yu", "10.13.7.3");
  await X.c.post(`/api/e/${ev.code}/checkin`, {});
  await Y.c.post(`/api/e/${ev.code}/checkin`, {});
  await Y.c.post("/api/connect", { cardId: X.card, via: "qr", eventId: ev.id });
  const res = [
    await H.get(`/api/host/events/${ev.id}/report`), await H.get(`/api/host/events/${ev.id}/report.csv`),
    await H.get(`/api/host/events/${ev.id}/live`), await H.get("/api/host/account/export"),
  ];
  check("those four host responses all answered (so the check below is not empty)", res.every((r) => r.status === 200), res.map((r) => r.status));
  const seen = JSON.stringify(res.map((r) => r.json ?? r.text));
  check("the host's report, CSV, live view and export carry no per-person provenance", !/"via"|qr code|\bvia\b/i.test(seen), seen.slice(0, 200));
}

summary();
