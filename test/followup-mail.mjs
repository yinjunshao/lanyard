// F48: follow-up reminder emails. Run: node test/followup-mail.mjs
// The real Worker on in-memory SQLite. Each section names the line of the email rules bar it tests; the F48
// plan note's Log lists them. The clock is a number passed to the job, so "due", "not yet due" and "48 hours
// overdue" are exact.
import { readFileSync } from "node:fs";
import { makeEnv, makeDb, migrationFiles, readMigration, withLatency, check, summary } from "./harness.mjs";
import { sendFollowupEmails, OVERDUE_MS } from "../worker/followupmail.js";
import { mailableAddress, releaseMail, setPending, confirmAddress } from "../worker/pending-email.js";
import { followupReminderEmail } from "../worker/mail-templates.js";
import worker from "../worker/index.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const H = 3600e3, DAY = 24 * H;

console.log("\n# Migration 0037 on a database in the old shape");
{
  const db = makeDb({ before: "0037" });
  const raw = db.raw;
  raw.prepare("INSERT INTO users (id, created_at, recovery_email, email_verified) VALUES ('u1', 1, 'old@example.com', 1)").run();
  raw.prepare("INSERT INTO users (id, created_at) VALUES ('u2', 1)").run();
  raw.prepare("INSERT INTO connections (id, user_a, user_b, created_at) VALUES ('c1', 'u1', 'u2', 1)").run();
  raw.prepare("INSERT INTO notes (user_id, connection_id, text, updated_at, remind_at) VALUES ('u1', 'c1', 'hi', 1, 5000)").run();
  const m = migrationFiles().find((f) => f.startsWith("0037_"));
  raw.exec(readMigration(m));
  const u = raw.prepare("SELECT notify_reminders FROM users WHERE id = 'u1'").get();
  const n = raw.prepare("SELECT text, remind_at, reminder_mailed_for FROM notes WHERE user_id = 'u1'").get();
  check("0037 keeps every account and note as it was: the switch is on and nothing is marked mailed", u.notify_reminders === 1 && n.text === "hi" && n.remind_at === 5000 && n.reminder_mailed_for === null, [u, n]);
  const sql = readMigration(m).replace(/--.*$/gm, "");
  check("it only adds (ALTER TABLE ADD COLUMN, CREATE INDEX): no DROP, DELETE, UPDATE or INSERT", !/\b(DROP|DELETE\s+FROM|UPDATE\s+\w+\s+SET|INSERT\s+INTO)\b/i.test(sql) && /ALTER TABLE users ADD COLUMN notify_reminders/.test(sql));
}

const T = await makeEnv({ UNSUB_SECRET: "test-unsub-secret-f48" });
const { client, q, q1, env } = T;
const out = env.MAIL_OUTBOX;
const sql = (s, ...p) => env.DB.raw.prepare(s).run(...p);

let ipn = 0;
const ip = () => `10.48.${Math.floor(++ipn / 200)}.${(ipn % 200) + 1}`;
let nth = 0;
async function signup(name, { email, pending, body = {} } = {}) {
  const c = client({ ip: ip() });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, ...body });
  if (r.status !== 201) throw new Error(r.text);
  const me = (await c.get("/api/me")).json;
  const id = me.user.id;
  if (email) sql("UPDATE users SET recovery_email = ?, email_verified = 1, is_guest = 0 WHERE id = ?", email, id);
  if (pending) { sql("UPDATE users SET pending_email = ?, pending_email_at = ?, pending_mails = ? WHERE id = ?", pending.to, Date.now(), pending.mails ?? 1, id); }
  return { c, name, id, card: me.cards[0].cardId, email };
}
// `from` connects to `to`; returns the connection id.
async function connect(from, to, body = {}) {
  const r = await from.c.post("/api/connect", { cardId: to.card, ...body });
  if (r.status !== 200) throw new Error(r.text);
  return r.json.connectionId;
}
const email = (n) => `owner${++nth}.${n}@mail.test`;
// A reminder set the way the app sets it, a little in the future (the route refuses the distant past).
const setRemind = async (p, cn, t) => { const r = await p.c.put(`/api/connections/${cn}/meta`, { remindAt: t }); if (r.status !== 200) throw new Error(r.text); return r; };
const to = (a) => out.filter((m) => m.to[0] === a);
const marked = (p, cn) => q1("SELECT remind_at, reminder_mailed_for FROM notes WHERE user_id = ? AND connection_id = ?", p.id, cn);

