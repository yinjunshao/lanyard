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
  check("the schema check needs the presence table", rdb.prepare(SCHEMA_SQL).get().n === 5); // the host tables of 0018, event_presence (0023) and host_promo_claims (0025, F20)
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

// ------------------------------------------------------------------ F17.3
const { words, rank, visibleFields, NEW_REASON, TOP } = await import("../worker/presenceMatch.js");
const { visibleSide } = await import("../worker/inCommon.js");

console.log("\n# Matching: the words");
{
  const w = (t) => [...words(t).keys()].join();
  check("a wish becomes distinct, folded words with the filler dropped", w("I want to meet someone who is into Robots and robotics!") === "robot,robotic", w("I want to meet someone who is into Robots and robotics!"));
  check("accents, case and plurals fold like tags", w("Café DESIGNERS") === "cafe,designer");
  check("short filler and numbers: 'AI' stays, 'a' and 'to' go", w("a to AI 3d") === "ai,3d", w("a to AI 3d"));
  check("nothing in, nothing out (and no crash on null)", w("") === "" && w(null) === "" && w(undefined) === "");
  check("the spelling the person typed is kept for the reason", words("Robots").get("robot") === "robots");
}

console.log("\n# Matching: scoring, reasons and the top five");
{
  let n = 0;
  const row = (o = {}) => ({ id: `p${++n}`, user_id: `u${n}`, selfie_key: null, intro: "", looking_for: "", checked_in_at: 1000 + n, name: `Person ${n}`, mode: "student",
    uni: "", institution_id: null, course: "", company: "", role: "", headline: "", tags: [], card_headline: null, card_tags: "[]", ...o });
  const me = visibleSide({ mode: "student", uni: "University of Example", institution_id: "example", course: "Law", company: "", role: "", tags: ["chess"] }, null);
  const order = (res) => res.ranked.map((r) => r.row.id);
  {
    const both = row({ tags: ["Robotics", "Design"] }), one = row({ tags: ["Robotics"] }), none = row({ tags: ["Music"] });
    const r = rank({ me, wish: "robotics design", rows: [none, one, both] });
    check("+3 for each wish word found: two words beat one, and a person with no hit is not shown", r.mode === "matched" && order(r).join() === `${both.id},${one.id}` && r.ranked[0].score === 6 && r.ranked[1].score === 3, r.ranked.map((x) => x.score));
    check("the reason names the tag", r.ranked[0].reason === "Into Robotics", r.ranked[0].reason);
  }
  {
    const a = row({ intro: "Here to learn about robots" }), b = row({ headline: "Builds robots" }), c = row({ course: "Robotics" }), d = row({ mode: "career", role: "Robot engineer" }), e = row({ mode: "career", company: "Robotix" });
    const r = rank({ me, wish: "robots", rows: [a] });
    check("a word in the line they wrote counts, and the reason says Mentions with the word typed", r.ranked[0].score === 3 && r.ranked[0].reason === "Mentions robots", r.ranked);
    check("a word in the headline counts", rank({ me, wish: "robots", rows: [b] }).ranked[0].reason === "Mentions robots");
    check("a student's course counts", rank({ me, wish: "robotics", rows: [c] }).ranked[0].reason === "Studying Robotics");
    check("a career role counts", rank({ me, wish: "robot", rows: [d] }).ranked[0].reason === "Works as Robot engineer");
    check("a career company counts", rank({ me, wish: "robotix", rows: [e] }).ranked[0].reason === "Works at Robotix");
  }
  {
    const instRow = row({ uni: "University of Example", institution_id: "example" });
    const r = rank({ me, wish: "someone from University of Example", rows: [instRow] });
    check("the institution words each score, and the reason is the institution", r.ranked[0].reason === "At University of Example" && r.ranked[0].score === 2 * 3 + 1, r.ranked[0]);
  }
  {
    const f2 = row({ uni: "University of Example", institution_id: "example", tags: ["Chess"] }), f1 = row({ uni: "University of Example", institution_id: "example" }), f0 = row({});
    const r = rank({ me, wish: "", rows: [f0, f1, f2] });
    check("with no wish, people are ranked by shared ground alone (+1 for each)", r.mode === "matched" && order(r).join() === `${f2.id},${f1.id}` && r.ranked[0].score === 2 && r.ranked[1].score === 1, r.ranked.map((x) => x.score));
    check("the reason is the first shared fact", r.ranked[0].reason === "Both into Chess" && r.ranked[1].reason === "Both at University of Example", r.ranked.map((x) => x.reason));
    check("shared ground adds to word hits (3 + 2)", rank({ me, wish: "chess", rows: [f2] }).ranked[0].score === 3 + 2);
  }
  {
    const a = row({ tags: ["robotics"], checked_in_at: 5000 }), b = row({ tags: ["robotics"], checked_in_at: 9000 }), c = row({ tags: ["robotics"], checked_in_at: 1000 });
    check("equal scores: the most recent check-in first", order(rank({ me, wish: "robotics", rows: [a, c, b] })).join() === `${b.id},${a.id},${c.id}`);
  }
  {
    const many = Array.from({ length: 9 }, () => row({ tags: ["robotics"] }));
    const r = rank({ me, wish: "robotics", rows: many });
    check("at most five are shown", r.ranked.length === TOP && TOP === 5);
  }
  {
    const rows = Array.from({ length: 8 }, () => row({ tags: ["Pottery"] }));
    const r = rank({ me, wish: "astronomy", rows });
    check("nothing in common with anyone: three people, all 'Say hi to someone new'", r.mode === "new" && r.ranked.length === 3 && r.ranked.every((x) => x.reason === NEW_REASON && x.score === 0), r);
    check("…at random (a fixed random picks a fixed set)", order(rank({ me, wish: "", rows, random: () => 0 })).join() !== order(rank({ me, wish: "", rows, random: () => 0.99 })).join());
    check("two people here: two shown; nobody here: none", rank({ me, wish: "", rows: rows.slice(0, 2) }).ranked.length === 2 && rank({ me, wish: "", rows: [] }).ranked.length === 0);
  }
  check("a viewer with no profile has no shared ground and does not crash", rank({ me: null, wish: "", rows: [row({ tags: ["x1"] })] }).mode === "new");
}

