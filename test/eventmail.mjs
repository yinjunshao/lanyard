// Post-event emails, sign-in alerts and "sign out other devices".
// Run: node test/eventmail.mjs
import { makeEnv, check, summary, becomeHost } from "./harness.mjs";
import { sendEventEmails } from "../worker/eventmail.js";

const T = await makeEnv({ ADMIN_TOKEN: "test-admin-token" });
const { client, q1, env } = T;
const out = env.MAIL_OUTBOX;
const HOUR = 3600e3;
const sql = (s, ...p) => env.DB.raw.prepare(s).run(...p);

async function signup(name, ip) {
  const c = client({ ip });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, course: "CS" });
  if (r.status !== 201) throw new Error(r.text);
  return { c, id: (await c.get("/api/me")).json.user.id };
}
const verified = (u, email, extra = "") => sql(`UPDATE users SET recovery_email = ?, email_verified = 1 ${extra} WHERE id = ?`, email, u.id);

console.log("\n# Post-event emails");
const H = { c: client({ ip: "10.0.0.1", site: "host" }) };
await becomeHost(H.c, { kind: "company", name: "Hosty", email: "host@hosty.test" });
const now = Date.now();
const mk = async (name, startsAt, endsAt) => (await H.c.post("/api/host/events", { name, startsAt, endsAt })).json;
const done = await mk("Finished Fest", now - 30 * HOUR, now - 26 * HOUR);
const recent = await mk("Fresh Fest", now - 6 * HOUR, now - 2 * HOUR);

const A = await signup("A", "10.1.0.1"), B = await signup("B", "10.1.0.2"), C = await signup("C", "10.1.0.3"), D = await signup("D", "10.1.0.4");
verified(A, "a@x.test"); verified(B, "b@x.test"); verified(D, "d@x.test", ", notify_events = 0");
for (const ev of [done, recent]) for (const u of [A, B, C, D]) sql("INSERT INTO checkins (event_id, user_id, created_at) VALUES (?, ?, ?)", ev.id, u.id, now);
sql("INSERT INTO feedback_done (event_id, user_id) VALUES (?, ?)", done.id, B.id);

const n0 = out.length;
const r1 = await sendEventEmails(env, now);
const sent = out.slice(n0);
const reminders = sent.filter((m) => m.subject.startsWith("How was"));
check("one reminder goes out, to the attendee who hasn't answered", reminders.length === 1 && reminders[0].to[0] === "a@x.test" && /Finished Fest/.test(reminders[0].subject), sent.map((m) => [m.to, m.subject]));
check("no reminder for answered, unverified or opted-out people", !sent.some((m) => ["b@x.test", "d@x.test"].includes(m.to[0])));
check("nothing is sent for an event that ended 2 hours ago", !sent.some((m) => /Fresh Fest/.test(m.subject)));
check("the reminder links to the feedback form and can be stopped in one click", reminders[0].text.includes(`/app/feedback/${done.id}`) && /^<.+k=events/.test(reminders[0].headers["List-Unsubscribe"]));
const recap = sent.find((m) => m.subject === "How Finished Fest went");
check("the host gets one recap with the numbers", recap && recap.kind === "decisions" && recap.to[0] === "host@hosty.test" && /checked in: 4/.test(recap.text) && /reminder to 1 person/.test(recap.text), recap?.text);
check("…and links to the event on the host site (F10)", recap?.text.includes(`https://host.lanyard.test/events/${done.id}`) && !/\/host\/events/.test(recap.text), recap?.text);
check("run summary counts", r1.reminders === 1 && r1.summaries === 1, r1);

const n1 = out.length;
const r2 = await sendEventEmails(env, now + HOUR);
check("running again sends nothing twice", out.length === n1 && r2.reminders === 0 && r2.summaries === 0, r2);
const later = await sendEventEmails(env, now + 23 * HOUR);
check("a later event gets its own reminders and recap a day after it ends", later.reminders === 2 && later.summaries === 1, later);
const r3 = await sendEventEmails(env, now + 9 * 24 * HOUR);
check("events older than a week are left alone", r3.reminders === 0 && r3.summaries === 0, r3);

// One-click stop.
const stop = new URL(reminders[0].headers["List-Unsubscribe"].slice(1, -1));
const bare = client({ ip: "198.51.100.60" });
const path = stop.pathname + stop.search;
check("GET on the stop link changes nothing", (await bare.get(path)).status === 200 && q1("SELECT notify_events n FROM users WHERE id = ?", A.id).n === 1);
check("POST stops reminders", (await bare.post(path)).text.includes("Reminders off") && q1("SELECT notify_events n FROM users WHERE id = ?", A.id).n === 0);
check("a forged stop link is refused", !(await bare.post(path.replace(/t=.{4}/, "t=0000"))).text.includes("Reminders off"));
check("Settings can switch reminders back on", (await A.c.post("/api/account/event-emails", { on: true })).status === 200 && q1("SELECT notify_events n FROM users WHERE id = ?", A.id).n === 1);

console.log("\n# Sign-in alerts and signing out other devices");
{
  const U = await signup("Ula", "10.3.0.1");
  verified(U, "ula@x.test");
  const link = await U.c.post("/api/auth/link");
  const n = out.length;
  const dev = client({ ip: "198.51.100.70", });
  const ok = await dev.post("/api/auth/redeem", { code: link.json.code });
  const alert = out.slice(n).find((m) => m.subject === "New sign-in to your Lanyard account");
  check("signing in with a code emails an alert to the verified address", ok.status === 200 && alert?.to[0] === "ula@x.test" && /one-time code/.test(alert.text), out.slice(n).map((m) => m.subject));
  const link2 = await U.c.post("/api/auth/link");
  const n2 = out.length;
  await client({ ip: "198.51.100.71" }).post("/api/auth/redeem", { code: link2.json.code });
  check("a burst of sign-ins sends one alert, not many", out.length === n2);

  const guest = await signup("NoEmail", "10.3.0.2");
  const gl = await guest.c.post("/api/auth/link");
  const n3 = out.length;
  await client({ ip: "198.51.100.72" }).post("/api/auth/redeem", { code: gl.json.code });
  check("accounts without a verified email get no alert", out.length === n3);

  const sessions = await dev.get("/api/auth/sessions");
  check("the device list shows this device", sessions.json.sessions.some((s) => s.current), sessions.json);
  const so = await dev.post("/api/auth/signout-others");
  check("sign out other devices keeps this one", so.status === 200 && (await dev.get("/api/me")).json.user?.id === U.id && (await U.c.get("/api/me")).json.user === null, so.json);

  const rl = new URL(alert.text.match(/https:\/\/\S+k=revoke\S+/)[0]);
  const rpath = rl.pathname + rl.search;
  check("GET on the 'wasn't me' link changes nothing", (await bare.get(rpath)).status === 200 && (await dev.get("/api/me")).json.user?.id === U.id);
  check("POST on the 'wasn't me' link signs out every device", (await bare.post(rpath)).text.includes("Signed out everywhere") && (await dev.get("/api/me")).json.user === null);
  check("a forged or expired 'wasn't me' link does nothing", !(await bare.post(rpath.replace(/e=\d+/, "e=1"))).text.includes("Signed out everywhere"));
}

summary();
