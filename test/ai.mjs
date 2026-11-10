// F21: the AI foundation. Every model call here goes to a stubbed fetch: nothing leaves the machine,
// no key is read from disk. Sections are added task by task (F21.1 config, F21.2 the client, F21.4
// admin, F21.5 settings). Run: node test/ai.mjs
import { readFileSync } from "node:fs";
import { makeDb, readMigration, check, summary } from "./harness.mjs";
import { aiConfig, stubMode, dayOf, monthOf, DEFAULT_MODEL } from "../worker/ai/config.js";
import { prices, costMicros } from "../worker/ai/price.js";
import { AI_LIMITS } from "../worker/plans.js";

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
  check("with nothing set, AI is off and nothing is configured", !off.enabled && !off.gatewayUrl && !off.hasKey && off.model === DEFAULT_MODEL, off);
  check("the model id is claude-haiku-5-5 and comes from AI_MODEL when set", DEFAULT_MODEL === "claude-haiku-5-5" && aiConfig({ AI_MODEL: "other-model" }).model === "other-model");
  check("only 1, true, on or yes turn it on", ["1", "true", "ON", "yes"].every((v) => aiConfig({ AI_ENABLED: v }).enabled) && ["0", "", "no", "false", "2", "enabled"].every((v) => !aiConfig({ AI_ENABLED: v }).enabled));
  check("budgets default to $2 a day and $30 a month", aiConfig({}).dailyBudgetMicros === 2_000_000 && aiConfig({}).monthlyBudgetMicros === 30_000_000);
  check("a budget of 0.000001 is one micro-dollar", aiConfig({ AI_DAILY_BUDGET_USD: "0.000001" }).dailyBudgetMicros === 1);
  check("a budget that is set but not a positive number means zero, not unlimited", ["abc", "-5", "0", "NaN", "Infinity"].every((v) => aiConfig({ AI_DAILY_BUDGET_USD: v }).dailyBudgetMicros === 0 && aiConfig({ AI_MONTHLY_BUDGET_USD: v }).monthlyBudgetMicros === 0));
  check("the gateway must be an https address without credentials or a query; a trailing slash is removed",
    aiConfig({ AI_GATEWAY_URL: "https://gw.test/v1/a/b/anthropic/" }).gatewayUrl === "https://gw.test/v1/a/b/anthropic"
    && ["http://gw.test", "ftp://x", "not a url", "https://u:p@gw.test", "https://gw.test/?k=1", ""].every((v) => aiConfig({ AI_GATEWAY_URL: v }).gatewayUrl === null));
  check("the key counts as set only when it looks like a key (8 or more characters)", aiConfig({ CLAUDE_API_KEY: "short" }).hasKey === false && aiConfig({ CLAUDE_API_KEY: "sk-test-12345" }).hasKey === true);
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
  check("production config has AI_ENABLED off", /^AI_ENABLED\s*=\s*"0"/m.test(live));
  check("production config holds no key and no price (the owner sets both)", !/CLAUDE_API_KEY|AI_PRICE_|sk-ant/.test(live));
  check("the production APP_ORIGIN would make the Worker refuse the stub anyway", stubMode({ AI_STUB: "1", APP_ORIGIN: /^APP_ORIGIN\s*=\s*"([^"]+)"/m.exec(live)[1] }).allowed === false);
}

console.log("\n# Prices and cost");
{
  const p = prices({});
  check("with no price vars the plan's figures are used and flagged unconfirmed", p.input === 0.10 && p.output === 0.50 && p.confirmed === false);
  check("both vars together are confirmed and used", prices({ AI_PRICE_INPUT_PER_MTOK_USD: "1", AI_PRICE_OUTPUT_PER_MTOK_USD: "5" }).confirmed === true && prices({ AI_PRICE_INPUT_PER_MTOK_USD: "1", AI_PRICE_OUTPUT_PER_MTOK_USD: "5" }).output === 5);
  check("one var alone, or a bad one, stays unconfirmed", prices({ AI_PRICE_INPUT_PER_MTOK_USD: "1" }).confirmed === false && prices({ AI_PRICE_INPUT_PER_MTOK_USD: "x", AI_PRICE_OUTPUT_PER_MTOK_USD: "-1" }).confirmed === false);
  const env = { AI_PRICE_INPUT_PER_MTOK_USD: "1", AI_PRICE_OUTPUT_PER_MTOK_USD: "5" };
  check("cost is micro-dollars: 1,000,000 input tokens at $1 is 1,000,000", costMicros(env, 1_000_000, 0) === 1_000_000 && costMicros(env, 0, 1_000_000) === 5_000_000);
  check("a tiny call is rounded up, never free", costMicros({}, 1, 0) === 1 && costMicros({}, 900, 180) === 180);
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

globalThis.fetch = realFetch;
summary();
