// F21: the AI foundation. Every model call here goes to a stubbed fetch: nothing leaves the machine,
// no key is read from disk. Sections are added task by task (F21.1 config, F21.2 the client, F21.4
// admin, F21.5 settings). Run: node test/ai.mjs
import { readFileSync } from "node:fs";
import { makeDb, makeEnv, readMigration, check, summary, becomeHost } from "./harness.mjs";
import { aiConfig, stubMode, dayOf, monthOf, DEFAULT_MODEL, DEFAULT_GATEWAY, DEFAULT_FALLBACK_MODEL } from "../worker/ai/config.js";
import { prices, costMicros } from "../worker/ai/price.js";
import { AI_LIMITS } from "../worker/plans.js";
import { callModel, allowanceFor, requestBody } from "../worker/ai/client.js";
import { S } from "../worker/ai/validate.js";
import { searchableIds, setAiSearchOk } from "../worker/ai/optout.js";
import { setSetting } from "../worker/ai/store.js";
import { purgeExpired, eraseUser } from "../worker/purge.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

// A fetch that refuses everything, installed before anything else runs: no test may reach a network.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => { throw new Error(`unexpected network call to ${url}`); };

console.log("\n# Migration 0024 (additive, on data in the old shape)");
{
  const db = makeDb({ before: "0024" });
  db.raw.prepare("INSERT INTO users (id, created_at, is_guest) VALUES ('u-old', 1, 0)").run();
  db.exec(readMigration("0024_ai_foundation.sql"));
  const row = db.raw.prepare("SELECT ai_search_ok FROM users WHERE id = 'u-old'").get();
  check("an account made before the migration is findable by AI search (default 1)", row.ai_search_ok === 1, row);
  const tables = db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ai\\_%' ESCAPE '\\'").all().map((r) => r.name).sort();
  check("it adds the four tables and nothing else", tables.join() === "ai_cache,ai_daily,ai_settings,ai_usage", tables);
  const cols = (t) => db.raw.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  const text = ["prompt", "system", "input", "messages", "content", "body", "text"];
  check("no table has a column that could hold a prompt", ["ai_usage", "ai_daily", "ai_settings", "ai_cache"].every((t) => !cols(t).some((c) => text.includes(c))), cols("ai_cache"));
  check("the only text a call leaves is the cached reply (ai_cache.result)", cols("ai_cache").includes("result") && !cols("ai_usage").includes("result"));
  const mig = read("migrations/0024_ai_foundation.sql");
  check("the migration only adds (no DROP, no UPDATE of old data, no edit to an older migration)", !/\bDROP\b|\bUPDATE\b|\bDELETE\b|\bRENAME\b/i.test(mig.replace(/--.*$/gm, "")));
}

console.log("\n# Configuration");
{
  const off = aiConfig({});
  check("with nothing set, AI is off and nothing is configured", !off.enabled && off.gatewayUrl === DEFAULT_GATEWAY && !off.hasKey && off.model === DEFAULT_MODEL, off);
  check("the model id is the cheap OpenRouter default and comes from AI_MODEL when set", DEFAULT_MODEL === "google/gemini-2.5-flash-lite" && aiConfig({ AI_MODEL: "other-model" }).model === "other-model");
  check("only 1, true, on or yes turn it on", ["1", "true", "ON", "yes"].every((v) => aiConfig({ AI_ENABLED: v }).enabled) && ["0", "", "no", "false", "2", "enabled"].every((v) => !aiConfig({ AI_ENABLED: v }).enabled));
  check("budgets default to $2 a day and $30 a month", aiConfig({}).dailyBudgetMicros === 2_000_000 && aiConfig({}).monthlyBudgetMicros === 30_000_000);
  check("a budget of 0.000001 is one micro-dollar", aiConfig({ AI_DAILY_BUDGET_USD: "0.000001" }).dailyBudgetMicros === 1);
  check("a budget that is set but not a positive number means zero, not unlimited", ["abc", "-5", "0", "NaN", "Infinity"].every((v) => aiConfig({ AI_DAILY_BUDGET_USD: v }).dailyBudgetMicros === 0 && aiConfig({ AI_MONTHLY_BUDGET_USD: v }).monthlyBudgetMicros === 0));
  check("the gateway must be an https address without credentials or a query; a trailing slash is removed",
    aiConfig({ AI_GATEWAY_URL: "https://gw.test/v1/a/b/anthropic/" }).gatewayUrl === "https://gw.test/v1/a/b/anthropic"
    && ["http://gw.test", "ftp://x", "not a url", "https://u:p@gw.test", "https://gw.test/?k=1"].every((v) => aiConfig({ AI_GATEWAY_URL: v }).gatewayUrl === null));
  check("the key counts as set only when it looks like a key (8 or more characters)", aiConfig({ OPENROUTER_API_KEY: "short" }).hasKey === false && aiConfig({ OPENROUTER_API_KEY: "sk-test-12345" }).hasKey === true);
  check("the timeout defaults to 10 seconds and is capped at 30", aiConfig({}).timeoutMs === 10000 && aiConfig({ AI_TIMEOUT_MS: "60" }).timeoutMs === 60 && aiConfig({ AI_TIMEOUT_MS: "999999" }).timeoutMs === 30000 && aiConfig({ AI_TIMEOUT_MS: "x" }).timeoutMs === 10000);
  check("days and months are UTC", dayOf(Date.UTC(2026, 10, 10, 23, 59, 59)) === "2026-11-10" && dayOf(Date.UTC(2026, 10, 11, 0, 0, 0)) === "2026-11-11" && monthOf(Date.UTC(2026, 11, 31, 23, 0)) === "2026-12");
}

