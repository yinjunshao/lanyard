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
// Image builders (see the F17.2 section): valid enough for the sniffer and the metadata stripper.
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

// ------------------------------------------------------------------ F17.2
const le = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
const ascii = (t) => [...t].map((ch) => ch.charCodeAt(0));
const chunk = (type, data) => [...ascii(type), ...le(data.length), ...data, ...(data.length & 1 ? [0] : [])];
// A WebP made of a VP8X header (flags say whether EXIF/XMP are present), the picture, and optional metadata.
const webpOf = ({ exif = null, xmp = null } = {}) => {
  const flags = (exif ? 0x08 : 0) | (xmp ? 0x04 : 0);
  const body = [...ascii("WEBP"), ...chunk("VP8X", [flags, 0, 0, 0, 0, 0, 0, 0, 0, 0]), ...chunk("VP8L", [0x2f, 0, 0, 0, 0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88, 0xfe, 0x07]),
    ...(exif ? chunk("EXIF", ascii(exif)) : []), ...(xmp ? chunk("XMP ", ascii(xmp)) : [])];
  return Uint8Array.from([...ascii("RIFF"), ...le(body.length), ...body]);
};
const url = (mime, bytes) => `data:image/${mime};base64,${Buffer.from(bytes).toString("base64")}`;
const jpegOf = (secret) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, ...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
  0xff, 0xe1, 0, secret.length + 8, ...ascii("Exif"), 0, 0, ...ascii(secret), 0xff, 0xed, 0, 4, 80, 83, 0xff, 0xfe, 0, 6, ...ascii("note"),
  0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0x11, 0x22, 0xff, 0xd9]);
const pngWithText = (secret) => {
  const raw = Buffer.from(PNG.split(",")[1], "base64");
  const text = [...le(secret.length + 5).reverse(), ...ascii("tEXt"), ...ascii("GPS:"), 0, ...ascii(secret), 0, 0, 0, 0];
  return Uint8Array.from([...raw.slice(0, 33), ...text, ...raw.slice(33)]);
};
const has = (bytes, text) => Buffer.from(bytes).includes(Buffer.from(text));
const objects = () => [...bucket.keys()].filter((k) => k.startsWith("presence/"));
const bytesOf = (key) => bucket.get(key).bytes;
const state = (id, ev) => q1("SELECT * FROM event_presence WHERE event_id = ? AND user_id = ?", ev.id, id);

console.log("\n# F17.2 setup: one event that is on, and the people around it");
const live = await mkEvent({ name: "Presence night", startsAt: t0 - H, endsAt: t0 + 5 * H, directoryOn: true });
const noDir = await mkEvent({ name: "No directory", startsAt: t0 - H, endsAt: t0 + 5 * H, directoryOn: false });
const later = await mkEvent({ name: "Not yet", startsAt: t0 + 3 * H, endsAt: t0 + 6 * H, directoryOn: true });
const otherNight = await mkEvent({ name: "Elsewhere", startsAt: t0 - H, endsAt: t0 + 5 * H, directoryOn: true });
const A = await signup("Alice Hubbard", "10.17.2.1", { tags: ["robotics", "design"], headline: "Builds robots" });
const B = await signup("Bea Mercer", "10.17.2.2", { tags: ["robotics"], headline: "Studies maths" });
const C = await signup("Cal Doyle", "10.17.2.3");
const D = await signup("Dee Nobody", "10.17.2.4"); // never checks in here
const E = await signup("Eve Elsewhere", "10.17.2.5");
for (const p of [A, B, C]) await checkIn(p, live);
await checkIn(A, noDir); await checkIn(A, later); await checkIn(E, otherNight);
const turnOn = (p, body = {}, ev = live) => p.c.put(`/api/e/${ev.id}/presence`, { consent: true, ...body });
const seen = async (p, ev = live) => (await p.c.get(`/api/e/${ev.id}/suggestions`));
const names = (r) => (r.json?.people || []).map((x) => x.name);