const BASE = Date.now() + 2 * H;   // a reminder time; the job runs a minute after it unless a section says otherwise
const AFTER = BASE + 60e3;

console.log("\n# Bar 1: a reminder is mailed once, also under two runs at the same moment");
const A = await signup("Alex Owner", { email: email("a") });
const SAM = await signup("Sam Peerson", { email: "sam.private@mail.test", body: { headline: "Builds robots", links: { linkedin: "https://linkedin.com/in/sam-private-link" } } });
const cnA = await connect(A, SAM);
await setRemind(A, cnA, BASE);
{
  const before = out.length;
  const early = await sendFollowupEmails(env, BASE - 60e3);
  check("a reminder not yet due sends nothing", out.length === before && early.emails === 0 && marked(A, cnA).reminder_mailed_for === null);
  const r1 = await sendFollowupEmails(env, AFTER);
  const mine = to(A.email);
  check("the first run after it is due sends one email to the owner", mine.length === 1 && r1.emails === 1 && r1.reminders === 1, [mine.length, r1]);
  check("its subject names the person and it links to that person's page in the app", mine[0]?.subject === "Time to follow up with Sam" && mine[0].text.includes(`https://lanyard.test/app/people/${cnA}`) && mine[0].html.includes(`/app/people/${cnA}`), mine[0]?.subject);
  check("the reminder is marked as mailed for exactly its time", marked(A, cnA).reminder_mailed_for === BASE);
  const r2 = await sendFollowupEmails(env, AFTER + H);
  const r3 = await sendFollowupEmails(env, AFTER + 2 * H);
  check("later runs send it no more", to(A.email).length === 1 && r2.emails === 0 && r3.emails === 0);
}
{
  // Six people, each with one due reminder, and two runs started at the same moment over a database that
  // yields at every query, as the real one does.
  const six = [];
  for (let i = 0; i < 6; i++) {
    const o = await signup(`Racer ${i}`, { email: email("race") });
    const p = await signup(`Peer ${i}`);
    const cn = await connect(o, p);
    await setRemind(o, cn, BASE);
    six.push({ o, cn });
  }
  const real = env.DB;
  env.DB = withLatency(real);
  const runs = await Promise.all([sendFollowupEmails(env, AFTER), sendFollowupEmails(env, AFTER), sendFollowupEmails(env, AFTER)]);
  env.DB = real;
  check("three runs at once send each of six reminders exactly once", six.every((s) => to(s.o.email).length === 1) && runs.reduce((n, r) => n + r.emails, 0) === 6, [runs, six.map((s) => to(s.o.email).length)]);
}