console.log("\n# Local stub mode is refused anywhere that is not local");
{
  const local = { AI_STUB: "1", APP_ORIGIN: "http://localhost:5173,http://host.localhost:5173" };
  check("allowed when every origin is local", stubMode(local).allowed === true);
  check("not asked for means not allowed", stubMode({ APP_ORIGIN: local.APP_ORIGIN }).allowed === false);
  check("refused on a production origin", stubMode({ AI_STUB: "1", APP_ORIGIN: "https://lanyd.fyi" }).allowed === false);
  check("refused when even one origin is not local", stubMode({ AI_STUB: "1", APP_ORIGIN: "http://localhost:5173,https://lanyd.fyi" }).allowed === false);
  check("refused with no origin set, with a bad one, and with look-alike hosts",
    stubMode({ AI_STUB: "1" }).allowed === false && stubMode({ AI_STUB: "1", APP_ORIGIN: "nonsense" }).allowed === false
    && stubMode({ AI_STUB: "1", APP_ORIGIN: "https://localhost.evil.example" }).allowed === false && stubMode({ AI_STUB: "1", APP_ORIGIN: "https://evil.example/localhost" }).allowed === false);
  const prod = read("wrangler.production.toml");
  const live = prod.replace(/^\s*#.*$/gm, "");
  check("production config never sets AI_STUB", !/AI_STUB/.test(live));
  check("production config has AI_ENABLED on (the owner switched it on, with the key set as a secret)", /^AI_ENABLED\s*=\s*"1"/m.test(live));
  check("production config holds no key and no price (the owner sets both)", !/OPENROUTER_API_KEY|AI_PRICE_|sk-ant/.test(live));
  const localToml = read("wrangler.toml").replace(/^\s*#.*$/gm, "");
  const localOrigin = /^APP_ORIGIN\s*=\s*"([^"]+)"/m.exec(localToml)[1];
  check("the local config turns the stub on, and only with local origins (so the Worker would accept it there and nowhere else)", /^AI_STUB\s*=\s*"1"/m.test(localToml) && stubMode({ AI_STUB: "1", APP_ORIGIN: localOrigin }).allowed === true, localOrigin);
  const wranglerDeploys = (src) => src.split("\n").filter((l) => /wrangler(\.cmd)? deploy/.test(l));
  const deploys = wranglerDeploys(read("package.json")).concat(wranglerDeploys(read("deploy.bat")));
  check("`npm run deploy` and deploy.bat both use the production config, never the local file that has the stub", deploys.length >= 2 && deploys.every((l) => /--config wrangler\.production\.toml/.test(l)), deploys);
  check("the production APP_ORIGIN would make the Worker refuse the stub anyway", stubMode({ AI_STUB: "1", APP_ORIGIN: /^APP_ORIGIN\s*=\s*"([^"]+)"/m.exec(live)[1] }).allowed === false);
}

console.log("\n# Prices and cost");
{
  const p = prices({});
  check("with no price vars the plan's figures are used and flagged unconfirmed", p.input === 0.10 && p.output === 0.40 && p.confirmed === false);
  check("both vars together are confirmed and used", prices({ AI_PRICE_INPUT_PER_MTOK_USD: "1", AI_PRICE_OUTPUT_PER_MTOK_USD: "5" }).confirmed === true && prices({ AI_PRICE_INPUT_PER_MTOK_USD: "1", AI_PRICE_OUTPUT_PER_MTOK_USD: "5" }).output === 5);
  check("one var alone, or a bad one, stays unconfirmed", prices({ AI_PRICE_INPUT_PER_MTOK_USD: "1" }).confirmed === false && prices({ AI_PRICE_INPUT_PER_MTOK_USD: "x", AI_PRICE_OUTPUT_PER_MTOK_USD: "-1" }).confirmed === false);
  const env = { AI_PRICE_INPUT_PER_MTOK_USD: "1", AI_PRICE_OUTPUT_PER_MTOK_USD: "5" };
  check("cost is micro-dollars: 1,000,000 input tokens at $1 is 1,000,000", costMicros(env, 1_000_000, 0) === 1_000_000 && costMicros(env, 0, 1_000_000) === 5_000_000);
  check("a tiny call is rounded up, never free", costMicros({}, 1, 0) === 1 && costMicros({}, 900, 180) === 162);
  check("negative token counts count as zero", costMicros({}, -5, -5) === 0);
}

console.log("\n# Allowances (AI_LIMITS in worker/plans.js)");
{
  const L = AI_LIMITS;
  check("drafts: Free 3 a day and 15 a month, Plus 15 a day and 150 a month", L.followup.free.day === 3 && L.followup.free.month === 15 && L.followup.plus.day === 15 && L.followup.plus.month === 150);
  check("people search: Free 5 a day, Plus 30 a day", L.people_search.free.day === 5 && L.people_search.plus.day === 30);
  check("who to meet: 3 per event Free, 10 Plus", L.who_to_meet.free.perScope === 3 && L.who_to_meet.plus.perScope === 10);
  check("host summary regenerations: 3 a day, for hosts only", L.feedback_summary.host.day === 3 && !L.feedback_summary.free && !L.feedback_summary.plus);
  check("people search and who to meet honour the AI search opt-out; drafts do not", L.people_search.optOut && L.who_to_meet.optOut && !L.followup.optOut);
}


// ------------------------------------------------------------------ F21.2: the client
// A fake gateway. It records every request, can be slow or broken, and refuses any other address.
const KEY = "sk-test-not-a-real-key-0123456789";
const GW = "https://gateway.test/v1/acct/gw/anthropic";
const gateway = {};
const resetGateway = () => { const calls = []; for (const k of Object.keys(gateway)) delete gateway[k]; Object.assign(gateway, { calls, text: JSON.stringify({ body: "Hello there" }), inTok: 100, outTok: 20, status: 200, delay: 0, throws: false, raw: null, stop: "stop" }); };
resetGateway();
globalThis.fetch = async (url, init = {}) => {
  if (!String(url).startsWith("https://gateway.test/")) throw new Error(`unexpected network call to ${url}`);
  gateway.calls.push({ url: String(url), method: init.method, headers: init.headers, body: JSON.parse(init.body), redirect: init.redirect });
  if (gateway.delay) await new Promise((res, rej) => {
    const t = setTimeout(res, gateway.delay);
    init.signal?.addEventListener("abort", () => { clearTimeout(t); rej(Object.assign(new Error("aborted"), { name: "AbortError" })); });
  });
  if (gateway.throws) throw new Error("connection reset");
  const body = gateway.raw ?? JSON.stringify({ id: "gen_x", model: "google/gemini-2.5-flash-lite", choices: [{ message: { role: "assistant", content: gateway.text }, finish_reason: gateway.stop }], usage: { prompt_tokens: gateway.inTok, completion_tokens: gateway.outTok } });
  return new Response(body, { status: gateway.status });
};

// A clock the tests can move: the Worker reads Date.now() everywhere.
const realNow = Date.now.bind(Date);
let skew = Date.UTC(2026, 10, 10, 12, 0, 0) - realNow(); // start at noon UTC so a run near midnight cannot split a day
Date.now = () => realNow() + skew;
const advance = (ms) => { skew += ms; };

// Everything the Worker prints is captured, so we can say the key never appears in a log.
const logged = [];
for (const m of ["log", "error", "warn", "info"]) { const o = console[m].bind(console); console[m] = (...a) => { if (!/^\s+(ok|FAIL)\s/.test(String(a[0]))) logged.push(a.map(String).join(" ")); o(...a); }; }

const BASE = { AI_ENABLED: "1", AI_GATEWAY_URL: GW, OPENROUTER_API_KEY: KEY, AI_PRICE_INPUT_PER_MTOK_USD: "1", AI_PRICE_OUTPUT_PER_MTOK_USD: "5" };
let uid = 0;
async function world(extra = {}) {
  const T = await makeEnv({ ...BASE, ...extra });
  const raw = T.env.DB.raw;
  const user = ({ verified = true, guest = false, plan = "free", email, ai = 1, id } = {}) => {
    uid += 1;
    const i = id || `u${String(uid).padStart(8, "0")}`;
    raw.prepare("INSERT INTO users (id, created_at, is_guest, recovery_email, email_verified, plan, ai_search_ok, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(i, Date.now(), guest ? 1 : 0, verified ? (email || `${i}@mail.test`) : null, verified ? 1 : 0, plan, ai, Date.now());
    return { kind: "user", id: i, email: email || `${i}@mail.test` };
  };
  const host = ({ status = "active", deleted = null, id, email } = {}) => {
    uid += 1;
    const i = id || `h${String(uid).padStart(8, "0")}`;
    raw.prepare("INSERT INTO host_accounts (id, email, status, created_at, deleted_at) VALUES (?, ?, ?, ?, ?)").run(i, email || `${i}@host.test`, status, Date.now(), deleted);
    return { kind: "host", id: i, email: email || `${i}@host.test` };
  };
  const allow = async (...emails) => { await setSetting(T.env.DB, "allow", JSON.stringify(emails)); };
  const q = (sql, ...p) => raw.prepare(sql).all(...p);
  const q1 = (sql, ...p) => raw.prepare(sql).get(...p);
  const usage = (a, feature = "followup") => q1("SELECT * FROM ai_usage WHERE actor_kind = ? AND actor_id = ? AND feature = ? ORDER BY day DESC", a.kind, a.id, feature);
  return { ...T, raw, user, host, allow, q, q1, usage };
}
const SCHEMA = S.obj({ body: S.str({ max: 300 }) });
const ask = (W, actor, over = {}) => callModel(W.env, { feature: "followup", actor, promptVersion: "test-1", system: "Write a short note.", data: { person: "Sam", topic: "robotics" }, schema: SCHEMA, maxTokens: 300, ...over });
const everyone = async (W) => setSetting(W.env.DB, "rollout", "everyone");
const DAYMS = 24 * 3600e3;

console.log("\n# A normal call");
{
  resetGateway();
  const W = await world();
  await everyone(W);
  const a = W.user();
  const r = await ask(W, a, { subjects: [] });
  check("a verified account gets a checked result and nothing marked as a fallback", r.fallback === false && r.result.body === "Hello there" && r.cached === false, r);
  const c = gateway.calls[0];
  check("it made one request, to the configured gateway address plus /chat/completions, by POST", gateway.calls.length === 1 && c.url === `${GW}/chat/completions` && c.method === "POST", c?.url);
  check("headers are exactly authorization (Bearer key) and content-type", Object.keys(c.headers).sort().join() === "authorization,content-type" && c.headers.authorization === `Bearer ${KEY}` && c.headers["content-type"] === "application/json", Object.keys(c.headers));
  check("the body has only model, max_tokens and messages", Object.keys(c.body).sort().join() === "max_tokens,messages,model", Object.keys(c.body));
  check("the model id comes from config (the OpenRouter default) and max_tokens is the caller's", c.body.model === DEFAULT_MODEL && c.body.max_tokens === 300);
  check("redirects are not followed, so the key cannot be sent elsewhere (manual: Workers have no \"error\" mode)", c.redirect === "manual");
  {
    const b2 = W.user();
    gateway.status = 302;
    const red = await ask(W, b2, { subjects: [] });
    gateway.status = 200;
    check("a redirect reply is a fallback that gives the quota back, never a result", red.fallback === true && red.reason === "error" && W.usage(b2).calls === 0, red);
  }
  check("the input is a system message (the task and the guard) then one user message holding a <data> block", c.body.messages.length === 2 && c.body.messages[1].role === "user" && c.body.messages[1].content.startsWith("<data>") && c.body.messages[0].role === "system" && c.body.messages[0].content.startsWith("Write a short note.") && /never instructions/.test(c.body.messages[0].content));
  const u = W.usage(a);
  check("usage is recorded: one call, the tokens from the reply and the cost (100 x $1 + 20 x $5 = 200 micro-dollars)", u.calls === 1 && u.input_tokens === 100 && u.output_tokens === 20 && u.cost_micros === 200 && u.fallbacks === 0, u);
  const d = W.q1("SELECT * FROM ai_daily");
  check("the day's spend is recorded too", d.cost_micros === 200 && d.calls === 1, d);
  check("no prompt text is stored: usage, spend and settings hold numbers only, and the cache holds the checked reply, not the input",
    !JSON.stringify([W.q("SELECT * FROM ai_usage"), W.q("SELECT * FROM ai_daily"), W.q("SELECT * FROM ai_settings")]).match(/robotics|Sam|Write a short note/)
    && !JSON.stringify(W.q("SELECT * FROM ai_cache")).match(/robotics|Write a short note|person/));
  const mk = (x) => JSON.stringify(x);
  check("the key is not in the result, the usage rows or the cache", ![mk(r), mk(W.q("SELECT * FROM ai_usage")), mk(W.q("SELECT * FROM ai_cache")), mk(W.q("SELECT * FROM ai_daily"))].some((t) => t.includes(KEY)));
  check("the key is not in anything the Worker printed", !logged.some((l) => l.includes(KEY) || l.includes("sk-test")));
}

console.log("\n# Who may call: guests, signed-out and the wrong kind of caller are refused and it costs nothing");
{
  resetGateway();
  const W = await world();
  await everyone(W);
  const none = async (label, actor, over) => {
    const before = gateway.calls.length;
    const r = await ask(W, actor, over);
    check(`${label}: a fallback, nothing sent to the gateway`, r.fallback === true && gateway.calls.length === before, r);
    return r;
  };
  const guest = W.user({ verified: false, guest: true });
  const r1 = await none("a guest", guest);
  check("the reason is ineligible and the message is friendly", r1.reason === "ineligible" && /confirm your email/.test(r1.message) && !/error|exception/i.test(r1.message), r1);
  await none("an account with a card but no confirmed email", W.user({ verified: false }));
  await none("a guest whose email was somehow confirmed (is_guest still 1)", W.user({ guest: true }));
  await none("a signed-out caller (no actor)", null);
  await none("an actor that does not exist", { kind: "user", id: "nobody" });
  await none("an actor with no id", { kind: "user", id: "" });
  await none("an unknown kind", { kind: "root", id: "x" });
  await none("the admin kind with the wrong id", { kind: "admin", id: "someone" });
  const pre = W.q1("SELECT COUNT(*) n FROM ai_usage").n;
  await none("a host calling an attendee feature", W.host());
  await none("an attendee calling a host feature", W.user(), { feature: "feedback_summary" });
  await none("an attendee calling the admin-only test", W.user(), { feature: "admin_test" });
  check("none of those wrote a usage row", W.q1("SELECT COUNT(*) n FROM ai_usage").n === pre && W.q1("SELECT COUNT(*) n FROM ai_cache").n === 0);
  await none("a disabled host account", W.host({ status: "disabled" }), { feature: "feedback_summary" });
  await none("a deleted host account", W.host({ deleted: Date.now() }), { feature: "feedback_summary" });
}

console.log("\n# Rollout: the allow-list, then Plus, then everyone");
{
  resetGateway();
  const W = await world();
  const a = W.user({ email: "owner@mail.test" }), b = W.user(), p = W.user({ plan: "plus" }), h = W.host();
  const hostAsk = (actor) => ask(W, actor, { feature: "feedback_summary" });
  check("the default stage is Plus: a Plus account gets in, a Free account is told it is not open to them yet", (await ask(W, p)).fallback === false && (await ask(W, a)).reason === "not_allowed" && gateway.calls.length === 1);
  advance(6000);
  await setSetting(W.env.DB, "rollout", "allowlist");
  await W.allow("  Owner@Mail.test ");
  check("an address on the list gets in (case and spacing ignored)", (await ask(W, a)).fallback === false);
  advance(6000);
  check("someone not on the list does not, and a host does not", (await ask(W, b)).reason === "not_allowed" && (await hostAsk(h)).reason === "not_allowed");
  await setSetting(W.env.DB, "rollout", "plus");
  check("Plus stage: a Plus account and a host get in, a Free account does not", (await ask(W, p)).fallback === false && (await hostAsk(h)).fallback === false && (await ask(W, b)).reason === "not_allowed");
  await setSetting(W.env.DB, "rollout", "everyone");
  advance(6000);
  check("Everyone stage: a verified Free account gets in", (await ask(W, b)).fallback === false);
  await setSetting(W.env.DB, "rollout", "banana");
  advance(6000);
  check("an unknown stage in the database falls back to the strictest (allow-list)", (await ask(W, W.user())).reason === "not_allowed");
}

console.log("\n# Quotas");
{
  resetGateway();
  const W = await world();
  await everyone(W);
  const a = W.user();
  const mine = async (n) => { advance(6000); return ask(W, a, { data: { n } }); };
  const rs = [await mine(1), await mine(2), await mine(3)];
  check("the first three drafts of a Free account in a day work, and the third says none are left today", rs.every((r) => r.fallback === false) && rs[0].remaining.day === 2 && rs[2].remaining.day === 0, rs.map((r) => r.remaining));
  const costBefore = W.q1("SELECT cost_micros c, calls FROM ai_daily");
  const fourth = await mine(4);
  check("the 4th in the same day is the fallback, with 'back tomorrow' and no gateway call", fourth.fallback === true && fourth.reason === "quota_day" && /back tomorrow/.test(fourth.message) && gateway.calls.length === 3, fourth);
  const costAfter = W.q1("SELECT cost_micros c, calls FROM ai_daily");
  check("the refused call cost nothing and was not counted as a call", costAfter.c === costBefore.c && costAfter.calls === costBefore.calls && W.usage(a).calls === 3, [costBefore, costAfter]);
  check("the refusal is recorded as a limit hit (for the admin page)", W.usage(a).limited === 1 && W.usage(a).fallbacks === 1);
  advance(DAYMS);
  check("the next day it works again", (await mine(5)).fallback === false);
  // Month: 15 a month for Free.
  const b = W.user();
  const month = new Date(Date.now()).toISOString().slice(0, 7);
  for (let d = 1; d <= 5; d++) W.raw.prepare("INSERT INTO ai_usage (day, actor_kind, actor_id, feature, scope, calls) VALUES (?, 'user', ?, 'followup', '', 3)").run(`${month}-0${d}`, b.id);
  advance(6000);
  const m = await ask(W, b, { data: { n: 9 } });
  check("15 drafts earlier in the month means the monthly limit refuses, with 'back next month'", m.reason === "quota_month" && /next month/.test(m.message) && gateway.calls.length === 4, [m.reason, gateway.calls.length]);
  const p = W.user({ plan: "plus" });
  const plusRs = [];
  for (let i = 0; i < 15; i++) { advance(6000); plusRs.push(await ask(W, p, { data: { i } })); }
  check("Plus gets 15 a day", plusRs.every((r) => r.fallback === false));
  advance(6000);
  check("and the 16th is refused", (await ask(W, p, { data: { i: 99 } })).reason === "quota_day");
  const expired = W.user({ plan: "plus" });
  W.raw.prepare("UPDATE users SET plan_until = ? WHERE id = ?").run(Date.now() - 1000, expired.id);
  const exp = [];
  for (let i = 0; i < 4; i++) { advance(6000); exp.push(await ask(W, expired, { data: { i } })); }
  check("a Plus plan that has run out is treated as Free (the 4th is refused)", exp[3].reason === "quota_day" && exp.slice(0, 3).every((r) => r.fallback === false));
  // Per event.
  const e = W.user();
  const ev = async (scope, n) => { advance(6000); return callModel(W.env, { feature: "who_to_meet", actor: e, promptVersion: "t", system: "x", data: { n }, schema: SCHEMA, maxTokens: 100, scope }); };
  const e1 = [await ev("event-1", 1), await ev("event-1", 2), await ev("event-1", 3)];
  const e1x = await ev("event-1", 4);
  const e2 = await ev("event-2", 5);
  check("who to meet: 3 per event, the 4th for the same event is refused, another event is not affected", e1.every((r) => r.fallback === false) && e1x.reason === "quota_scope" && e2.fallback === false, [e1x.reason, e2.fallback]);
  advance(3 * DAYMS);
  check("the per-event limit does not reset with the day", (await ev("event-1", 6)).reason === "quota_scope");
  const al = await allowanceFor(W.env, a, "followup");
  check("allowanceFor reports what is left (for '2 of 3 left today')", al.limit.day === 3 && typeof al.remaining.day === "number");
  check("allowanceFor says nothing for someone who is not eligible", (await allowanceFor(W.env, W.user({ verified: false }), "followup")) === null);
}

console.log("\n# Burst and address limits");
{
  resetGateway();
  const W = await world();
  await everyone(W);
  const a = W.user();
  const r1 = await ask(W, a, { data: { n: 1 } });
  const r2 = await ask(W, a, { data: { n: 2 } });
  check("a second call straight away is refused as too fast, and does not touch the gateway or the usage", r1.fallback === false && r2.reason === "burst" && gateway.calls.length === 1 && W.usage(a).calls === 1 && W.usage(a).limited === 0, r2);
  advance(5100);
  check("five seconds later it works", (await ask(W, a, { data: { n: 3 } })).fallback === false);
  const people = Array.from({ length: 31 }, () => W.user());
  const out = [];
  for (const p of people) out.push(await ask(W, p, { ip: "198.51.100.7" }));
  check("30 calls an hour from one address are allowed and the 31st is refused, even for a different person", out.slice(0, 30).every((r) => r.fallback === false) && out[30].reason === "ip_limit", out[30]);
  check("another address is not affected", (await ask(W, W.user(), { ip: "198.51.100.8" })).fallback === false);
  advance(3600e3 + 1000);
  check("the address limit resets after an hour", (await ask(W, W.user(), { ip: "198.51.100.7" })).fallback === false);
  const auto = W.user();
  await ask(W, auto, { automatic: true });
  check("a server-started call is not stopped by the burst limit", (await ask(W, auto, { automatic: true, data: { n: 2 } })).fallback === false);
}

console.log("\n# Cache: free, and never shared");
{
  resetGateway();
  const W = await world();
  await everyone(W);
  const a = W.user({ plan: "plus" }), b = W.user({ plan: "plus" });
  const first = await ask(W, a);
  advance(6000);
  const second = await ask(W, a);
  const costs = W.q1("SELECT cost_micros c, calls FROM ai_daily");
  check("the same input again is served from the cache: same result, no gateway call, no new cost, not counted against the quota",
    second.cached === true && second.result.body === first.result.body && gateway.calls.length === 1 && costs.c === 200 && costs.calls === 1 && W.usage(a).calls === 1 && W.usage(a).cache_hits === 1, [second, costs]);
  advance(6000);
  const other = await ask(W, b);
  check("another person with the very same input is NOT served the first person's reply (a new call is made)", other.cached === false && gateway.calls.length === 2);
  const rows = W.q("SELECT key, actor_id FROM ai_cache ORDER BY actor_id");
  check("the two replies are stored separately, each against its own person", rows.length === 2 && rows[0].key !== rows[1].key && new Set(rows.map((r) => r.actor_id)).size === 2);
  const { cacheGet } = await import("../worker/ai/store.js");
  const keyA = rows.find((r) => r.actor_id === a.id).key;
  check("a row is returned only to the person it belongs to, even given the right key", (await cacheGet(W.env.DB, keyA, b, Date.now())) === null && (await cacheGet(W.env.DB, keyA, a, Date.now())) !== null);
  check("a host with the same id does not get it either", (await cacheGet(W.env.DB, keyA, { kind: "host", id: a.id }, Date.now())) === null);
  advance(6000);
  const changed = await ask(W, a, { data: { person: "Sam", topic: "robotics", extra: "new detail" } });
  check("changed input (what the person may see has changed) is a miss", changed.cached === false);
  advance(6000);
  check("a new prompt version is a miss", (await ask(W, a, { promptVersion: "test-2" })).cached === false);
  advance(6000);
  const n = gateway.calls.length;
  check("Regenerate skips the cache, calls the model and counts", (await ask(W, a, { regenerate: true })).cached === false && gateway.calls.length === n + 1);
  advance(6000);
  W.env.AI_MODEL = "google/gemini-2.5-flash-lite-b";
  check("a different model is a miss", (await ask(W, a)).cached === false);
  W.env.AI_MODEL = undefined;
  advance(8 * DAYMS);
  const m = gateway.calls.length;
  check("a reply older than 7 days is not served", (await ask(W, a)).cached === false && gateway.calls.length === m + 1);
  advance(6000);
  await callModel(W.env, { feature: "followup", actor: a, promptVersion: "t", system: "x", data: { long: 1 }, schema: SCHEMA, maxTokens: 50, cacheTtlMs: 365 * DAYMS });
  check("no cache row is kept longer than 7 days, even if a caller asks for a year", W.q1("SELECT MAX(expires_at - created_at) t FROM ai_cache").t <= 7 * DAYMS);
  advance(6000);
  const k = W.q1("SELECT COUNT(*) n FROM ai_cache").n;
  await callModel(W.env, { feature: "followup", actor: a, promptVersion: "t", system: "x", data: { none: 1 }, schema: SCHEMA, maxTokens: 50, cacheTtlMs: 0 });
  check("a feature can turn caching off (ttl 0)", W.q1("SELECT COUNT(*) n FROM ai_cache").n === k);
}

console.log("\n# Budget");
{
  resetGateway();
  let W = await world({ AI_DAILY_BUDGET_USD: "0.000001" });
  await everyone(W);
  const a = W.user();
  const r = await ask(W, a);
  check("a daily budget of $0.000001 makes the feature fall back at once, with no gateway call and no cost", r.fallback === true && r.reason === "budget_day" && gateway.calls.length === 0 && !W.q1("SELECT cost_micros c FROM ai_daily").c, r);
  check("the message is 'back tomorrow' and shows no money", /back tomorrow/.test(r.message) && !/\$|£|\d/.test(r.message));
  check("it falls back for every feature, host summaries included", (await ask(W, W.host(), { feature: "feedback_summary" })).reason === "budget_day" && (await ask(W, W.user({ plan: "plus" }), { feature: "people_search" })).reason === "budget_day");
  check("the refusal did not take the quota", (W.usage(a)?.calls || 0) === 0);
  // 900 micro-dollars a day: the worst case for 20 tokens is under that, a call costs 200.
  W = await world({ AI_DAILY_BUDGET_USD: "0.0009" });
  await everyone(W);
  const b = W.user({ plan: "plus" });
  const take = (n) => { advance(6000); return ask(W, b, { maxTokens: 20, data: { n }, feature: "people_search" }); };
  const got = [];
  for (let i = 0; i < 6; i++) got.push(await take(i));
  const spentNow = W.q1("SELECT cost_micros c FROM ai_daily").c;
  check("calls go through until the next one could overshoot the daily budget, then fall back; spend never passes the budget", got.some((g) => g.fallback === false) && got.some((g) => g.reason === "budget_day") && spentNow <= 900, [got.map((g) => g.reason || "ok"), spentNow]);
  advance(DAYMS);
  check("the next day the daily budget is fresh", (await take(77)).fallback === false);
  W = await world({ AI_MONTHLY_BUDGET_USD: "0.0005" });
  await everyone(W);
  const c = W.user();
  W.raw.prepare("INSERT INTO ai_daily (day, cost_micros, calls) VALUES (?, 400, 5)").run(new Date(Date.now()).toISOString().slice(0, 7) + "-01");
  const mres = await ask(W, c, { maxTokens: 20 });
  check("spend earlier this month counts: the monthly budget stops calls too", mres.reason === "budget_month", mres);
  W = await world({ AI_DAILY_BUDGET_USD: "banana" });
  await everyone(W);
  check("a budget typed wrongly means no spending, not no limit", (await ask(W, W.user())).reason === "budget_day");
}

console.log("\n# Kill switch and AI_ENABLED");
{
  resetGateway();
  const W = await world();
  await everyone(W);
  const a = W.user();
  check("working before the switch", (await ask(W, a)).fallback === false);
  await setSetting(W.env.DB, "killed", "1");
  advance(6000);
  const k = await ask(W, a, { data: { n: 2 } });
  check("the admin kill switch (in the database) turns it off at once: fallback, no call, nothing counted", k.fallback === true && k.reason === "off" && gateway.calls.length === 1 && W.usage(a).calls === 1, k);
  check("it stops cached replies too", (await ask(W, a)).reason === "off");
  await setSetting(W.env.DB, "killed", "0");
  advance(6000);
  check("and turning it back on works at once, with no wait", (await ask(W, a)).fallback === false);
  const off = await world({ AI_ENABLED: "0" });
  await everyone(off);
  check("AI_ENABLED off: fallback, no call", (await ask(off, off.user())).reason === "off" && gateway.calls.length === 1);
  const unset = await world({ AI_ENABLED: undefined });
  await everyone(unset);
  check("AI_ENABLED unset is off", (await ask(unset, unset.user())).reason === "off" && gateway.calls.length === 1);
  check("fallbacks are counted on the day (for the admin page)", W.q1("SELECT fallbacks f FROM ai_daily").f >= 2);
}

console.log("\n# Timeout, provider errors and bad output all fall back cleanly");
{
  resetGateway();
  const W = await world({ AI_TIMEOUT_MS: "40" });
  await everyone(W);
  const a = W.user({ plan: "plus" });
  gateway.delay = 400;
  const t0 = realNow();
  const r = await ask(W, a);
  const took = realNow() - t0;
  check("a slow model is cut off at the timeout: fallback, friendly message, back in well under a second", r.fallback === true && r.reason === "timeout" && /aren't available right now/.test(r.message) && took < 300, [r.reason, took]);
  check("it cost nothing and took none of the quota", W.usage(a).calls === 0 && !W.q1("SELECT cost_micros c FROM ai_daily")?.c && W.q1("SELECT COUNT(*) n FROM ai_cache").n === 0, W.usage(a));
  gateway.delay = 0;
  const bad = async (label, setup, reason) => {
    advance(6000);
    resetGateway(); setup();
    const before = W.usage(a)?.calls || 0;
    const res = await ask(W, a, { data: { label } });
    const after = W.usage(a);
    check(`${label}: fallback (${reason}), nothing cached, ${reason === "bad_output" ? "the call still counts" : "nothing counted"}`,
      res.fallback === true && res.reason === reason && W.q1("SELECT COUNT(*) n FROM ai_cache").n === 0 && after.calls === before + (reason === "bad_output" ? 1 : 0), [res.reason, after.calls]);
    return res;
  };
  await bad("the provider says 429", () => { gateway.status = 429; gateway.raw = '{"error":{"type":"rate_limit_error","message":"secret detail"}}'; }, "provider_limit");
  await bad("the provider says 500", () => { gateway.status = 500; gateway.raw = "oops"; }, "error");
  await bad("the provider says 401", () => { gateway.status = 401; gateway.raw = "{}"; }, "error");
  await bad("the connection fails", () => { gateway.throws = true; }, "error");
  await bad("the reply is not JSON at all", () => { gateway.raw = "<html>bad gateway</html>"; }, "error");
  await bad("the reply text is prose, not JSON", () => { gateway.text = "Sure! Here is a note for Sam."; }, "bad_output");
  await bad("the reply is JSON with the wrong shape", () => { gateway.text = JSON.stringify({ message: "hi" }); }, "bad_output");
  await bad("the reply is cut off at max_tokens", () => { gateway.text = '{"body":"half a thou'; gateway.stop = "length"; }, "bad_output");
  await bad("the reply has no content", () => { gateway.raw = JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 20 } }); }, "bad_output");
  const fb = W.q("SELECT fallbacks FROM ai_usage WHERE actor_id = ?", a.id).reduce((s, r) => s + r.fallbacks, 0);
  check("every one of these is counted as a fallback", fb >= 9, fb);
  check("a provider's error text never reaches a log", !logged.some((l) => l.includes("secret detail")));
  const costBad = W.q1("SELECT cost_micros c FROM ai_daily").c;
  check("a reply that was paid for but unusable is still charged to the budget (4 calls x 200)", costBad === 800, costBad);
  resetGateway();
  advance(6000);
  check("after all that a good reply works again", (await ask(W, a, { data: { again: 1 } })).fallback === false);
  resetGateway();
  gateway.text = '```json\n{"body":"fenced"}\n```';
  advance(6000);
  check("a reply wrapped in one code fence is accepted", (await ask(W, a, { data: { fence: 1 } })).result?.body === "fenced");
  gateway.text = '{"body":"ok","extra":"x","__proto__":{"polluted":true}}';
  advance(6000);
  const extra = await ask(W, a, { data: { extra: 1 } });
  check("keys the schema does not name are dropped from the result", extra.fallback === false && Object.keys(extra.result).join() === "body" && ({}).polluted === undefined);
}

