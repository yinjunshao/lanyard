// F59: feature stages and tutorials (D055). The Worker's rules (a tutorial shows once per account, never two on one calendar
// day, only known ids, counts only, deleted with the account and in the export, "Show tips again" for one account), the
// registry's trigger rules, and (from F59.2) the tour's keyboard, focus and motion rules as source guards.
// Run: node test/stages.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { makeEnv, makeDb, readMigration, check, summary, reqBody } from "./harness.mjs";
import { setSetting } from "../worker/ai/store.js";
import { eraseUser, purgeExpired } from "../worker/purge.js";
import { stageFunnel, SEEN_LIMIT, aiOnFor } from "../worker/stages.js";
import { STAGES, STAGE_IDS, MAX_STEPS, dueStage } from "../src/lib/stages.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const KEY = "sk-test-not-a-real-key-0123456789";
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => { throw new Error(`unexpected network call to ${url}`); }; // no model is ever called here

const realNow = Date.now.bind(Date);
let fixed = null;
Date.now = () => (fixed === null ? realNow() : fixed);
const DAY = 86400000;
const midnight = Math.floor(realNow() / DAY) * DAY + 2 * DAY; // 00:00 UTC, the day after tomorrow

const T = await makeEnv({ UNSUB_SECRET: "test-secret-for-links", AI_ENABLED: "1", AI_GATEWAY_URL: "https://gateway.test/v1/a/b/anthropic", OPENROUTER_API_KEY: KEY });
const { client, q, q1, env } = T;
await setSetting(env.DB, "rollout", "everyone");
const raw = env.DB.raw;

let ipn = 0;
async function signup(name, { verified = true, onboarding = false } = {}) {
  ipn += 1;
  const c = client({ ip: `10.59.${Math.floor(ipn / 200)}.${(ipn % 200) + 1}` });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, ...(onboarding ? { onboarding: true } : {}) });
  if (r.status !== 201) throw new Error(r.text);
  const me = await c.get("/api/me");
  const id = me.json.user.id;
  if (verified) raw.prepare("UPDATE users SET recovery_email = ?, email_verified = 1, is_guest = 0 WHERE id = ?").run(`${name.split(" ")[0].toLowerCase()}.${id}@mail.test`.slice(0, 80), id);
  return { c, name, id, card: me.json.cards[0].cardId };
}
const connect = async (from, to) => {
  const r = await from.c.post("/api/connect", { cardId: to.card });
  if (r.status !== 200) throw new Error(r.text);
  return r.json.connectionId;
};
const seen = (p, id, body) => p.c.post(`/api/stages/${id}/seen`, body);
const rows = (p) => q("SELECT stage, seen_at, outcome FROM user_stages WHERE user_id = ? ORDER BY seen_at", p.id);
const stats = (stage) => q("SELECT * FROM stage_stats WHERE stage = ?", stage);

// ------------------------------------------------------------------ F59.1
console.log("\n# The migration is additive");
{
  const old = makeDb({ before: "0041" });
  old.exec("INSERT INTO users (id, created_at) VALUES ('u1', 1)");
  old.exec(readMigration("0041_user_stages.sql"));
  const sql = readMigration("0041_user_stages.sql").replace(/--.*$/gm, "");
  check("0041 only creates: two tables and an index, nothing dropped, updated or deleted", (sql.match(/CREATE TABLE IF NOT EXISTS/g) || []).length === 2 && !/\b(DROP|DELETE|UPDATE|INSERT|RENAME|ALTER)\b/i.test(sql.replace(/ON DELETE CASCADE/g, "")));
  const cols = (t) => old.raw.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  check("user_stages holds who, which tip, when and how it ended", cols("user_stages").join() === "user_id,stage,seen_at,outcome", cols("user_stages"));
  check("stage_stats is counts per day and tip with no column that could say who", cols("stage_stats").join() === "day,stage,shown,finished,skipped", cols("stage_stats"));
  check("an existing account is untouched and the database still has all its other tables", !!old.raw.prepare("SELECT 1 FROM users WHERE id = 'u1'").get());
  check("0041 is the newest migration of the tips, named for them (0042, F56, adds one column to cards after it, 0043, F65, one to events, 0044, F66, the branding columns, and 0045, F70, the metrics archive)", readdirSync(new URL("../migrations", import.meta.url)).filter((f) => f.endsWith(".sql")).sort().filter((f) => f >= "0041").join() === "0041_user_stages.sql,0042_card_material.sql,0043_event_strap_ink.sql,0044_host_branding.sql,0045_metrics_daily.sql");
}

