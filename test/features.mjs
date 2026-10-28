// Feature tests: feedback, reports, duplicate/edit/end, integrations, follow-ups, purge.
import { makeEnv, check, summary, PNG } from "./harness.mjs";
import { purgeExpired } from "../worker/purge.js";

const T = await makeEnv();
const { client, q, q1 } = T;
const HOUR = 3600e3, DAY = 24 * HOUR;

async function signup(name, opts) {
  const c = client(opts);
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, course: "CS" });
  if (r.status !== 201) throw new Error(r.text);
  const me = await c.get("/api/me");
  return { c, id: me.json.user.id, card: me.json.cards[0].cardId };
}
async function host(name = "Soc", ip = "10.0.0.1") {
  const h = await signup(name, { ip });
  await h.c.post("/api/auth/recovery");
  await h.c.post("/api/host/terms", { accept: true });
  return h;
}

// Webhook capture
const sent = [];
globalThis.fetch = async (url, init) => { sent.push({ url, init }); return new Response("ok", { status: 200 }); };

console.log("\n# Host events");
const H = await host();
const start = Date.now() - 4 * HOUR;
const ev = await H.c.post("/api/host/events", {
  name: "AI Social", startsAt: start, endsAt: start + 2 * HOUR, venue: "Roberts 106",
  info: { access: "Step-free via lift", food: "Pizza", junk: "x" }, rsvpCount: 40,
  feedbackQuestions: [{ type: "single", label: "Best part?", options: ["Talks", "Pizza", "People"] }, { type: "text", label: "Next topic?" }, { type: "single", label: "bad", options: ["only one"] }],
});
check("create event with end time, info, RSVP and feedback questions", ev.status === 201, ev.text);
const row = q1("SELECT * FROM events WHERE id = ?", ev.json.id);
check("bad feedback question (one option) is dropped", JSON.parse(row.feedback_questions).length === 2, row.feedback_questions);
check("unknown info keys are dropped", !row.info.includes("junk") && row.info.includes("Step-free"), row.info);
const bad = await H.c.post("/api/host/events", { name: "x", startsAt: 1000, endsAt: 500 });
check("end before start is rejected", bad.status === 400, bad.status);
const edit = await H.c.put(`/api/host/events/${ev.json.id}`, { venue: "Roberts 105", rsvpCount: 42 });
check("edit event details", edit.status === 200 && q1("SELECT venue, rsvp_count FROM events WHERE id = ?", ev.json.id).rsvp_count === 42);
const pub = await client().get(`/api/e/${ev.json.code}`);
check("public event shows info and end time", pub.json.event.info.access === "Step-free via lift" && pub.json.event.endsAt, pub.json.event);

console.log("\n# Check-in and feedback");
const people = [];
for (let i = 0; i < 6; i++) {
  const p = await signup("P" + i, { ip: "10.1.0." + i });
  const r = await p.c.post(`/api/e/${ev.json.code}/checkin`, {});
  if (r.status !== 200) throw new Error(r.text);
  people.push(p);
}
const outsider = await signup("Out", { ip: "10.2.0.1" });
const fq = await people[0].c.get(`/api/e/${ev.json.id}/feedback`);
check("feedback is open after the scheduled end", fq.json.status === "open", fq.json.status);
check("questions = 3 core + 2 host", fq.json.questions.length === 5, fq.json.questions.map((x) => x.id));
const home = await people[0].c.get("/api/home");
check("home lists the pending feedback", home.json.feedback.length === 1 && home.json.feedback[0].eventId === ev.json.id, home.json);
const noOverall = await people[0].c.post(`/api/e/${ev.json.id}/feedback`, { answers: { again: "Yes" } });
check("overall rating is required", noOverall.status === 400, noOverall.status);
const notIn = await outsider.c.post(`/api/e/${ev.json.id}/feedback`, { answers: { overall: 5 } });
check("someone who didn't check in can't answer", notIn.status === 403, notIn.status);