console.log("\n# Matching never reads what a person keeps hidden (F16's visibleSide rules)");
{
  const mk = (o = {}) => ({ id: "h1", user_id: "uh1", intro: "", checked_in_at: 1, name: "Hidden H", mode: "student", uni: "", institution_id: null, course: "", company: "", role: "", headline: "", tags: [], card_headline: null, card_tags: "[]", ...o });
  const me = visibleSide({ mode: "student", uni: "", course: "Law", company: "Acme", tags: [] }, null);
  const hit = (row, wish) => rank({ me, wish, rows: [row] }).mode === "matched";
  check("a career profile's kept course never matches", !hit(mk({ mode: "career", course: "Robotics", company: "Other" }), "robotics") && hit(mk({ mode: "student", course: "Robotics" }), "robotics"));
  check("a student profile's kept company and role never match", !hit(mk({ mode: "student", company: "Robotix", role: "Robot maker" }), "robotix robot") && hit(mk({ mode: "career", company: "Robotix" }), "robotix"));
  check("a profile tag the default card leaves out is not matched (the card's tags replace them)", !hit(mk({ tags: ["robotics"], card_tags: JSON.stringify(["music"]) }), "robotics") && hit(mk({ tags: ["robotics"], card_tags: JSON.stringify(["music"]) }), "music"));
  check("a card's own headline replaces the profile's, so the hidden one is not matched", !hit(mk({ headline: "Robotics lead", card_headline: "Plays guitar" }), "robotics") && hit(mk({ headline: "Robotics lead", card_headline: "Plays guitar" }), "guitar"));
  check("the same goes for the reason: it is never built from a hidden field", rank({ me, wish: "robotics music", rows: [mk({ mode: "career", course: "Robotics", tags: ["x1"], card_tags: JSON.stringify(["music"]) })] }).ranked[0].reason === "Into music");
  check("shared ground (F16) with a hidden company is not a fact either", rank({ me: visibleSide({ mode: "career", company: "Acme", tags: [] }, null), wish: "", rows: [mk({ mode: "student", company: "Acme" })] }).mode === "new");
  const f = visibleFields(mk({ mode: "career", course: "Hidden course", company: "Shown Co", role: "Shown role", card_headline: "Card line", headline: "Profile line" }));
  check("the visible fields of a career candidate carry no course, and the card's headline", f.course === "" && f.company === "Shown Co" && f.role === "Shown role" && f.headline === "Card line");
}

