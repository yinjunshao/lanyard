// F49: profile score and finish-your-profile emails. Run: node test/profile-nudge.mjs
// The real Worker on in-memory SQLite. The clock is a number passed to the job, so every timing line is exact.
import { readFileSync, readdirSync } from "node:fs";
import { makeEnv, makeDb, migrationFiles, readMigration, withLatency, becomeHost, check, summary } from "./harness.mjs";
import { profileScore, SCORE_MAX } from "../src/lib/profileScore.js";
import { sendProfileNudges, NUDGE_MAX, FIRST_AFTER_MS, SECOND_MIN_GAP_MS, SECOND_MAX_GAP_MS, mayEmailNow, secondIsDue, localTime } from "../worker/profilenudge.js";
import { profileNudgeEmail } from "../worker/mail-templates.js";
import worker from "../worker/index.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

console.log("\n# The score: six items, one point each");
{
  const base = { name: "Sam Lee", photo: "/media/x", mode: "student", uni: "A University", course: "Maths", headline: "Building things", links: { Site: "https://example.com" } };
  const keys = (p) => profileScore(p).items.map((i) => i.key).join(",");
  check("six items in all, out of six", profileScore(base).items.length === 6 && SCORE_MAX === 6 && profileScore(base).max === 6);
  check("a full student profile scores 6 and nothing is missing", profileScore(base).score === 6 && profileScore(base).missing.length === 0);
  check("student items are name, photo, university, course, what you do, link", keys(base) === "name,photo,uni,course,headline,links");

  // The plan's example: name, photo, university and course, no headline and no link.
  const four = profileScore({ ...base, headline: "", links: {} });
  check("name, photo, university and course but no headline and no link scores 4 and names the two missing items",
    four.score === 4 && four.missing.map((m) => m.label).join("|") === "What you do|A link", four.missing);
  check("each missing item says which field to go to", four.missing.map((m) => m.field).join(",") === "headline,links");

  // Career mode asks for company and role, and ignores university and course.
  const career = { ...base, mode: "career", uni: "", course: "", company: "Acme", role: "Designer" };
  check("a career person scores company and role instead of university and course", profileScore(career).score === 6 && keys(career) === "name,photo,company,role,headline,links");
  check("a career profile with an old university but no company or role scores 4", profileScore({ ...career, company: "", role: "", uni: "A University", course: "Maths" }).score === 4);
  check("a career profile with company but no role is missing the role only", profileScore({ ...career, role: "" }).missing.map((m) => m.key).join() === "role");
  check("a student profile with company and role but no university scores 4", profileScore({ ...base, uni: "", course: "", company: "Acme", role: "Designer" }).score === 4);
  check("a mode that is not 'career' is scored as student", profileScore({ ...base, mode: "", company: "x", role: "y", uni: "", course: "" }).score === 4);

  // Blank and spaces-only values never count.
  const blank = { name: "   ", photo: "  ", mode: "student", uni: " \t", course: "\n", headline: "   ", links: { Site: "   " } };
  check("values of only spaces score 0 in student mode", profileScore(blank).score === 0 && profileScore(blank).missing.length === 6);
  check("values of only spaces score 0 in career mode", profileScore({ ...blank, mode: "career", company: " ", role: "  " }).score === 0);
  check("a link with a blank address does not count; one with an address does", profileScore({ ...base, links: { A: " ", B: "" } }).score === 5 && profileScore({ ...base, links: { A: " ", B: "https://x.test" } }).score === 6);
  check("nothing at all, and no profile, score 0", profileScore({}).score === 0 && profileScore(null).score === 0 && profileScore(null).missing.length === 6);
  check("the database's shape works: photo_key, links as JSON text", profileScore({ ...base, photo: undefined, photo_key: "avatar/k", links: JSON.stringify({ A: "https://x.test" }) }).score === 6
    && profileScore({ ...base, photo: undefined, photo_key: null, links: "{}" }).score === 4 && profileScore({ ...base, links: "not json" }).score === 5);
  check("a name alone scores 1", profileScore({ name: "Sam" }).score === 1);
}

console.log("\n# Where the score module is loaded");
{
  const importers = [];
  const walk = (dir) => {
    for (const e of readdirSync(new URL("../" + dir, import.meta.url), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.(vue|js)$/.test(e.name) && /profileScore/.test(read(p)) && e.name !== "profileScore.js") importers.push(p);
    }
  };
  walk("src");
  check("only Edit profile in src/ imports it (so no public page's first load carries it)", importers.join() === "src/views/EditProfile.vue", importers);
  check("the module has no imports", !/^\s*import\s/m.test(read("src/lib/profileScore.js")));
  check("api.js, store.js and main.css do not mention it", !/profileScore/.test(read("src/lib/api.js") + read("src/lib/store.js") + read("src/styles/main.css")));
}

console.log("\n# Migration 0038 on a database in the old shape");
{
  const db = makeDb({ before: "0038" });
  const raw = db.raw;
  raw.prepare("INSERT INTO users (id, created_at, recovery_email, email_verified) VALUES ('u1', 1, 'old@example.com', 1)").run();
  raw.prepare("INSERT INTO profiles (user_id, name, updated_at) VALUES ('u1', 'Old Timer', 7)").run();
  const m = migrationFiles().find((f) => f.startsWith("0038_"));
  raw.exec(readMigration(m));
  const u = raw.prepare("SELECT profile_nudges, profile_nudge_at, recovery_email FROM users WHERE id = 'u1'").get();
  check("0038 keeps every account as it was: no email counted, none marked", u.profile_nudges === 0 && u.profile_nudge_at === null && u.recovery_email === "old@example.com", u);
  check("it does not touch profiles (profiles.updated_at already exists)", raw.prepare("SELECT updated_at FROM profiles WHERE user_id = 'u1'").get().updated_at === 7 && !/ALTER TABLE profiles/i.test(readMigration(m)));
  const sql0 = readMigration(m).replace(/--.*$/gm, "");
  check("it only adds (ALTER TABLE ADD COLUMN, CREATE INDEX): no DROP, DELETE, UPDATE or INSERT", !/\b(DROP|DELETE\s+FROM|UPDATE\s+\w+\s+SET|INSERT\s+INTO)\b/i.test(sql0) && /ALTER TABLE users ADD COLUMN profile_nudges/.test(sql0));
}

