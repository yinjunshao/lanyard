// The one way the Worker talks to a model. Every AI feature calls callModel(); none calls a provider
// itself ("AI Safety and Cost Plan", section 1). It never throws: when anything stops a call (off, not
// allowed, a limit, no money left, a slow or broken reply) it returns { fallback: true, reason, message }
// and the feature shows its non-AI version. A refused call costs nothing.
//
//   const r = await callModel(env, {
//     feature: "followup",            // a key of AI_LIMITS in worker/plans.js
//     actor: { kind: "user", id },    // or { kind: "host", id }; loaded from the database, not trusted
//     promptVersion: "followup-1",    // part of the cache key: change it when the prompt changes
//     system: "...the task...",       // the feature's own instructions (worker/ai/prompts/)
//     data: { ... },                  // permission-scoped input; strings are cleaned again here
//     schema: S.obj({ body: S.str({ max: 600 }) }),   // the reply must fit this (worker/ai/validate.js)
//     maxTokens: 300,
//     subjects: [otherUserId, ...],   // people whose data is in `data` (opt-out and block checks)
//     scope: eventId,                 // only for per-event limits
//     regenerate: true,               // skip the cache (counts against the quota)
//     automatic: true,                // server-started (a cron): no burst or address limit (quotas and budget still apply)
//     refine: (value) => value | null,// the feature's own checks on the reply (filterIds, exactQuotes, ...), run before
//                                    // the reply is cached; null or a throw means the reply is thrown away
//     ip, cacheTtlMs, stub, allowFrom
//   });
//   r.fallback ? use the template and r.message : r.result (already checked) and r.remaining
//
// Order of checks: switched on, set up, allowed to use it, people in the data may be used, burst limit,
// quota, cache, budget, then the call (timeout), then the reply is checked, counted and cached.
import { AI_LIMITS, planOf } from "../plans.js";
import { one } from "../db.js";
import { bump, HOUR } from "../ratelimit.js";
import { sha256Hex } from "../session.js";
import { aiConfig, dayOf } from "./config.js";
import { costMicros } from "./price.js";
import { deepClean } from "./sanitize.js";
import { buildSystem, buildUser } from "./prompt.js";
import { parseModelJson, validate } from "./validate.js";
import { getSettings, normEmail, addUsage, addDaily, usedBy, spent, cacheGet, cachePut } from "./store.js";
import { searchableIds, blockedAmong } from "./optout.js";
import { stubResponse } from "./stub.js";
import { friendly } from "./messages.js";
import { checkBudgetAlerts } from "./alerts.js";

export const CACHE_MAX_MS = 7 * 24 * HOUR;
export const BURST_MS = 5000;
export const IP_PER_HOUR = 30;
const MAX_TOKENS_CAP = 1500;
const MAX_BODY_CHARS = 200_000;
const MAX_CACHED_CHARS = 30_000;
const ANTHROPIC_VERSION = "2023-06-01";

const fallback = (reason, feature, extra = {}) => ({ fallback: true, reason, message: friendly(reason, feature), ...extra });

const canonical = (v) => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
};

/** Who is asking, read from the database. The tier says which limits apply. */
async function resolveActor(db, actor) {
  if (!actor || typeof actor.id !== "string" || !actor.id) return null;
  if (actor.kind === "user") {
    const u = await one(db, "SELECT id, is_guest, email_verified, recovery_email, plan, plan_until FROM users WHERE id = ?", actor.id);
    if (!u || u.is_guest || !u.email_verified) return null;
    return { kind: "user", id: u.id, tier: planOf(u).tier, email: normEmail(u.recovery_email) };
  }
  if (actor.kind === "host") {
    const h = await one(db, "SELECT id, email, status, deleted_at FROM host_accounts WHERE id = ?", actor.id);
    if (!h || h.status !== "active" || h.deleted_at) return null;
    return { kind: "host", id: h.id, tier: "host", email: normEmail(h.email) };
  }
  // The admin page's own test call. Reached only from the token-guarded admin route.
  if (actor.kind === "admin" && actor.id === "admin") return { kind: "admin", id: "admin", tier: "admin", email: "" };
  return null;
}

function allowedByRollout(settings, who) {
  if (who.kind === "admin") return true;
  if (who.email && settings.allow.includes(who.email)) return true;
  if (settings.rollout === "everyone") return true;
  if (settings.rollout === "plus") return who.kind === "host" || who.tier === "plus";
  return false;
}

function quotaRefusal(limit, used, scope) {
  if (limit.perScope !== undefined && scope && used.scope >= limit.perScope) return "quota_scope";
  if (limit.day !== undefined && used.day >= limit.day) return "quota_day";
  if (limit.month !== undefined && used.month >= limit.month) return "quota_month";
  return null;
}