console.log("\n# Setup problems and bad calls");
{
  resetGateway();
  const noKey = await world({ OPENROUTER_API_KEY: undefined });
  await everyone(noKey);
  check("no key: misconfigured fallback, no call", (await ask(noKey, noKey.user())).reason === "misconfigured" && gateway.calls.length === 0);
  const http = await world({ AI_GATEWAY_URL: "http://gateway.test/x" });
  await everyone(http);
  check("a non-https gateway: misconfigured fallback, no call", (await ask(http, http.user())).reason === "misconfigured" && gateway.calls.length === 0);
  const none = await world({ AI_GATEWAY_URL: undefined });
  await everyone(none);
  check("no gateway address set: it defaults to OpenRouter", aiConfig({}).gatewayUrl === DEFAULT_GATEWAY && DEFAULT_GATEWAY === "https://openrouter.ai/api/v1");
  const W = await world();
  await everyone(W);
  const a = W.user();
  for (const [label, over] of [["no feature", { feature: undefined }], ["unknown feature", { feature: "nope" }], ["no prompt version", { promptVersion: "" }], ["no system prompt", { system: "" }],
    ["no schema", { schema: null }], ["no max tokens", { maxTokens: undefined }], ["a huge max tokens", { maxTokens: 100000 }], ["no data", { data: undefined }]]) {
    advance(6000);
    const r = await ask(W, a, over);
    check(`${label}: a fallback, not an exception, and no call`, r.fallback === true && r.reason === "misconfigured" && gateway.calls.length === 0, r);
  }
  const r1 = await callModel(W.env, null);
  const r2 = await callModel(W.env, undefined);
  const r3 = await callModel({ DB: { prepare() { throw new Error("db down"); } }, AI_ENABLED: "1" }, { feature: "followup", actor: a, promptVersion: "x", system: "x", data: {}, schema: SCHEMA, maxTokens: 10 });
  check("it never throws, even with nothing, or with the database down", r1.fallback && r2.fallback && r3.fallback === true, [r1, r2, r3]);
}