console.log("\n# The registry");
{
  check("there are six stages with the ids the plan names", STAGE_IDS.join() === "ai_finder,followup_reminder,draft_message,who_to_meet,more_cards,add_to_home", STAGE_IDS);
  check("ids are unique", new Set(STAGE_IDS).size === STAGE_IDS.length);
  check(`every tutorial has one to ${MAX_STEPS} steps (the plan says two to four; the install tip is one control)`, STAGES.every((s) => s.steps.length >= 1 && s.steps.length <= MAX_STEPS), STAGES.map((s) => s.steps.length));
  check("every step names a control (data-tip), a short title and one or two plain sentences", STAGES.every((s) => s.steps.every((st) => /^[a-z-]+$/.test(st.tip) && st.title.split(/\s+/).length <= 6 && st.text.length <= 150 && (st.text.match(/[.?]/g) || []).length <= 2)),
    STAGES.flatMap((s) => s.steps).filter((st) => !(/^[a-z-]+$/.test(st.tip) && st.title.split(/\s+/).length <= 6 && st.text.length <= 150)).map((st) => st.title));
  const words = JSON.stringify(STAGES.map((s) => s.steps.map((st) => [st.title, st.text])));
  check("no emoji and no named university or society in any tutorial", !/\p{Extended_Pictographic}/u.test(words) && !/\b(Oxford|Cambridge|Imperial|UCL|LSE|Harvard|Stanford|MIT|Warwick|Durham|Bristol|Edinburgh|Manchester)\b/i.test(words));
  check("every tutorial runs on a page the app has", STAGES.every((s) => ["people", "person", "event", "cards", "home"].includes(s.page)));
  const ok = { eligible: true, shownToday: false, seen: [], progress: { connections: 3, events: 0, cards: 1, aiFinder: true, aiDraft: true } };
  const at = (over, page = "people", ctx = {}) => dueStage({ ...ok, ...over, progress: { ...ok.progress, ...(over.progress || {}) } }, page, ctx)?.id || null;
  check("the AI Finder is due at 3 connections with AI on, on People", at({}) === "ai_finder");
  check("not at 2 connections (the owner's choice: after 3)", at({ progress: { connections: 2 } }) === null);
  check("not with AI off for the person", at({ progress: { aiFinder: false } }) === null);
  check("not on another page (on My card the home-screen tip is the one due, not the AI Finder)", at({}, "cards") === null && at({}, "event") === null && at({}, "home") === "add_to_home");
  check("not once seen, and a seen one stays seen at 10 connections", at({ seen: ["ai_finder"] }) === null && at({ seen: ["ai_finder"], progress: { connections: 10 } }) === null);
  check("not when a tip was already shown today", at({ shownToday: true }) === null);
  check("not for someone who is not ready (no card, welcome steps, Terms)", at({ eligible: false }) === null && dueStage(null, "people") === null && dueStage({ eligible: true }, "people") === null);
  check("the reminder tip is due on a person's page from the first connection", at({ progress: { connections: 1 } }, "person") === "followup_reminder" && at({ progress: { connections: 0 } }, "person") === null);
  check("Draft a message is due only for someone met at an event, with AI on, and after the reminder tip", at({ seen: ["followup_reminder"], progress: { connections: 1 } }, "person", { metAtEvent: true }) === "draft_message"
    && at({ seen: ["followup_reminder"], progress: { connections: 1 } }, "person", { metAtEvent: false }) === null
    && at({ seen: ["followup_reminder"], progress: { connections: 1, aiDraft: false } }, "person", { metAtEvent: true }) === null
    && at({ progress: { connections: 1 } }, "person", { metAtEvent: true }) === "followup_reminder");
  check("Who to meet is due on the event page after one check-in", at({ progress: { events: 1 } }, "event") === "who_to_meet" && at({ progress: { events: 0 } }, "event") === null);
  check("the cards tip is due after a second check-in or 5 connections, not before", at({ progress: { events: 2, connections: 0 } }, "cards") === "more_cards" && at({ progress: { events: 1, connections: 4 } }, "cards") === null && at({ progress: { events: 0, connections: 5 } }, "cards") === "more_cards");
  check("the home-screen tip is due after the second connection", at({ progress: { connections: 2 } }, "home") === "add_to_home" && at({ progress: { connections: 1 } }, "home") === null);
}

console.log("\n# Signed out and unknown ids");
{
  const out = client({ ip: "10.59.250.1" });
  const before = q1("SELECT COUNT(*) n FROM users").n;
  const g = await out.get("/api/stages");
  const p = await out.post("/api/stages/ai_finder/seen");
  const d = await out.del("/api/stages");
  check("signed out: reading, marking and clearing are all 401", g.status === 401 && p.status === 401 && d.status === 401, [g.status, p.status, d.status]);
  check("and none of them made a guest account", q1("SELECT COUNT(*) n FROM users").n === before);
  check("nothing was written", q1("SELECT COUNT(*) n FROM user_stages").n === 0 && q1("SELECT COUNT(*) n FROM stage_stats").n === 0);
}
const A = await signup("Alice Adams");
{
  const bad = [];
  for (const id of ["nope", "AI_FINDER", "ai_finder ", "x".repeat(300), "1", "followup", "ai_finder%00"]) {
    const r = await seen(A, encodeURIComponent(id));
    if (r.status !== 400 || r.json?.code !== "unknown_stage") bad.push([id.slice(0, 20), r.status]);
  }
  check("an unknown id is 400, whatever it looks like", bad.length === 0, bad);
  const o = await seen(A, "ai_finder", { outcome: "maybe" });
  check("an outcome that is not finished or skipped is 400", o.status === 400 && o.json.code === "bad_outcome", o.json);
  const end = await seen(A, "ai_finder", { outcome: "finished" });
  check("how a tip ended is refused for a tip that was never shown", end.status === 404 && end.json.code === "not_seen", end.json);
  check("none of those wrote a row or a count", rows(A).length === 0 && q1("SELECT COUNT(*) n FROM stage_stats").n === 0);
}

