// The AI section of the admin page: spend against budget, calls per feature, cache hits, fallbacks, the
// busiest people (ids only), the kill switch, the rollout stage, the allow-list and a test call. Registered
// on adminApp (worker/admin.js), so every route here sits behind ADMIN_TOKEN like the rest of /api/admin.
// Nothing here returns the key, a prompt or anyone's text.
import { all } from "../db.js";
import { AI_LIMITS } from "../plans.js";
import { aiConfig, dayOf } from "./config.js";
import { prices } from "./price.js";
import { getSettings, setSetting, spent, normEmail, ROLLOUTS, MAX_ALLOW } from "./store.js";
import { callModel } from "./client.js";
import { ADMIN_TEST } from "./prompts/adminTest.js";

const usd = (micros) => Math.round(micros) / 1e6;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// People who reached a limit on three days in a row (not blocked, only flagged).
function flaggedFrom(rows) {
  const byActor = new Map();
  for (const r of rows) {
    const k = `${r.actor_kind}:${r.actor_id}`;
    if (!byActor.has(k)) byActor.set(k, { kind: r.actor_kind, id: r.actor_id, days: [] });
    byActor.get(k).days.push(r.day);
  }
  const out = [];
  for (const a of byActor.values()) {
    const days = [...new Set(a.days)].sort();
    let run = 1, best = 1;
    for (let i = 1; i < days.length; i++) {
      run = (Date.parse(days[i]) - Date.parse(days[i - 1])) === 86400e3 ? run + 1 : 1;
      best = Math.max(best, run);
    }
    if (best >= 3) out.push({ kind: a.kind, id: a.id, days: best, last: days[days.length - 1] });
  }
  return out;
}

export function registerAiAdmin(app) {
  app.get("/api/admin/ai", async (c) => {
    const env = c.env, db = env.DB;
    const cfg = aiConfig(env);
    const settings = await getSettings(db);
    const ts = Date.now();
    const day = dayOf(ts);
    const monthStart = `${day.slice(0, 7)}-01`;
    const [spend, daily, byFeature, top, limitedRows] = await Promise.all([
      spent(db, day, monthStart),
      all(db, "SELECT day, cost_micros, calls, cache_hits, fallbacks FROM ai_daily WHERE day >= ? ORDER BY day", monthStart),
      all(db, `SELECT feature,
                 SUM(calls) AS calls, SUM(cache_hits) AS cache_hits, SUM(fallbacks) AS fallbacks, SUM(limited) AS limited,
                 SUM(cost_micros) AS cost, SUM(CASE WHEN day = ? THEN calls ELSE 0 END) AS calls_today
               FROM ai_usage WHERE day >= ? GROUP BY feature ORDER BY calls DESC`, day, monthStart),
      all(db, `SELECT actor_kind, actor_id, SUM(calls) AS calls, SUM(cost_micros) AS cost, SUM(limited) AS limited
               FROM ai_usage WHERE day >= ? GROUP BY actor_kind, actor_id HAVING SUM(calls) > 0 ORDER BY calls DESC, cost DESC LIMIT 10`, monthStart),
      all(db, "SELECT DISTINCT actor_kind, actor_id, day FROM ai_usage WHERE limited > 0 AND day >= ?", new Date(ts - 14 * 86400e3).toISOString().slice(0, 10)),
    ]);
    const today = daily.find((d) => d.day === day) || { cost_micros: 0, calls: 0, cache_hits: 0, fallbacks: 0 };
    const sum = (k) => daily.reduce((s, d) => s + (d[k] || 0), 0);
    const price = prices(env);
    const stubOk = cfg.stub.allowed;
    const configured = stubOk || (!!cfg.gatewayUrl && cfg.hasKey);
    return c.json({
      // Is AI working right now, and if not, why not (the reason is for the admin only).
      state: !cfg.enabled ? "off_env" : settings.killed ? "off_switch" : cfg.stub.requested && !stubOk ? "stub_refused" : !configured ? "not_configured" : "on",
      config: {
        enabled: cfg.enabled, model: cfg.model, gatewaySet: !!cfg.gatewayUrl, keySet: cfg.hasKey, // set or not: never the value
        stub: cfg.stub, timeoutMs: cfg.timeoutMs, alertEmailSet: !!cfg.alertEmail,
        prices: { inputPerMtokUsd: price.input, outputPerMtokUsd: price.output, confirmed: price.confirmed },
        dailyBudgetUsd: usd(cfg.dailyBudgetMicros), monthlyBudgetUsd: usd(cfg.monthlyBudgetMicros),
      },
      settings: { killed: settings.killed, rollout: settings.rollout, allow: settings.allow, rollouts: ROLLOUTS, maxAllow: MAX_ALLOW },
      today: { spendUsd: usd(spend.day), calls: today.calls || 0, cacheHits: today.cache_hits || 0, fallbacks: today.fallbacks || 0 },
      month: { spendUsd: usd(spend.month), calls: sum("calls"), cacheHits: sum("cache_hits"), fallbacks: sum("fallbacks") },
      cacheHitRate: sum("calls") + sum("cache_hits") ? sum("cache_hits") / (sum("calls") + sum("cache_hits")) : null,
      features: byFeature.map((f) => ({ feature: f.feature, label: AI_LIMITS[f.feature]?.label || f.feature, callsToday: f.calls_today || 0, calls: f.calls || 0, cacheHits: f.cache_hits || 0, fallbacks: f.fallbacks || 0, limited: f.limited || 0, spendUsd: usd(f.cost || 0) })),
      topUsers: top.map((u) => ({ kind: u.actor_kind, id: u.actor_id, calls: u.calls, spendUsd: usd(u.cost || 0), limited: u.limited || 0 })),
      flagged: flaggedFrom(limitedRows),
    });
  });

  app.post("/api/admin/ai/kill", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    if (typeof b.killed !== "boolean") return c.json({ error: "killed must be true or false" }, 400);
    await setSetting(c.env.DB, "killed", b.killed ? "1" : "0");
    return c.json({ ok: true, killed: b.killed });
  });

  app.post("/api/admin/ai/rollout", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    if (!ROLLOUTS.includes(b.mode)) return c.json({ error: `mode must be one of ${ROLLOUTS.join(", ")}` }, 400);
    await setSetting(c.env.DB, "rollout", b.mode);
    return c.json({ ok: true, rollout: b.mode });
  });

  app.put("/api/admin/ai/allow", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    if (!Array.isArray(b.emails)) return c.json({ error: "emails must be a list" }, 400);
    const emails = [...new Set(b.emails.map(normEmail).filter(Boolean))];
    if (emails.length > MAX_ALLOW) return c.json({ error: `At most ${MAX_ALLOW} addresses.` }, 400);
    const bad = emails.find((e) => e.length > 120 || !EMAIL.test(e));
    if (bad) return c.json({ error: "One of those isn't an email address." }, 400);
    await setSetting(c.env.DB, "allow", JSON.stringify(emails));
    return c.json({ ok: true, allow: emails });
  });

  // One small call through the whole pipeline (switches, budget, gateway, key, reply check), so the owner can
  // see that it is set up without writing any code. It sends no personal data.
  app.post("/api/admin/ai/test", async (c) => {
    const r = await callModel(c.env, { ...ADMIN_TEST, actor: { kind: "admin", id: "admin" }, regenerate: true, cacheTtlMs: 0 });
    if (r.fallback) return c.json({ ok: false, reason: r.reason, message: r.message });
    return c.json({ ok: true, usage: r.usage, stub: aiConfig(c.env).stub.allowed });
  });
}
