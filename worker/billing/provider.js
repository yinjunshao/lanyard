// Card payments (F36, D041): the one place the rest of the Worker asks about billing.
//
// The provider module (polar.js today) is the only code that knows a provider's API. It has:
//   createCheckout(env, productId, who, { orderId, successUrl, email }) -> { id, url }
//   verifyWebhook(headers, rawBody, secret, nowMs?)                     -> true | false
//   portalUrl(env, who, { returnUrl })                                  -> url
//   readEvent(json)  -> the event in our own words (see routes.js), or null to store and ignore
// Our own tables (migration 0031) hold the facts, with a `provider` column, so a switch to
// another provider is a new module with these four functions, not new data.
//
// Prices, currency and the provider's product ids come only from here. The browser sends one of
// our product ids at most; nothing it sends about price, amount, currency or quantity is used.
import { PLUS_PRICE, HOST_SKUS } from "../plans.js";
import * as polar from "./polar.js";

export const CURRENCY = "gbp";
export const BILLING_OFF = "Card payments are not switched on yet.";

/** Our product table: what each product id is and what it costs. Host packs come from HOST_SKUS. */
export const PRODUCTS = {
  plus_month: { kind: "plus", label: "Lanyard Plus, monthly", interval: "month", pence: PLUS_PRICE.monthlyPence },
  plus_year:  { kind: "plus", label: "Lanyard Plus, yearly",  interval: "year",  pence: PLUS_PRICE.yearlyPence },
  ...Object.fromEntries(Object.entries(HOST_SKUS)
    .filter(([, s]) => s.audience !== "quote" && s.pence > 0 && s.credits > 0)
    .map(([id, s]) => [id, { kind: "credits", label: s.label, pence: s.pence, credits: s.credits, days: s.days, audience: s.audience }])),
};

/** The product for an id the browser sent, or null. Only own string keys count (no "__proto__" tricks). */
export function productFor(id) {
  return typeof id === "string" && Object.hasOwn(PRODUCTS, id) ? { id, ...PRODUCTS[id] } : null;
}

/** The switch. Production sets nothing, so it is off. */
export const billingOn = (env) => env?.BILLING_ENABLED === "1";

/** The provider in use. One line to change for another provider. */
export const provider = () => polar;

/** The provider's product id for one of ours, from the POLAR_PRODUCTS var (JSON), or null. */
export function providerProductId(env, productId) {
  let map;
  try { map = typeof env.POLAR_PRODUCTS === "string" ? JSON.parse(env.POLAR_PRODUCTS) : env.POLAR_PRODUCTS; } catch { return null; }
  const v = map && Object.hasOwn(map, productId) ? map[productId] : null;
  return typeof v === "string" && /^[A-Za-z0-9_-]{6,80}$/.test(v) ? v : null;
}

/** Our product id for a provider's product id, or null. */
export function productForProviderId(env, providerId) {
  return Object.keys(PRODUCTS).find((id) => providerProductId(env, id) === providerId) || null;
}

/** Who we are, for the pre-contract box. Empty until the owner sets SELLER_NAME and SELLER_ADDRESS. */
export function seller(env) {
  const name = String(env.SELLER_NAME || "").trim();
  const address = String(env.SELLER_ADDRESS || "").trim();
  return name && address ? { name, address } : null;
}

/**
 * Whether a checkout may start: the switch, both secrets, the seller's name and address, and the
 * provider's id for this product (when one is given). Fails closed.
 */
export function checkoutReady(env, productId) {
  if (!billingOn(env) || !env.POLAR_ACCESS_TOKEN || !env.POLAR_WEBHOOK_SECRET || !seller(env)) return false;
  return productId ? !!providerProductId(env, productId) : true;
}