// ---------------------------------------------------------------------------------------------------------------
// The fixed clock. 10 June 2026 is British Summer Time (London is UTC+1); Hong Kong is UTC+8 all year.
const H = 3600e3, MIN = 60e3;
const lon = (d, h, m = 0) => Date.UTC(2026, 5, d, h - 1, m);
const hk = (d, h, m = 0) => Date.UTC(2026, 5, d, h - 8, m);

const T = await makeEnv({ UNSUB_SECRET: "test-unsub-secret-f49" });
const { client, q, q1, env } = T;
const out = env.MAIL_OUTBOX;
const sql = (s, ...p) => env.DB.raw.prepare(s).run(...p);
const to = (a) => out.filter((m) => m.to[0] === a);

let ipn = 0;
const ip = () => `10.49.${Math.floor(++ipn / 200)}.${(ipn % 200) + 1}`;
let nth = 0, evn = 0;
const OLD = lon(1, 12);   // every test profile was last saved long before the test clock
// A person with a card at 3 of 6 (name, university, course) and a confirmed email unless told otherwise.
async function person(name, { email = true, pending, tz, set = "", body = {} } = {}) {
  const c = client({ ip: ip() });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, uni: "Test University", course: "Maths", ...body });
  if (r.status !== 201) throw new Error(r.text);
  const me = (await c.get("/api/me")).json;
  const id = me.user.id;
  const addr = email === true ? `p${++nth}.${name.toLowerCase().replace(/\W+/g, "")}@mail.test` : email || undefined;
  if (addr) sql("UPDATE users SET recovery_email = ?, email_verified = 1, is_guest = 0 WHERE id = ?", addr, id);
  if (pending) sql("UPDATE users SET pending_email = ?, pending_email_at = ?, pending_mails = ? WHERE id = ?", pending.to, Date.now(), pending.mails ?? 0, id);
  if (tz) sql("UPDATE users SET tz = ? WHERE id = ?", tz, id);
  sql("UPDATE profiles SET updated_at = ? WHERE user_id = ?", OLD, id);
  if (set) sql(`UPDATE profiles SET ${set} WHERE user_id = ?`, id);
  return { c, name, id, card: me.cards[0].cardId, email: addr || pending?.to };
}
const peerOf = (name) => person(name, { email: false });
// `a` connects to `b` through the real route; the connection is then dated `t`.
async function meet(a, b, t) {
  const r = await a.c.post("/api/connect", { cardId: b.card });
  if (r.status !== 200) throw new Error(r.text);
  sql("UPDATE connections SET created_at = ? WHERE id = ?", t, r.json.connectionId);
  return r.json.connectionId;
}
// `p` checked in to an event that ended at `endTs` (ends_at set; the host has not ended it by hand).
function atEvent(p, endTs, { startsAt = endTs - 3 * H, name = "Test Mixer" } = {}) {
  const id = `ev49_${++evn}`;
  sql("INSERT INTO events (id, code, name, starts_at, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?)", id, `E49${evn}`, name, startsAt, endTs, 1);
  sql("INSERT INTO checkins (event_id, user_id, created_at) VALUES (?, ?, ?)", id, p.id, startsAt + H);
  return id;
}
const nudgeRow = (p) => q1("SELECT profile_nudges n, profile_nudge_at at FROM users WHERE id = ?", p.id);
const sent = (p) => to(p.email).length;
const FULL = "photo_key = 'avatar/x', headline = 'Doing things', links = '{\"A\":\"https://example.com\"}'";

console.log("\n# Bar 1: the anchor, and 75 minutes after it");
{
  // Connected at 20:00 and again at 21:10 (London): the later one is the anchor, so the first email is the 22:47 run.
  const P = await person("Ada Anchor"), x1 = await peerOf("Sam Quill"), x2 = await peerOf("Priya Narain");
  await meet(P, x1, lon(10, 20, 0)); await meet(P, x2, lon(10, 21, 10));
  await sendProfileNudges(env, lon(10, 21, 47));
  check("connected at 20:00 and 21:10 with 3 of 6: nothing at the 21:47 run", sent(P) === 0);
  await sendProfileNudges(env, lon(10, 22, 24) + 59e3);
  check("nothing 1 second before anchor + 75 minutes", sent(P) === 0 && nudgeRow(P).n === 0);
  const r = await sendProfileNudges(env, lon(10, 22, 47));
  check("the 22:47 run sends email 1 (the first run at or after 22:25)", sent(P) === 1 && r.first >= 1 && nudgeRow(P).n === 1 && nudgeRow(P).at === lon(10, 22, 47), [sent(P), nudgeRow(P)]);

  // The boundary: exactly anchor + 75 minutes sends.
  const B = await person("Bea Boundary"), b1 = await peerOf("Cal Pal");
  await meet(B, b1, lon(10, 18, 0));
  await sendProfileNudges(env, lon(10, 19, 14) + 59e3);
  const before = sent(B);
  await sendProfileNudges(env, lon(10, 19, 15));
  check("a run at exactly anchor + 75 minutes sends (and one a second earlier did not)", before === 0 && sent(B) === 1);

  // A connection 30 minutes ago means wait: the anchor moves on.
  const W = await person("Wen Waits"), w1 = await peerOf("Dev Pal"), w2 = await peerOf("Eli Pal");
  await meet(W, w1, lon(10, 17, 0));
  await meet(W, w2, lon(10, 18, 17));
  await sendProfileNudges(env, lon(10, 18, 47));
  check("a connection 30 minutes before the run: wait, although the first one was long ago", sent(W) === 0 && nudgeRow(W).n === 0);
  await sendProfileNudges(env, lon(10, 19, 47));
  check("and email 1 goes at the first run 75 minutes after that last connection", sent(W) === 1);

  // The later of an event end and the latest connection.
  const E = await person("Eve Event"), e1 = await peerOf("Fay Pal");
  atEvent(E, lon(10, 18, 0));
  await meet(E, e1, lon(10, 19, 30));
  await sendProfileNudges(env, lon(10, 19, 47));
  const early = sent(E);
  await sendProfileNudges(env, lon(10, 20, 47));
  check("an event that ended at 18:00 and a connection at 19:30: the connection is the anchor (nothing at 19:47, email 1 at 20:47)", early === 0 && sent(E) === 1);

  // An event end alone is an anchor too.
  const V = await person("Val Venue");
  atEvent(V, lon(10, 20, 0));
  await sendProfileNudges(env, lon(10, 21, 14) + 59e3);
  const ve = sent(V);
  await sendProfileNudges(env, lon(10, 21, 15));
  check("someone who only checked in to an event that ended at 20:00 gets email 1 from 21:15, not before", ve === 0 && sent(V) === 1);
  check("with nobody met, the subject is the plain one and names no one", to(V.email)[0].subject === "Finish your Lanyard card", to(V.email)[0].subject);

  // The host ended the event by hand (ended_at), earlier than planned: that is its end.
  const X = await person("Xena Ended");
  const xe = atEvent(X, lon(10, 23, 30));
  sql("UPDATE events SET ended_at = ? WHERE id = ?", lon(10, 19, 0), xe);
  await sendProfileNudges(env, lon(10, 20, 14) + 59e3);
  const xb = sent(X);
  await sendProfileNudges(env, lon(10, 20, 15));
  check("an event the host ended early at 19:00 is over at 19:00, so email 1 goes from 20:15", xb === 0 && sent(X) === 1);

  // Still at an event that has not ended: wait for its end, whatever the last connection was.
  const M = await person("Mia Midevent"), m1 = await peerOf("Gus Pal");
  atEvent(M, lon(10, 23, 0), { startsAt: lon(10, 16, 0) });
  await meet(M, m1, lon(10, 17, 0));
  await sendProfileNudges(env, lon(10, 19, 47)); await sendProfileNudges(env, lon(10, 22, 47));
  check("still at an event that has not ended (last connection 3 hours ago): nothing mid-event", sent(M) === 0 && nudgeRow(M).n === 0);
  await sendProfileNudges(env, lon(11, 8, 47));
  check("it ended at 23:00 so the anchor is 23:00; that falls in the quiet hours, so the next morning's run sends", sent(M) === 1);
}