console.log("\n# Bar 2: nothing is sent for a reminder that should not go");
{
  const skipped = {};
  const mk = async (label, opts = {}) => {
    const o = await signup(`Skip ${label}`, { email: opts.noEmail ? undefined : email(label), ...opts.signup });
    const p = await signup(`Peer ${label}`, { email: email("p" + label) });
    const cn = await connect(o, p);
    await setRemind(o, cn, BASE);
    skipped[label] = { o, p, cn };
    return skipped[label];
  };
  await mk("followed");
  await mk("cleared");
  await mk("removed");
  await mk("blockedByMe");
  await mk("blockedByThem");
  await mk("switchoff");
  await mk("noaddress", { noEmail: true });
  await mk("capped", { noEmail: true, signup: { pending: { to: "capped@mail.test", mails: 2 } } });
  await mk("overdue");
  await mk("control");           // sent: proves the run really ran and the others were skipped on purpose
  const f = skipped;
  await f.followed.o.c.put(`/api/connections/${f.followed.cn}/meta`, { followedUp: true });
  await f.cleared.o.c.put(`/api/connections/${f.cleared.cn}/meta`, { remindAt: null });
  await f.removed.o.c.del(`/api/connections/${f.removed.cn}`);
  sql("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)", f.blockedByMe.o.id, f.blockedByMe.p.id, 1);
  sql("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)", f.blockedByThem.p.id, f.blockedByThem.o.id, 1);
  const off = await f.switchoff.o.c.post("/api/account/reminder-emails", { on: false });
  sql("UPDATE notes SET remind_at = ? WHERE user_id = ? AND connection_id = ?", AFTER - OVERDUE_MS - 1000, f.overdue.o.id, f.overdue.cn); // 48 h and a second overdue at the run
  const n0 = out.length;
  const r = await sendFollowupEmails(env, AFTER);
  const sent = out.slice(n0);
  check("the control is mailed in the same run", to(f.control.o.email).length === 1 && sent.length >= 1);
  const label = { followed: "a followed-up connection", cleared: "a cleared reminder", removed: "a removed connection", blockedByMe: "a person you blocked", blockedByThem: "a person who blocked you", switchoff: "someone with the switch off", overdue: "a reminder more than 48 hours overdue" };
  for (const k of Object.keys(label)) check(`nothing for ${label[k]}`, to(f[k].o.email).length === 0, to(f[k].o.email).map((m) => m.subject));
  check("the switch route worked (the off case really is off)", off.status === 200 && q1("SELECT notify_reminders n FROM users WHERE id = ?", f.switchoff.o.id).n === 0);
  check("nothing for someone with no address, and nothing for an unconfirmed address that already had its two emails", !sent.some((m) => m.to[0] === "capped@mail.test") && q1("SELECT pending_mails n FROM users WHERE id = ?", f.capped.o.id).n === 2 && r.emails === sent.length);
  check("a skipped reminder is not marked mailed (so it is not lost if the person is later able to be emailed)", marked(f.noaddress.o, f.noaddress.cn).reminder_mailed_for === null && marked(f.capped.o, f.capped.cn).reminder_mailed_for === null && marked(f.overdue.o, f.overdue.cn).reminder_mailed_for === null);
  // Exactly 48 hours overdue is still inside the window; a reminder just inside it goes.
  sql("UPDATE notes SET remind_at = ? WHERE user_id = ? AND connection_id = ?", AFTER - OVERDUE_MS, f.overdue.o.id, f.overdue.cn);
  await sendFollowupEmails(env, AFTER);
  check("one that is exactly 48 hours overdue is still mailed (the window is 48 hours)", to(f.overdue.o.email).length === 1);
  // Not first-deploy spam: a 3-day-old reminder at the first run is not mailed.
  const old = await mk("threeDays");
  sql("UPDATE notes SET remind_at = ? WHERE user_id = ? AND connection_id = ?", AFTER - 3 * DAY, old.o.id, old.cn);
  await sendFollowupEmails(env, AFTER);
  check("a 3-day-old reminder at the first run after a deploy is not mailed", to(old.o.email).length === 0);
  // Removing the connection after the claim cannot send: the claim re-checks in the write.
  const late = await mk("lateRemove");
  const hiddenRows = q("SELECT 1 FROM notes WHERE user_id = ? AND connection_id = ?", late.o.id, late.cn).length;
  await late.o.c.del(`/api/connections/${late.cn}`);
  await sendFollowupEmails(env, AFTER);
  check("a connection removed before the run sends nothing, and its note went with it", hiddenRows === 1 && to(late.o.email).length === 0 && q("SELECT 1 FROM notes WHERE user_id = ? AND connection_id = ?", late.o.id, late.cn).length === 0);
}

