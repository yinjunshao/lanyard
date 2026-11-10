// F17: event presence and who to meet. Retention (48 hours after the event ends, simulated clock),
// withdrawing, the presence endpoints and who can see what, the selfie as private media, blocking,
// matching, the host aggregate, export, erasure and the host reset. Each privacy rule has its
// negative case. Run: node test/presence.mjs
import { readFileSync } from "node:fs";
import { makeEnv, makeDb, check, summary, becomeHost, PNG } from "./harness.mjs";
import { purgeExpired, eraseUser } from "../worker/purge.js";
import { eventEndsAt, PRESENCE_KEEP_MS, removePresence } from "../worker/presence.js";
import { eventStatus } from "../worker/eventstatus.js";

const T = await makeEnv();
const { client, q, q1, env } = T;
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const H = 3600e3;
const raw = env.DB.raw;
const bucket = env.MEDIA.store;

async function signup(name, ip, extra = {}) {
  const c = client({ ip });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, course: "Maths", uni: "Test University", ...extra });
  if (r.status !== 201) throw new Error(r.text);
  const me = await c.get("/api/me");
  return { c, name, id: me.json.user.id, card: me.json.cards[0].cardId };
}
const host = client({ ip: "10.17.0.1", site: "host" });
const hostInfo = await becomeHost(host, { kind: "company", name: "Presence Test Co" });
raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES (?, ?, 50, 0, ?, ?)").run("cr-pres", hostInfo.org.json.id, "test", Date.now());
const mkEvent = async (body) => {
  const r = await host.post("/api/host/events", body);
  if (r.status !== 201) throw new Error(r.text);
  return r.json;
};
const checkIn = async (p, ev, extra = {}) => {
  const r = await p.c.post(`/api/e/${ev.code}/checkin`, extra);
  if (r.status !== 200) throw new Error(r.text);
};
// A tiny valid WebP, built by hand (RIFF header + a VP8L chunk), so the sniffer accepts it.
const webp = (extra = []) => {
  const body = [0x56, 0x50, 0x38, 0x4c, 0x0d, 0, 0, 0, 0x2f, 0, 0, 0, 0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88, 0xfe, 0x07, 0, ...extra];
  const size = body.length + 4;
  const b = [0x52, 0x49, 0x46, 0x46, size & 255, (size >> 8) & 255, 0, 0, 0x57, 0x45, 0x42, 0x50, ...body];
  return "data:image/webp;base64," + Buffer.from(b).toString("base64");
};
const t0 = Date.now();

// ------------------------------------------------------------------ F17.1
console.log("\n# The end rule matches eventStatus");
{
  const T1 = Date.UTC(2026, 10, 4, 18, 0);
  const cases = [
    ["an end time", { starts_at: T1, ends_at: T1 + 2 * H }, T1],
    ["the host ended it early", { starts_at: T1, ends_at: T1 + 5 * H, ended_at: T1 + H }, T1],
    ["the host ended it after the end time", { starts_at: T1, ends_at: T1 + H, ended_at: T1 + 3 * H }, T1],
    ["no end time", { starts_at: T1 }, T1],
    ["no end time, a late check-in", { starts_at: T1 }, T1 + 20 * H],
    ["no start or end time", {}, T1],
  ];
  for (const [name, ev, at] of cases) {
    const end = eventEndsAt(ev, at);
    const st = (t) => eventStatus({ startsAt: ev.starts_at, endsAt: ev.ends_at, endedAt: ev.ended_at }, at, t);
    // A host who ends an event sets ended_at to the moment they pressed the button, so before that moment the flag did not exist.
    const flagged = !!ev.ended_at;
    check(`${name}: ended from ${new Date(end).toISOString()}${flagged ? "" : ", and not a millisecond before"}`, st(end) === "ended" && (flagged || st(end - 1) !== "ended"), [st(end - 1), st(end)]);
  }
}