console.log("\n# Bar 7: activity older than 24 hours, no profile, host-only, deleted");
{
  const NOW = lon(11, 14, 47);
  const old = await person("Olga Old"), fresh = await person("Fred Fresh"), p1 = await peerOf("Hal Pal"), p2 = await peerOf("Ivy Pal");
  await meet(old, p1, NOW - 25 * H); await meet(fresh, p2, NOW - 23 * H);
  const evOld = await person("Ewan Eventold"); atEvent(evOld, NOW - 25 * H);
  const evNew = await person("Edna Eventnew"); atEvent(evNew, NOW - 23 * H);
  await sendProfileNudges(env, NOW);
  check("a connection 25 hours old gets nothing; one 23 hours old gets email 1", sent(old) === 0 && sent(fresh) === 1);
  check("an event that ended 25 hours ago gets nothing; one that ended 23 hours ago gets email 1", sent(evOld) === 0 && sent(evNew) === 1);

  // No profile at all.
  sql("INSERT INTO users (id, created_at, recovery_email, email_verified, is_guest) VALUES ('noprof1', 1, 'noprof1@mail.test', 1, 0)");
  sql("INSERT INTO connections (id, user_a, user_b, created_at) VALUES ('cnnp1', 'noprof1', ?, ?)", p1.id, NOW + 3 * H - 2 * H);
  // A host-only account (host accounts are a separate table, with no card).
  const hc = client({ ip: ip(), site: "host" });
  const host = await becomeHost(hc, { email: "host.only@work49.example.com" });
  const ctl = await person("Cleo Control"), p3 = await peerOf("Jon Pal");
  await meet(ctl, p3, NOW + 3 * H - 2 * H);
  // Deleted account: the whole row goes, and the job carries on for everyone else.
  const gone = await person("Gail Gone"), p4 = await peerOf("Kim Pal"), keep = await person("Kate Keep"), p5 = await peerOf("Lou Pal");
  await meet(gone, p4, NOW + 3 * H - 2 * H); await meet(keep, p5, NOW + 3 * H - 2 * H);
  const del = await gone.c.del("/api/account");
  await sendProfileNudges(env, NOW + 3 * H);
  check("a person with no profile gets nothing (a control with one does)", to("noprof1@mail.test").length === 0 && sent(ctl) === 1);
  check("a host-only account gets nothing (its sign-in code is not one of ours)", host.email && to(host.email).every((m) => !/card/i.test(m.subject)));
  check("a deleted account gets nothing, its row is gone, and the job still emails the others", del.status === 200 && to(gone.email).length === 0 && !q1("SELECT 1 x FROM users WHERE id = ?", gone.id) && sent(keep) === 1);
}