console.log("\n# Local stub mode");
{
  resetGateway();
  const W = await world({ AI_STUB: "1", APP_ORIGIN: "http://localhost:5173", OPENROUTER_API_KEY: undefined, AI_GATEWAY_URL: undefined });
  await everyone(W);
  const a = W.user();
  const r = await ask(W, a, { stub: { body: "from the stub" } });
  check("the stub answers locally with no key, no gateway and no network call", r.fallback === false && r.result.body === "from the stub" && gateway.calls.length === 0, r);
  check("it still counts calls, tokens and cost like a real call", W.usage(a).calls === 1 && W.usage(a).input_tokens > 0);
  const prod = await world({ AI_STUB: "1", APP_ORIGIN: "https://lanyd.fyi,https://host.lanyd.fyi" });
  await everyone(prod);
  const pr = await ask(prod, prod.user(), { stub: { body: "should never be used" } });
  check("on a production origin the stub is refused: no stub reply, and no real call either", pr.fallback === true && pr.reason === "misconfigured" && gateway.calls.length === 0, pr);
  const sneaky = await world({ AI_STUB: "1", APP_ORIGIN: "http://localhost:5173,https://lanyd.fyi" });
  await everyone(sneaky);
  check("one production origin among local ones is enough to refuse it", (await ask(sneaky, sneaky.user(), { stub: { body: "x" } })).reason === "misconfigured");
}