console.log("\n# Matching through the endpoint");
{
  const M = [], mkp = async (name, extra = {}) => { const p = await signup(name, `10.17.5.${M.length + 1}`, extra); M.push(p); await checkIn(p, live); return p; };
  const V = await mkp("Vic Viewer", { tags: ["chess"] });
  const R1 = await mkp("Robin Robot", { tags: ["Robotics"], headline: "Builds robots" });
  const R2 = await mkp("Rae Writer", { tags: ["writing"], headline: "Robotics editor" });
  const R3 = await mkp("Ray Same", { tags: ["chess"] });
  const R4 = await mkp("Rio Hidden", { mode: "career", company: "Acme", role: "Lead", course: "Robotics Engineering", tags: ["music"] });
  const R5 = await mkp("Ron Blocked", { tags: ["robotics"] });
  const R6 = await mkp("Roz Off", { tags: ["robotics"] });
  for (const p of [R1, R2, R3, R4, R5]) await turnOn(p, { intro: `${p.name.split(" ")[0]} here` });
  await turnOn(V, { lookingFor: "someone into robotics" });
  const r = await seen(V);
  const byName = Object.fromEntries((r.json.people || []).map((x) => [x.name, x]));
  check("people whose tag matches come first (equal scores go to the later check-in)", r.status === 200 && r.json.mode === "matched" && ["Ron B.", "Rae W."].includes(r.json.people[0].name) && /^Into robotics/i.test(r.json.people[0].reason) && ["Robin R.", "Ron B.", "Rae W."].every((n) => r.json.people.some((x) => x.name === n)), r.json);
  check("the person whose headline says robotics is shown with a Mentions reason", byName["Rae W."]?.reason === "Mentions robotics", byName);
  check("the person with a kept-but-hidden robotics course is not matched on it", !(r.json.people || []).some((x) => x.name === "Rio H." && /robot/i.test(x.reason)), byName["Rio H."]);
  check("a person who has not turned it on never appears", !byName["Roz O."]);
  check("the response carries no score, no ids, no card and no profile fields", !/score|userId|cardId|"tags"|headline|company|course/.test(r.text) && Object.keys(r.json.people[0]).sort().join() === "intro,name,presenceId,reason,selfie");
  check("the chips are tags two or more people here show, never a tag only one person shows", Array.isArray(r.json.topics) && r.json.topics.length === 1 && /^robotics$/i.test(r.json.topics[0]) && !r.json.topics.some((t) => /chess|writing|music/i.test(t)), r.json.topics);
  const { topicsOf } = await import("../worker/presenceMatch.js");
  const trow = (o) => ({ mode: "student", uni: "", institution_id: null, course: "", company: "", role: "", tags: [], card_tags: "[]", ...o });
  check("a tag the card leaves out is not a topic, and one person twice is still one", JSON.stringify(topicsOf([trow({ tags: ["Pottery", "pottery"] }), trow({ tags: ["pottery"], card_tags: JSON.stringify(["Chess"]) }), trow({ tags: ["x1"], card_tags: JSON.stringify(["chess"]) })])) === "[\"Chess\"]");
  const pid = byName["Ron B."]?.presenceId;
  check("Ron is in the list before he is blocked", !!pid || (await seen(V)).json.people.length > 0);
  const blocked = await signup("Bo Blocker", "10.17.5.40"); await checkIn(blocked, live); await turnOn(blocked, {});
  raw.prepare("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)").run(blocked.id, V.id, Date.now());
  check("someone who blocked me never appears, though I never blocked them", !names(await seen(V)).includes("Bo B."));
  raw.prepare("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)").run(V.id, R5.id, Date.now());
  check("someone I blocked never appears", !names(await seen(V)).includes("Ron B."));
  await V.c.del(`/api/e/${live.id}/presence`);
  check("once I withdraw, my list is refused at once", (await seen(V)).status === 403);
  await turnOn(V, { lookingFor: "" });
  const none = await seen(V);
  check("with no wish, people with shared ground come first (the shared tag: chess)", none.json.people[0].name === "Ray S." && none.json.people[0].reason === "Both into chess", none.json);
  await turnOn(V, { lookingFor: "underwater basket weaving" });
  const fresh = await seen(V);
  check("a wish nobody matches still shows people with shared ground first", fresh.json.people[0].name === "Ray S.");

  // A candidate for whom the event has ended (no end time, checked in long ago) is not shown, though it is on for me.
  const open = await mkEvent({ name: "No end time here", startsAt: t0 - 13 * H, directoryOn: true });
  const L1 = await signup("Lou Late", "10.17.5.41"), L2 = await signup("Lee Early", "10.17.5.42");
  await checkIn(L1, open); await checkIn(L2, open);
  await turnOn(L1, {}, open); await turnOn(L2, {}, open);
  check("both show up for each other while it is on for both", names(await seen(L1, open)).includes("Lee E."));
  raw.prepare("UPDATE checkins SET created_at = ? WHERE event_id = ? AND user_id = ?").run(t0 - 13 * H, open.id, L2.id);
  check("when the event is over for the other person (12 hours after their check-in) they are not shown", !names(await seen(L1, open)).includes("Lee E."));
}