console.log("\n# Not ready: the welcome steps, no card");
{
  const N = await signup("Nina New", { onboarding: true });
  const st = await N.c.get("/api/stages");
  check("someone still in the welcome steps is not ready, and gets no counts", st.status === 200 && st.json.eligible === false && st.json.progress === null, st.json);
  const r = await seen(N, "ai_finder");
  check("and a tip is refused for them (403), writing nothing", r.status === 403 && r.json.code === "not_ready" && rows(N).length === 0, r.json);
  await N.c.put("/api/onboarding", { done: true });
  check("once the steps are finished they are ready", (await N.c.get("/api/stages")).json.eligible === true);
  const guestOnly = client({ ip: "10.59.250.2" });
  await guestOnly.post("/api/auth/link"); // a request that makes a guest with no card
  const gs = await guestOnly.get("/api/stages");
  check("a guest with no card is signed out as far as tips go (401, never ready)", gs.status === 401 || gs.json?.eligible === false, gs.status);
}

console.log("\n# What the Worker returns is counts only");
const B = await signup("Bea Brightwater");
const C = await signup("Cal Carter");
const D = await signup("Dee Dunmore");
{
  await connect(A, B);
  await connect(A, C);
  const two = await A.c.get("/api/stages");
  check("two connections: progress says 2, and AI is on for her (stub-free: a gateway and a key are set)", two.json.progress.connections === 2 && two.json.progress.aiFinder === true && two.json.progress.aiDraft === true, two.json);
  const dd = await connect(D, A); // someone else connects to Alice: it is a connection for her too
  const three = await A.c.get("/api/stages");
  check("a third connection makes it 3 (a connection counts from either side)", three.json.progress.connections === 3, three.json.progress);
  check("the answer has exactly these keys and nothing else", Object.keys(three.json).sort().join() === "eligible,progress,seen,shownToday" && Object.keys(three.json.progress).sort().join() === "aiDraft,aiFinder,cards,connections,events", [Object.keys(three.json), Object.keys(three.json.progress)]);
  const text = three.text;
  check("no name, id, card or email of anyone else is in it", ![B, C, D].some((p) => text.includes(p.id) || text.includes(p.card) || text.includes(p.name.split(" ")[0]) || text.includes(p.name.split(" ")[1])) && !text.includes(dd) && !/@/.test(text), text);
  check("every progress value is a number or yes/no", Object.values(three.json.progress).every((v) => typeof v === "number" || typeof v === "boolean"));
  check("the cards and events counts are her own", three.json.progress.cards === 1 && three.json.progress.events === 0);
  const zero = await signup("Zed Zero");
  const zr = await zero.c.get("/api/stages");
  check("a new account has zeros", zr.json.progress.connections === 0 && zr.json.seen.length === 0 && zr.json.shownToday === false, zr.json);
}

console.log("\n# AI off means the AI stages never show");
{
  const stageFor = (st) => dueStage(st, "people")?.id || null;
  await setSetting(env.DB, "killed", "1");
  const killed = (await A.c.get("/api/stages")).json;
  check("with the admin kill switch on, AI is off for her", killed.progress.aiFinder === false && killed.progress.aiDraft === false, killed.progress);
  check("so the AI Finder does not show, with 3 connections", stageFor(killed) === null);
  check("and Draft a message does not show on a person met at an event", dueStage({ ...killed, seen: ["followup_reminder"] }, "person", { metAtEvent: true }) === null);
  await setSetting(env.DB, "killed", "0");
  check("switched back on, it can show", stageFor((await A.c.get("/api/stages")).json) === "ai_finder");
  const noEmail = await signup("Una Unverified", { verified: false });
  await connect(noEmail, A); await connect(noEmail, B); await connect(noEmail, C);
  const ne = (await noEmail.c.get("/api/stages")).json;
  check("someone with no confirmed email is not let into AI, so no AI tip, whatever their count", ne.progress.connections === 3 && ne.progress.aiFinder === false && stageFor(ne) === null, ne.progress);
  const plain = await makeEnv({}); // an environment with AI not set up at all
  check("with AI not set up at all, the answer is no, and the check calls no model", (await aiOnFor(plain.env, "someone", "people_search")) === false);
  await setSetting(env.DB, "rollout", "allowlist");
  check("when the rollout does not include her, AI is off for her", (await A.c.get("/api/stages")).json.progress.aiFinder === false);
  await setSetting(env.DB, "rollout", "everyone");
}