console.log("\n# Off by default; nobody appears without turning it on");
{
  const own = await A.c.get(`/api/e/${live.id}/presence`);
  check("my own state starts off, with nothing stored", own.status === 200 && own.json.on === false && own.json.available === true && own.json.selfie === null && !state(A.id, live), own.json);
  const r = await seen(A);
  check("I cannot see anyone until I am findable myself (no lurking)", r.status === 403 && r.json.code === "presence_off", r);
  await turnOn(B);
  check("someone else turning it on does not put me in their list", names(await seen(B)).length === 0 && !state(A.id, live));
  check("nothing about me is stored for anyone while I am off", q("SELECT * FROM event_presence WHERE user_id = ?", A.id).length === 0);
}

console.log("\n# Consent is needed, and it is its own act");
{
  const no = await A.c.put(`/api/e/${live.id}/presence`, { intro: "Hi" });
  check("turning it on without consent is refused and stores nothing", no.status === 400 && no.json.code === "consent_required" && !state(A.id, live), no);
  const before = objects().length;
  const noPhoto = await A.c.put(`/api/e/${live.id}/presence`, { selfieDataUrl: url("webp", webpOf()) });
  check("a selfie without consent is refused and nothing reaches R2", noPhoto.status === 400 && objects().length === before && !state(A.id, live));
  const falsy = await A.c.put(`/api/e/${live.id}/presence`, { consent: "yes", intro: "Hi" });
  check("only true counts as consent, not a truthy value", falsy.status === 400 && !state(A.id, live));
}

console.log("\n# Only the checked in, while it is on, with the directory on");
{
  const guest = client({ ip: "10.17.2.9" });
  const g = await guest.put(`/api/e/${live.id}/presence`, { consent: true });
  check("a signed-out visitor gets nothing (a write only makes them an empty guest, who has not checked in)", g.status === 403 && g.json.code === "not_checked_in" && q("SELECT * FROM event_presence").every((x) => x.user_id !== undefined && ![A.id, D.id, E.id].includes(x.user_id)), g);
  check("signed out: reading your state, the list and the photo route are all refused", (await client({ ip: "10.17.2.9" }).get(`/api/e/${live.id}/presence`)).status === 401
    && (await client({ ip: "10.17.2.9" }).get(`/api/e/${live.id}/suggestions`)).status === 401);
  const d = await D.c.put(`/api/e/${live.id}/presence`, { consent: true });
  check("signed in but not checked in: 403 on PUT", d.status === 403 && d.json.code === "not_checked_in" && !state(D.id, live), d);
  check("…and on reading your state and the list", (await D.c.get(`/api/e/${live.id}/presence`)).status === 403 && (await D.c.get(`/api/e/${live.id}/suggestions`)).status === 403);
  const e = await E.c.put(`/api/e/${live.id}/presence`, { consent: true });
  check("checked in to a different event only: 403", e.status === 403 && e.json.code === "not_checked_in" && !state(E.id, live));
  const nd = await A.c.put(`/api/e/${noDir.id}/presence`, { consent: true });
  check("an event whose host has the directory off: 403", nd.status === 403 && nd.json.code === "directory_off" && !state(A.id, noDir), nd);
  const up = await A.c.put(`/api/e/${later.id}/presence`, { consent: true });
  check("an event that has not started: 403", up.status === 403 && up.json.code === "not_ongoing" && !state(A.id, later), up);
  const none = await A.c.put(`/api/e/nonexistent/presence`, { consent: true });
  check("an event that does not exist: 404", none.status === 404);
}