console.log("\n# Hosts see one number, and only from 3 up (D004)");
{
  const ev = await mkEvent({ name: "Aggregate night", startsAt: t0 - H, endsAt: t0 + 5 * H, directoryOn: true });
  const people = [];
  for (let i = 0; i < 3; i++) { const p = await signup(`Agg Person${i}`, `10.17.6.${i + 1}`); await checkIn(p, ev); people.push(p); }
  await turnOn(people[0], { intro: "SECRET-INTRO-ZERO", selfieDataUrl: url("webp", webpOf()) }, ev);
  await turnOn(people[1], { lookingFor: "SECRET-WISH-ONE" }, ev);
  const live1 = (await host.get(`/api/host/events/${ev.id}/live`)).json;
  check("with two people the live screen has no number (null), so it cannot point at anyone", live1.presenceUsed === null, live1);
  await turnOn(people[2], {}, ev);
  await people[1].c.del(`/api/e/${ev.id}/presence`);
  const res = [await host.get(`/api/host/events/${ev.id}/live`), await host.get(`/api/host/events/${ev.id}/report`), await host.get(`/api/host/events/${ev.id}/report.csv`), await host.get("/api/host/account/export")];
  check("with three it is 3, and withdrawing does not lower it (it counts people who used it)", res[0].json.presenceUsed === 3 && res[1].json.totals.presence === 3, [res[0].json.presenceUsed, res[1].json.totals]);
  check("the CSV has the line", /People who used Be easy to find,3/.test(res[2].text));
  const all = res.map((r) => r.text).join("");
  check("no intro, wish, selfie key, user id or name of anyone who used it reaches a host", !/SECRET|presence\/|selfie|looking|Agg Person/.test(all.replace(/"selfies":\d+|Selfies|Shared selfies/g, "")) && !people.some((p) => all.includes(p.id)), all.slice(0, 200));
  const small = await mkEvent({ name: "Small", startsAt: t0 - H, endsAt: t0 + 5 * H, directoryOn: true });
  const s1 = await signup("Sml One", "10.17.6.20"); await checkIn(s1, small); await turnOn(s1, {}, small);
  check("the report hides a count under the small-cohort bucket size", (await host.get(`/api/host/events/${small.id}/report`)).json.totals.presence === null);
}

