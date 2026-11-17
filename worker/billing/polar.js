// Polar (polar.sh), merchant of record (F36, D041). The only file that knows Polar's API.
// Every network call goes through `env.BILLING_FETCH` when a test passes one, so tests never
// reach the network; on the Worker it is the global fetch. Sandbox: POLAR_SERVER = "sandbox".
// Field names follow Polar's API docs as read on 2026-11-15; check them in the sandbox.
export const name = "polar";

const API = { live: "https://api.polar.sh/v1", sandbox: "https://sandbox-api.polar.sh/v1" };
const base = (env) => (env.POLAR_SERVER === "sandbox" ? API.sandbox : API.live);
const fetcher = (env) => (typeof env.BILLING_FETCH === "function" ? env.BILLING_FETCH : fetch);

class ProviderError extends Error {
  constructor(message) { super(message); this.status = 502; this.code = "provider_error"; this.expose = true; this.quiet = true; }
}
const UNREACHABLE = "We couldn't reach the payment page. Try again in a moment.";

async function call(env, path, body) {
  let res;
  try {
    res = await fetcher(env)(base(env) + path, {
      method: "POST",
      headers: { authorization: `Bearer ${env.POLAR_ACCESS_TOKEN}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch { throw new ProviderError(UNREACHABLE); }
  // Never log or pass on the body: it can echo what we sent. The status is enough.
  if (!res.ok) { console.error(`polar ${path} answered ${res.status}`); throw new ProviderError(UNREACHABLE); }
  return res.json().catch(() => { throw new ProviderError(UNREACHABLE); });
}

const httpsUrl = (u) => { try { return new URL(u).protocol === "https:" ? String(u) : null; } catch { return null; } };

/**
 * A hosted checkout for one of our products. `providerProductId` comes from our own table
 * (provider.js); the browser never chooses it. Discount codes are off: promos are ours.
 */
export async function createCheckout(env, providerProductId, who, { orderId, successUrl, email } = {}) {
  const body = {
    products: [providerProductId],
    success_url: successUrl,
    external_customer_id: who.externalId,
    metadata: { lanyard_order: orderId },
    allow_discount_codes: false,
  };
  if (email) body.customer_email = email;
  const out = await call(env, "/checkouts/", body);
  const url = httpsUrl(out?.url);
  if (!url || typeof out?.id !== "string") throw new ProviderError(UNREACHABLE);
  return { id: out.id, url };
}

/** Polar's Customer Portal for a customer of ours: cancel, change card, receipts. */
export async function portalUrl(env, who, { returnUrl } = {}) {
  const out = await call(env, "/customer-sessions/", { external_customer_id: who.externalId, ...(returnUrl ? { return_url: returnUrl } : {}) });
  const url = httpsUrl(out?.customer_portal_url);
  if (!url) throw new ProviderError(UNREACHABLE);
  return url;
}

/* --------------------------- Standard Webhooks ---------------------------- */
// https://www.standardwebhooks.com: HMAC-SHA256 over `id.timestamp.body` with the base64 key after
// "whsec_", base64 signatures "v1,<sig>" separated by spaces (any one may match), and a timestamp
// within 5 minutes either way. Polar secrets made from 8 September 2026 are plain Standard Webhooks.
export const TOLERANCE_SECONDS = 5 * 60;
const enc = new TextEncoder();
function fromB64(s) {
  try { return Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0)); } catch { return null; }
}
/** Every byte is compared, whatever the first difference, so timing says nothing. */
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyWebhook(headers, rawBody, secret, nowMs = Date.now()) {
  const get = (k) => String((typeof headers?.get === "function" ? headers.get(k) : headers?.[k]) || "");
  const id = get("webhook-id"), ts = get("webhook-timestamp"), sigs = get("webhook-signature");
  if (typeof rawBody !== "string" || !secret || !id || id.length > 200 || !/^\d{1,12}$/.test(ts) || !sigs || sigs.length > 4000) return false;
  if (Math.abs(nowMs / 1000 - Number(ts)) > TOLERANCE_SECONDS) return false;
  const keyBytes = fromB64(String(secret).replace(/^whsec_/, ""));
  if (!keyBytes || keyBytes.length < 16) return false;
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${id}.${ts}.${rawBody}`)));
  let ok = false;
  for (const part of sigs.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const got = fromB64(sig);
    if (got && sameBytes(got, mac)) ok = true; // no early return
  }
  return ok;
}

/* ------------------------------ events ------------------------------------ */
const str = (v) => (typeof v === "string" && v.length <= 200 ? v : null);
const int = (v) => (Number.isSafeInteger(v) ? v : null);
const lower = (v) => (typeof v === "string" ? v.toLowerCase() : null);
const when = (v) => { const t = typeof v === "string" ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };

/** A verified Polar event in our own words, or null for one we store and ignore. */
export function readEvent(json) {
  const type = str(json?.type);
  const d = json?.data && typeof json.data === "object" ? json.data : {};
  const common = {
    providerType: type,
    checkoutId: str(d.checkout_id),
    lanyardOrder: str(d.metadata?.lanyard_order),
    providerProductId: str(d.product_id) || str(d.product?.id),
    currency: lower(d.currency),
  };
  if (type === "order.paid" || type === "order.refunded") {
    return {
      ...common, kind: type === "order.paid" ? "paid" : "refunded",
      providerOrderId: str(d.id), subscriptionId: str(d.subscription_id),
      amount: int(d.subtotal_amount) ?? int(d.amount),
      fullRefund: d.status === "refunded",
    };
  }
  if (type && type.startsWith("subscription.")) {
    return {
      ...common, kind: "subscription",
      subscriptionId: str(d.id), status: str(d.status),
      periodEnd: when(d.current_period_end), cancelAtPeriodEnd: d.cancel_at_period_end === true,
      ended: type === "subscription.revoked" || d.status === "revoked",
    };
  }
  return null;
}