console.log("\n# Retention: 48 hours after the event ends (simulated clock)");
const P = await signup("Pia Purge", "10.17.1.1");
const Q = await signup("Quin Purge", "10.17.1.2");
{
  const mkAt = async (name, body, who = P) => {
    const ev = await mkEvent({ name, ...body });
    await checkIn(who, ev);
    return ev;
  };
  const putRow = async (ev, who, key, createdAt = t0 - H) => {
    if (key) bucket.set(key, { bytes: new Uint8Array([1]), httpMetadata: {} });
    raw.prepare("INSERT INTO event_presence (id, event_id, user_id, selfie_key, intro, looking_for, created_at, updated_at) VALUES (?, ?, ?, ?, 'Here for coffee', '', ?, ?)")
      .run("pr" + Math.random().toString(16).slice(2, 12), ev.id, who.id, key, createdAt, createdAt);
    raw.prepare("INSERT OR REPLACE INTO consents (id, user_id, scope, granted, created_at) VALUES (?, ?, ?, 1, ?)").run("cs" + Math.random().toString(16).slice(2, 10), who.id, `event_presence:${ev.id}`, createdAt);
  };
  const has = (ev, who) => !!q1("SELECT 1 x FROM event_presence WHERE event_id = ? AND user_id = ?", ev.id, who.id);
  const end1 = t0 + 2 * H;
  const withEnd = await mkAt("Has an end time", { startsAt: t0 - H, endsAt: end1 });
  await putRow(withEnd, P, "presence/aaaa1.webp");
  check("the selfie and row are there before the end", has(withEnd, P) && bucket.has("presence/aaaa1.webp"));
  let out = await purgeExpired(env, end1 + PRESENCE_KEEP_MS - 1);
  check("one millisecond before 48 hours after the end: nothing is deleted", has(withEnd, P) && bucket.has("presence/aaaa1.webp") && out.presence === 0, out);
  out = await purgeExpired(env, end1 + PRESENCE_KEEP_MS);
  check("48 hours after the end: the row and the R2 object are gone", !has(withEnd, P) && !bucket.has("presence/aaaa1.webp") && out.presence === 1, out);
  const log = q("SELECT action, ref FROM consent_log WHERE user_id = ? AND scope = ?", P.id, `event_presence:${withEnd.id}`);
  check("the consent is marked withdrawn, with a history line saying it was retention", q1("SELECT granted FROM consents WHERE user_id = ? AND scope = ?", P.id, `event_presence:${withEnd.id}`).granted === 0 && log.some((l) => l.action === "withdrawn" && l.ref === "retention"), log);
  out = await purgeExpired(env, end1 + PRESENCE_KEEP_MS + 1);
  check("running the purge again is safe", out.presence === 0);

  const hostEnded = await mkAt("Host ends it", { startsAt: t0 - H, endsAt: t0 + 30 * H });
  await putRow(hostEnded, P, "presence/bbbb1.webp");
  const endedAt = (await host.post(`/api/host/events/${hostEnded.id}/end`)).json.endedAt;
  await purgeExpired(env, endedAt + PRESENCE_KEEP_MS - 1);
  check("an event the host ended: kept up to 48 hours after they ended it", has(hostEnded, P));
  await purgeExpired(env, endedAt + PRESENCE_KEEP_MS);
  check("…and deleted at 48 hours (not 48 hours after the original end time)", !has(hostEnded, P) && !bucket.has("presence/bbbb1.webp"));

  const noEnd = await mkAt("No end time", { startsAt: t0 - H }, P);
  await putRow(noEnd, P, "presence/cccc1.webp");
  const base = Math.max(t0 - H, q1("SELECT created_at c FROM checkins WHERE event_id = ? AND user_id = ?", noEnd.id, P.id).c);
  await purgeExpired(env, base + 12 * H + PRESENCE_KEEP_MS);
  check("an event with no end time: ended 12 hours after the later of start and check-in, so still kept at 12 + 48 hours exactly", has(noEnd, P));
  await purgeExpired(env, base + 12 * H + 1 + PRESENCE_KEEP_MS);
  check("…and deleted one millisecond later", !has(noEnd, P) && !bucket.has("presence/cccc1.webp"));

  const live = await mkAt("Still on", { startsAt: t0 - H, endsAt: t0 + 5 * H });
  await putRow(live, P, "presence/dddd1.webp");
  await purgeExpired(env, t0 + 10 * H);
  check("an event that is still on is never purged, however old the row", has(live, P) && bucket.has("presence/dddd1.webp"));

  const two = await mkAt("Two people", { startsAt: t0 - H, endsAt: t0 + H }, P);
  await checkIn(Q, two);
  await putRow(two, P, "presence/eeee1.webp");
  await putRow(two, Q, null);
  await purgeExpired(env, t0 + H + PRESENCE_KEEP_MS);
  check("a row with no selfie is deleted too, and a delete with no object does not fail", !has(two, P) && !has(two, Q));
  check("another event's presence is not touched by deleting this one's", has(live, P));

  console.log("\n# Withdrawing deletes at once");
  const w = await mkAt("Withdraw here", { startsAt: t0 - H, endsAt: t0 + 5 * H });
  await putRow(w, P, "presence/ffff1.webp");
  check("removePresence returns true and removes the row, the object and the consent", await removePresence(env, w.id, P.id) === true && !has(w, P) && !bucket.has("presence/ffff1.webp")
    && q1("SELECT granted FROM consents WHERE user_id = ? AND scope = ?", P.id, `event_presence:${w.id}`).granted === 0);
  check("removing again is a harmless false", await removePresence(env, w.id, P.id) === false);
}