console.log("\n# AI search opt-out and blocks (the foundation's helper, not each feature)");
{
  resetGateway();
  const W = await world();
  await everyone(W);
  const asker = W.user({ plan: "plus" });
  const ok1 = W.user(), ok2 = W.user(), out = W.user({ ai: 0 });
  const search = (subjects, over = {}) => { advance(6000); return callModel(W.env, { feature: "people_search", actor: asker, promptVersion: "s1", system: "Find people.", data: { people: subjects }, schema: SCHEMA, maxTokens: 100, subjects, ...over }); };
  check("a new account is findable by default (ai_search_ok = 1)", W.q1("SELECT ai_search_ok a FROM users WHERE id = ?", ok1.id).a === 1);
  const found = await searchableIds(W.env.DB, [ok1.id, ok2.id, out.id, "ghost"]);
  check("searchableIds leaves out someone who opted out and someone who does not exist", found.has(ok1.id) && found.has(ok2.id) && !found.has(out.id) && !found.has("ghost") && found.size === 2);
  const good = await search([ok1.id, ok2.id]);
  check("people who allow it can be in a search", good.fallback === false);
  const before = gateway.calls.length;
  const bad = await search([ok1.id, out.id]);
  check("a search that includes someone who opted out is refused whole, nothing is sent to the model", bad.fallback === true && bad.reason === "opted_out" && gateway.calls.length === before, bad);
  check("it took no quota and cost nothing", W.usage(asker, "people_search").calls === 1);
  await setAiSearchOk(W.env.DB, ok2.id, false);
  const cachedSame = await search([ok1.id, ok2.id]);
  check("someone who opts out AFTER a reply was cached is not served from that cache: the same call is refused", cachedSame.reason === "opted_out", cachedSame);
  await setAiSearchOk(W.env.DB, ok2.id, true);
  check("opting back in makes them findable again at once", (await search([ok1.id, ok2.id])).fallback === false);
  check("choices are written to the consent history", W.q("SELECT action FROM consent_log WHERE user_id = ? AND scope = 'ai_search' ORDER BY at", ok2.id).map((r) => r.action).join() === "withdrawn,granted");
  await setAiSearchOk(W.env.DB, ok2.id, true);
  check("setting the same value again writes nothing new", W.q("SELECT 1 FROM consent_log WHERE user_id = ? AND scope = 'ai_search'", ok2.id).length === 2);
  W.raw.prepare("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)").run(ok1.id, asker.id, Date.now());
  const blocked = await search([ok1.id, ok2.id]);
  check("a block in either direction refuses the call", blocked.reason === "blocked", blocked);
  const draft = await ask(W, W.user({ plan: "plus" }), { subjects: [out.id] });
  check("follow-up drafts do not use the opt-out (they are not search): a draft about someone who opted out is allowed", draft.fallback === false);
  const many = Array.from({ length: 120 }, () => W.user().id);
  check("more people than one query can hold are handled (120 ids)", (await searchableIds(W.env.DB, many)).size === 120);
}

console.log("\n# Hosts are a separate identity");
{
  resetGateway();
  const W = await world();
  await everyone(W);
  const shared = "samesame01";
  const u = W.user({ id: shared });
  const h = W.host({ id: shared });
  const hostAsk = (n) => { advance(6000); return ask(W, h, { feature: "feedback_summary", data: { n } }); };
  const hr = [await hostAsk(1), await hostAsk(2), await hostAsk(3), await hostAsk(4)];
  check("a host gets 3 summaries a day, the 4th falls back", hr.slice(0, 3).every((r) => r.fallback === false) && hr[3].reason === "quota_day" && /summaries/.test(hr[3].message));
  advance(6000);
  const ur = await ask(W, u, { data: { n: 1 } });
  check("an attendee with the same id string is not affected by the host's use (their own counters)", ur.fallback === false && W.usage(u).calls === 1 && W.usage(h, "feedback_summary").calls === 3);
  check("rows are kept apart by kind", W.q("SELECT DISTINCT actor_kind k FROM ai_usage WHERE actor_id = ?", shared).map((r) => r.k).sort().join() === "host,user");
  advance(6000);
  const auto = await ask(W, h, { feature: "feedback_summary_auto", automatic: true, data: { n: 1 } });
  check("the automatic summary is its own feature, so it does not use the host's 3 regenerations", auto.fallback === false && W.usage(h, "feedback_summary").calls === 3);
}

console.log("\n# Alerts at 50% and 90% of the budget");
{
  resetGateway();
  // 100 in x $1 + 36 out x $5 = 280 micro-dollars, which is 93% of a daily budget of 300.
  const W = await world({ AI_DAILY_BUDGET_USD: "0.0003", AI_ALERT_EMAIL: "owner@mail.test" });
  await everyone(W);
  const a = W.user();
  gateway.outTok = 36;
  await ask(W, a, { maxTokens: 5 });
  const mails = W.env.MAIL_OUTBOX.filter((m) => /AI spend/.test(m.subject));
  check("passing 50% and 90% of the day's budget emails the admin once each", mails.length === 2 && mails.some((m) => /50%/.test(m.subject)) && mails.some((m) => /90%/.test(m.subject)) && mails.every((m) => m.to[0] === "owner@mail.test"), mails.map((m) => m.subject));
  check("the email carries figures only, no names or ids", mails.every((m) => /\$0\.0003/.test(m.text) && !m.text.includes(a.id) && !m.text.includes(a.email)), mails[0]?.text);
  W.env.AI_DAILY_BUDGET_USD = "0.0004";
  advance(6000);
  await ask(W, a, { maxTokens: 5, data: { second: 1 } });
  check("it is not sent again the same day", W.env.MAIL_OUTBOX.filter((m) => /AI spend/.test(m.subject)).length === 2, W.env.MAIL_OUTBOX.length);
  const quiet = await world({ AI_DAILY_BUDGET_USD: "0.0003" });
  await everyone(quiet);
  gateway.outTok = 36;
  await ask(quiet, quiet.user(), { maxTokens: 5 });
  check("with no AI_ALERT_EMAIL nothing is sent", quiet.env.MAIL_OUTBOX.length === 0);
}