console.log("\n# Bar 2: quiet hours, 23:00 to 08:00 in the person's time zone");
{
  // London, anchor 22:30: due 23:45, in the quiet hours, so the first run from 08:30.
  const L = await person("Lena London"), l1 = await peerOf("Max Pal");
  await meet(L, l1, lon(10, 22, 30));
  for (const t of [lon(10, 23, 47), lon(11, 0, 47), lon(11, 3, 47), lon(11, 7, 47)]) await sendProfileNudges(env, t);
  check("anchor 22:30 London: nothing at 23:47, 00:47, 03:47 or 07:47", sent(L) === 0 && nudgeRow(L).n === 0);
  await sendProfileNudges(env, lon(11, 8, 47));
  check("the 08:47 run sends it", sent(L) === 1 && nudgeRow(L).at === lon(11, 8, 47));

  // The edge: 08:29 is still quiet, 08:30 is not.
  const L2 = await person("Lex Edge"), l2 = await peerOf("Nia Pal");
  await meet(L2, l2, lon(10, 22, 30));
  await sendProfileNudges(env, lon(11, 8, 29) + 59e3);
  const q0 = sent(L2);
  await sendProfileNudges(env, lon(11, 8, 30));
  check("08:29:59 waits, 08:30 sends", q0 === 0 && sent(L2) === 1);
  const L3 = await person("Late Edge"), l3 = await peerOf("Oli Pal");
  await meet(L3, l3, lon(10, 21, 0));
  await sendProfileNudges(env, lon(10, 22, 59) + 59e3);
  check("22:59:59 is not yet quiet: an email due then goes", sent(L3) === 1);
  const L4 = await person("Edge Twentythree"), l4 = await peerOf("Pam Pal");
  await meet(L4, l4, lon(10, 21, 0));
  await sendProfileNudges(env, lon(10, 23, 0));
  const l4a = sent(L4);
  await sendProfileNudges(env, lon(11, 9, 47));
  check("23:00 is quiet (nothing), and it goes the next morning", l4a === 0 && sent(L4) === 1);

  // Hong Kong (UTC+8): the same UTC moment is 19:47 in London and 02:47 the next day in Hong Kong.
  const U = Date.UTC(2026, 5, 10, 18, 47);
  const A = await person("Lon Same"), B = await person("Hkg Same", { tz: "Asia/Hong_Kong" }), a1 = await peerOf("Quin Pal"), b1 = await peerOf("Rae Pal");
  await meet(A, a1, U - 2 * H); await meet(B, b1, U - 2 * H);
  await sendProfileNudges(env, U);
  check("the same moment: sent to the London person (19:47), not to the Hong Kong person (02:47)", sent(A) === 1 && sent(B) === 0 && nudgeRow(B).n === 0, [sent(A), sent(B)]);
  await sendProfileNudges(env, hk(11, 8, 29));
  const hb = sent(B);
  await sendProfileNudges(env, hk(11, 8, 47));
  check("Hong Kong: 08:29 waits and 08:47 sends", hb === 0 && sent(B) === 1);

  // A Hong Kong evening: 20:00 anchor sends at 21:47 Hong Kong time; a 22:30 anchor waits for the morning.
  const C = await person("Hkg Evening", { tz: "Asia/Hong_Kong" }), c1 = await peerOf("Sue Pal");
  await meet(C, c1, hk(12, 20, 0));
  await sendProfileNudges(env, hk(12, 21, 47));
  check("Hong Kong anchor 20:00 sends at 21:47 Hong Kong time", sent(C) === 1);
  const D = await person("Hkg Late", { tz: "Asia/Hong_Kong" }), d1 = await peerOf("Tom Pal");
  await meet(D, d1, hk(12, 22, 30));
  await sendProfileNudges(env, hk(12, 23, 47)); await sendProfileNudges(env, hk(13, 1, 47));
  const dn = sent(D);
  await sendProfileNudges(env, hk(13, 8, 47));
  check("Hong Kong anchor 22:30: nothing overnight, then 08:47 Hong Kong time", dn === 0 && sent(D) === 1);

  // No zone, or one this runtime does not know: London.
  const N1 = await person("Zone Null"), N2 = await person("Zone Bogus"), n1 = await peerOf("Uma Pal"), n2 = await peerOf("Vik Pal");
  sql("UPDATE users SET tz = NULL WHERE id = ?", N1.id); sql("UPDATE users SET tz = 'Mars/Phobos' WHERE id = ?", N2.id);
  await meet(N1, n1, lon(12, 22, 30)); await meet(N2, n2, lon(12, 22, 30));
  await sendProfileNudges(env, lon(13, 0, 47));
  const zn = sent(N1) + sent(N2);
  await sendProfileNudges(env, lon(13, 8, 47));
  check("no time zone, or an unknown one, is London: nothing at 00:47, both at 08:47", zn === 0 && sent(N1) === 1 && sent(N2) === 1);

  // The London clock change: the same UTC moment is 23:30 in summer (quiet) and 22:30 in winter (not).
  const sum = Date.UTC(2026, 5, 10, 22, 30), win = Date.UTC(2026, 11, 10, 22, 30);
  check("22:30 UTC is 23:30 in British Summer Time (quiet) and 22:30 in winter (not quiet)", !mayEmailNow(sum, "Europe/London") && mayEmailNow(win, "Europe/London") && localTime(sum, "Europe/London").minutes === 23 * 60 + 30);
  check("across the October clock change: 08:30 local is 07:30 UTC the day before it and 08:30 UTC after it",
    !mayEmailNow(Date.UTC(2026, 9, 24, 7, 29), "Europe/London") && mayEmailNow(Date.UTC(2026, 9, 24, 7, 30), "Europe/London") && !mayEmailNow(Date.UTC(2026, 9, 25, 8, 29), "Europe/London") && mayEmailNow(Date.UTC(2026, 9, 25, 8, 30), "Europe/London"));
  const S = await person("Summer Sam"), W = await person("Winter Wes"), s1 = await peerOf("Wyn Pal"), w1 = await peerOf("Xan Pal");
  await meet(S, s1, Date.UTC(2026, 5, 10, 21, 0)); await meet(W, w1, Date.UTC(2026, 11, 10, 21, 0));
  await sendProfileNudges(env, Date.UTC(2026, 5, 10, 22, 47));
  check("the same 22:47 UTC run sends nothing in summer (23:47 in London)", sent(S) === 0, sent(S));
  await sendProfileNudges(env, Date.UTC(2026, 11, 10, 22, 47));
  check("and in winter (22:47 GMT) it sends", sent(W) === 1);
}

