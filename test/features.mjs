// Feature tests: feedback, reports, duplicate/edit/end, integrations, follow-ups, purge.
import { makeEnv, check, summary, PNG, becomeHost, hostSignIn } from "./harness.mjs";
import { purgeExpired } from "../worker/purge.js";
import { HOST_SKUS } from "../worker/plans.js";

const T = await makeEnv({ ADMIN_TOKEN: "test-admin-token" });
const { client, q, q1 } = T;
const HOUR = 3600e3, DAY = 24 * HOUR;

async function signup(name, opts) {
  const c = client(opts);
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, course: "CS" });
  if (r.status !== 201) throw new Error(r.text);
  const me = await c.get("/api/me");
  return { c, id: me.json.user.id, card: me.json.cards[0].cardId };
}
// A host is a client on the host site (F10): its own account, not an attendee's.
async function host(name = "Soc", ip = "10.0.0.1") {
  const h = { c: client({ ip, site: "host" }) };
  await becomeHost(h.c, { kind: "company", name });
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

console.log("\n# Per-card details and host survey");
const mk = await A.c.post("/api/cards", { name: "Careers", headline: "Looking for placements", about: "Second-year CS", tags: ["CV reviews", "mock interviews", "placements", "CAD", "robots", "hackathons"] });
const mkId = mk.json.id;
const careers = await A.c.get(`/api/c/${mkId}`);
check("a card can carry its own what-you-do and about", careers.text.includes("Looking for placements") && careers.text.includes("Second-year CS"), careers.text.slice(0, 200));
check("…and all six come-to-me tags survive", careers.text.includes("hackathons") && careers.text.includes("CV reviews"));
const back = await A.c.get("/api/me");
const mine = back.json.cards.find((x) => x.cardId === mkId);
check("owner gets the raw overrides for editing", mine.headlineOverride === "Looking for placements" && mine.aboutOverride === "Second-year CS" && mine.tagsOverride.length === 6);
await A.c.put(`/api/cards/${mkId}`, { headline: "" });
const cleared = (await A.c.get("/api/me")).json.cards.find((x) => x.cardId === mkId);
check("clearing an override falls back to the profile", cleared.profile.headline === (back.json.profile.headline || "") && cleared.headlineOverride === "");
const h2 = { c: client({ ip: "10.0.0.9", site: "host" }) };
await hostSignIn(h2.c, "Sam@Corp.example.com");
const noUse = await h2.c.post("/api/host/account/details", { fullName: "Sam Lee", survey: { useCase: "", frequency: "Weekly or more" } });
check("host survey needs a use case", noUse.status === 400, noUse.text);
const okSu = await h2.c.post("/api/host/account/details", { fullName: "Sam Lee", survey: { useCase: "Weekly socials", frequency: "Weekly or more", size: "50 to 200" } });
const orgRow = q1("SELECT email, use_case, event_frequency, typical_size FROM host_accounts WHERE full_name = 'Sam Lee'");
check("host survey is saved on the host account, email lower-cased", okSu.status === 200 && orgRow.use_case === "Weekly socials" && orgRow.typical_size === "50 to 200" && orgRow.email === "sam@corp.example.com", orgRow);

console.log("\n# Host accounts, societies, transfers and tickets");
{
  const ADMIN = { authorization: "Bearer test-admin-token" };
  // Admin calls go to the main site; host calls to the host site (F10).
  const adm = client({ ip: "10.1.0.99" });
  const fresh = (ip) => client({ ip, site: "host" });
  const survey = { useCase: "Weekly socials", frequency: "Weekly or more" };
  // A new host: email code, then details, then the Host Terms, each saved on the server.
  const signedUp = async (ip, email, fullName) => {
    const c = fresh(ip);
    await hostSignIn(c, email);
    await c.post("/api/host/account/details", { fullName, survey });
    await c.post("/api/host/terms", { accept: true });
    return c;
  };

  const bare = fresh("10.1.0.1");
  await hostSignIn(bare, "ada@example.ac.uk");
  const early = await bare.get("/api/host/me");
  check("a new host account starts at the details step", early.status === 200 && early.json.step === "details" && early.json.account.email === "ada@example.ac.uk", early.json);
  const termsFirst = await bare.post("/api/host/terms", { accept: true });
  check("the Host Terms come after the details", termsFirst.status === 403 && termsFirst.json.code === "details_required", termsFirst.json);
  const orgFirst = await bare.post("/api/host/orgs", { kind: "individual" });
  check("nothing else works before the details", orgFirst.status === 403 && orgFirst.json.code === "details_required", orgFirst.json);
  const su = await bare.post("/api/host/account/details", { fullName: "Ada Leader", survey });
  check("details are saved", su.status === 200, su.text);
  const mid = await bare.get("/api/host/me");
  const orgBeforeTerms = await bare.post("/api/host/orgs", { kind: "individual" });
  check("then the Host Terms step, and nothing else until they are accepted",
    mid.json.step === "terms" && orgBeforeTerms.status === 403 && orgBeforeTerms.json.code === "terms_required", [mid.json, orgBeforeTerms.json]);
  const noTick = await bare.post("/api/host/terms", {});
  check("the terms need a clear yes", noTick.status === 400, noTick.json);
  await bare.post("/api/host/terms", { accept: true });
  const logged = q1("SELECT scope, ref FROM consent_log WHERE user_id = (SELECT id FROM host_accounts WHERE email = 'ada@example.ac.uk')");
  check("Host Terms acceptance is recorded against the host account", logged?.scope?.startsWith("host_terms:") && logged.ref === "host_account", logged);
  const empty = await bare.get("/api/host/me");
  check("a new host sees an empty portal: no organisation yet", empty.status === 200 && empty.json.step === "org" && empty.json.org === null && empty.json.events.length === 0, empty.json);
  const noOrgEvent = await bare.post("/api/host/events", { name: "X" });
  check("no events before choosing own name or an organisation", noOrgEvent.status === 409 && noOrgEvent.json.code === "no_org", noOrgEvent.json);

  const again = fresh("10.1.0.2");
  await hostSignIn(again, "ADA@example.ac.uk");
  const againMe = await again.get("/api/host/me");
  check("one host account per email: signing in again on another device reaches the same account",
    againMe.json.step === "org" && againMe.json.account.fullName === "Ada Leader"
    && q1("SELECT COUNT(*) n FROM host_accounts WHERE email = 'ada@example.ac.uk'").n === 1, againMe.json);

  // Applying as a society needs the leader details and an education email.
  const missing = await bare.post("/api/host/orgs", { kind: "society", name: "Example Robotics Society" });
  check("a society application needs leader name, link and university", missing.status === 400, missing.json);
  const apply = await bare.post("/api/host/orgs", { kind: "society", name: "Example Robotics Society", leaderName: "Ada Leader", orgLink: "https://union.example.ac.uk/robotics", university: "Example University" });
  check("society application is accepted and pending", apply.status === 201 && apply.json.status === "pending", apply.json);
  const second = await bare.post("/api/host/orgs", { kind: "company", name: "Other" });
  check("one organisation per account", second.status === 409, second.json);
  const blocked = await bare.post("/api/host/events", { name: "Welcome social" });
  check("a pending society cannot create events", blocked.status === 403 && blocked.json.code === "not_approved", blocked.json);

  // Webmail cannot apply as a society or company.
  const gm = await signedUp("10.1.0.3", "gus@gmail.com", "Gus Gmail");
  const gmApply = await gm.post("/api/host/orgs", { kind: "society", name: "Gmail Soc", leaderName: "Gus Gmail", orgLink: "https://example.org/x", university: "Example University" });
  check("a society cannot apply with webmail", gmApply.status === 400 && gmApply.json.code === "email_not_eligible", gmApply.json);
  const gmCo = await gm.post("/api/host/orgs", { kind: "company", name: "Gus Ltd" });
  check("a company cannot sign up with webmail", gmCo.status === 400 && gmCo.json.code === "email_not_eligible", gmCo.json);

  const gotIt = T.env.MAIL_OUTBOX.find((m) => m.kind === "decisions" && m.to[0] === "ada@example.ac.uk" && /Example Robotics Society/.test(m.subject));
  check("a pending application emails a confirmation to the applicant", !!gotIt);

  // Admin approval.
  const noTok = await adm.get("/api/admin/queue");
  check("the admin queue refuses without the token", noTok.status === 401, noTok.status);
  const fromHost = await bare.get("/api/admin/queue", ADMIN);
  check("the admin API is not served on the host site", fromHost.status === 401 && fromHost.json.code === "wrong_site", fromHost.json);
  const queue = await adm.get("/api/admin/queue", ADMIN);
  const pending = queue.json?.applications?.find((a) => a.name === "Example Robotics Society");
  check("admin sees the application with leader, link, university and email kind",
    pending && pending.leaderEmail === "ada@example.ac.uk" && pending.emailKind === "education" && pending.university === "Example University", queue.json);
  const rej = await adm.post(`/api/admin/orgs/${pending.id}/review`, { decision: "reject" }, ADMIN);
  check("rejecting needs a reason", rej.status === 400, rej.json);
  const appr = await adm.post(`/api/admin/orgs/${pending.id}/review`, { decision: "approve" }, ADMIN);
  check("admin can approve", appr.status === 200, appr.json);
  const decided = T.env.MAIL_OUTBOX.at(-1);
  check("approving emails the applicant from the decisions sender", appr.json.emailed === true && decided?.kind === "decisions" && /approved/i.test(decided.subject), decided);

  // Free allowance: 1 event a week, then packs; hard cap of 200 check-ins.
  const e1 = await bare.post("/api/host/events", { name: "Welcome social" });
  check("an approved society's first event this week is free", e1.status === 201, e1.json);
  const e2 = await bare.post("/api/host/events", { name: "Second social" });
  check("a second event in the same week needs a pack", e2.status === 402 && e2.json.code === "no_credits", e2.json);
  const meSoc = await bare.get("/api/host/me");
  check("limits are reported to the portal", meSoc.json.limits.freePerWeek === 1 && meSoc.json.limits.checkinCap === 200 && meSoc.json.limits.freeLeftThisWeek === 0, meSoc.json.limits);
  check("a free event spends no credit", meSoc.json.credits.granted === 0, meSoc.json.credits);
  const bill = await bare.get("/api/host/billing");
  check("societies see society prices", bill.json.audience === "society" && bill.json.skus.every((s) => s.pence <= 2500), bill.json.skus);
  const evId = e1.json.id, evCode = e1.json.code;
  const t0 = Date.now();
  const ins = T.env.DB.raw.prepare("INSERT INTO users (id, created_at, is_guest) VALUES (?, ?, 1)");
  const insC = T.env.DB.raw.prepare("INSERT INTO checkins (event_id, user_id, answers, sponsor, created_at) VALUES (?, ?, '{}', '[]', ?)");
  for (let i = 0; i < 200; i++) { ins.run("capuser" + i, t0); insC.run(evId, "capuser" + i, t0); }
  const late = client({ ip: "10.1.9.9" });
  const full = await late.post(`/api/e/${evCode}/checkin`, { name: "Late Larry", acceptTerms: true, over18: true });
  check("the 201st check-in at a society event is refused", full.status === 403 && full.json.code === "event_full", full.json);

  // Institutions: discounted packs, after approval.
  const uni = await signedUp("10.1.0.4", "una@example.ac.uk", "Una Admin");
  const uniApply = await uni.post("/api/host/orgs", { kind: "institution", name: "Example Institute", leaderName: "Una Admin", orgLink: "https://www.example.ac.uk" });
  check("an institution applies and waits for approval", uniApply.status === 201 && uniApply.json.status === "pending", uniApply.json);
  const uniBillEarly = await uni.post("/api/host/billing/request", { sku: "institution_5", email: "una@example.ac.uk" });
  check("a pending institution cannot buy packs yet", uniBillEarly.status === 403, uniBillEarly.json);
  const uq = (await adm.get("/api/admin/queue", ADMIN)).json.applications.find((a) => a.name === "Example Institute");
  await adm.post(`/api/admin/orgs/${uq.id}/review`, { decision: "approve" }, ADMIN);
  const uniBill = await uni.get("/api/host/billing");
  const std = HOST_SKUS.standard_5.pence;
  const inst5 = uniBill.json.skus.find((s) => s.id === "institution_5");
  check("institutions get discounted packs (cheaper than standard)", uniBill.json.audience === "institution" && inst5 && inst5.pence < std, uniBill.json.skus);

  // Company pays standard prices.
  const co = fresh("10.1.0.5");
  await becomeHost(co, { kind: "company", name: "Acme Ltd" });
  const coBill = await co.get("/api/host/billing");
  check("companies see standard prices", coBill.json.audience === "standard" && coBill.json.skus.find((s) => s.id === "standard_5").pence === std, coBill.json.skus);

  // Transfers: a company hands over to another host account, who must accept.
  const heir = await signedUp("10.1.0.6", "hana@acme.example.com", "Hana Heir");
  const ghost = await co.post("/api/host/transfer", { email: "nobody@acme.example.com" });
  check("transfer checks the account exists", ghost.status === 404 && ghost.json.code === "no_account", ghost.json);
  const tr = await co.post("/api/host/transfer", { email: "hana@acme.example.com" });
  check("transfer to an existing host account is offered", tr.status === 201, tr.json);
  const inbox = await heir.get("/api/host/me");
  check("the new owner sees it waiting", inbox.json.pendingTransfers.length === 1 && inbox.json.org === null, inbox.json);
  const stillOwner = await co.get("/api/host/me");
  check("nothing moves until it is accepted", stillOwner.json.role === "owner" && stillOwner.json.org.name === "Acme Ltd");
  const acc = await heir.post(`/api/host/transfers/${inbox.json.pendingTransfers[0].id}/accept`);
  check("accepting hands over the organisation", acc.status === 200, acc.json);
  const heirMe = await heir.get("/api/host/me");
  const coMe = await co.get("/api/host/me");
  check("the heir owns it and billing follows their email", heirMe.json.org?.name === "Acme Ltd" && heirMe.json.role === "owner" && heirMe.json.org.billingEmail === "hana@acme.example.com", heirMe.json.org);
  check("the old owner is back to an empty portal", coMe.json.org === null, coMe.json);

  // A society leader change is a ticket an admin checks, then the new leader accepts.
  const direct = await bare.post("/api/host/transfer", { email: "x@example.ac.uk" });
  check("societies cannot hand over directly", direct.status === 400 && direct.json.code === "ticket_required", direct.json);
  const noAcct = await bare.post("/api/host/tickets", { kind: "leader_change", newEmail: "ben@example.ac.uk", message: "Ada is graduating, Ben takes over" });
  check("a leader-change ticket checks the new leader has signed up", noAcct.status === 404 && noAcct.json.code === "no_account", noAcct.json);
  const newLead = await signedUp("10.1.0.7", "ben@example.ac.uk", "Ben Next");
  const tk = await bare.post("/api/host/tickets", { kind: "leader_change", newEmail: "ben@example.ac.uk", message: "Ada is graduating, Ben takes over" });
  check("a leader-change ticket is opened", tk.status === 201, tk.json);
  const adminQ = (await adm.get("/api/admin/queue", ADMIN)).json;
  const tkRow = adminQ.tickets.find((t) => t.newEmail === "ben@example.ac.uk");
  check("admin sees the ticket and that the account exists", tkRow && tkRow.accountExists && tkRow.newEmailKind === "education", adminQ.tickets);
  const tkOk = await adm.post(`/api/admin/tickets/${tkRow.id}/resolve`, { decision: "approve" }, ADMIN);
  check("approving the ticket sends the transfer", tkOk.status === 200 && tkOk.json.next === "transfer_sent", tkOk.json);
  const benMe = await newLead.get("/api/host/me");
  check("the new leader must press accept", benMe.json.pendingTransfers.length === 1 && benMe.json.org === null, benMe.json);
  await newLead.post(`/api/host/transfers/${benMe.json.pendingTransfers[0].id}/accept`);
  const benAfter = await newLead.get("/api/host/me");
  check("the society is now led by the new person, still approved", benAfter.json.org?.name === "Example Robotics Society" && benAfter.json.org.status === "approved" && benAfter.json.org.leaderEmail === "ben@example.ac.uk", benAfter.json.org);

  // Email change for the same person.
  const em = await newLead.post("/api/host/tickets", { kind: "email_change", newEmail: "ben.next@example.ac.uk", message: "My department moved me to a new address" });
  const emRow = (await adm.get("/api/admin/queue", ADMIN)).json.tickets.find((t) => t.newEmail === "ben.next@example.ac.uk");
  await adm.post(`/api/admin/tickets/${emRow.id}/resolve`, { decision: "approve" }, ADMIN);
  const emAfter = await newLead.get("/api/host/me");
  check("an approved email-change ticket updates the account and billing", em.status === 201 && emAfter.json.account.email === "ben.next@example.ac.uk" && emAfter.json.org.billingEmail === "ben.next@example.ac.uk", emAfter.json);
  const newSignIn = fresh("10.1.0.8");
  await hostSignIn(newSignIn, "ben.next@example.ac.uk");
  check("…and the new address is now how that account signs in", (await newSignIn.get("/api/host/me")).json.org?.name === "Example Robotics Society");
  const wrongTok = await adm.get("/api/admin/queue", { authorization: "Bearer nope" });
  check("a wrong admin token is refused", wrongTok.status === 401, wrongTok.status);

  // F10.8: host mail links to the host site; invites and transfers go by host email.
  const box = T.env.MAIL_OUTBOX;
  const handOver = box.find((m) => m.to[0] === "hana@acme.example.com" && /Acme Ltd is waiting/.test(m.subject));
  check("a transfer emails the new owner, with a link to the host site", handOver?.kind === "decisions" && handOver.text.includes("https://host.lanyard.test/"), handOver?.text);
  const leadMail = box.find((m) => m.to[0] === "ben@example.ac.uk" && /Example Robotics Society is waiting/.test(m.subject));
  check("an approved leader change emails the new leader too", !!leadMail);
  const hostMail = box.filter((m) => m.kind === "decisions" && !/host portal code/.test(m.subject));
  check("every host email links to the host portal at host.lanyard.test, none to an old /host address",
    hostMail.length >= 5 && hostMail.every((m) => m.text.includes("https://host.lanyard.test/") && !/lanyard\.test\/host\b/.test(m.text)),
    hostMail.map((m) => [m.subject, m.text.match(/https?:\/\/\S+/g)]));

  const byEmail = await heir.post("/api/host/team/invite", { email: "Ivy@acme.example.com" });
  check("an owner can invite a colleague by email", byEmail.status === 201 && byEmail.json.email === "ivy@acme.example.com" && byEmail.json.emailed === true, byEmail.json);
  const inviteMail = box.find((m) => m.to[0] === "ivy@acme.example.com" && /Join Acme Ltd/.test(m.subject));
  check("…and the invite is emailed with the code and a link to the host site", inviteMail?.text.includes(byEmail.json.code) && inviteMail.text.includes("https://host.lanyard.test/account#join"), inviteMail?.text);
  const stranger = await signedUp("10.1.0.20", "sid@acme.example.com", "Sid Other");
  const wrongPerson = await stranger.post("/api/host/team/join", { code: byEmail.json.code });
  check("an invite made for one email can't be used by another host account", wrongPerson.status === 404, wrongPerson.json);
  const ivy = await signedUp("10.1.0.21", "ivy@acme.example.com", "Ivy Invited");
  const joined = await ivy.post("/api/host/team/join", { code: byEmail.json.code });
  const ivyMe = await ivy.get("/api/host/me");
  check("the invited host account can use it, and joins as staff", joined.status === 200 && ivyMe.json.org?.name === "Acme Ltd" && ivyMe.json.role === "staff", [joined.json, ivyMe.json.role]);
  const members = (await heir.get("/api/host/team")).json.members;
  check("the team lists host accounts by name and email", members.some((m) => m.email === "ivy@acme.example.com" && m.label === "Ivy Invited" && m.role === "staff"), members);
  const open = await heir.post("/api/host/team/invite", {});
  const sidJoins = await stranger.post("/api/host/team/join", { code: open.json.code });
  check("an invite without an email still works for whoever has the code", open.status === 201 && open.json.email === null && sidJoins.status === 200, [open.json, sidJoins.json]);
  const kick = await heir.del(`/api/host/team/${members.find((m) => m.email === "ivy@acme.example.com").id}`);
  check("the owner can remove a member", kick.status === 200 && (await ivy.get("/api/host/me")).json.org === null);

  // F10.9: admin lists host accounts and gives an organisation with no members to a host email.
  check("the host list needs the admin token", (await adm.get("/api/admin/hosts")).status === 401);
  const all = (await adm.get("/api/admin/hosts", ADMIN)).json;
  const ada = all.hosts.find((h) => h.email === "ben.next@example.ac.uk");
  check("admin lists host accounts with their organisation", ada && ada.setUp && ada.status === "active" && ada.org?.name === "Example Robotics Society", ada);
  const acme = (await adm.get("/api/admin/hosts?q=acme", ADMIN)).json.hosts;
  check("…and finds them by email, name or organisation", acme.length >= 2 && acme.every((h) => /acme/.test(h.email) || /Acme/.test(h.org?.name || "")), acme.map((h) => h.email));
  const t1 = Date.now();
  T.env.DB.raw.prepare("INSERT INTO orgs (id, name, plan, org_type, verification_status, created_at) VALUES ('orphan0001', 'Orphan Events Ltd', 'starter', 'company', 'approved', ?)").run(t1);
  const listed = (await adm.get("/api/admin/hosts", ADMIN)).json.unclaimed;
  check("an organisation with no members is listed as having no host", listed.some((o) => o.id === "orphan0001"), listed);
  const unknown = await adm.post("/api/admin/orgs/orphan0001/attach", { email: "nobody@acme.example.com" }, ADMIN);
  check("attaching needs an existing host account", unknown.status === 404, unknown.json);
  const busyAcct = await adm.post("/api/admin/orgs/orphan0001/attach", { email: "hana@acme.example.com" }, ADMIN);
  check("…that has no organisation yet", busyAcct.status === 409, busyAcct.json);
  const claimer = await signedUp("10.1.0.30", "cal@orphan.example.com", "Cal Claimer");
  const attached = await adm.post("/api/admin/orgs/orphan0001/attach", { email: "Cal@Orphan.example.com" }, ADMIN);
  const calMe = (await claimer.get("/api/host/me")).json;
  check("admin can attach the organisation to that host email, as owner", attached.status === 200 && calMe.org?.name === "Orphan Events Ltd" && calMe.role === "owner" && calMe.org.billingEmail === "cal@orphan.example.com", [attached.json, calMe.org]);
  check("…after which it has a host and can't be attached again",
    !(await adm.get("/api/admin/hosts", ADMIN)).json.unclaimed.some((o) => o.id === "orphan0001")
    && (await adm.post("/api/admin/orgs/orphan0001/attach", { email: "sid@acme.example.com" }, ADMIN)).status === 409);
  const cal = (await adm.get("/api/admin/hosts?q=cal@orphan", ADMIN)).json.hosts[0];
  const off = await adm.post(`/api/admin/hosts/${cal.id}/status`, { status: "disabled" }, ADMIN);
  check("switching a host account off signs it out everywhere", off.status === 200 && (await claimer.get("/api/host/me")).status === 401
    && q1("SELECT COUNT(*) n FROM host_sessions WHERE host_account_id = ?", cal.id).n === 0);
  const offIn = await hostSignIn(fresh("10.1.0.31"), "cal@orphan.example.com");
  check("…and it can't sign in until it's switched back on", offIn.verify.status === 400);
  await adm.post(`/api/admin/hosts/${cal.id}/status`, { status: "active" }, ADMIN);
  const backIn = await hostSignIn(fresh("10.1.0.32"), "cal@orphan.example.com");
  check("switched back on, it signs in again", backIn.verify.status === 200);
  check("admin host actions are in the audit log", q1("SELECT COUNT(*) n FROM admin_audit WHERE action LIKE 'POST /api/admin/orgs/%/attach' OR action LIKE 'POST /api/admin/hosts/%/status'").n >= 4);
}

console.log("\n# Anonymous visitors");
const anon = client();
const view = await anon.get(`/api/c/${Bp.card}`);
check("a first-time visitor can open a public card", view.status === 200 && view.json.viewer.signedIn === false, view.status);
check("…without creating an account", !anon.jar.has("lanyard_session"));
const conn = await anon.post("/api/connect", { cardId: Bp.card, name: "Newbie", email: "newbie@example.com", acceptTerms: true, over18: true });
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