console.log("\n# Admin: behind the token, and it never shows the key or any text");
{
  resetGateway();
  const TOKEN = "admin-test-token-0123456789";
  const W = await world({ ADMIN_TOKEN: TOKEN });
  const adm = { authorization: `Bearer ${TOKEN}` };
  const routes = [["get", "/api/admin/ai"], ["post", "/api/admin/ai/kill", { killed: true }], ["post", "/api/admin/ai/rollout", { mode: "everyone" }], ["put", "/api/admin/ai/allow", { emails: ["x@y.test"] }], ["post", "/api/admin/ai/test", {}]];
  const hit = (c, [m, p, b], h) => (m === "get" ? c.get(p, h) : m === "post" ? c.post(p, b, h) : c.put(p, b, h));
  const anon = W.client({ ip: "10.30.0.1" });
  const noToken = await world({ ADMIN_TOKEN: undefined });
  const ncl = noToken.client({ ip: "10.30.0.2" });
  const statuses = async (c, h) => { const out = []; for (const r of routes) out.push((await hit(c, r, h)).status); return out; };
  check("with no token sent, every AI admin route is 401", (await statuses(anon)).every((s) => s === 401));
  check("with a wrong token, every route is 401", (await statuses(W.client({ ip: "10.30.0.3" }), { authorization: "Bearer nope" })).every((s) => s === 401));
  check("when the admin token is not set up at all, every route is 503 (never open)", (await statuses(ncl, { authorization: "Bearer anything" })).every((s) => s === 503));
  // A signed-in attendee, and a signed-in host, are not admins.
  const user = W.client({ ip: "10.30.0.4" });
  await user.post("/api/profile", { name: "Normal User", acceptTerms: true, over18: true, course: "Maths", uni: "Test University" });
  const host = W.client({ ip: "10.30.0.5", site: "host" });
  await becomeHost(host, { kind: "company", name: "Admin Test Co" });
  check("a signed-in attendee cookie does not open it", (await statuses(user)).every((s) => s === 401));
  check("a signed-in host cookie does not open it either", (await user.get("/api/admin/ai", { cookie: "" })).status === 401);
  check("nothing changed from those attempts", !W.q1("SELECT 1 x FROM ai_settings"));

  const ok = W.client({ ip: "10.30.0.6" });
  const first = await ok.get("/api/admin/ai", adm);
  const J = first.json;
  check("with the token the page data is returned", first.status === 200 && J.config && J.settings && J.today && J.month && Array.isArray(J.features) && Array.isArray(J.topUsers) && Array.isArray(J.flagged), first.text.slice(0, 200));
  check("it says whether the key and gateway are set (yes or no), never what they are", J.config.keySet === true && J.config.gatewaySet === true && !first.text.includes(KEY) && !first.text.includes("gateway.test") && !/sk-/.test(first.text));
  check("the model, budgets, prices and whether the prices are confirmed are there", J.config.model === DEFAULT_MODEL && J.config.dailyBudgetUsd === 2 && J.config.monthlyBudgetUsd === 30 && J.config.prices.confirmed === true && J.config.prices.inputPerMtokUsd === 1);
  check("the starting state is: enabled by the environment, open to Plus, switch not thrown, nobody listed", J.state === "on" && J.settings.rollout === "plus" && J.settings.killed === false && J.settings.allow.length === 0);
  check("a fresh install has no spend and no rows", J.today.spendUsd === 0 && J.month.calls === 0 && J.features.length === 0 && J.topUsers.length === 0 && J.cacheHitRate === null);
  const unconfirmed = await world({ ADMIN_TOKEN: TOKEN, AI_PRICE_INPUT_PER_MTOK_USD: undefined, AI_PRICE_OUTPUT_PER_MTOK_USD: undefined });
  check("with no price vars the page says the prices are not confirmed", (await unconfirmed.client({ ip: "10.30.0.7" }).get("/api/admin/ai", adm)).json.config.prices.confirmed === false);
  const states = [[{ AI_ENABLED: "0" }, "off_env"], [{ OPENROUTER_API_KEY: undefined }, "not_configured"], [{ AI_STUB: "1", APP_ORIGIN: "https://lanyd.fyi" }, "stub_refused"]];
  for (const [extra, want] of states) {
    const X = await world({ ADMIN_TOKEN: TOKEN, ...extra });
    check(`state is ${want} when ${Object.keys(extra).join("+")} is ${JSON.stringify(Object.values(extra)[0])}`, (await X.client({ ip: "10.30.0.8" }).get("/api/admin/ai", adm)).json.state === want);
  }

  // Use it, then look.
  await setSetting(W.env.DB, "rollout", "everyone");
  const a = W.user({ plan: "plus" }), b = W.user();
  await ask(W, a); advance(6000); await ask(W, a); advance(6000); await ask(W, b, { data: { b: 1 } });
  advance(6000);
  await ask(W, b, { data: { b: 2 } }); advance(6000); await ask(W, b, { data: { b: 3 } }); advance(6000); await ask(W, b, { data: { b: 4 } }); // 4th is refused
  const J2 = (await ok.get("/api/admin/ai", adm)).json;
  check("today's spend, calls, cache hits and fallbacks add up (4 calls at 200 micro-dollars, 1 cache hit, 1 refusal)", J2.today.calls === 4 && J2.today.spendUsd === 0.0008 && J2.today.cacheHits === 1 && J2.today.fallbacks === 1 && J2.month.calls === 4, J2.today);
  check("the cache hit rate is hits over hits plus calls", Math.abs(J2.cacheHitRate - 0.2) < 1e-9, J2.cacheHitRate);
  const f = J2.features.find((x) => x.feature === "followup");
  check("calls per feature are listed with their label, today's count, hits, fallbacks and limit hits", f && f.label === "drafts" && f.calls === 4 && f.callsToday === 4 && f.cacheHits === 1 && f.fallbacks === 1 && f.limited === 1 && f.spendUsd === 0.0008, f);
  check("the top people are ids only, busiest first, with their kind", J2.topUsers[0].id === b.id && J2.topUsers[0].calls === 3 && J2.topUsers[0].kind === "user" && J2.topUsers.length === 2 && Object.keys(J2.topUsers[0]).sort().join() === "calls,id,kind,limited,spendUsd");
  check("no name, email, prompt or reply text is on the page", !/@|robotics|Hello there|Write a short note|Sam/.test(JSON.stringify(J2)));
  // Flagging: three days running at a limit.
  const day = (n) => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10);
  const rep = W.user(), gap = W.user();
  for (const n of [0, 1, 2]) W.raw.prepare("INSERT INTO ai_usage (day, actor_kind, actor_id, feature, limited) VALUES (?, 'user', ?, 'followup', 1)").run(day(n), rep.id);
  for (const n of [0, 1, 3]) W.raw.prepare("INSERT INTO ai_usage (day, actor_kind, actor_id, feature, limited) VALUES (?, 'user', ?, 'followup', 1)").run(day(n), gap.id);
  const J3 = (await ok.get("/api/admin/ai", adm)).json;
  check("someone who hit a limit on 3 days in a row is flagged (not blocked), and a gap in the run is not", J3.flagged.some((x) => x.id === rep.id && x.days === 3) && !J3.flagged.some((x) => x.id === gap.id), J3.flagged);
  check("flagged people are only listed: they can still use it", (await ask(W, rep, { data: { x: 1 } })).fallback !== undefined);

  // Kill switch, rollout, allow-list.
  const bad = [await ok.post("/api/admin/ai/kill", { killed: "yes" }, adm), await ok.post("/api/admin/ai/kill", {}, adm), await ok.post("/api/admin/ai/rollout", { mode: "all" }, adm), await ok.post("/api/admin/ai/rollout", {}, adm)];
  check("a bad kill-switch or rollout value is a 400 and changes nothing", bad.every((r) => r.status === 400) && W.q1("SELECT value v FROM ai_settings WHERE key = 'rollout'").v === "everyone" && !W.q1("SELECT 1 x FROM ai_settings WHERE key = 'killed'"));
  advance(6000);
  const k = await ok.post("/api/admin/ai/kill", { killed: true }, adm);
  const afterKill = await ask(W, a, { data: { k: 1 } });
  check("the kill switch from the admin page turns every call into a fallback at once", k.status === 200 && afterKill.reason === "off", afterKill);
  check("and the page shows it as off", (await ok.get("/api/admin/ai", adm)).json.state === "off_switch");
  await ok.post("/api/admin/ai/kill", { killed: false }, adm);
  advance(6000);
  check("switching it back on works at once", (await ask(W, a, { data: { k: 2 } })).fallback === false);
  await ok.post("/api/admin/ai/rollout", { mode: "allowlist" }, adm);
  const al = await ok.put("/api/admin/ai/allow", { emails: [" Mine@Mail.test ", "mine@mail.test", "other@mail.test"] }, adm);
  check("the allow-list is stored lower-case, trimmed and without repeats", al.status === 200 && al.json.allow.join() === "mine@mail.test,other@mail.test", al.json);
  const owner = W.user({ email: "mine@mail.test" });
  advance(6000);
  check("the stage 'allow-list' then lets only listed people in", (await ask(W, owner, { data: { o: 1 } })).fallback === false && (await ask(W, W.user())).reason === "not_allowed");
  const badAllow = [await ok.put("/api/admin/ai/allow", { emails: "a@b.test" }, adm), await ok.put("/api/admin/ai/allow", { emails: ["not an email"] }, adm), await ok.put("/api/admin/ai/allow", { emails: Array.from({ length: 51 }, (_, i) => `p${i}@x.test`) }, adm), await ok.put("/api/admin/ai/allow", { emails: ["a".repeat(130) + "@x.test"] }, adm)];
  check("a bad list (not a list, not an address, over 50, too long) is a 400 and the list is unchanged", badAllow.every((r) => r.status === 400) && (await ok.get("/api/admin/ai", adm)).json.settings.allow.length === 2);
  check("an empty list clears it", (await ok.put("/api/admin/ai/allow", { emails: [] }, adm)).json.allow.length === 0);

  // The test button.
  await ok.post("/api/admin/ai/rollout", { mode: "everyone" }, adm);
  advance(6000);
  const before = gateway.calls.length;
  gateway.text = '{"ok":true}';
  const t1 = await ok.post("/api/admin/ai/test", {}, adm);
  check("the test button makes one real-shaped call and reports success with the tokens", t1.status === 200 && t1.json.ok === true && t1.json.usage.inputTokens === 100 && gateway.calls.length === before + 1 && !t1.text.includes(KEY), t1.json);
  check("it sent no personal data: the request holds only the fixed ping", gateway.calls.at(-1).body.messages[1].content.includes('"ping":"hello"') && !/@|Sam|robotics/.test(JSON.stringify(gateway.calls.at(-1).body)));
  check("it is counted against the budget under the admin kind", W.q1("SELECT calls c FROM ai_usage WHERE actor_kind = 'admin' AND feature = 'admin_test'").c === 1);
  const t2 = await ok.post("/api/admin/ai/test", {}, adm);
  check("pressing it twice at once is refused as too fast", t2.json.ok === false && t2.json.reason === "burst" && gateway.calls.length === before + 1);
  advance(6000);
  gateway.text = "not json";
  const t3 = await ok.post("/api/admin/ai/test", {}, adm);
  check("when the reply is wrong it says so plainly (reason bad_output), still without the key", t3.json.ok === false && t3.json.reason === "bad_output" && !t3.text.includes(KEY), t3.json);
  resetGateway();
  await ok.post("/api/admin/ai/kill", { killed: true }, adm);
  advance(6000);
  check("the test respects the kill switch", (await ok.post("/api/admin/ai/test", {}, adm)).json.reason === "off");
  check("every admin action is in the audit log", W.q1("SELECT COUNT(*) n FROM admin_audit WHERE action LIKE '%/api/admin/ai%'").n >= 10);

  const stubW = await world({ ADMIN_TOKEN: TOKEN, AI_STUB: "1", APP_ORIGIN: "http://localhost:5173", OPENROUTER_API_KEY: undefined, AI_GATEWAY_URL: undefined });
  const sc = stubW.client({ ip: "10.30.0.9" });
  advance(6000);
  const st = await sc.post("/api/admin/ai/test", {}, adm);
  check("in local stub mode the test works with no key and no gateway, and says it was the stub", st.json.ok === true && st.json.stub === true && gateway.calls.length === 0, st.json);
  const src = read("worker/admin.js");
  check("the AI admin routes are registered on adminApp after the token check, and nowhere else", src.indexOf('adminApp.use("/api/admin/*"') < src.indexOf("registerAiAdmin(adminApp)") && !/registerAiAdmin/.test(read("worker/index.js")) && /app\.(get|post|put)\("\/api\/admin\/ai/.test(read("worker/ai/admin.js")));
}

console.log("\n# Settings: the AI search choice and the allowances");
{
  resetGateway();
  const W = await world();
  await everyone(W);
  const anon = W.client({ ip: "10.40.0.1" });
  check("signed out, the status is refused (401)", (await anon.get("/api/ai/status")).status === 401);
  const put = (c, body) => c.put("/api/ai/search", body);
  const before = W.q1("SELECT COUNT(*) n FROM users WHERE ai_search_ok = 0").n;
  const noCard = await put(W.client({ ip: "10.40.0.2" }), { ok: false });
  check("signed out, the choice is refused and nothing is saved (a visitor with no session or card gets 403)", noCard.status === 403 && noCard.json.code === "no_card" && W.q1("SELECT COUNT(*) n FROM users WHERE ai_search_ok = 0").n === before, noCard.json);

  const c = W.client({ ip: "10.40.0.3" });
  await c.post("/api/profile", { name: "Sam Settings", acceptTerms: true, over18: true, course: "Maths", uni: "Test University" });
  const me = (await c.get("/api/me")).json.user;
  const st = await c.get("/api/ai/status");
  check("a signed-in person sees the choice (on by default), whether AI is on, and the allowances for Free and Plus", st.status === 200 && st.json.searchOk === true && st.json.on === true && st.json.allowances.length === 3, st.json);
  const fol = st.json.allowances.find((a) => a.key === "followup");
  check("the allowances are the ones in AI_LIMITS, and hosts' are not shown to attendees", fol.free.day === 3 && fol.free.month === 15 && fol.plus.day === 15 && fol.plus.month === 150 && !st.json.allowances.some((a) => /feedback|admin/.test(a.key)));
  check("the status holds no key, address or other person's data", !st.text.includes(KEY) && !st.text.includes("gateway") && !/@/.test(st.text));
  check("it says AI is off when the environment switch is off, and when the kill switch is thrown", (await (async () => { const X = await world({ AI_ENABLED: "0" }); const cx = X.client({ ip: "10.40.0.4" }); await cx.post("/api/profile", { name: "Off Person", acceptTerms: true, over18: true, course: "Maths", uni: "Test University" }); return (await cx.get("/api/ai/status")).json.on; })()) === false);
  await setSetting(W.env.DB, "killed", "1");
  check("kill switch thrown: status says off", (await c.get("/api/ai/status")).json.on === false);
  await setSetting(W.env.DB, "killed", "0");

  check("a value that is not true or false is a 400", (await put(c, { ok: "no" })).status === 400 && (await put(c, {})).status === 400 && W.q1("SELECT ai_search_ok a FROM users WHERE id = ?", me.id).a === 1);
  const off = await put(c, { ok: false });
  check("turning it off is saved at once and the status shows it", off.status === 200 && off.json.searchOk === false && W.q1("SELECT ai_search_ok a FROM users WHERE id = ?", me.id).a === 0 && (await c.get("/api/ai/status")).json.searchOk === false);
  const asker = W.user({ plan: "plus" });
  const search = (subjects) => { advance(6000); return callModel(W.env, { feature: "people_search", actor: asker, promptVersion: "st-1", system: "Find.", data: { s: subjects.length }, schema: SCHEMA, maxTokens: 50, subjects }); };
  check("the opt-out is honoured by the foundation: a search that includes her is refused, with nothing sent", (await search([me.id])).reason === "opted_out" && !(await searchableIds(W.env.DB, [me.id])).has(me.id));
  await put(c, { ok: true });
  check("turning it on again lets her be included at once", (await search([me.id])).fallback === false);
  check("each change is in her consent history, and it shows in the list the Settings page reads", (await c.get("/api/account/consents")).json.history.filter((h) => h.scope === "ai_search").map((h) => h.action).join() === "granted,withdrawn");
  check("it is in her data download", (await c.get("/api/account/export")).json.ai.searchByConnections === true);
  const x = await c.put("/api/ai/search", { ok: false }, { origin: "https://evil.example" });
  check("a request from another website is refused (same-origin rule)", x.status === 403 && W.q1("SELECT ai_search_ok a FROM users WHERE id = ?", me.id).a === 1, x.json);
  const hostSite = W.client({ ip: "10.40.0.5", site: "host" });
  check("the host portal cannot reach it", (await hostSite.get("/api/ai/status")).status === 401 && (await hostSite.put("/api/ai/search", { ok: false })).status === 401);
  let last;
  for (let i = 0; i < 22; i++) last = await put(c, { ok: i % 2 === 0 });
  check("changing it over and over is rate limited", last.status === 429);

  // A guest with a card (not yet saved with an email) may set it for later.
  const g = W.client({ ip: "10.40.0.6" });
  await g.post("/api/profile", { name: "Gus Guest", acceptTerms: true, over18: true, course: "Maths", uni: "Test University" });
  check("someone with a card but no confirmed email may still choose (it applies when they save their card)", (await put(g, { ok: false })).status === 200);
  check("but cannot use AI: the foundation refuses them", (await ask(W, { kind: "user", id: (await g.get("/api/me")).json.user.id }, { data: { g: 1 } })).reason === "ineligible");
}

console.log("\n# The Settings pages and the policy (source guards)");
{
  const priv = read("src/views/settings/SettingsPrivacy.vue"), plan = read("src/views/settings/SettingsPlan.vue");
  const sw = read("src/views/settings/AiSearchSetting.vue"), al = read("src/views/settings/AiAllowances.vue");
  check("Privacy and data has the switch, worded as the plan says, above the consent history", priv.includes("<AiSearchSetting") && priv.indexOf("<AiSearchSetting") < priv.indexOf("<ConsentHistory") && sw.includes("Let people I've connected with find me using AI search"));
  check("the switch is on unless turned off, saves through PUT /api/ai/search and puts the box back if it fails", /:checked="on"/.test(sw) && /"\/api\/ai\/search", "PUT"/.test(sw) && /ev\.target\.checked = on\.value/.test(sw));
  check("Plan shows the allowances for Free and Plus from the Worker, with no numbers typed into the page", plan.includes("<AiAllowances") && /Free:/.test(al) && /Plus:/.test(al) && !/\b(15|150|30)\b/.test(al.replace(/<style[\s\S]*$/, "")));
  const shared = ["src/lib/api.js", "src/lib/store.js", "src/lib/profile.js", "src/components/Icon.vue", "src/main.js", "src/router/index.js", "src/router/routes.attendee.js", "src/router/routes.host.js"];
  check("nothing AI was added to shared front-end code (api.js, store.js, profile.js, Icon.vue, the entry or the router)", shared.every((f) => !/\/api\/ai|AiSearch|AiAllowances|AdminAi|ai_search/.test(read(f))), shared.filter((f) => /\/api\/ai|AiSearch|AiAllowances|AdminAi/.test(read(f))));
  check("the settings router still names no settings page and the two new files are loaded only by the pages that use them", !/Ai(Search|Allow)/.test(read("src/views/Settings.vue")) && !/Ai(Search|Allow)/.test(read("src/router/routes.attendee.js")));
  const files = ["src/views/settings/AiSearchSetting.vue", "src/views/settings/AiAllowances.vue", "src/components/AdminAi.vue"].map(read).join("\n");
  check("no emoji, sparkle or 'magic' wording in the new screens (Design System)", !/\p{Extended_Pictographic}/u.test(files) && !/sparkle|magic|supercharg|\bAI-powered\b|\bAI assistant\b/i.test(files));
  check("no colour is hard-coded in the new screens (tokens only)", !/#[0-9a-f]{3,8}\b/i.test(files.replace(/&#\d+;/g, "")));
  const pol = read("src/views/Privacy.vue");
  check("the Privacy Policy has an AI features section, in the data and retention tables, the lawful bases and the provider list", /<h2>8c\. AI features<\/h2>/.test(pol) && /AI providers/.test(pol) && /Anthropic/.test(pol) && /Cloudflare AI Gateway/.test(pol) && /legitimate interests<\/b>[^<]*AI search/i.test(pol) && /An AI reply/.test(pol) && /13 months/.test(pol) && /7 days/.test(pol));
  check("it says nothing runs unless you tap, that people read before anything is sent, and how to switch being found off", /Nothing runs unless you tap/.test(pol) && /nothing is\s+sent for you/.test(pol) && /app\/settings\/privacy/.test(pol));
  check("the Terms and Privacy version is the latest one the owner approved (2026-11-13)", /export const TERMS_VERSION = "2026-11-13"/.test(read("worker/legal.js")));
}

console.log("\n# Retention, the data download and deleting an account");
{
  resetGateway();
  const W = await world();
  await everyone(W);
  const c = W.client({ ip: "10.21.0.1" });
  const made = await c.post("/api/profile", { name: "Ada Test", acceptTerms: true, over18: true, course: "Maths", uni: "Test University" });
  const me = (await c.get("/api/me")).json.user;
  W.raw.prepare("UPDATE users SET recovery_email = 'ada@mail.test', email_verified = 1, is_guest = 0 WHERE id = ?").run(me.id);
  const ada = { kind: "user", id: me.id };
  const other = W.user();
  const r1 = await ask(W, ada, { data: { who: "Ada" } });
  advance(6000);
  await ask(W, other, { data: { who: "Other" } });
  check("setup: a real signed-in account made a call", made.status === 201 && r1.fallback === false && !!W.usage(ada));

  const exp = await c.get("/api/account/export");
  const ai = exp.json?.ai;
  check("the data download has an AI section: the person's own usage rows (counts, tokens, cost)", exp.status === 200 && ai?.usage?.length === 1 && ai.usage[0].feature === "followup" && ai.usage[0].calls === 1 && ai.usage[0].costMicros === 200, ai);
  check("it also has the reply still held, with when it expires, and the person's search choice", ai.replies.length === 1 && ai.replies[0].result.body === "Hello there" && ai.replies[0].expiresAt > ai.replies[0].createdAt && ai.searchByConnections === true, ai.replies);
  check("it holds nothing of anyone else's", !JSON.stringify(ai).includes(other.id) && !JSON.stringify(ai).includes("Other"));
  check("and no prompt", !JSON.stringify(exp.json).includes("Write a short note") && !JSON.stringify(ai).includes("robotics"));

  // The purge, on a simulated clock.
  const t0 = Date.now();
  await purgeExpired(W.env, t0 + 7 * DAYMS - 60e3);
  check("a cached reply is still there just before 7 days", W.q1("SELECT COUNT(*) n FROM ai_cache WHERE actor_id = ?", ada.id).n === 1);
  const done = await purgeExpired(W.env, t0 + 7 * DAYMS + 60e3);
  check("and gone just after 7 days (the daily purge)", W.q1("SELECT COUNT(*) n FROM ai_cache").n === 0 && done.aiCache >= 2, done);
  check("usage counts stay (they hold no text)", W.q1("SELECT COUNT(*) n FROM ai_usage WHERE actor_id = ?", ada.id).n === 1);
  W.raw.prepare("INSERT INTO ai_usage (day, actor_kind, actor_id, feature, calls) VALUES ('2025-10-09', 'user', ?, 'followup', 1), ('2025-10-10', 'user', ?, 'followup', 1)").run(ada.id, ada.id);
  W.raw.prepare("INSERT INTO ai_daily (day, cost_micros, calls) VALUES ('2025-10-09', 5, 1), ('2025-10-10', 5, 1)").run();
  await purgeExpired(W.env, Date.UTC(2026, 10, 10));
  const left = W.q("SELECT day FROM ai_usage WHERE actor_id = ? AND day < '2026-01-01' ORDER BY day", ada.id).map((r) => r.day);
  check("usage is kept 13 months: a row from the day before the 13-month line goes, the row on the line stays", left.join() === "2025-10-10" && W.q("SELECT day FROM ai_daily WHERE day < '2026-01-01'").map((r) => r.day).join() === "2025-10-10", left);
  W.raw.prepare("INSERT INTO ai_usage (day, actor_kind, actor_id, feature, calls) VALUES (?, 'user', 'ghost-user', 'followup', 1), (?, 'host', 'ghost-host', 'feedback_summary', 1)").run(new Date().toISOString().slice(0, 10), new Date().toISOString().slice(0, 10));
  W.raw.prepare("INSERT INTO ai_cache (key, feature, actor_kind, actor_id, result, created_at, expires_at) VALUES ('k1', 'followup', 'user', 'ghost-user', '{}', ?, ?)").run(Date.now(), Date.now() + 1e6);
  await purgeExpired(W.env, Date.now());
  check("rows for an account that no longer exists (a host removed by the reset, say) are swept up, for users and for hosts", W.q1("SELECT COUNT(*) n FROM ai_usage WHERE actor_id LIKE 'ghost%'").n === 0 && W.q1("SELECT COUNT(*) n FROM ai_cache WHERE actor_id = 'ghost-user'").n === 0);
  check("a live account's rows are not swept", W.q1("SELECT COUNT(*) n FROM ai_usage WHERE actor_id = ?", ada.id).n >= 1);

  // Erasure.
  advance(6000);
  await ask(W, ada, { data: { again: 1 } });
  advance(6000);
  await ask(W, other, { data: { other: 2 } });
  check("setup: Ada has a cached reply and usage again", W.q1("SELECT COUNT(*) n FROM ai_cache WHERE actor_id = ?", ada.id).n === 1);
  const del = await c.del("/api/account");
  check("deleting the account removes her cached replies and usage counts at once", del.status === 200 && W.q1("SELECT COUNT(*) n FROM ai_cache WHERE actor_id = ?", ada.id).n === 0 && W.q1("SELECT COUNT(*) n FROM ai_usage WHERE actor_id = ?", ada.id).n === 0);
  check("and leaves everyone else's alone", W.q1("SELECT COUNT(*) n FROM ai_usage WHERE actor_id = ?", other.id).n >= 1 && W.q1("SELECT COUNT(*) n FROM ai_cache WHERE actor_id = ?", other.id).n >= 1);

  // A host's own data download.
  const hc = W.client({ ip: "10.21.0.2", site: "host" });
  const hostInfo = await becomeHost(hc, { kind: "company", name: "AI Test Co" });
  const hid = W.q1("SELECT id FROM host_accounts WHERE email = ?", hostInfo.email).id;
  advance(6000);
  const hr = await ask(W, { kind: "host", id: hid }, { feature: "feedback_summary", data: { host: 1 } });
  const hexp = await hc.get("/api/host/account/export");
  check("a host's data download lists their own AI usage (counts, no text) and the reply still held", hr.fallback === false && hexp.json?.ai?.usage?.length === 1 && hexp.json.ai.usage[0].feature === "feedback_summary" && hexp.json.ai.replies.length === 1 && hexp.json.ai.searchByConnections === undefined, hexp.json?.ai);
  check("nothing a host can fetch names an attendee's usage", !JSON.stringify(hexp.json).includes(other.id));
}

Date.now = realNow;
globalThis.fetch = realFetch;
console.log("\n# The backup model (OpenRouter only)");
{
  const def = aiConfig({});
  const body = requestBody(def, 100, "sys", "usr");
  check("by default the main model is kept and Tencent Hy4 Flash is the backup, in the same request", def.model === DEFAULT_MODEL && DEFAULT_FALLBACK_MODEL === "tencent/hy4-flash"
    && body.model === DEFAULT_MODEL && JSON.stringify(body.models) === JSON.stringify([DEFAULT_MODEL, "tencent/hy4-flash"]) && body.response_format?.type === "json_object", body);
  check("\"none\" turns the backup off, and a backup equal to the main model is dropped",
    !requestBody(aiConfig({ AI_FALLBACK_MODEL: "none" }), 10, "s", "u").models && !requestBody(aiConfig({ AI_FALLBACK_MODEL: DEFAULT_MODEL }), 10, "s", "u").models);
  const other = requestBody(aiConfig({ AI_GATEWAY_URL: "https://gw.test/v1" }), 10, "s", "u");
  check("another gateway gets the plain request, with no OpenRouter-only fields", !("models" in other) && !("response_format" in other));
  const prod = readFileSync(new URL("../wrangler.production.toml", import.meta.url), "utf8");
  check("production names the backup", /^AI_FALLBACK_MODEL = "tencent\/hy4-flash"/m.test(prod));
}

summary();