console.log("\n# Turning it on, changing it, and what is stored");
{
  const r = await turnOn(A, { intro: "  Here   for the\u0000 robots ", lookingFor: "someone into design" });
  check("consent plus a line and a wish turns it on", r.status === 200 && r.json.on === true && r.json.intro === "Here for the robots" && r.json.lookingFor === "someone into design", r.json);
  const row = state(A.id, live);
  check("one row, with an opaque id that is not the user id", row && row.id.length === 20 && row.id !== A.id && row.selfie_key === null, row);
  const long = await A.c.put(`/api/e/${live.id}/presence`, { intro: "x".repeat(81) });
  check("a line over 80 characters is refused", long.status === 400 && state(A.id, live).intro === "Here for the robots");
  const long2 = await A.c.put(`/api/e/${live.id}/presence`, { lookingFor: "x".repeat(121) });
  check("a wish over 120 characters is refused", long2.status === 400);
  const edit = await A.c.put(`/api/e/${live.id}/presence`, { intro: "Here for coffee" });
  check("a change that leaves fields out keeps them", edit.json.intro === "Here for coffee" && edit.json.lookingFor === "someone into design");
  const log = q("SELECT scope, action, ref FROM consent_log WHERE user_id = ? ORDER BY at", A.id).filter((l) => l.scope === `event_presence:${live.id}`);
  check("consent is recorded in the consent history and the consents table", log.length === 1 && log[0].action === "granted" && log[0].ref === live.id
    && q1("SELECT granted FROM consents WHERE user_id = ? AND scope = ?", A.id, `event_presence:${live.id}`).granted === 1, log);
  check("the host's counter has one count for each person who turned it on (B earlier, now A)", q1("SELECT presence_used n FROM events WHERE id = ?", live.id).n === 2);
}