// Host sees nothing before 3 answers
await people[0].c.post(`/api/e/${ev.json.id}/feedback`, { answers: { overall: 5, again: "Yes", improve: "More chairs", h1: "Talks", h2: "LLM evals" } });
let res = await H.c.get(`/api/host/events/${ev.json.id}/feedback`);
check("with 1 answer, results are hidden", res.json.results.questions.find((x) => x.id === "overall").hidden === true, res.json.results);
check("questions lock after the first answer", res.json.locked === true);
const relock = await H.c.put(`/api/host/events/${ev.json.id}/feedback`, { questions: [] });
check("locked questions can't be changed", relock.status === 409, relock.status);
const dup = await people[0].c.post(`/api/e/${ev.json.id}/feedback`, { answers: { overall: 1 } });
check("one answer per person", dup.status === 409, dup.status);
check("answered feedback leaves the home list", (await people[0].c.get("/api/home")).json.feedback.length === 0);

const answers = [
  { overall: 4, again: "Maybe", improve: "Better mic", h1: "Pizza" },
  { overall: 5, again: "Yes", h1: "People", h2: "Agents" },
  { overall: 3, again: "No", improve: "Too loud", h1: "People" },
  { overall: 4, again: "Yes", improve: "Name tags", h1: "Talks", h2: "Robotics" },
];
for (let i = 0; i < answers.length; i++) await people[i + 1].c.post(`/api/e/${ev.json.id}/feedback`, { answers: answers[i] });
res = await H.c.get(`/api/host/events/${ev.json.id}/feedback`);
const overall = res.json.results.questions.find((x) => x.id === "overall");
check("with 5 answers, rating average shown", overall.average === 4.2 && overall.counts.join() === "0,0,1,2,2", overall);
const improve = res.json.results.questions.find((x) => x.id === "improve");
check("with 5 answers, comments shown", improve.comments && improve.comments.length === 4, improve);
const resp = q("SELECT * FROM feedback_responses WHERE event_id = ?", ev.json.id);
check("responses store no user id", resp.length === 5 && !JSON.stringify(resp).includes(people[0].id));
check("responses keep the day only", resp.every((r) => r.day % DAY === 0));
const cols = q("PRAGMA table_info(feedback_responses)").map((c) => c.name);
check("feedback_responses has no user column", !cols.some((c) => /user/.test(c)), cols);

console.log("\n# Report, CSV, end, webhook");
// A connection at the event
await people[0].c.post("/api/connect", { cardId: people[1].card, eventId: ev.json.id });
const rep = await H.c.get(`/api/host/events/${ev.json.id}/report`);
check("report has RSVP turnout", rep.json.rsvp.count === 42 && rep.json.rsvp.turnout === 14, rep.json.rsvp);
check("report includes feedback summary", rep.json.feedback.responses === 5);
check("small events hide arrivals by hour", rep.json.arrivals === null);
// Formula injection via a comment
await H.c.put(`/api/host/events/${ev.json.id}`, { name: "=HYPERLINK(\"http://evil\")" });
const csv = await H.c.get(`/api/host/events/${ev.json.id}/report.csv`);
check("CSV downloads", csv.status === 200 && /text\/csv/.test(csv.headers.get("content-type")));
check("CSV escapes formulas", csv.text.includes("'=HYPERLINK") && !/(^|,)=HYPERLINK/m.test(csv.text));
// Integrations
const hook = await H.c.put("/api/host/integrations/webhook", { url: "https://hooks.zapier.com/abc" });
check("set webhook returns a one-time secret", hook.status === 200 && /^whsec_/.test(hook.json.secret), hook.json);
for (const u of ["http://x.com/h", "https://127.0.0.1/h", "https://localhost/h", "https://[::1]/h", "https://a:b@x.com/", "https://intranet/h"]) {
  const r = await H.c.put("/api/host/integrations/webhook", { url: u });
  check("webhook URL rejected: " + u, r.status === 400, r.status);
}
const end = await H.c.post(`/api/host/events/${ev.json.id}/end`);
await T.flush();
const last = sent.at(-1);
check("ending the event sends a signed webhook", end.status === 200 && last?.url === "https://hooks.zapier.com/abc"
  && /^t=\d+,v1=[0-9a-f]{64}$/.test(last.init.headers["lanyard-signature"]), last?.init?.headers);