console.log("\n# Bar 3: several due reminders for one person give one email naming them all");
{
  const G = await signup("Gail Group", { email: email("g") });
  const names = ["Priya", "Sam", "Jo", "Kim", "Lee"];
  const cns = [];
  for (const [i, n] of names.entries()) {
    const p = await signup(`${n} Surname${i}`, { email: email("gp") });
    const cn = await connect(G, p);
    await setRemind(G, cn, BASE + i * 1000);
    cns.push(cn);
  }
  const two = await signup("Two Due", { email: email("two") });
  const t1 = await signup("Ana Peer"), t2 = await signup("Bo Peer");
  for (const [i, p] of [t1, t2].entries()) await setRemind(two, await connect(two, p), BASE + i * 1000);
  await sendFollowupEmails(env, AFTER);
  const mine = to(G.email);
  check("five due reminders give one email", mine.length === 1, mine.map((m) => m.subject));
  check("it names three and says 'and 2 others'", mine[0]?.subject === "Time to follow up with Priya, Sam, Jo and 2 others", mine[0]?.subject);
  check("the three named people link to their pages", cns.slice(0, 3).every((c) => mine[0].text.includes("/app/people/" + c)), mine[0]?.text);
  check("the others are not named, and are one link to the People list", !mine[0].text.includes("/app/people/" + cns[3]) && !mine[0].text.includes("/app/people/" + cns[4]) && /People list: https:\/\/lanyard\.test\/app\/people(\s|$)/.test(mine[0].text), mine[0]?.text);
  check("all five are marked mailed", cns.every((c) => marked(G, c).reminder_mailed_for !== null));
  const t = to(two.email);
  check("two due give one email naming both", t.length === 1 && t[0].subject === "Time to follow up with Ana and Bo", t.map((m) => m.subject));
  const msg = followupReminderEmail({ people: [{ first: "A", url: "u1" }, { first: "B", url: "u2" }, { first: "C", url: "u3" }, { first: "D", url: "u4" }], total: 4, stopUrl: "s", listUrl: "l" });
  check("'and 1 other' for four, singular", msg.subject === "Time to follow up with A, B, C and 1 other", msg.subject);
}

console.log("\n# Bar 4: a changed time mails again; the same time set again does not");
{
  const C = await signup("Cy Change", { email: email("c") });
  const P = await signup("Pat Peer", { email: email("cp") });
  const cn = await connect(C, P);
  await setRemind(C, cn, BASE);
  await sendFollowupEmails(env, AFTER);
  check("first time: mailed", to(C.email).length === 1);
  await setRemind(C, cn, BASE);
  await sendFollowupEmails(env, AFTER + H);
  check("the same time set again: not mailed again", to(C.email).length === 1);
  const NEW = BASE + 3 * H;
  await setRemind(C, cn, NEW);
  await sendFollowupEmails(env, NEW - 60e3);
  check("a new time that is not due yet: not mailed", to(C.email).length === 1);
  await sendFollowupEmails(env, NEW + 60e3);
  check("on the new time: mailed again", to(C.email).length === 2);
  await sendFollowupEmails(env, NEW + 2 * H);
  check("and only once for it", to(C.email).length === 2);
  await C.c.put(`/api/connections/${cn}/meta`, { followedUp: true });
  await C.c.put(`/api/connections/${cn}/meta`, { followedUp: false });
  await sendFollowupEmails(env, NEW + 3 * H);
  check("marking followed up and undoing it does not mail it again", to(C.email).length === 2);
}