const remainingOf = (limit, used, scope) => ({
  day: limit.day !== undefined ? Math.max(0, limit.day - used.day) : null,
  month: limit.month !== undefined ? Math.max(0, limit.month - used.month) : null,
  scope: limit.perScope !== undefined && scope ? Math.max(0, limit.perScope - used.scope) : null,
});

/** What a person has left, for "2 of 3 left today". Reads only; the caller has already checked who they are. */
export async function allowanceFor(env, actor, feature, scope = "") {
  const limit = AI_LIMITS[feature];
  if (!limit) return null;
  const who = await resolveActor(env.DB, actor);
  const l = who && limit[who.tier];
  if (!l) return null;
  const ts = Date.now();
  const day = dayOf(ts);
  const used = await usedBy(env.DB, who, feature, scope, day, `${day.slice(0, 7)}-01`);
  return { limit: l, remaining: remainingOf(l, used, scope) };
}

export async function callModel(env, opts = {}) {
  const feature = opts?.feature;
  try {
    return await run(env, opts);
  } catch (e) {
    // Never throws to the person. The message is not logged: it could hold request details.
    console.error(`ai ${feature}: unexpected ${e?.name || "error"}`);
    return fallback("error", feature);
  }
}

async function run(env, opts) {
  const { feature, actor, system, promptVersion, data, schema, scope = "", subjects = [], regenerate = false, automatic = false, ip = null, stub, allowFrom = [] } = opts;
  const db = env.DB;
  const meta = AI_LIMITS[feature];
  const maxTokens = Number.isInteger(opts.maxTokens) ? opts.maxTokens : 0;
  if (!meta || typeof system !== "string" || !system || typeof promptVersion !== "string" || !promptVersion
      || !schema || maxTokens < 1 || maxTokens > MAX_TOKENS_CAP || data === undefined) {
    console.error(`ai ${feature}: callModel was called with a bad definition`);
    return fallback("misconfigured", feature);
  }
  const cfg = aiConfig(env);
  const ts = Date.now();
  const day = dayOf(ts);
  const monthStart = `${day.slice(0, 7)}-01`;
  const settings = await getSettings(db);

  // 1. Switched on? The environment variable and the admin kill switch both have to allow it.
  if (!cfg.enabled || settings.killed) { await addDaily(db, day, { fallbacks: 1 }); return fallback("off", feature); }
  if (cfg.stub.requested && !cfg.stub.allowed) { console.error("ai: AI_STUB is set on a non-local origin and was refused"); await addDaily(db, day, { fallbacks: 1 }); return fallback("misconfigured", feature); }
  if (!cfg.stub.allowed && (!cfg.gatewayUrl || !cfg.hasKey)) { await addDaily(db, day, { fallbacks: 1 }); return fallback("misconfigured", feature); }

  // 2. Allowed to use it? A saved account with a confirmed email, or a host account; the rollout stage.
  const who = await resolveActor(db, actor);
  if (!who) { await addDaily(db, day, { fallbacks: 1 }); return fallback("ineligible", feature); }
  const limit = meta[who.tier];
  if (!limit) { await addDaily(db, day, { fallbacks: 1 }); return fallback("ineligible", feature); }
  const counted = async (reason, d = {}) => {
    await addUsage(db, who, day, feature, scope, { fallbacks: 1, ...d });
    await addDaily(db, day, { fallbacks: 1 });
    return fallback(reason, feature);
  };
  if (!allowedByRollout(settings, who)) return counted("not_allowed");

  // 3. The people whose data is in the prompt: not opted out of AI search, not blocked either way.
  const people = [...new Set((Array.isArray(subjects) ? subjects : []).filter((x) => typeof x === "string"))];
  if (people.length) {
    if (meta.optOut) {
      const ok = await searchableIds(db, people);
      if (people.some((id) => !ok.has(id))) return counted("opted_out");
    }
    if (who.kind === "user" && (await blockedAmong(db, who.id, people)).size) return counted("blocked");
  }

  // 4. Burst limit: one call every 5 seconds per person, 30 an hour per address. Refusals here write nothing.
  if (!automatic) {
    if ((await bump(db, `ai:burst:${who.kind}:${who.id}`, BURST_MS)) > 1) return fallback("burst", feature);
    if (ip && (await bump(db, `ai:ip:${ip}`, HOUR)) > IP_PER_HOUR) return fallback("ip_limit", feature);
  }

  // 5. Quota (a daily, monthly or per-event number of calls to the model).
  const used = await usedBy(db, who, feature, scope, day, monthStart);
  const over = quotaRefusal(limit, used, scope);
  if (over) return counted(over, { limited: 1 });

  // The request, built once: cleaned data, the guard sentence and the wrapped data block.
  const cleanData = deepClean(data);
  const systemText = buildSystem(system);
  const userText = buildUser(cleanData);

  // 6. Cache. The key covers the person, the feature, the prompt version, the model and the exact input,
  // so nobody else, and no changed input, can be served this row.
  const key = await sha256Hex(canonical({ v: promptVersion, f: feature, k: who.kind, a: who.id, m: cfg.model, mt: maxTokens, x: scope, p: [...people].sort(), s: systemText, d: cleanData, sc: schema }));
  if (!regenerate) {
    const hit = await cacheGet(db, key, who, ts);
    if (hit !== null) {
      await addUsage(db, who, day, feature, scope, { cache_hits: 1 });
      await addDaily(db, day, { cache_hits: 1 });
      return { fallback: false, result: hit, cached: true, remaining: remainingOf(limit, used, scope) };
    }
  }

  // 7. App budget. The worst this call could cost (all of max_tokens) has to fit in what is left.
  const worst = costMicros(env, Math.ceil((systemText.length + userText.length) / 3), maxTokens);
  const before = await spent(db, day, monthStart);
  if (before.day + worst > cfg.dailyBudgetMicros) return counted("budget_day");
  if (before.month + worst > cfg.monthlyBudgetMicros) return counted("budget_month");

  // 8. The call. The quota is taken first so that two calls at once cannot both squeeze in; a failed call gives it back.
  await addUsage(db, who, day, feature, scope, { calls: 1 });
  const giveBack = async (reason) => {
    await addUsage(db, who, day, feature, scope, { calls: -1, fallbacks: 1 });
    await addDaily(db, day, { fallbacks: 1 });
    return fallback(reason, feature);
  };
  let body;
  if (cfg.stub.allowed) {
    body = stubResponse({ system: systemText, user: userText, stub });
  } else {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs);
    try {
      const res = await fetch(`${cfg.gatewayUrl}/v1/messages`, {
        method: "POST",
        redirect: "error", // a redirect could carry the key somewhere else
        signal: ctl.signal,
        headers: { "x-api-key": env.CLAUDE_API_KEY, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json" },
        body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, system: systemText, messages: [{ role: "user", content: userText }] }),
      });
      if (!res.ok) {
        console.error(`ai ${feature}: the model answered ${res.status}`);
        return giveBack(res.status === 429 ? "provider_limit" : "error");
      }
      const text = await res.text();
      if (text.length > MAX_BODY_CHARS) return giveBack("error");
      try { body = JSON.parse(text); } catch { return giveBack("error"); }
    } catch (e) {
      return giveBack(e?.name === "AbortError" ? "timeout" : "error");
    } finally { clearTimeout(timer); }
  }

  // 9. Count what it cost. Tokens come from the reply; if they are missing the worst case is charged.
  const tokens = (v, worstCase) => (Number.isFinite(v) && v >= 0 ? Math.round(v) : worstCase);
  const inTok = tokens(body?.usage?.input_tokens, Math.ceil((systemText.length + userText.length) / 3));
  const outTok = tokens(body?.usage?.output_tokens, maxTokens);
  const cost = costMicros(env, inTok, outTok);
  await addUsage(db, who, day, feature, scope, { input_tokens: inTok, output_tokens: outTok, cost_micros: cost });
  await addDaily(db, day, { cost_micros: cost, calls: 1 });
  const after = await spent(db, day, monthStart);
  await checkBudgetAlerts(env, cfg, db, after, ts).catch(() => {});

  // 10. Check the reply: strict JSON that fits the schema, or it is thrown away.
  const stopped = body?.stop_reason;
  const text = body?.content?.[0]?.text;
  const parsed = stopped === "max_tokens" ? { ok: false } : parseModelJson(text);
  const checked = parsed.ok ? validate(schema, parsed.value, { allowFrom: [systemText, userText, ...allowFrom.map(String)] }) : { ok: false };
  let final = checked.ok ? checked.value : null;
  if (checked.ok && typeof opts.refine === "function") {
    try { final = opts.refine(checked.value) ?? null; } catch { final = null; }
  }
  if (final === null) {
    // The model was paid for, so the call still counts.
    await addUsage(db, who, day, feature, scope, { fallbacks: 1 });
    await addDaily(db, day, { fallbacks: 1 });
    return fallback("bad_output", feature);
  }

  const ttl = Math.min(Number.isFinite(opts.cacheTtlMs) ? opts.cacheTtlMs : CACHE_MAX_MS, CACHE_MAX_MS);
  const json = JSON.stringify(final);
  if (ttl > 0 && json.length <= MAX_CACHED_CHARS) await cachePut(db, key, who, feature, json, Date.now(), ttl);
  const usedNow = { day: used.day + 1, month: used.month + 1, scope: used.scope + (scope ? 1 : 0) };
  return { fallback: false, result: final, cached: false, usage: { inputTokens: inTok, outputTokens: outTok, costMicros: cost }, remaining: remainingOf(limit, usedNow, scope) };
}