console.log("\n# Once per account, idempotent, one a day (fixed clock)");
{
  fixed = midnight + 10 * 3600e3; // day X, 10:00 UTC
  const first = await seen(A, "ai_finder");
  check("starting a tip is recorded, and says it was the first time", first.status === 200 && first.json.first === true && rows(A).length === 1 && rows(A)[0].stage === "ai_finder" && rows(A)[0].seen_at === fixed, first.json);
  const again = await seen(A, "ai_finder");
  const third = await seen(A, "ai_finder");
  check("pressing it twice is still one row, and one count", again.status === 200 && third.status === 200 && again.json.first === false && rows(A).length === 1 && stats("ai_finder")[0].shown === 1, rows(A));
  const state = (await A.c.get("/api/stages")).json;
  check("the tip is in her seen list and a tip was shown today", state.seen.join() === "ai_finder" && state.shownToday === true, state);
  // a second device: the same account, a new browser, signed in by the link code
  const code = (await A.c.post("/api/auth/link")).json.code;
  const phone = client({ ip: "10.59.251.1" });
  const red = await phone.post("/api/auth/redeem", { code });
  const other = (await phone.get("/api/stages")).json;
  check("another device of the same account is signed in", red.status === 200 && other.eligible === true, red.text);
  check("and it sees the same: the tip is seen, so it is not shown again there", other.seen.join() === "ai_finder" && dueStage(other, "people") === null, other);
  const otherAgain = await phone.post("/api/stages/ai_finder/seen");
  check("and starting it there again adds nothing", otherAgain.status === 200 && otherAgain.json.first === false && rows(A).length === 1);

  const second = await seen(A, "followup_reminder");
  check("a different tip the same day is refused (409, one a day) and writes nothing", second.status === 409 && second.json.code === "one_a_day" && rows(A).length === 1, second.json);
  check("the refusal counts nothing", stats("followup_reminder").length === 0);
  fixed = midnight + 23 * 3600e3 + 59 * 60e3; // the same UTC day, a minute before midnight
  check("a minute before midnight is still the same day", (await seen(A, "followup_reminder")).status === 409);
  fixed = midnight + DAY + 60e3; // the next UTC day, a minute past midnight
  const next = await seen(A, "followup_reminder");
  check("a minute past midnight it is allowed", next.status === 200 && next.json.first === true && rows(A).length === 2, next.json);
  fixed = midnight + DAY + 12 * 3600e3;
  check("then that day is used up too", (await seen(A, "draft_message")).status === 409 && rows(A).length === 2);
  check("and the state says so", (await A.c.get("/api/stages")).json.shownToday === true);
  fixed = midnight + 2 * DAY + 3600e3;
  check("the day after, nothing was shown today", (await A.c.get("/api/stages")).json.shownToday === false);

  // two devices ask for two different tips at the same moment: only one wins
  const R = await signup("Rae Racer");
  fixed = midnight + 5 * DAY;
  const code2 = (await R.c.post("/api/auth/link")).json.code;
  const dev2 = client({ ip: "10.59.251.2" });
  await dev2.post("/api/auth/redeem", { code: code2 });
  const [x, y] = await Promise.all([R.c.post("/api/stages/ai_finder/seen"), dev2.post("/api/stages/followup_reminder/seen")]);
  check("two devices starting two different tips at once: exactly one is let through", [x.status, y.status].sort().join() === "200,409" && rows(R).length === 1, [x.status, y.status]);
  const sameBoth = await signup("Sam Same");
  const [s1, s2] = await Promise.all([seen(sameBoth, "who_to_meet"), seen(sameBoth, "who_to_meet")]);
  check("two devices starting the same tip at once: one row, both are told ok, one count", s1.status === 200 && s2.status === 200 && rows(sameBoth).length === 1 && stats("who_to_meet")[0].shown === 1 && [s1, s2].filter((r) => r.json.first).length === 1, [s1.json, s2.json]);
  fixed = null;
}

console.log("\n# How a tip ended: finished or skipped, counted once");
{
  const E = await signup("Eve Ender");
  fixed = midnight + 8 * DAY;
  await seen(E, "who_to_meet");
  const a = await seen(E, "who_to_meet", { outcome: "skipped" });
  const b = await seen(E, "who_to_meet", { outcome: "finished" });
  const c2 = await seen(E, "who_to_meet", { outcome: "skipped" });
  check("the first ending is kept; a later one changes nothing and is not counted", a.status === 200 && b.status === 200 && c2.status === 200 && rows(E)[0].outcome === "skipped", rows(E));
  const s = stats("who_to_meet").find((r) => r.shown === 2 || true);
  const total = q1("SELECT SUM(shown) shown, SUM(finished) finished, SUM(skipped) skipped FROM stage_stats WHERE stage = 'who_to_meet'");
  check("the daily counts: who_to_meet shown twice so far (Sam and Eve), skipped once, finished never", total.shown === 2 && total.skipped === 1 && total.finished === 0, total);
  fixed = null;
}

console.log("\n# Rate limit");
{
  const L = await signup("Lou Limit");
  fixed = midnight + 12 * DAY;
  let last = null;
  let firstBlock = 0;
  for (let n = 1; n <= SEEN_LIMIT + 3; n++) { last = await seen(L, "add_to_home"); if (last.status === 429 && !firstBlock) firstBlock = n; }
  check(`after ${SEEN_LIMIT} calls in an hour the next is 429, with the code`, firstBlock === SEEN_LIMIT + 1 && last.status === 429 && last.json.code === "throttled", [firstBlock, last.status]);
  check("and it is still one row", rows(L).length === 1);
  const other = await signup("Moe Other");
  check("another person is not limited by it", (await seen(other, "add_to_home")).status === 200);
  fixed = null;
}

console.log("\n# Show tips again clears one account only");
{
  fixed = midnight + 20 * DAY;
  const P = await signup("Pia Pick");
  const Q = await signup("Quin Other");
  await seen(P, "ai_finder");
  fixed += DAY; await seen(P, "followup_reminder");
  fixed += DAY; await seen(Q, "ai_finder");
  const stat = q1("SELECT SUM(shown) n FROM stage_stats").n;
  const r = await P.c.del("/api/stages");
  check("Show tips again answers ok", r.status === 200 && r.json.ok === true, r.text);
  check("her seen tips are gone and she can be shown one today", rows(P).length === 0 && (await P.c.get("/api/stages")).json.shownToday === false && (await P.c.get("/api/stages")).json.seen.length === 0);
  check("someone else's tips are not touched", rows(Q).length === 1 && rows(A).length === 2);
  check("the funnel counts stay as they were (they are not about her)", q1("SELECT SUM(shown) n FROM stage_stats").n === stat);
  check("she can be shown the first one again", (await seen(P, "ai_finder")).json.first === true);
  fixed = null;
}