const payload = JSON.parse(last.init.body);
check("webhook carries only aggregates", payload.type === "event.ended" && payload.data.totals.checkins === 6 && !JSON.stringify(payload).match(/P0|P1|course/), payload);
// verify signature
const { createHmac } = await import("node:crypto");
const [tPart, vPart] = last.init.headers["lanyard-signature"].split(",");
const expect = createHmac("sha256", hook.json.secret).update(`${tPart.slice(2)}.${last.init.body}`).digest("hex");
check("webhook signature verifies with the secret", vPart.slice(3) === expect);
const key = await H.c.post("/api/host/integrations/key");
check("API key issued once", /^lyk_[0-9a-f]{48}$/.test(key.json.key));
check("API key stored hashed", !JSON.stringify(q("SELECT * FROM org_integrations")).includes(key.json.key));
const zap = client({ origin: null });
const rs = await zap.post("/api/integrations/rsvp", { eventCode: ev.json.code, count: 55 }, { authorization: "Bearer " + key.json.key });
check("RSVP count via API key", rs.status === 200 && q1("SELECT rsvp_count FROM events WHERE id = ?", ev.json.id).rsvp_count === 55, rs.text);
const rsBad = await zap.post("/api/integrations/rsvp", { eventCode: ev.json.code, count: 1 }, { authorization: "Bearer lyk_" + "0".repeat(48) });
check("wrong API key rejected", rsBad.status === 401);
check("integration calls create no guest accounts", !zap.jar.has("lanyard_session"));
const H2 = await host("Other", "10.9.9.9");
const ev2 = await H2.c.post("/api/host/events", { name: "Other ev" });
const cross = await zap.post("/api/integrations/rsvp", { eventCode: ev2.json.code, count: 9 }, { authorization: "Bearer " + key.json.key });
check("API key can't touch another organisation's event", cross.status === 404, cross.status);
const staffEdit = await H2.c.put(`/api/host/events/${ev.json.id}`, { name: "pwn" });
check("another org can't edit the event", staffEdit.status === 404);

console.log("\n# Duplicate");
const before = (await H.c.get("/api/host/me")).json.credits.remaining;
const d = await H.c.post(`/api/host/events/${ev.json.id}/duplicate`, { name: "AI Social #2" });
const drow = q1("SELECT * FROM events WHERE id = ?", d.json.id);
check("duplicate copies questions, info and feedback form", d.status === 201 && drow.feedback_questions.includes("Best part") && drow.info.includes("Step-free") && !drow.ended_at, drow);
check("duplicate uses a credit", (await H.c.get("/api/host/me")).json.credits.remaining === before - 1);
check("duplicate gets a new code", drow.code !== ev.json.code);
const live = await H.c.get(`/api/host/events/${d.json.id}/live`);
check("live view works for the copy", live.status === 200 && live.json.event.feedbackOn === true);