console.log("\n# The selfie: same upload checks as other media, metadata removed, stored privately");
{
  const before = objects().length;
  const bad = {
    "an HTML file called an image": "data:image/png;base64," + Buffer.from("<script>alert(1)</script>").toString("base64"),
    "an SVG": "data:image/svg+xml;base64," + Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>").toString("base64"),
    "a PNG that is really a JPEG": url("png", jpegOf("x")),
    "plain text": "hello",
    "a number": 5,
  };
  for (const [name, v] of Object.entries(bad)) {
    const r = await A.c.put(`/api/e/${live.id}/presence`, { consent: true, selfieDataUrl: v });
    check(`${name} is refused`, r.status === 400 && objects().length === before && state(A.id, live).selfie_key === null, r);
  }
  const big = await A.c.put(`/api/e/${live.id}/presence`, { consent: true, selfieDataUrl: url("webp", webpOf({ exif: "e".repeat(700 * 1024) })) });
  check("a photo over the size ceiling is refused with 413 and nothing is stored", big.status === 413 && objects().length === before, big.status);

  const w = await A.c.put(`/api/e/${live.id}/presence`, { consent: true, selfieDataUrl: url("webp", webpOf({ exif: "GPS-LAT-51.5N-SECRET", xmp: "WHO-IS-THIS" })) });
  const key = state(A.id, live).selfie_key;
  check("a WebP is stored under presence/, an unguessable key", w.status === 200 && /^presence\/[0-9a-f]{20}\.webp$/.test(key) && w.json.selfie === `/media/${key}`, key);
  const stored = bytesOf(key);
  check("EXIF and XMP are removed from the stored bytes, and the flags say so", !has(stored, "SECRET") && !has(stored, "WHO-IS-THIS") && !has(stored, "EXIF") && !has(stored, "XMP ") && (stored[20] & 0x0c) === 0 && has(stored, "VP8L"), [...stored.slice(12, 22)]);
  const riffSize = stored[4] | (stored[5] << 8) | (stored[6] << 16);
  check("the RIFF size matches what is left", riffSize === stored.length - 8, [riffSize, stored.length]);
  const j = await A.c.put(`/api/e/${live.id}/presence`, { consent: true, selfieDataUrl: url("jpeg", jpegOf("EXIF-GPS-SECRET")) });
  const jb = bytesOf(state(A.id, live).selfie_key);
  check("a JPEG loses Exif, Photoshop and comment segments but keeps the picture", j.status === 200 && !has(jb, "SECRET") && !has(jb, "Exif") && !has(jb, "note") && has(jb, "JFIF") && jb[jb.length - 1] === 0xd9, j.status);
  check("the previous selfie was deleted when it was replaced", !bucket.has(key) && objects().length === before + 1, objects());
  const p = await A.c.put(`/api/e/${live.id}/presence`, { consent: true, selfieDataUrl: url("png", pngWithText("PNG-GPS-SECRET")) });
  const pb = bytesOf(state(A.id, live).selfie_key);
  check("a PNG loses its text chunks", p.status === 200 && !has(pb, "SECRET") && !has(pb, "tEXt") && has(pb, "IHDR") && has(pb, "IEND"), p.status);
  const photoLog = q("SELECT action, ref FROM consent_log WHERE user_id = ? AND scope = ? AND ref = 'photo'", A.id, `event_presence:${live.id}`);
  check("each selfie is a recorded consent to the photo", photoLog.length === 3 && photoLog.every((l) => l.action === "granted"), photoLog);
  const mal = await A.c.put(`/api/e/${live.id}/presence`, { consent: true, selfieDataUrl: url("jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2])) });
  check("a JPEG whose segments run past its end is refused, not stored", mal.status === 400 && objects().length === before + 1, mal.status);
  const kept = state(A.id, live).selfie_key;
  const rm = await A.c.put(`/api/e/${live.id}/presence`, { selfieDataUrl: null });
  check("removing just the selfie deletes it and keeps the rest", rm.status === 200 && rm.json.selfie === null && !bucket.has(kept) && state(A.id, live).intro === "Here for coffee", rm.json);
  const rmLog = q("SELECT action FROM consent_log WHERE user_id = ? AND scope = ? AND ref = 'photo' ORDER BY at DESC", A.id, `event_presence:${live.id}`)[0];
  check("…and the photo consent is recorded as withdrawn", rmLog.action === "withdrawn");
}

console.log("\n# Who can fetch a selfie");
{
  await turnOn(A, { selfieDataUrl: url("webp", webpOf()) });
  await turnOn(B, { selfieDataUrl: PNG });
  const path = `/media/${state(A.id, live).selfie_key}`;
  const mine = await A.c.get(path);
  check("the owner gets it, never cached, never sniffed, never framed", mine.status === 200 && /no-store/.test(mine.headers.get("cache-control")) && /private/.test(mine.headers.get("cache-control"))
    && mine.headers.get("x-content-type-options") === "nosniff", [mine.status, mine.headers.get("cache-control")]);
  const b = await B.c.get(path);
  check("someone checked in here, with presence on, gets it", b.status === 200 && b.headers.get("content-type") === "image/webp");
  check("a signed-out visitor does not (not a public URL)", (await client({ ip: "10.17.2.10" }).get(path)).status === 404);
  check("someone who did not check in does not", (await D.c.get(path)).status === 404);
  check("someone checked in at another event does not", (await E.c.get(path)).status === 404);
  check("someone checked in here but with presence off does not", (await C.c.get(path)).status === 404);
  check("a made-up key, or one with the wrong extension or folder, does not", (await B.c.get("/media/presence/00000000000000000000.webp")).status === 404
    && (await B.c.get("/media/presence/zz/x.webp")).status === 400 && (await B.c.get("/media/presence/aaaa.gif")).status === 400);
  const ev = state(A.id, live);
  raw.prepare("UPDATE events SET directory_on = 0 WHERE id = ?").run(live.id);
  check("if the host turns the directory off, other people lose it at once", (await B.c.get(path)).status === 404 && (await A.c.get(path)).status === 200);
  raw.prepare("UPDATE events SET directory_on = 1 WHERE id = ?").run(live.id);
  raw.prepare("UPDATE events SET ends_at = ? WHERE id = ?").run(Date.now() - 1000, live.id);
  check("once the event is over other people cannot fetch it", (await B.c.get(path)).status === 404, ev.id);
  raw.prepare("UPDATE events SET ends_at = ? WHERE id = ?").run(t0 + 5 * H, live.id);
  check("…and can again if it is on", (await B.c.get(path)).status === 200);
}

console.log("\n# What the list shows");
{
  const r = await seen(B);
  check("B sees A, with the fields below and nothing else", r.status === 200 && r.json.people.length === 1 && Object.keys(r.json.people[0]).sort().join() === "intro,name,presenceId,reason,selfie", r.json);
  const a = r.json.people[0];
  check("the name is first name and last initial", a.name === "Alice H." && a.intro === "Here for coffee" && a.selfie === `/media/${state(A.id, live).selfie_key}`, a);
  const text = r.text;
  check("no card id, link, user id, email, full surname or contact detail anywhere in the response",
    ![A.card, A.id, "Hubbard", "@", "/c/", "cardId", "userId", "email", "links", "about", "uni", "Test University"].some((x) => text.includes(x)), text);
  check("my own entry is not in my own list", !names(r).some((n) => n.startsWith("Bea")));
  check("the presence id is not the user id or the card id", a.presenceId === state(A.id, live).id && ![A.id, A.card].includes(a.presenceId));
  check("a person with presence off sees nothing (no lurking)", (await seen(C)).status === 403);
}

console.log("\n# Withdrawing");
{
  const path = `/media/${state(A.id, live).selfie_key}`;
  const key = state(A.id, live).selfie_key;
  const del = await A.c.del(`/api/e/${live.id}/presence`);
  check("DELETE removes the row, the selfie object and the consent at once", del.status === 200 && del.json.removed === true && !state(A.id, live) && !bucket.has(key)
    && q1("SELECT granted FROM consents WHERE user_id = ? AND scope = ?", A.id, `event_presence:${live.id}`).granted === 0);
  check("the very next request from B no longer lists A", !names(await seen(B)).some((n) => n.startsWith("Alice")));
  check("the photo is gone for B and for A", (await B.c.get(path)).status === 404 && (await A.c.get(path)).status === 404);
  const hist = q("SELECT action, ref FROM consent_log WHERE user_id = ? AND scope = ? ORDER BY at", A.id, `event_presence:${live.id}`);
  check("the withdrawal is in the consent history", hist[hist.length - 1].action === "withdrawn", hist);
  check("withdrawing again is harmless", (await A.c.del(`/api/e/${live.id}/presence`)).json.removed === false);
  await turnOn(A, { intro: "Back again" });
  check("turning it on again is allowed and the host figure does not count me twice", q1("SELECT presence_used n FROM events WHERE id = ?", live.id).n === 2, q1("SELECT presence_used n FROM events WHERE id = ?", live.id));
}

console.log("\n# After the event ends");
{
  const ended = await mkEvent({ name: "Ends soon", startsAt: t0 - H, endsAt: t0 + 5 * H, directoryOn: true });
  const X = await signup("Xia Ended", "10.17.3.1"), Y = await signup("Yan Ended", "10.17.3.2");
  await checkIn(X, ended); await checkIn(Y, ended);
  await turnOn(X, { selfieDataUrl: url("webp", webpOf()) }, ended); await turnOn(Y, {}, ended);
  const xKey = state(X.id, ended).selfie_key;
  check("while it is on, Y sees X", names(await seen(Y, ended)).length === 1);
  await host.post(`/api/host/events/${ended.id}/end`);
  const after = await seen(Y, ended);
  check("the moment the host ends it, suggestions are refused", after.status === 403 && after.json.code === "not_ongoing", after);
  check("…changing your presence is refused", (await X.c.put(`/api/e/${ended.id}/presence`, { intro: "late" }, {})).status === 403);
  check("…and so is the photo", (await Y.c.get(`/media/${xKey}`)).status === 404);
  const mineNow = await X.c.get(`/api/e/${ended.id}/presence`);
  check("my own state says it is not available, and still lets me see that it is on", mineNow.status === 200 && mineNow.json.available === false && mineNow.json.why === "not_ongoing" && mineNow.json.on === true);
  check("I can still withdraw after it ends, and it deletes the selfie", (await X.c.del(`/api/e/${ended.id}/presence`)).json.removed === true && !bucket.has(xKey));
}

console.log("\n# Blocking, both ways, from the list");
{
  await turnOn(C, { selfieDataUrl: url("webp", webpOf()) });
  const cKey = state(C.id, live).selfie_key;
  check("before blocking B and C see each other", names(await seen(B)).includes("Cal D.") && names(await seen(C)).includes("Bea M."));
  const pid = (await seen(B)).json.people.find((x) => x.name === "Cal D.").presenceId;
  const cnId = (await B.c.post("/api/connect", { cardId: C.card })).json.connectionId;
  check("a made-up presence id cannot be reported", (await B.c.post(`/api/e/${live.id}/presence/nope/report`, { block: true })).status === 404);
  check("neither can my own entry", (await B.c.post(`/api/e/${live.id}/presence/${state(B.id, live).id}/report`, { block: true })).status === 404);
  const rep = await B.c.post(`/api/e/${live.id}/presence/${pid}/report`, { block: true, reason: "rude line" });
  check("B reports and blocks C from the list", rep.status === 200 && rep.json.blocked === true && q1("SELECT 1 x FROM reports WHERE reporter_id = ? AND target_id = ?", B.id, C.id)
    && q1("SELECT 1 x FROM blocks WHERE blocker_id = ? AND blocked_id = ?", B.id, C.id), rep);
  check("a connection between them is removed, as everywhere else", !q1("SELECT 1 x FROM connections WHERE id = ?", cnId));
  check("B no longer sees C, and C no longer sees B (both ways)", !names(await seen(B)).includes("Cal D.") && !names(await seen(C)).includes("Bea M."));
  check("the blocked person's photo is refused to the blocker, and the blocker's to the blocked", (await B.c.get(`/media/${cKey}`)).status === 404 && (await C.c.get(`/media/${state(B.id, live).selfie_key}`)).status === 404);
  check("the owners still see their own", (await C.c.get(`/media/${cKey}`)).status === 200);
  check("a blocked person cannot report back through the list (they cannot see B)", (await C.c.post(`/api/e/${live.id}/presence/${state(B.id, live).id}/report`, { block: true })).status === 404);
  check("a report with no reason and no block is refused", (await A.c.post(`/api/e/${live.id}/presence/${state(B.id, live).id}/report`, {})).status === 400);
}

console.log("\n# Rate limits");
{
  const R = await signup("Rae Limits", "10.17.4.1");
  await checkIn(R, live);
  let last;
  for (let i = 0; i < 30; i++) last = await turnOn(R, { intro: `n${i}` });
  check("30 changes in an hour are fine", last.status === 200);
  const over = await turnOn(R, { intro: "one more" });
  check("the 31st is refused with 429", over.status === 429 && over.json.code === "throttled", over.status);
  const S = await signup("Sam Photos", "10.17.4.2");
  await checkIn(S, live);
  let n = 0;
  for (let i = 0; i < 10; i++) { const r = await turnOn(S, { selfieDataUrl: url("webp", webpOf()) }); if (r.status === 200) n++; }
  const eleven = await turnOn(S, { selfieDataUrl: url("webp", webpOf()) });
  check("10 selfies a day, then 429, and the refused one is not stored", n === 10 && eleven.status === 429 && q("SELECT * FROM event_presence WHERE user_id = ?", S.id).length === 1);
  let status = 200;
  for (let i = 0; i < 121 && status === 200; i++) status = (await seen(S)).status;
  check("the list is limited to 120 an hour", status === 429, status);
}

console.log("\n# Hosts and the code (source guards)");
{
  const hostFiles = ["worker/hosts.js", "worker/events.js", "worker/host-auth.js", "worker/hostorg.js", "worker/admin.js", "worker/feedback.js", "worker/integrations.js", "worker/eventmail.js", "worker/myevents.js"];
  check("no host-facing file imports the presence modules or reads the presence table", hostFiles.every((f) => !/presence/i.test(read(f).replace(/presence_used/g, ""))), hostFiles.filter((f) => /presence/i.test(read(f).replace(/presence_used/g, ""))));
  check("only index.js and the presence files know the presence modules", ["worker/index.js"].every((f) => /presenceApp/.test(read(f))));
  check("the presence routes all need a signed-in person", (read("worker/presenceApp.js").match(/presenceApp\.(get|put|post|delete)\(/g) || []).length === (read("worker/presenceApp.js").match(/requireUser\(c\)/g) || []).length);
  check("the selfie route is not public: it asks canViewPresenceSelfie and is never cached", /canViewPresenceSelfie/.test(read("worker/index.js")) && /noStore: isPresence/.test(read("worker/index.js")));
}

summary();