console.log("\n# Deleted with the account, and in the data download");
{
  const X = await signup("Xan Export");
  fixed = midnight + 30 * DAY;
  const none = (await X.c.get("/api/account/export")).json;
  check("a person who was never shown a tip has no tip record in the download", !("stageTips" in none));
  await seen(X, "who_to_meet");
  await seen(X, "who_to_meet", { outcome: "finished" });
  const exp = (await X.c.get("/api/account/export")).json;
  check("the download lists which tip, when and how it ended", Array.isArray(exp.stageTips) && exp.stageTips.length === 1 && exp.stageTips[0].stage === "who_to_meet" && exp.stageTips[0].seenAt === fixed && exp.stageTips[0].outcome === "finished", exp.stageTips);
  check("the download of another account does not include it", !JSON.stringify((await A.c.get("/api/account/export")).json.stageTips || []).includes("who_to_meet"));
  const del = await X.c.del("/api/account");
  check("deleting the account works", del.status === 200);
  check("its tip rows are gone with it", q("SELECT * FROM user_stages WHERE user_id = ?", X.id).length === 0);
  check("and the counts, which never said who, are still there", q1("SELECT SUM(shown) n FROM stage_stats WHERE stage = 'who_to_meet'").n >= 1);
  const Y = await signup("Yan Erase");
  await seen(Y, "more_cards");
  await eraseUser(env, Y.id);
  check("erasing from the clean-up side removes them too", q("SELECT * FROM user_stages WHERE user_id = ?", Y.id).length === 0);
  fixed = null;
}

console.log("\n# The funnel is counts only, and old counts are cleared");
{
  const f = await stageFunnel(env.DB, 30);
  check("the funnel lists every stage with shown, finished and skipped, and nothing else", f.stages.length === STAGE_IDS.length && f.stages.every((s) => Object.keys(s).sort().join() === "finished,shown,skipped,stage") && JSON.stringify(f).indexOf("user") === -1, f);
  check("it adds up the days", f.stages.find((s) => s.stage === "who_to_meet").shown >= 2);
  raw.prepare("INSERT OR REPLACE INTO stage_stats (day, stage, shown, finished, skipped) VALUES ('2020-01-01', 'ai_finder', 5, 1, 1)").run();
  const old = (await stageFunnel(env.DB, 30)).stages.find((s) => s.stage === "ai_finder").shown;
  await purgeExpired(env, realNow());
  check("a count from long ago is not in the last 30 days, and the daily clean-up removes it", old === (await stageFunnel(env.DB, 30)).stages.find((s) => s.stage === "ai_finder").shown && q("SELECT * FROM stage_stats WHERE day = '2020-01-01'").length === 0);
}

console.log("\n# Settings > Help and the registry stay out of public pages");
{
  const help = read("src/views/settings/SettingsHelp.vue");
  check("Settings > Help has Show tips again, which calls DELETE /api/stages and forgets the page's copy", /Show tips again/.test(help) && /api\("\/api\/stages", "DELETE"\)/.test(help) && /forgetStages\(\)/.test(help) && /:disabled="tipsBusy"/.test(help));
  const walk = (d) => readdirSync(new URL("../" + d, import.meta.url)).flatMap((f) => (statSync(new URL("../" + d + "/" + f, import.meta.url)).isDirectory() ? walk(d + "/" + f) : [d + "/" + f]));
  const PUBLIC = ["Landing", "PublicCard", "Hosts", "Privacy", "Terms", "Redeem", "SignIn", "PrivacyRequest", "EventJoin", "Connect", "Claim"].map((n) => `src/views/${n}.vue`);
  const ENTRY = ["src/main.js", "src/App.vue", "src/lib/store.js", "src/lib/api.js", ...walk("src/router")];
  const re = /stages|StageHost|StageTour/;
  check("no public page, entry file or router file mentions tutorials", [...PUBLIC, ...ENTRY].every((f) => !re.test(read(f))), [...PUBLIC, ...ENTRY].filter((f) => re.test(read(f))));
  check("the me response and the store carry no tutorial progress (it has its own route)", !/stage|tutorial/i.test(read("src/lib/store.js")) && !/progressOf|stages/.test(/app\.get\("\/api\/me"[\s\S]*?\n\}\);/.exec(read("worker/index.js"))?.[0] || ""));
}

