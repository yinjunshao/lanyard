// Everything the AI foundation reads from the environment, in one place. Nothing here is a secret
// except CLAUDE_API_KEY, which is only ever read by client.js and never returned or logged.
//
//   AI_ENABLED               "1" to allow AI at all. Anything else, or unset, is off.
//   AI_MODEL                 the model id (default below). Prices must be set for the model in use.
//   AI_GATEWAY_URL           base address of the gateway or provider, https. "/v1/messages" is added.
//   AI_DAILY_BUDGET_USD      default 2
//   AI_MONTHLY_BUDGET_USD    default 30
//   AI_TIMEOUT_MS            default 10000
//   AI_PRICE_*               see price.js
//   AI_ALERT_EMAIL           where the 50% and 90% budget emails go (none if unset)
//   AI_STUB                  "1" answers locally with a canned reply and calls nothing. Refused unless
//                            every APP_ORIGIN is a local address; production config never sets it.
//   CLAUDE_API_KEY           secret
export const DEFAULT_MODEL = "claude-haiku-5-5";
const DEFAULT_DAILY_USD = 2;
const DEFAULT_MONTHLY_USD = 30;
const DEFAULT_TIMEOUT_MS = 10_000;

const truthy = (v) => /^(1|true|on|yes)$/i.test(String(v ?? "").trim());

// A budget that is set but not a positive number means zero, so a typo stops spending instead of
// removing the limit. Unset means the default.
function usdToMicros(v, fallbackUsd) {
  if (v === undefined || v === null || String(v).trim() === "") return Math.round(fallbackUsd * 1e6);
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1e6) : 0;
}

function gatewayUrl(v) {
  try {
    const u = new URL(String(v || "").trim());
    if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash) return null;
    return u.origin + u.pathname.replace(/\/+$/, "");
  } catch { return null; }
}

const LOCAL_HOST = (h) => h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost") || h.endsWith(".test");

/** Allowed only when AI_STUB is set AND every origin the app answers to is a local address. */
export function stubMode(env) {
  const requested = truthy(env.AI_STUB);
  if (!requested) return { requested: false, allowed: false };
  const origins = String(env.APP_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
  let allowed = origins.length > 0;
  for (const o of origins) {
    try { if (!LOCAL_HOST(new URL(o).hostname)) allowed = false; } catch { allowed = false; }
  }
  return { requested: true, allowed };
}

export function aiConfig(env) {
  const timeout = Number(env.AI_TIMEOUT_MS);
  return {
    enabled: truthy(env.AI_ENABLED),
    model: String(env.AI_MODEL || "").trim() || DEFAULT_MODEL,
    gatewayUrl: gatewayUrl(env.AI_GATEWAY_URL),
    hasKey: typeof env.CLAUDE_API_KEY === "string" && env.CLAUDE_API_KEY.trim().length >= 8,
    dailyBudgetMicros: usdToMicros(env.AI_DAILY_BUDGET_USD, DEFAULT_DAILY_USD),
    monthlyBudgetMicros: usdToMicros(env.AI_MONTHLY_BUDGET_USD, DEFAULT_MONTHLY_USD),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? Math.min(timeout, 30_000) : DEFAULT_TIMEOUT_MS,
    alertEmail: String(env.AI_ALERT_EMAIL || "").trim() || null,
    stub: stubMode(env),
  };
}

/** UTC calendar day, "YYYY-MM-DD". Quotas and budgets reset at midnight UTC. */
export const dayOf = (ts = Date.now()) => new Date(ts).toISOString().slice(0, 10);
export const monthOf = (ts = Date.now()) => dayOf(ts).slice(0, 7);