console.log("\n# The hub card and list (source guards)");
{
  const ui = read("src/components/EventPresence.vue"), hub = read("src/views/EventDetail.vue");
  check("the card says who sees it, what they see and when it is deleted (48 hours)", /Who sees it/.test(ui) && /What they see/.test(ui) && /When it is deleted/.test(ui) && /48 hours/.test(ui) && /only see[s]? how many/.test(ui));
  check("it is off until the box is ticked, and ticking it is what sends consent", /type="checkbox" :checked="me\.on"/.test(ui) && /change\(\{ consent: true \}/.test(ui));
  check("turning it off calls DELETE, which removes the row and the photo", /"DELETE"/.test(ui));
  check("a person in the list is a button that opens a sheet, with no link to a card or contact detail", !/router-link|\/c\/|href=|mailto|cardId|userId/.test(ui) && /Find them in the room and scan their badge to connect\./.test(ui));
  check("the list can be reported or blocked", /Report or block/.test(ui) && /presence\/\$\{encodeURIComponent\(p\.presenceId\)\}\/report/.test(ui));
  check("the hub shows it above the tabs, only while the event is not upcoming and the room is on", /<EventPresence v-if="event\.directoryOn && status !== 'upcoming'"/.test(hub) && hub.indexOf("<EventPresence") < hub.indexOf('role="tablist"'));
  check("when the event is over the card offers to delete now and says nobody can see it", /Delete my photo and line now/.test(ui) && /nobody can see your photo or line any more/.test(ui));
  check("colours are tokens only", !/#[0-9a-f]{3,8}\b/i.test(ui.slice(ui.indexOf("<style"))));
  const entry = ["src/main.js", "src/App.vue", "src/router/index.js", "src/lib/store.js", "src/lib/api.js", "src/lib/profile.js", "src/lib/shell.js", "src/components/Icon.vue"].filter((f) => /EventPresence|presence/i.test(read(f)));
  check("no shared or entry file knows about presence (it stays in the /app event hub chunk)", entry.length === 0, entry);
  check("the camera input asks for the front camera and the photo is made small first", /capture="user"/.test(ui) && /fileToDataUrl\(file, 720/.test(ui));
}

console.log("\n# Hosts and the code (source guards)");
{
  const hostFiles = ["worker/hosts.js", "worker/events.js", "worker/host-auth.js", "worker/hostorg.js", "worker/admin.js", "worker/feedback.js", "worker/integrations.js", "worker/eventmail.js", "worker/myevents.js"];
  const BAD = /event_presence|presenceApp|presenceMatch|presenceCandidates|from "\.\/presence\.js"|looking_for|selfie_key/;
  check("no host-facing file imports the presence modules or reads the presence table or its fields", hostFiles.filter((f) => f !== "worker/hosts.js").every((f) => !/presence/i.test(read(f))) && !BAD.test(read("worker/hosts.js").replace(/connections[^\n]*selfie_key[^\n]*/g, "")), hostFiles.filter((f) => BAD.test(read(f))));
  const hostsLines = read("worker/hosts.js").split("\n").filter((l) => /presence/i.test(l)).join("\n");
  check("hosts.js mentions presence only for the events.presence_used counter, hidden under 3 (D004)", /presence_used FROM events WHERE id/.test(hostsLines) && !/event_presence|FROM presence/.test(hostsLines) && /t\.presence >= 3/.test(hostsLines), hostsLines);
  check("only index.js and the presence files know the presence modules", ["worker/index.js"].every((f) => /presenceApp/.test(read(f))));
  check("the presence routes all need a signed-in person", (read("worker/presenceApp.js").match(/presenceApp\.(get|put|post|delete)\(/g) || []).length === (read("worker/presenceApp.js").match(/requireUser\(c\)/g) || []).length);
  check("the selfie route is not public: it asks canViewPresenceSelfie and is never cached", /canViewPresenceSelfie/.test(read("worker/index.js")) && /noStore: isPresence/.test(read("worker/index.js")));
}

summary();