console.log("\n# Bar 3: email 2, and never a third");
{
  const mk = async (label, opts) => { const P = await person(label, opts), x = await peerOf(`${label} Peer`); await meet(P, x, lon(10, 21, 10)); return P; };
  const P = await mk("Pia Second"), Q = await mk("Quo Changed"), R = await mk("Rhea Finished"), K = await mk("Kit Second");
  for (const x of [P, Q, R, K]) await sendProfileNudges(env, lon(10, 22, 47));
  check("all four had email 1 at 22:47 on the 10th", [P, Q, R, K].every((x) => sent(x) === 1 && nudgeRow(x).n === 1));

  // Q saves the profile through the real route (it moves profiles.updated_at); R reaches 6 of 6 without a save (SQL).
  const t0 = Date.now();
  const put = await Q.c.put("/api/profile", { name: Q.name, headline: "Now I say what I do" });
  check("saving the profile moves profiles.updated_at (what 'changed since email 1' reads)", put.status === 200 && q1("SELECT updated_at u FROM profiles WHERE user_id = ?", Q.id).u >= t0);
  sql("UPDATE profiles SET updated_at = ? WHERE user_id = ?", lon(10, 23, 30), Q.id);   // after email 1, on the test clock
  sql(`UPDATE profiles SET ${FULL} WHERE user_id = ?`, R.id);                               // 6 of 6, updated_at left as it was
  check("R is really 6 of 6 now", profileScore(q1("SELECT * FROM profiles WHERE user_id = ?", R.id)).score === 6);

  await sendProfileNudges(env, lon(11, 18, 47));
  check("the next day at 18:47: too early for email 2 (it goes from 19:00)", [P, Q, R, K].every((x) => sent(x) === 1));
  await sendProfileNudges(env, lon(11, 19, 47));
  check("the next day at 19:47, email 2 goes to the unchanged, still-incomplete profile", sent(P) === 2 && sent(K) === 2 && nudgeRow(P).n === 2, [sent(P), nudgeRow(P)]);
  check("it goes to no one whose profile changed since email 1", sent(Q) === 1 && nudgeRow(Q).n === 1);
  check("it goes to no one who has reached 6 of 6", sent(R) === 1 && nudgeRow(R).n === 1);
  const second = to(P.email)[1];
  check("email 2 says it is the last and has its own subject", /last email/.test(second.text) && second.subject === "Your Lanyard card is still unfinished", second.subject);
  check("email 1 says there is one more at most", /one more email/.test(to(P.email)[0].text));

  // Never a third: not that evening, not the next, not after another event weeks on.
  for (const t of [lon(11, 20, 47), lon(12, 8, 47), lon(12, 19, 47)]) await sendProfileNudges(env, t);
  check("never a third email: later runs send nothing more", sent(P) === 2 && sent(K) === 2 && nudgeRow(P).n === 2);
  const later = await peerOf("Later Peer");
  await meet(P, later, lon(30, 18, 0));
  atEvent(P, lon(30, 18, 30));
  await sendProfileNudges(env, lon(30, 20, 47)); await sendProfileNudges(env, lon(30, 21, 47)); await sendProfileNudges(env, lon(31, 19, 47));
  check("two in total ever: a new event and a new connection weeks later still send nothing", sent(P) === 2 && nudgeRow(P).n === 2);
  const src = read("worker/profilenudge.js");
  check("the total is one named constant, 2, and both claims read it in the write", NUDGE_MAX === 2 && (src.match(/profile_nudges < \?3/g) || []).length === 2);
  const guard = await person("Cap Guard"), cg = await peerOf("Cap Peer");
  await meet(guard, cg, lon(10, 21, 10));
  sql("UPDATE users SET profile_nudges = ?, profile_nudge_at = ? WHERE id = ?", NUDGE_MAX, lon(5, 12), guard.id);
  await sendProfileNudges(env, lon(10, 22, 47));
  check("a person already at the total gets nothing, whatever their anchor", sent(guard) === 0 && nudgeRow(guard).n === NUDGE_MAX);

  // Email 1 at 08:47 (it waited out the night): email 2 is the evening of the next day, not the same evening.
  const M = await person("Mo Morning"), mm = await peerOf("Mo Peer");
  await meet(M, mm, lon(10, 22, 30));
  await sendProfileNudges(env, lon(11, 8, 47));
  await sendProfileNudges(env, lon(11, 19, 47));
  const same = sent(M);
  await sendProfileNudges(env, lon(12, 19, 47));
  check("email 1 at 08:47 on the 11th: nothing that evening (same day), email 2 at 19:47 on the 12th", same === 1 && sent(M) === 2);
  // Too late: more than 48 hours after email 1.
  const Z = await person("Zed Late"), zz = await peerOf("Zed Peer");
  await meet(Z, zz, lon(10, 17, 0));
  await sendProfileNudges(env, lon(10, 18, 47));
  await sendProfileNudges(env, lon(12, 19, 47));
  check("49 hours after email 1: email 2 never goes", sent(Z) === 1 && nudgeRow(Z).n === 1);
  check("the windows are named constants: 75 minutes, 18 hours, 48 hours", FIRST_AFTER_MS === 75 * MIN && SECOND_MIN_GAP_MS === 18 * H && SECOND_MAX_GAP_MS === 48 * H);
  check("secondIsDue: a later local day, from 19:00 to 23:00, within 18 to 48 hours of email 1",
    secondIsDue(lon(11, 19, 0), lon(10, 22, 47), "Europe/London") && !secondIsDue(lon(11, 18, 59), lon(10, 22, 47), "Europe/London")
    && !secondIsDue(lon(10, 23, 59), lon(10, 19, 0), "Europe/London") && !secondIsDue(lon(11, 23, 0), lon(10, 22, 47), "Europe/London") && !secondIsDue(lon(12, 19, 47), lon(10, 10, 47), "Europe/London"));
  // Hong Kong evening for email 2.
  const Hk = await person("Hkg Second", { tz: "Asia/Hong_Kong" }), hh = await peerOf("Hkg Peer");
  await meet(Hk, hh, hk(10, 20, 0));
  await sendProfileNudges(env, hk(10, 21, 47));
  await sendProfileNudges(env, hk(11, 18, 47));
  const early2 = sent(Hk);
  await sendProfileNudges(env, hk(11, 19, 47));
  check("Hong Kong: email 2 at 19:47 Hong Kong time, not at 18:47", early2 === 1 && sent(Hk) === 2);

  // The data download shows the count, and the stop link ends it.
  const exp = (await P.c.get("/api/account/export")).json.user;
  check("the data download shows how many finish-your-card emails were sent and when", exp.finishCardEmailsSent === 2 && typeof exp.lastFinishCardEmailAt === "number", exp);
}