// ------------------------------------------------------------------ F59.2
console.log("\n# The tour: where it loads, and what it promises (source guards; the browser walk is in the plan note's Log)");
{
  const tour = read("src/components/StageTour.vue").replace(/\r\n/g, "\n");
  const host = read("src/components/StageHost.vue").replace(/\r\n/g, "\n");
  const shell = read("src/components/AppShell.vue");
  const walk = (d) => readdirSync(new URL("../" + d, import.meta.url)).flatMap((f) => (statSync(new URL("../" + d + "/" + f, import.meta.url)).isDirectory() ? walk(d + "/" + f) : [d + "/" + f]));
  const files = walk("src").filter((f) => /\.(vue|js)$/.test(f));
  const strip = (t) => t.replace(/\/\/.*$/gm, "").replace(/<!--[\s\S]*?-->/g, "");
  check("the tour is fetched with a plain import() from StageHost, and nothing imports it statically", /import\("\.\/StageTour\.vue"\)/.test(host) && files.filter((f) => /^\s*import .*StageTour/m.test(strip(read(f)))).length === 0 && !/defineAsyncComponent/.test(host));
  const mounts = files.filter((f) => /StageHost/.test(strip(read(f))) && !/StageHost\.vue$/.test(f)).sort();
  check("only the signed-in frame (and, from F59.3, a connection's panel) mount the host: both load only for signed-in people", mounts.includes("src/components/AppShell.vue") && mounts.every((f) => ["src/components/AppShell.vue", "src/components/CardConnection.vue"].includes(f)) && /<StageHost v-if="showChrome"/.test(shell), mounts);
  check("the host fetches the tour before it records the tip (a failed download loses nothing), and shows nothing if the page changed meanwhile", host.indexOf('import("./StageTour.vue")') < host.indexOf("await markSeen") && /if \(mine !== run\) return;/.test(host));
  check("the host waits: no tip while a sheet, dialog, open editor or a focused field is there, and the first control must be on the page and still", /\.sheet-backdrop/.test(host) && /\.reveal\.open/.test(host) && /INPUT\|TEXTAREA\|SELECT/.test(host) && /isContentEditable/.test(host) && /still >= 2/.test(host) && /document\.visibilityState === "visible"/.test(host));
  check("the always-present photo viewer does not count as an open dialog until it is open", /:not\(\.lb\)/.test(host) && /\.lb\.open/.test(host));
  check("it never runs for someone with no card", /!me\.profile\) return/.test(host));
  check("the card is a dialog with a name and a description", /role="dialog"/.test(tour) && /aria-modal="true"/.test(tour) && /aria-labelledby="tour-title"/.test(tour) && /aria-describedby="tour-text"/.test(tour));
  check("focus moves into the card when it opens (on the main button) and goes back to where it was when it ends", /opener = document\.activeElement/.test(tour) && /\[data-primary\]/.test(tour) && /opener\.focus\(/.test(tour));
  check("Escape skips, from anywhere (a capture listener on the document), and does nothing else", /e\.key === "Escape"[^}]*finish\("skipped"\)/.test(tour) && /document\.addEventListener\("keydown", onKey, true\)/.test(tour) && /stopPropagation\(\)/.test(tour));
  check("Tab and Shift+Tab stay inside the card, so it works with the keyboard alone", /e\.key !== "Tab"/.test(tour) && /f\[f\.length - 1\]\.focus\(\)/.test(tour) && /f\[0\]\.focus\(\)/.test(tour));
  check("every button is a real button: Skip, Back, Next, Try it and Got it", ["Skip", "Back", "Next", "Try it", "Got it"].every((l) => new RegExp(`<button[^<]*?type="button"[^<]*?>${l}</button>`).test(tour)));
  check("when the pressed button goes (Next becomes Got it on the last step), focus is put back inside the card, so the keyboard is never dropped", /async function go\(d\)/.test(tour) && /if \(!card\.value\?\.contains\(document\.activeElement\)\) \(card\.value\?\.querySelector\("\[data-primary\]"\)/.test(tour));
  check("Try it presses a button or link but only focuses a field or a tick, so trying it never changes a choice (it does not untick Suggest me)", /el\.matches\("button, a\[href\]"\) \? el : el\.querySelector\("input, textarea, select, button, a\[href\]"\)/.test(tour) && /if \(ctl\.matches\("button, a\[href\]"\)\) ctl\.click\(\);/.test(tour) && !/el\.click\(\)/.test(tour));
  check("the host does not start a tip within 1.5 s of a press, a key or a scroll, so it cannot land on top of something the person is opening", /QUIET_MS = 1500/.test(host) && /\["pointerdown", "keydown", "wheel", "touchstart"\]/.test(host) && /Date\.now\(\) - touched > QUIET_MS/.test(host) && /removeEventListener\(e, touch/.test(host));
  check("the always-open My card editors count as busy but the closed card summary does not (the Cards page would never get its tip)", /\.reveal\.open \[id\^="card-editor-"\]/.test(host));
  check("the last step can press the real control: Try it, or a press on the control itself", /canPress/.test(tour) && /function tryIt/.test(tour) && /addEventListener\("click", pressedTarget, true\)/.test(tour) && /\.tour > \.tour-hole\.open/.test(tour));
  check("a control that is no longer there leaves the card without a ring (no crash)", /if \(!r \|\| \(!r\.width && !r\.height\)\) \{ rect\.value = null/.test(tour) && /v-if="rect"/.test(tour));
  check("listeners are removed when it goes", /removeEventListener\("keydown", onKey, true\)/.test(tour) && /removeEventListener\("scroll", follow\)/.test(tour) && /onBeforeUnmount/.test(tour));
  check("how it ended is sent for the funnel and a failure there changes nothing", /endStage\(props\.stage\.id, outcome\)/.test(tour) && /\.catch\(\(\) => \{\}\)/.test(read("src/lib/stagesState.js")));
  const css = (tour.match(/<style[^>]*>([\s\S]*?)<\/style>/) || [])[1] || "";
  const main = read("src/styles/main.css");
  check("motion comes from the tokens only: no hard-coded duration or easing, and no transition", !/\b\d+(\.\d+)?m?s\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")) && !/cubic-bezier|transition/.test(css) && /var\(--dur\)/.test(css) && /var\(--ease-out\)/.test(css));
  const keyframes = [...css.matchAll(/animation: (m-[\w-]+)/g)].map((m) => m[1]);
  check("it uses only the shared keyframes, which exist in main.css (slides become fades under reduced motion; nothing here scales)", keyframes.length >= 4 && keyframes.every((k) => new RegExp(`@keyframes ${k} `).test(main)) && keyframes.every((k) => ["m-fade", "m-fade-out", "m-rise", "m-sheet-in", "m-sheet-out"].includes(k)), keyframes);
  check("it leaves faster than it arrives, and the wait before it is removed is under 300 ms and over the slowest exit", /--dur-out/.test(css) && Number(/EXIT_MS = (\d+)/.exec(tour)?.[1]) <= 300 && Number(/EXIT_MS = (\d+)/.exec(tour)?.[1]) >= 200);
  check("while leaving it takes no presses", /\.tour\.is-leaving > \* \{ pointer-events: none; \}/.test(css));
  check("it follows the control while the page scrolls and the window changes, and brings it into view without a smooth scroll under reduced motion", /addEventListener\("scroll", follow/.test(tour) && /addEventListener\("resize", follow\)/.test(tour) && /calm\(\) \? "auto" : "smooth"/.test(tour));
  check("on a phone the card is a sheet at the bottom; elsewhere it sits beside the control", /\.tour-card\.phone/.test(css) && /max-width: 599px/.test(tour));
  check("it shows no colour of its own beyond the dim layer: the theme's paper, ink, strap and shadow (Light, Dark and Midnight follow)", !/#[0-9a-f]{3,8}\b/i.test(css) && /var\(--paper\)/.test(css) && /var\(--strap\)/.test(css) && /var\(--shadow-2\)/.test(css));
  check("the card says which tip of how many, and updates politely for a screen reader", /Tip \{\{ i \+ 1 \}\} of \{\{ stage\.steps\.length \}\}/.test(tour) && /aria-live="polite"/.test(tour));
  const people = read("src/views/People.vue");
  check("the AI Finder tutorial points at the real row on People (data-tip=ai-ask)", /class="ask-row" data-tip="ai-ask"/.test(people) && STAGES.find((s) => s.id === "ai_finder").steps.every((s) => s.tip === "ai-ask"));
  check("the frame names the page a tip may run on, and My card, People, Cards and one event page are the only ones", /return p\.startsWith\("\/app\/events\/"\)/.test(shell) && /"home"/.test(shell) && /"people"/.test(shell) && /"cards"/.test(shell));
}

// ------------------------------------------------------------------ F59.3
console.log("\n# The acceptance walk on the Worker: 2 connections, then a third, then finished, on another device too");
{
  const W = await signup("Wren Walker");
  const P1 = await signup("Pax One"), P2 = await signup("Pax Two"), P3 = await signup("Pax Three");
  await connect(P1, W); await connect(P2, W);
  const s2 = (await W.c.get("/api/stages")).json;
  check("with 2 connections and AI on, People starts no tour", s2.progress.connections === 2 && s2.progress.aiFinder === true && dueStage(s2, "people") === null, s2.progress);
  await connect(P3, W);
  const s3 = (await W.c.get("/api/stages")).json;
  check("after a third, opening People starts the AI Finder tour", dueStage(s3, "people")?.id === "ai_finder");
  fixed = midnight + 40 * DAY;
  check("it is recorded as it starts", (await seen(W, "ai_finder")).json.first === true);
  check("finishing it is recorded", (await seen(W, "ai_finder", { outcome: "finished" })).status === 200 && rows(W)[0].outcome === "finished");
  const again = (await W.c.get("/api/stages")).json;
  check("reloading does not show it again", dueStage(again, "people") === null && again.seen.includes("ai_finder"));
  const code = (await W.c.post("/api/auth/link")).json.code;
  const other = client({ ip: "10.59.252.1" });
  await other.post("/api/auth/redeem", { code });
  const otherState = (await other.get("/api/stages")).json;
  check("another browser does not show it either", otherState.eligible === true && dueStage(otherState, "people") === null);
  for (let n = 0; n < 3; n++) await connect(await signup(`Extra ${n}`), W);
  check("and more connections never bring it back", dueStage((await W.c.get("/api/stages")).json, "people") === null);
  fixed = null;
}

console.log("\n# The admin funnel is counts only");
{
  const A2 = client({ ip: "10.59.253.1" });
  const adminEnv = await makeEnv({ ADMIN_TOKEN: "stages-admin-token", UNSUB_SECRET: "x" });
  const get = (token) => adminEnv.client({ ip: "10.59.253.2" }).get("/api/admin/stages", token ? { authorization: `Bearer ${token}` } : {});
  check("the page is for the admin token only", (await get()).status === 401 && (await get("wrong")).status === 401);
  const empty = (await get("stages-admin-token")).json;
  check("with nothing seen yet, every stage is there with zeros", empty.stages.length === 6 && empty.stages.every((s) => s.shown === 0 && s.finished === 0 && s.skipped === 0), empty);
  adminEnv.env.DB.raw.prepare("INSERT INTO stage_stats (day, stage, shown, finished, skipped) VALUES (?, 'ai_finder', 4, 3, 1)").run(new Date(realNow()).toISOString().slice(0, 10));
  const body = (await get("stages-admin-token")).json;
  check("it adds up, and the response holds no id, name or time of a person", body.stages.find((s) => s.stage === "ai_finder").shown === 4 && Object.keys(body).sort().join() === "days,since,stages" && body.stages.every((s) => Object.keys(s).sort().join() === "finished,shown,skipped,stage"), body);
  const adm = read("src/views/Admin.vue");
  check("the admin page shows it, with a name for each tip", /\/api\/admin\/stages/.test(adm) && /id="adm-tips-h"/.test(adm) && Object.keys({ ai_finder: 1, followup_reminder: 1, draft_message: 1, who_to_meet: 1, more_cards: 1, add_to_home: 1 }).every((k) => adm.includes(k)));
  check("no host route reads it (hosts only ever see aggregates of their events)", !/stage_stats|user_stages|stageFunnel/.test(read("worker/hosts.js") + read("worker/events.js") + read("worker/host-auth.js") + read("worker/myevents.js")));
  void A2;
}

console.log("\n# Every tutorial points at a real control, and nothing else claims one");
{
  const sources = {
    "src/views/People.vue": ["ai-ask"],
    "src/components/CardConnection.vue": ["followup", "note", "draft"],
    "src/components/EventWhoToMeet.vue": ["who-to-meet", "intention", "suggest-me"],
    "src/views/Cards.vue": ["new-card", "card-edit"],
    "src/views/MyCard.vue": ["install"],
  };
  const text = Object.fromEntries(Object.keys(sources).map((f) => [f, read(f)]));
  const wanted = [...new Set(STAGES.flatMap((s) => s.steps.map((st) => st.tip)))].sort();
  const found = Object.entries(sources).flatMap(([f, tips]) => tips.map((t) => [f, t]));
  check("every control a step names has a data-tip in the page source", wanted.every((t) => found.some(([f, tip]) => tip === t && new RegExp(`data-tip="${t}"|:data-tip="[^"]*'${t}'`).test(text[f]))), wanted.filter((t) => !found.some(([, tip]) => tip === t)));
  check("and the pages claim no data-tip that no step uses", found.every(([, t]) => wanted.includes(t)) && wanted.length === found.length, [wanted, found.map((x) => x[1])]);
  const stray = ["src/views", "src/components"].flatMap((d) => readdirSync(new URL("../" + d, import.meta.url)).filter((f) => f.endsWith(".vue")).map((f) => `${d}/${f}`)).filter((f) => /data-tip=/.test(read(f)) && !sources[f] && !/\/Stage(Host|Tour)\.vue$/.test(f)); // those two only look the attribute up
  check("no other file carries a data-tip", stray.length === 0, stray);
  const walk = (d) => readdirSync(new URL("../" + d, import.meta.url)).flatMap((f) => (statSync(new URL("../" + d + "/" + f, import.meta.url)).isDirectory() ? walk(d + "/" + f) : [d + "/" + f]));
  const mounts = walk("src").filter((f) => /\.vue$/.test(f) && /<StageHost/.test(read(f)) && !/StageHost\.vue$/.test(f)).sort();
  check("the host is mounted by exactly two files: the frame and a connection's panel", mounts.join() === "src/components/AppShell.vue,src/components/CardConnection.vue", mounts);
  const cn = read("src/components/CardConnection.vue");
  check("a person's panel runs the 'person' tips and tells the registry whether you met at an event", /<StageHost page="person" :ctx="\{ metAtEvent: !!connection\.event \}"/.test(cn));
  check("the connection panel is still fetched lazily by the card page, so a person who is not connected never loads the host", /import\("\.\.\/components\/CardConnection\.vue"\)/.test(read("src/views/PublicCard.vue")) && !/StageHost/.test(read("src/views/PublicCard.vue")));
  const shell = read("src/components/AppShell.vue");
  check("the frame maps My card, People, Cards and one event page to their tips", /p === "\/app"\) return "home"/.test(shell) && /"\/app\/people"\) return "people"/.test(shell) && /"\/app\/cards"\) return "cards"/.test(shell) && /"event"/.test(shell));
  check("the Cards tip points at the first card's Edit button only", /:data-tip="n === 0 \? 'card-edit' : null"/.test(text["src/views/Cards.vue"]));
  check("the home-screen tip points at the panel that only shows on a phone that has not added Lanyard", /aria-label="Add to home screen" data-tip="install"/.test(text["src/views/MyCard.vue"]) && /v-else-if="showInstall"/.test(text["src/views/MyCard.vue"]));
}

console.log("\n# The Privacy Policy says it, and the Terms version is not bumped");
{
  const pv = read("src/views/Privacy.vue");
  check("what is stored and why is in section 2, and how long is in section 6", /Which short app tips you have been shown, and whether you finished or skipped each/.test(pv) && /To show each tip once and no more than one a day/.test(pv) && /Which app tips you have been shown<\/td><td>Until you delete your account, or press Show tips again/.test(pv));
  check("the Terms and Privacy version is still 2026-11-22", /TERMS_VERSION = "2026-11-22"/.test(read("worker/legal.js")));
}

globalThis.fetch = realFetch;
Date.now = realNow;
summary();