console.log("\n# Follow-ups and tags");
const A = people[0], Bp = people[1];
const list = await A.c.get("/api/connections");
const cid = list.json.connections[0].id;
const m = await A.c.put(`/api/connections/${cid}/meta`, { remindAt: Date.now() + 1000, tags: ["Mentor", "mentor", "  cofounder ", "", 5] });
check("set reminder and tags", m.status === 200 && m.json.tags.join() === "mentor,cofounder", m.json);
let h = await A.c.get("/api/home");
check("due follow-up shows on home", h.json.followups.length === 1 && h.json.followups[0].cardId === Bp.card, h.json.followups);
const l2 = await A.c.get("/api/connections");
check("connections list carries my tags and reminder", l2.json.connections[0].myTags.join() === "mentor,cofounder" && l2.json.connections[0].remindAt);
const theirs = await Bp.c.get("/api/connections");
check("my tags are private to me", theirs.json.connections[0].myTags.length === 0);
await A.c.put(`/api/connections/${cid}/meta`, { followedUp: true });
h = await A.c.get("/api/home");
check("marking followed-up clears it from home", h.json.followups.length === 0);
const farOff = await A.c.put(`/api/connections/${cid}/meta`, { remindAt: Date.now() + 5 * 365 * DAY });
check("reminders more than a year out are rejected", farOff.status === 400);
const card = await A.c.get(`/api/c/${Bp.card}`);
check("card page carries my follow-up state", card.json.viewer.connection.followedUpAt && card.json.viewer.connection.tags.length === 2);
const note = await A.c.put(`/api/connections/${cid}/note`, { text: "Met at the AI social" });
const after = q1("SELECT text, tags FROM notes WHERE connection_id = ? AND user_id = ?", cid, A.id);
check("saving a note keeps tags", after.text === "Met at the AI social" && after.tags.includes("mentor"), after);

console.log("\n# Anonymous visitors");
const anon = client();
const view = await anon.get(`/api/c/${Bp.card}`);
check("a first-time visitor can open a public card", view.status === 200 && view.json.viewer.signedIn === false, view.status);
check("…without creating an account", !anon.jar.has("lanyard_session"));
const conn = await anon.post("/api/connect", { cardId: Bp.card, name: "Newbie", acceptTerms: true, over18: true });
check("…and connecting creates their guest account", conn.status === 200 && anon.jar.has("lanyard_session"), conn.text);

console.log("\n# Retention and erasure");
T.env.DB.raw.prepare("UPDATE feedback_responses SET day = ? WHERE event_id = ?").run(Date.now() - 400 * DAY, ev.json.id);
T.env.DB.raw.prepare("INSERT INTO webauthn_challenges (id, challenge, expires_at) VALUES ('old','x',1)").run();
const out = await purgeExpired(T.env);
const stripped = q("SELECT answers FROM feedback_responses WHERE event_id = ?", ev.json.id);
check("purge removes free text after 12 months", out.feedbackText === 5 && stripped.every((r) => JSON.parse(r.answers).text && !Object.keys(JSON.parse(r.answers).text).length));
check("purge keeps the ratings", stripped.every((r) => JSON.parse(r.answers).closed.overall));
check("purge clears expired passkey challenges", !q1("SELECT 1 FROM webauthn_challenges WHERE id = 'old'"));
const ex = await A.c.get("/api/account/export");
check("export lists events you gave feedback for", ex.json.feedbackGivenFor.includes(ev.json.id) && ex.json.privateNotes[0].tags.includes("mentor"));
const del = await A.c.del("/api/account");
check("account deletion works", del.status === 200 && !q1("SELECT 1 FROM users WHERE id = ?", A.id));
check("…removes the feedback marker but keeps the anonymous answer", !q1("SELECT 1 FROM feedback_done WHERE user_id = ?", A.id) && q("SELECT * FROM feedback_responses WHERE event_id = ?", ev.json.id).length === 5);

console.log("\n# Legacy sessions");
const legacy = "ab".repeat(16);
const u = people[5];
T.env.DB.raw.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, 0, ?)").run(legacy, u.id, Date.now() + DAY);
const lc = client(); lc.jar.set("lanyard_session", legacy);
const lm = await lc.get("/api/me");
check("pre-upgrade session cookies still work", lm.json.user?.id === u.id);
check("…and are re-stored hashed", !q1("SELECT 1 FROM sessions WHERE id = ?", legacy));

summary();