console.log("\n# Bar 4: who is never emailed");
{
  const NOW = lon(12, 14, 47);
  const mk = async (label, opts = {}) => { const P = await person(label, opts), x = await peerOf(`${label} Peer`); await meet(P, x, NOW - 2 * H); return P; };
  const ctl = await mk("Control Cat");
  const off = await mk("Switch Off"); await off.c.post("/api/account/reminder-emails", { on: false });
  const noAddr = await mk("No Address", { email: false });
  const six = await mk("Six Of Six", { set: FULL });
  const spaces = await mk("Spaces Only", { set: "photo_key = 'avatar/x', headline = '    ', links = '{\"A\":\"https://example.com\"}'" });
  const careerFull = await mk("Career Full", { set: `mode = 'career', company = 'Acme', role = 'Designer', uni = '', course = '', ${FULL}` });
  const careerHalf = await mk("Career Half", { set: `mode = 'career', company = 'Acme', role = '   ', ${FULL}` });
  const cap = await mk("Pending Cap", { email: false, pending: { to: "pending.cap@mail.test", mails: 2 } });
  const one = await mk("Pending One", { email: false, pending: { to: "pending.one@mail.test", mails: 1 } });
  const zero = await mk("Pending Zero", { email: false, pending: { to: "pending.zero@mail.test", mails: 0 } });
  const cleared = await mk("Cleared Mail", { email: false });
  await sendProfileNudges(env, NOW);
  check("control: a 3 of 6 profile with an address and the switch on is emailed", sent(ctl) === 1);
  check("the switch off: nothing, and nothing is marked", sent(off) === 0 && nudgeRow(off).n === 0);
  check("no address at all: nothing, and nothing is marked", nudgeRow(noAddr).n === 0);
  check("6 of 6: nothing, and nothing is marked", sent(six) === 0 && nudgeRow(six).n === 0);
  check("a headline of only spaces counts as missing: 5 of 6 is emailed and the email asks for it", sent(spaces) === 1 && /What you do/.test(to(spaces.email)[0].text) && /5 of 6/.test(to(spaces.email)[0].text), to(spaces.email)[0]?.text);
  check("a complete career profile (company and role, no university) is 6 of 6: nothing", sent(careerFull) === 0 && nudgeRow(careerFull).n === 0);
  check("a career profile with a blank role is 5 of 6 and is asked for the role, not a course", sent(careerHalf) === 1 && /Your role/.test(to(careerHalf.email)[0].text) && !/Your course|Your university/.test(to(careerHalf.email)[0].text), to(careerHalf.email)[0]?.text);
  check("an unconfirmed address that already had its two emails: nothing sent, nothing marked, its count stays 2",
    to("pending.cap@mail.test").length === 0 && nudgeRow(cap).n === 0 && q1("SELECT pending_mails m FROM users WHERE id = ?", cap.id).m === 2);
  check("an unconfirmed address with one email left gets email 1 with the confirm button, and then has had two",
    to("pending.one@mail.test").length === 1 && /email\/confirm/.test(to("pending.one@mail.test")[0].text) && /email\/confirm/.test(to("pending.one@mail.test")[0].html) && q1("SELECT pending_mails m FROM users WHERE id = ?", one.id).m === 2 && nudgeRow(one).n === 1);
  check("an unconfirmed address with no email yet gets one with the confirm button", to("pending.zero@mail.test").length === 1 && q1("SELECT pending_mails m FROM users WHERE id = ?", zero.id).m === 1);
  check("a confirmed address gets no confirm button", !/email\/confirm/.test(to(ctl.email)[0].text));

  // Email 2 for the pending person: it shares the cap of two, so there is no room and nothing is marked.
  const before = nudgeRow(one);
  await sendProfileNudges(env, lon(13, 19, 47));
  check("email 2 to an unconfirmed address that is at its two emails: nothing sent, nothing marked", to("pending.one@mail.test").length === 1 && nudgeRow(one).n === 1 && nudgeRow(one).at === before.at && q1("SELECT pending_mails m FROM users WHERE id = ?", one.id).m === 2);
  check("a confirmed person's email 2 goes in the same run", sent(ctl) === 2 && sent(spaces) === 2);

  // The stop link in the email turns the one switch off; the stop page says it covers these emails.
  const st = await mk("Stop Link");
  await sendProfileNudges(env, lon(12, 14, 47) + 2 * H);   // email 1 for Stop Link? its anchor is 2 hours before NOW, so it already is due at NOW+0
  // (it was created after the first run, so its email 1 goes now)
  const msg = to(st.email)[0];
  const stop = new URL(msg.headers["List-Unsubscribe"].slice(1, -1));
  const path = stop.pathname + stop.search;
  const bare = client({ ip: "198.51.100.49" });
  check("the email carries the reminders stop link, in the header and the body, and the page says it also covers finishing the card",
    /k=reminders/.test(path) && msg.text.includes(stop.href) && msg.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click" && /finish your card/i.test((await bare.get(path)).text), path);
  const done = await bare.post(path);
  check("pressing it, with no sign-in, turns the switch off and says finishing the card is covered", /finishing your card/.test(done.text) && q1("SELECT notify_reminders n FROM users WHERE id = ?", st.id).n === 0);
  await sendProfileNudges(env, lon(13, 19, 47) + H);
  check("after stopping, email 2 never goes", sent(st) === 1 && nudgeRow(st).n === 1);
  check("the Settings switch label covers both kinds of email", /follow-up reminder[^<]*and to finish my card/.test(read("src/components/EmailPreferences.vue")));
}

console.log("\n# Bar 5: two runs at the same moment send once");
{
  const NOW = lon(14, 14, 47);
  const six = [];
  for (let i = 0; i < 6; i++) { const P = await person(`Race ${i} Racer`), x = await peerOf(`Race ${i} Peer`); await meet(P, x, NOW - 2 * H); six.push(P); }
  const pend = await person("Race Pending", { email: false, pending: { to: "race.pending@mail.test", mails: 1 } }), px = await peerOf("Race Pending Peer");
  await meet(pend, px, NOW - 2 * H);
  const real = env.DB;
  env.DB = withLatency(real);
  const runs = await Promise.all([sendProfileNudges(env, NOW), sendProfileNudges(env, NOW), sendProfileNudges(env, NOW)]);
  env.DB = real;
  check("three runs at once send email 1 to each of six people exactly once", six.every((p) => sent(p) === 1 && nudgeRow(p).n === 1) && runs.reduce((n, r) => n + r.first, 0) === 7, [runs, six.map(sent)]);
  check("and exactly once to an unconfirmed address with one email left, which then has had two", to("race.pending@mail.test").length === 1 && q1("SELECT pending_mails m FROM users WHERE id = ?", pend.id).m === 2);
  const NEXT = lon(15, 19, 47);
  env.DB = withLatency(real);
  const runs2 = await Promise.all([sendProfileNudges(env, NEXT), sendProfileNudges(env, NEXT), sendProfileNudges(env, NEXT)]);
  env.DB = real;
  check("three runs at once send email 2 to each of the six exactly once, and never a third", six.every((p) => sent(p) === 2 && nudgeRow(p).n === 2) && runs2.reduce((n, r) => n + r.second, 0) === 6, [runs2, six.map(sent)]);
  // A person who saves their profile while the job runs: the claim re-checks it in the write.
  const claim = read("worker/profilenudge.js");
  check("source guard: both claims re-check the rules in the write (switch, profile, recent connections, unchanged profile, window)", /profile_nudges = 0/.test(claim) && /notify_reminders = 1/.test(claim) && /pr\.updated_at <= users\.profile_nudge_at/.test(claim) && /c2\.created_at > \?4/.test(claim));

  // A send that fails: the claim and the unconfirmed count are handed back, and the next run sends.
  const F = await person("Fail Sender"), fx = await peerOf("Fail Peer"), G = await person("Fail Pending", { email: false, pending: { to: "fail.pending@mail.test", mails: 1 } }), gx = await peerOf("Fail Pending Peer");
  const FT = lon(16, 14, 47);
  await meet(F, fx, FT - 2 * H); await meet(G, gx, FT - 2 * H);
  const realOutbox = env.MAIL_OUTBOX;
  env.MAIL_OUTBOX = undefined;   // no outbox, no MAIL_LOG, no key: the send throws, as a refused send does
  const errs = console.error; console.error = () => {};
  const failed = await sendProfileNudges(env, FT);
  console.error = errs;
  env.MAIL_OUTBOX = realOutbox;
  check("a refused send hands everything back: nothing counted, nothing marked, the unconfirmed address still has its one email left",
    failed.first === 0 && nudgeRow(F).n === 0 && nudgeRow(G).n === 0 && q1("SELECT pending_mails m FROM users WHERE id = ?", G.id).m === 1 && sent(F) === 0);
  await sendProfileNudges(env, FT + H);
  check("and the next hour sends both", sent(F) === 1 && to("fail.pending@mail.test").length === 1);
}

console.log("\n# Bar 6: what the email says, and nothing else about anyone");
{
  const NOW = lon(17, 14, 47);
  const P = await person("Tess Target"), sam = await peerOf("Sam Quill"), priya = await peerOf("Priya Narain"), jo = await peerOf("Jo Marsh");
  const bart = await peerOf("Bart Blockedbyme"), cora = await peerOf("Cora Blockedme"), olly = await peerOf("Olly Oldmeeting");
  for (const [x, em] of [[sam, "sam.private@mail.test"], [priya, "priya.private@mail.test"], [jo, "jo.private@mail.test"]]) {
    sql("UPDATE users SET recovery_email = ? WHERE id = ?", em, x.id);
    sql("UPDATE profiles SET headline = 'HEADLINE-NOT-IN-EMAIL', links = '{\"LinkedIn\":\"https://linkedin.com/in/morgan-secret-link\"}', tags = '[\"peer-tag-zzz\"]', about = 'ABOUT-NOT-IN-EMAIL' WHERE user_id = ?", x.id);
  }
  const c1 = await meet(P, sam, NOW - 6 * H), c2 = await meet(P, priya, NOW - 5 * H), c3 = await meet(P, jo, NOW - 4 * H);
  const c4 = await meet(P, bart, NOW - 3 * H), c5 = await meet(cora, P, NOW - 3 * H + MIN);
  await meet(P, olly, NOW - 30 * H);
  sql("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, 1)", P.id, bart.id);
  sql("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, 1)", cora.id, P.id);
  await P.c.put(`/api/connections/${c3}/note`, { text: "PRIVATE-NOTE-SHOULD-NOT-LEAK 07700900123" });
  await P.c.put(`/api/connections/${c3}/meta`, { tags: ["my-secret-tag-qqq"] });
  await sendProfileNudges(env, NOW);
  const m = to(P.email);
  check("one email, naming at most two first names: the two most recent people met who are not blocked", m.length === 1 && m[0].subject === "Finish your card so Jo and Priya remember you", m.map((x) => x.subject));
  check("the first names appear in the body; an older third person, a blocked person and one who blocked them do not",
    /\bJo\b/.test(m[0].text) && /\bPriya\b/.test(m[0].text) && !/\bSam\b|\bBart\b|\bCora\b|\bOlly\b/.test(JSON.stringify(m[0])), m[0].text);
  const all = JSON.stringify(m[0]);
  const forbidden = ["Quill", "Narain", "Marsh", "Blockedbyme", "Blockedme", "Oldmeeting", "PRIVATE-NOTE-SHOULD-NOT-LEAK", "07700900123", "my-secret-tag-qqq", "peer-tag-zzz", "sam.private@mail.test", "priya.private@mail.test", "jo.private@mail.test",
    "morgan-secret-link", "linkedin.com", "HEADLINE-NOT-IN-EMAIL", "ABOUT-NOT-IN-EMAIL", sam.id, priya.id, jo.id, sam.card, jo.card, c3];
  for (const f of forbidden) check(`the captured message (subject, text, html, headers) does not contain "${f}"`, !all.includes(f), f);
  const addrs = (all.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g) || []).filter((a) => !/^(accounts|help)@lanyd\.fyi$/.test(a));
  check("the only email address anywhere in it is the owner's own (none of anyone else's)", addrs.every((a) => a === P.email), addrs);
  const urls = (all.match(/https?:\/\/[^\s"<>\\]+/g) || []);
  check("every link goes to our own site: the Edit profile page or the stop link", urls.length > 0 && urls.every((u) => u.startsWith("https://lanyard.test/app/profile") || u.startsWith("https://lanyard.test/api/unsubscribe")), urls);
  check("it lists what is missing (a photo, what you do, a link) and the score", /Still to add/.test(m[0].text) && /A photo/.test(m[0].text) && /What you do/.test(m[0].text) && /A link/.test(m[0].text) && /3 of 6/.test(m[0].text) && !/Your university|Your course|Your name/.test(m[0].text), m[0].text);
  check("one button to Edit profile, plain text and HTML", /Finish your card: https:\/\/lanyard\.test\/app\/profile\n/.test(m[0].text) && m[0].html.includes('href="https://lanyard.test/app/profile"'));

  // One name, and the plain subject.
  const one = await person("Uno Only"), ox = await peerOf("Wendy Wells");
  await meet(one, ox, NOW + H);
  await sendProfileNudges(env, NOW + 3 * H);
  check("one person met: 'Finish your card so Wendy remembers you'", to(one.email)[0]?.subject === "Finish your card so Wendy remembers you", to(one.email)[0]?.subject);
  // A name with control characters or a very long first name cannot break the subject.
  const odd = await person("Odd Name"), dx = await peerOf("Z".repeat(80));
  await meet(odd, dx, NOW + 5 * H);
  await sendProfileNudges(env, NOW + 7 * H);
  check("an 80-character first name is cut short in the subject, on one line", /^Finish your card so Z{1,30} remembers you$/.test(to(odd.email)[0]?.subject), to(odd.email)[0]?.subject);

  // The template itself: never more than two names, however many are passed; escapes names.
  const t = profileNudgeEmail({ second: false, names: ["A", "B", "C"], score: 4, max: 6, missing: ["A photo", "A link"], url: "https://lanyard.test/app/profile", stopUrl: "https://lanyard.test/s" });
  check("the template names at most two people", t.subject === "Finish your card so A and B remember you" && !/\bC\b/.test(t.text));
  const t2 = profileNudgeEmail({ second: false, names: ["<b>x</b>"], score: 4, max: 6, missing: ["A photo"], url: "https://lanyard.test/app/profile", stopUrl: "https://lanyard.test/s" });
  check("a name with markup is escaped in the HTML part", !t2.html.includes("<b>x</b>") || t2.html.includes("&lt;b&gt;"));
  const guardSrc = read("worker/profilenudge.js") + read("worker/mail-templates.js").slice(read("worker/mail-templates.js").indexOf("export function profileNudgeEmail"), read("worker/mail-templates.js").indexOf("export function hostSummaryEmail"));
  check("source guard: the job never reads notes, tags, about, another person's email or links, or the unconfirmed-address column", !/\bnotes\b|\btags\b|p\.about|recovery_email|pending_email|peer.*email/i.test(guardSrc.replace(/\/\/.*$/gm, "")), guardSrc.match(/\bnotes\b|\btags\b|p\.about|recovery_email|pending_email/i));
}

console.log("\n# Bar 8: the per-run cap, the hourly job and the guards");
{
  // 305 people each with a connection 2 hours ago, made in bulk. One run emails 300; the next hour the rest.
  const NOW = lon(20, 14, 47);
  sql("INSERT INTO users (id, created_at, is_guest) VALUES ('capPeer49', 1, 0)");
  sql("INSERT INTO profiles (user_id, name, updated_at) VALUES ('capPeer49', 'Cap Peer', 1)");
  for (let i = 0; i < 305; i++) {
    const id = `cap49_${i}`;
    sql("INSERT INTO users (id, created_at, is_guest, recovery_email, email_verified) VALUES (?, 1, 0, ?, 1)", id, `${id}@mail.test`);
    sql("INSERT INTO profiles (user_id, name, updated_at) VALUES (?, ?, 1)", id, `Cap ${i}`);
    sql("INSERT INTO connections (id, user_a, user_b, created_at) VALUES (?, ?, 'capPeer49', ?)", `cn${id}`, id, NOW - 2 * H);
  }
  const r1 = await sendProfileNudges(env, NOW);
  check("one run emails at most 300 people", r1.first === 300, r1);
  const r2 = await sendProfileNudges(env, NOW);
  check("the next run carries on with the rest, and then there is nothing left", r2.first === 5 && (await sendProfileNudges(env, NOW)).first === 0, r2);
  check("everyone got exactly one", q1("SELECT COUNT(*) n FROM users WHERE id LIKE 'cap49_%' AND profile_nudges = 1").n === 305);

  const idx = read("worker/index.js");
  check("the hourly scheduled run starts it, the daily clean-up does not", /else \{[^}]*sendProfileNudges\(env\)/s.test(idx.slice(idx.indexOf("scheduled:"))) && !/17 3 \* \* \*"\) ctx\.waitUntil\(sendProfileNudges/.test(idx));
  check("wrangler.toml still runs the hourly job", /47 \* \* \* \*/.test(read("wrangler.toml")));
  check("the privacy policy says it: up to two emails after an event if the profile is unfinished, a switch stops each kind, and a retention row", /up to two after an event if your profile is unfinished/.test(read("src/views/Privacy.vue")) && /Finish-your-card emails<\/td><td>[^<]*never more than two/.test(read("src/views/Privacy.vue")));
  check("the Terms version is the one F50 set (2026-11-22)", /2026-11-22/.test(read("worker/legal.js")));
  check("the Settings label and the stop page both say finish my card", /and to finish my card/.test(read("src/components/EmailPreferences.vue")) && /or to finish your card/.test(read("worker/unsub.js")));
  // The anchor query reads people only through connections and check-ins, never through a note or a tag.
  const daily = [];
  const before = out.length;
  await worker.scheduled({ cron: "17 3 * * *" }, env, { waitUntil: (x) => daily.push(x) });
  await Promise.all(daily);
  check("the daily clean-up run sends no finish-your-card emails", out.length === before);
}

summary();