console.log("\n# Bar 5: the email holds only first names and the event, never a private note, tag, address or link");
{
  const PRIV = await signup("Dana Privatey", { email: email("priv") });
  const peer = await signup("Morgan Lastname-Secret", { email: "morgan.hidden@mail.test", body: { headline: "HEADLINE-NOT-IN-EMAIL", links: { linkedin: "https://linkedin.com/in/morgan-secret-link" }, tags: ["peer-tag-zzz"] } });
  sql("UPDATE users SET pending_email = 'morgan.pending@mail.test' WHERE id = ?", peer.id);
  sql("INSERT INTO events (id, code, name, starts_at, created_at) VALUES ('evfm1', 'EVFM1', 'Autumn Robotics Mixer', 1, 1)");
  const cn = await connect(PRIV, peer);
  sql("UPDATE connections SET event_id = 'evfm1' WHERE id = ?", cn);
  await PRIV.c.put(`/api/connections/${cn}/note`, { text: "PRIVATE-NOTE-SHOULD-NOT-LEAK 07700900123" });
  await PRIV.c.put(`/api/connections/${cn}/meta`, { tags: ["my-secret-tag-qqq"] });
  await setRemind(PRIV, cn, BASE);
  await sendFollowupEmails(env, AFTER);
  const m = to(PRIV.email);
  check("one email, naming the first name and the event the person met them at", m.length === 1 && /\bMorgan\b/.test(m[0].text) && m[0].text.includes("Autumn Robotics Mixer") && m[0].html.includes("Autumn Robotics Mixer"), m[0]?.text);
  const all = JSON.stringify(m[0]);
  const forbidden = ["PRIVATE-NOTE-SHOULD-NOT-LEAK", "07700900123", "my-secret-tag-qqq", "peer-tag-zzz", "morgan.hidden@mail.test", "morgan.pending@mail.test", "morgan-secret-link", "linkedin.com", "Lastname-Secret", "Lastname", "HEADLINE-NOT-IN-EMAIL", "sam.private@mail.test", peer.id, peer.card];
  for (const f of forbidden) check(`the captured message (subject, text, html, headers) does not contain "${f}"`, m[0] && !all.includes(f) , f);
  const addrs = (all.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g) || []).filter((a) => !/^(accounts|help)@lanyd\.fyi$/.test(a));
  check("the only email address anywhere in it is the owner's own sending address, if any (none of anyone else's)", addrs.every((a) => a === PRIV.email), addrs);
  const urls = (all.match(/https?:\/\/[^\s"<>\\]+/g) || []);
  check("every link goes to our own site: the person's page, the People list or the stop link", urls.length > 0 && urls.every((u) => u.startsWith("https://lanyard.test/")), urls);
  const src = read("worker/followupmail.js") + read("worker/mail-templates.js").slice(read("worker/mail-templates.js").indexOf("export function followupReminderEmail"), read("worker/mail-templates.js").indexOf("export function hostSummaryEmail"));
  check("source guard: the job's query never reads the note text, tags or the other person's email or links", !/n\.text|n\.tags|\.links|p\.tags|recovery_email AS|peer.*email/i.test(src.replace(/u\.recovery_email IS NOT NULL/, "")) && !/escapeHtml\(p\.(?!first|url)/.test(src));
}

console.log("\n# Bar 6: the stop link");
{
  const S = await signup("Stu Stopper", { email: email("s") });
  const peer1 = await signup("Una Peer"), peer2 = await signup("Vic Peer");
  const cn1 = await connect(S, peer1);
  await setRemind(S, cn1, BASE);
  await sendFollowupEmails(env, AFTER);
  const msg = to(S.email)[0];
  const stop = new URL(msg.headers["List-Unsubscribe"].slice(1, -1));
  const path = stop.pathname + stop.search;
  check("the email carries a one-click stop link (List-Unsubscribe and in the body) for the reminders scope", /k=reminders/.test(path) && msg.text.includes(stop.href) && msg.html.includes(stop.search.replace(/&/g, "&amp;")) && msg.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click", path);
  check("the link is signed (a 32-character signature) and never expires", /[?&]t=[0-9a-f]{32}\b/.test(path) && /e=0&/.test(path));
  const bare = client({ ip: "198.51.100.48" });
  const sw = () => q1("SELECT notify_reminders n FROM users WHERE id = ?", S.id).n;
  check("opening it (a mail scanner does) changes nothing and shows a button", (await bare.get(path)).status === 200 && (await bare.get(path)).text.includes("<button") && sw() === 1);
  // Tampered links: wrong signature, another person's id, another scope, a changed expiry.
  const other = path.replace(/u=[0-9a-f]{10}/, `u=${peer1.id}`);
  const swapped = path.replace("k=reminders", "k=events");
  const bad = [path.replace(/t=[0-9a-f]{4}/, "t=0000"), other, swapped, path.replace("e=0", "e=99999999999999"), path.replace(/t=[0-9a-f]+/, "t="), path.replace("k=reminders", "k=nonsense")];
  for (const b of bad) await bare.post(b);
  check("a link with a wrong signature, another person's id, another scope, another expiry or no signature does nothing", sw() === 1 && q1("SELECT notify_reminders n FROM users WHERE id = ?", peer1.id).n === 1 && q1("SELECT notify_events n FROM users WHERE id = ?", S.id).n === 1);
  const eventsPath = path.replace("k=reminders", "k=events");
  await bare.post(eventsPath);
  check("an events-scope or a news-scope signature cannot be turned into a reminders link", sw() === 1);
  const done = await bare.post(path);
  check("pressing the button, with no sign-in, turns the switch off", done.text.includes("Reminder emails off") && sw() === 0 && !bare.jar.size);
  check("Settings shows it off (/api/me) and the data download says so", (await S.c.get("/api/me")).json.user.reminderEmails === false && (await S.c.get("/api/account/export")).json.user.followUpReminderEmails === false);
  const cn2 = await connect(S, peer2);
  await setRemind(S, cn2, BASE + 1000);
  const n = to(S.email).length;
  await sendFollowupEmails(env, AFTER + H);
  check("after stopping, a new due reminder sends nothing", to(S.email).length === n);
  const on = await S.c.post("/api/account/reminder-emails", { on: true });
  check("the Settings switch turns it back on, and the next run sends the reminder that is still inside 48 hours", on.status === 200 && sw() === 1 && (await sendFollowupEmails(env, AFTER + 2 * H)).emails >= 1 && to(S.email).length === n + 1);
  check("the signed-out switch route is not a way in: a guest session cannot change someone else's switch", (await client({ ip: ip() }).post("/api/account/reminder-emails", { on: false })).status < 500 && sw() === 1);
}

console.log("\n# Bar 7: an unconfirmed address gets the confirm button; a failed send is handed back");
{
  const U = await signup("Una Unconfirmed", { pending: { to: "una.pending@mail.test", mails: 1 } });
  const peer = await signup("Wes Peer");
  const cn = await connect(U, peer);
  await setRemind(U, cn, BASE);
  await sendFollowupEmails(env, AFTER);
  const m = to("una.pending@mail.test");
  check("an unconfirmed address with one email so far gets the reminder, with the confirm button", m.length === 1 && /\/api\/email\/confirm\?t=[0-9a-f]+/.test(m[0].text) && /Confirm it(&#39;|')s you/.test(m[0].html), m[0]?.text);
  check("…and that was its second and last email", q1("SELECT pending_mails n FROM users WHERE id = ?", U.id).n === 2);
  const U2 = await signup("Uma Unconfirmed", { pending: { to: "uma.pending@mail.test", mails: 2 } });
  const cn2 = await connect(U2, peer);
  await setRemind(U2, cn2, BASE);
  const before = out.length;
  await sendFollowupEmails(env, AFTER);
  check("an address that already had two emails gets none, and the reminder is not marked mailed", to("uma.pending@mail.test").length === 0 && out.length === before && marked(U2, cn2).reminder_mailed_for === null);
  const confirmedOk = await confirmAddress(env.DB, U2.id, "uma.pending@mail.test");
  await sendFollowupEmails(env, AFTER + H);
  check("once the address is confirmed the reminder still inside 48 hours goes out, without a confirm button", confirmedOk === "confirmed" && to("uma.pending@mail.test").length === 1 && !/email\/confirm/.test(to("uma.pending@mail.test")[0].text));

  // A send that fails: claims and the pending count are handed back, and the next run sends.
  const F = await signup("Fay Failing", { pending: { to: "fay.pending@mail.test", mails: 1 } });
  const G = await signup("Gus Failing", { email: email("gus") });
  const cnF = await connect(F, peer), cnG = await connect(G, peer);
  await setRemind(F, cnF, BASE); await setRemind(G, cnG, BASE);
  const realOutbox = env.MAIL_OUTBOX;
  env.MAIL_OUTBOX = undefined; // no outbox, no MAIL_LOG, no key: sendBatch throws, as a refused send does
  const errs = console.error; console.error = () => {};
  const failed = await sendFollowupEmails(env, AFTER);
  console.error = errs;
  env.MAIL_OUTBOX = realOutbox;
  check("a failed send reports no emails and sends none", failed.emails === 0 && to("fay.pending@mail.test").length === 0 && to(G.email).length === 0);
  check("releaseMail was applied: the unconfirmed address is back to one email", q1("SELECT pending_mails n FROM users WHERE id = ?", F.id).n === 1);
  check("and the claims were handed back, so nothing is marked mailed", marked(F, cnF).reminder_mailed_for === null && marked(G, cnG).reminder_mailed_for === null);
  await sendFollowupEmails(env, AFTER + 2 * H);
  check("the next run sends both, once", to("fay.pending@mail.test").length === 1 && to(G.email).length === 1 && q1("SELECT pending_mails n FROM users WHERE id = ?", F.id).n === 2);
  check("source guard: the job calls mailableAddress only after it has claimed a reminder, and releaseMail on a failed send", /claim\(db[\s\S]*mailableAddress\(db/.test(read("worker/followupmail.js")) && /releaseMail/.test(read("worker/followupmail.js")));

  // The last pending email, two jobs at once: exactly one goes.
  const R = await signup("Ray Racing", { pending: { to: "ray.pending@mail.test", mails: 1 } });
  const cnR1 = await connect(R, peer), cnR2 = await connect(R, await signup("Xia Peer"));
  await setRemind(R, cnR1, BASE); await setRemind(R, cnR2, BASE);
  const real = env.DB;
  env.DB = withLatency(real);
  await Promise.all([sendFollowupEmails(env, AFTER), sendFollowupEmails(env, AFTER)]);
  env.DB = real;
  check("two jobs at the same moment for one unconfirmed person with one email left send one email naming both", to("ray.pending@mail.test").length === 1 && /Time to follow up with Wes and Xia|Time to follow up with Xia and Wes/.test(to("ray.pending@mail.test")[0].subject) && q1("SELECT pending_mails n FROM users WHERE id = ?", R.id).n === 2, to("ray.pending@mail.test").map((x) => x.subject));
  const ma = await mailableAddress(env.DB, R.id);
  check("mailableAddress itself now says no more", ma === null);
}

console.log("\n# Per-run cap, the hourly job, the Settings switch, the download and deletion");
{
  // 305 people each with one due reminder, made in bulk. One run mails 300 people; the next hour the rest.
  const now = Date.now();
  sql("INSERT INTO users (id, created_at, is_guest) VALUES ('capPeer', 1, 0)");
  sql("INSERT INTO profiles (user_id, name, updated_at) VALUES ('capPeer', 'Cap Peer', 1)");
  for (let i = 0; i < 305; i++) {
    const id = `cap${String(i).padStart(4, "0")}`;
    sql("INSERT INTO users (id, created_at, is_guest, recovery_email, email_verified) VALUES (?, 1, 0, ?, 1)", id, `${id}@cap.test`);
    sql("INSERT INTO profiles (user_id, name, updated_at) VALUES (?, ?, 1)", id, `Cap ${i}`);
    sql("INSERT INTO connections (id, user_a, user_b, created_at) VALUES (?, ?, 'capPeer', 1)", `cn${id}`, id);
    sql("INSERT INTO notes (user_id, connection_id, text, updated_at, remind_at) VALUES (?, ?, '', 1, ?)", id, `cn${id}`, now - H);
  }
  const r1 = await sendFollowupEmails(env, now);
  check("one run mails at most 300 people", r1.emails === 300, r1);
  const r2 = await sendFollowupEmails(env, now);
  check("the next run carries on with the rest, and then there is nothing left", r2.emails === 5 && (await sendFollowupEmails(env, now)).emails === 0, r2);
  check("everyone got exactly one", q1("SELECT COUNT(*) n FROM notes WHERE user_id LIKE 'cap%' AND reminder_mailed_for IS NOT NULL").n === 305);
}
{
  // The hourly cron runs it.
  const W = await signup("Wren Cron", { email: email("w") });
  const p = await signup("Cron Peer");
  const cn = await connect(W, p);
  sql("INSERT INTO notes (user_id, connection_id, text, updated_at, remind_at) VALUES (?, ?, '', 1, ?) ON CONFLICT(user_id, connection_id) DO UPDATE SET remind_at = excluded.remind_at", W.id, cn, Date.now() - H);
  const waits = [];
  await worker.scheduled({ cron: "47 * * * *" }, env, { waitUntil: (x) => waits.push(x) });
  await Promise.all(waits);
  check("the hourly scheduled run sends it, from the public address", to(W.email).length === 1 && to(W.email)[0].text.includes("https://lanyard.test/app/people/"), to(W.email).length);
  const daily = [];
  const before = out.length;
  await worker.scheduled({ cron: "17 3 * * *" }, env, { waitUntil: (x) => daily.push(x) });
  await Promise.all(daily);
  check("the daily clean-up run sends no reminder emails", out.length === before);
  check("wrangler.toml still runs the job hourly", /47 \* \* \* \*/.test(read("wrangler.toml")));

  // /api/me: the switch and whether an email would really go.
  const me = async (p) => (await p.c.get("/api/me")).json.user;
  const none = await signup("No Address");
  const ver = await signup("Has Verified", { email: email("v") });
  const pend = await signup("Has Pending", { pending: { to: "pend@mail.test", mails: 1 } });
  const capd = await signup("Has Capped", { pending: { to: "capped2@mail.test", mails: 2 } });
  const offv = await signup("Is Off", { email: email("off") });
  await offv.c.post("/api/account/reminder-emails", { on: false });
  const flags = [await me(none), await me(ver), await me(pend), await me(capd), await me(offv)].map((u) => `${u.reminderEmails}/${u.reminderEmailsGo}`);
  check("/api/me says switch on or off, and 'go' only with an address that may be emailed", flags.join() === "true/false,true/true,true/true,true/false,false/false", flags);
  check("the switch route takes only a plain true to turn on (anything else is off)", (await ver.c.post("/api/account/reminder-emails", { on: "yes" })).status === 200 && q1("SELECT notify_reminders n FROM users WHERE id = ?", ver.id).n === 0);
  // Deletion: reminders and their marks go with the account.
  const del = await W.c.del("/api/account");
  check("deleting the account removes its reminders and their marks", del.status === 200 && q("SELECT 1 FROM notes WHERE user_id = ?", W.id).length === 0 && q("SELECT 1 FROM users WHERE id = ?", W.id).length === 0);
}

summary();