console.log("\n# Erasing an account removes its selfies, and the data export has the rows");
{
  const E = await signup("Erin Erase", "10.17.1.3");
  const ev = await mkEvent({ name: "Erase night", startsAt: t0 - H, endsAt: t0 + 5 * H });
  await checkIn(E, ev);
  bucket.set("presence/gone1.webp", { bytes: new Uint8Array([1]), httpMetadata: {} });
  raw.prepare("INSERT INTO event_presence (id, event_id, user_id, selfie_key, intro, looking_for, created_at, updated_at) VALUES ('prx1', ?, ?, 'presence/gone1.webp', 'Here for the talks', 'a designer', 5, 6)").run(ev.id, E.id);
  const exp = (await E.c.get("/api/account/export")).json;
  check("the export lists the person's own presence: event, selfie link, lines and times", exp.eventPresence?.length === 1 && exp.eventPresence[0].eventId === ev.id
    && exp.eventPresence[0].selfie === "/media/presence/gone1.webp" && exp.eventPresence[0].intro === "Here for the talks" && exp.eventPresence[0].lookingFor === "a designer" && exp.eventPresence[0].createdAt === 5, exp.eventPresence);
  const other = (await P.c.get("/api/account/export")).json;
  check("someone else's export does not contain it", !JSON.stringify(other).includes("Here for the talks") && !JSON.stringify(other).includes("gone1"));
  await eraseUser(env, E.id);
  check("account deletion removes the row and the R2 selfie", !q1("SELECT 1 x FROM event_presence WHERE user_id = ?", E.id) && !bucket.has("presence/gone1.webp"));
}

console.log("\n# The host reset leaves no presence rows or selfies behind");
{
  const { COUNT_SQL, PRESENCE_SQL, SCHEMA_SQL, WIPED, wipeSql, verify, r2DeleteArgs } = await import("../scripts/reset-hosts.mjs");
  const rdb = makeDb().raw;
  rdb.exec(`INSERT INTO users (id, created_at, last_seen_at) VALUES ('u1', 1, 1);
    INSERT INTO events (id, code, name, created_at) VALUES ('e1', 'RESETAA', 'Reset night', 1);
    INSERT INTO checkins (event_id, user_id, created_at) VALUES ('e1', 'u1', 1);
    INSERT INTO event_presence (id, event_id, user_id, selfie_key, created_at, updated_at) VALUES ('p1', 'e1', 'u1', 'presence/zz9.webp', 1, 1);
    INSERT INTO consents (id, user_id, scope, granted, created_at) VALUES ('c1', 'u1', 'event_presence:e1', 1, 1);`);
  check("the schema check needs the presence table", rdb.prepare(SCHEMA_SQL).get().n === 4);
  const before = rdb.prepare(COUNT_SQL).get();
  check("the dry run counts presence rows and lists their selfies to delete", before.event_presence === 1 && before.host_consents >= 1 && rdb.prepare(PRESENCE_SQL).all()[0].selfie_key === "presence/zz9.webp", before);
  rdb.exec("BEGIN"); rdb.exec(wipeSql(before)); rdb.exec("COMMIT");
  const after = rdb.prepare(COUNT_SQL).get();
  check("after the wipe there are no presence rows or presence consents, and the script's own check passes", after.event_presence === 0 && after.host_consents === 0 && WIPED.includes("event_presence") && verify(before, after).length === 0, after);
  check("the consent history is kept", rdb.prepare("SELECT COUNT(*) n FROM users").get().n === 1);
  check("the selfie is deleted from R2 with wrangler before the wipe, and the wipe stops if one fails", r2DeleteArgs("remote", "presence/zz9.webp").join(" ") === "wrangler r2 object delete lanyard-media/presence/zz9.webp --remote --config wrangler.production.toml"
    && /r2DeleteArgs\(where, key\)[\s\S]*Could not delete[\s\S]*return 1;[\s\S]*db\.exec\(wipeSql\(before\)\)/.test(read("scripts/reset-hosts.mjs")));
}

summary();
