// Card payment routes (F36, D041), all off unless BILLING_ENABLED = "1":
//   GET  /api/billing/plans      what the Plan page shows (works when off: it says "coming soon")
//   POST /api/billing/checkout   Plus, monthly or yearly: returns the provider's checkout address
//   POST /api/billing/portal     the provider's portal to manage or cancel
//   POST /api/webhooks/polar     the only way an order becomes paid
// Host packs check out through POST /api/host/billing/checkout (hosts.js), with startCheckout here.
//
// The payment bar (F27, F35, D040): prices only from our table; paid only on a verified webhook;
// each webhook id once, and every grant one conditional write in the same batch, gated on this
// delivery's token; who gets it from our own order row; refunds only from the provider.
import { Hono } from "hono";
import { newToken, now, one, run } from "../db.js";
import { requireUser, HttpError } from "../session.js";
import { bump, HOUR } from "../ratelimit.js";
import { planOf, USER_PLANS, PLUS_INCLUDES } from "../plans.js";
import {
  BILLING_OFF, CURRENCY, billingOn, checkoutReady, productFor, provider, providerProductId,
  productForProviderId, seller,
} from "./provider.js";

export const billingApp = new Hono();
const DAY_MS = 24 * HOUR;
const MAX_BODY = 256 * 1024;
const ACTIVE = new Set(["active", "trialing"]);

export const offResponse = (c) => c.json({ error: BILLING_OFF, code: "billing_off" }, 503);

/** Checks every checkout request makes the same way, Plus or host pack. Throws a 400. */
export function checkoutBody(b, kind) {
  const product = productFor(b?.product);
  if (!product || product.kind !== kind) throw new HttpError(400, "That isn't something you can buy here.", "unknown_product");
  // There is nothing to buy more than one of: any quantity but 1 (or none) is refused, never bent.
  if (b.quantity !== undefined && b.quantity !== 1) throw new HttpError(400, "You can buy one at a time.", "bad_quantity");
  if (b.startNow !== true) throw new HttpError(400, "Tick the box to start straight away before you pay.", "express_start");
  return product; // b.price, b.amount, b.currency and the rest are never read
}

/**
 * Writes our order with our own price, then asks the provider for a checkout. `who` says whose it
 * is (a user, or an organisation and the host who pressed Pay); the webhook grants to this row.
 */
export async function startCheckout(c, product, who, successUrl) {
  const env = c.env;
  const p = provider();
  const id = "bo_" + newToken();
  const ts = now();
  await run(env.DB,
    `INSERT INTO billing_orders (id, provider, product, kind, amount_pence, currency, user_id, org_id, org_name, host_account_id, status, express_start_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    id, p.name, product.id, product.kind, product.pence, CURRENCY, who.userId || null, who.orgId || null, who.orgName || null, who.hostAccountId || null, ts, ts);
  try {
    const out = await p.createCheckout(env, providerProductId(env, product.id), who, { orderId: id, successUrl, email: who.email });
    await run(env.DB, "UPDATE billing_orders SET checkout_id = ? WHERE id = ?", out.id, id);
    return c.json({ url: out.url }, 201);
  } catch (e) {
    await run(env.DB, "UPDATE billing_orders SET status = 'failed' WHERE id = ?", id);
    throw e;
  }
}

/** What the pages show beside the price: who sells it (when set) and whether Pay can be offered. */
export const billingInfo = (env) => ({ cardPayments: checkoutReady(env), seller: checkoutReady(env) ? seller(env) : null });

const PLUS_IDS = ["plus_month", "plus_year"];
billingApp.get("/api/billing/plans", (c) => {
  const on = PLUS_IDS.every((id) => checkoutReady(c.env, id));
  return c.json({
    cardPayments: on,
    seller: on ? seller(c.env) : null,
    products: PLUS_IDS.map((id) => { const pr = productFor(id); return { id, label: pr.label, interval: pr.interval, pence: pr.pence }; }),
    includes: PLUS_INCLUDES,
    freeCards: USER_PLANS.free.cards,
  });
});

const claimed = (u) => !!(u.has_passkey || u.has_recovery || u.has_totp || u.email_verified);

billingApp.post("/api/billing/checkout", async (c) => {
  if (!billingOn(c.env)) return offResponse(c);
  const u = requireUser(c);
  const b = await c.req.json().catch(() => ({}));
  const product = checkoutBody(b && typeof b === "object" ? b : {}, "plus");
  if (!checkoutReady(c.env, product.id)) return offResponse(c);
  if (u.is_guest || !claimed(u)) throw new HttpError(403, "Add a way to sign in first (Settings, Security), so you never lose what you paid for.", "needs_signin");
  const row = await one(c.env.DB, "SELECT plan, plan_until FROM users WHERE id = ?", u.id);
  if (planOf(row).tier === "plus") throw new HttpError(409, "You already have Plus.", "already_plus");
  if ((await bump(c.env.DB, `bill:co:${u.id}`, HOUR)) > 10) throw new HttpError(429, "That's a lot of tries. Wait a little and try again.", "throttled");
  const email = u.email_verified && u.recovery_email ? u.recovery_email : undefined;
  return startCheckout(c, product, { userId: u.id, externalId: `u_${u.id}`, email }, `${new URL(c.req.url).origin}/app/settings/plan?checkout=done`);
});

billingApp.post("/api/billing/portal", async (c) => {
  if (!billingOn(c.env) || !c.env.POLAR_ACCESS_TOKEN) return offResponse(c);
  const u = requireUser(c);
  const has = await one(c.env.DB, "SELECT 1 AS x FROM billing_orders WHERE user_id = ? AND status IN ('paid', 'refunded', 'part_refunded') LIMIT 1", u.id);
  if (!has) throw new HttpError(404, "There's nothing to manage yet.", "no_billing");
  if ((await bump(c.env.DB, `bill:portal:${u.id}`, HOUR)) > 20) throw new HttpError(429, "That's a lot of tries. Wait a little and try again.", "throttled");
  const url = await provider().portalUrl(c.env, { externalId: `u_${u.id}` }, { returnUrl: `${new URL(c.req.url).origin}/app/settings/plan` });
  return c.json({ url });
});

/* -------------------------------- webhook --------------------------------- */

billingApp.post("/api/webhooks/polar", async (c) => {
  if (!billingOn(c.env) || !c.env.POLAR_WEBHOOK_SECRET) return offResponse(c);
  const p = provider();
  const raw = await c.req.text();
  if (raw.length > MAX_BODY) return c.json({ error: "Too large." }, 413);
  if (!(await p.verifyWebhook(c.req.raw.headers, raw, c.env.POLAR_WEBHOOK_SECRET))) {
    return c.json({ error: "Signature not valid.", code: "bad_signature" }, 400);
  }
  let json;
  try { json = JSON.parse(raw); } catch { return c.json({ error: "Not JSON." }, 400); }
  const outcome = await applyEvent(c.env, p, c.req.header("webhook-id"), json);
  return c.json({ ok: true, outcome });
});

/**
 * One verified event, as one batch. The first statement stores the webhook id with a token made
 * for this delivery (UNIQUE, so a replay or a copy sent at the same moment stores nothing); every
 * later statement runs only if the stored row has this delivery's token. Reads before the batch
 * only choose what to write; the gate and the conditions in each statement decide.
 */
export async function applyEvent(env, p, webhookId, json) {
  const db = env.DB;
  if (await one(db, "SELECT 1 AS x FROM billing_events WHERE webhook_id = ?", webhookId)) return "duplicate";
  const ts = now();
  const token = newToken();
  const GATE = "EXISTS (SELECT 1 FROM billing_events WHERE webhook_id = ? AND token = ?)";
  const work = []; // [sql, ...params], each with GATE's two params last
  const gated = (sql, ...params) => work.push([sql, ...params, webhookId, token]);
  const ev = p.readEvent(json);
  let outcome = "ignored";

  const order = ev ? await one(db,
    `SELECT * FROM billing_orders WHERE provider = ? AND (
       (checkout_id IS NOT NULL AND checkout_id = ?) OR (provider_order_id IS NOT NULL AND provider_order_id = ?)
       OR (id = ? AND checkout_id IS NULL)) LIMIT 1`,
    p.name, ev.checkoutId, ev.providerOrderId || null, ev.lanyardOrder) : null;
  const sameProduct = order && productForProviderId(env, ev.providerProductId) === order.product;
  const sameCurrency = order && ev.currency === order.currency;
  const product = order && productFor(order.product);

  if (ev?.kind === "paid") {
    if (!order) outcome = ev.subscriptionId ? "renewal" : "no_order";
    else if (order.status !== "open") outcome = "already"; // paid, refunded or held before: nothing more
    else if (!sameProduct || !sameCurrency || ev.amount !== order.amount_pence || !ev.providerOrderId) {
      outcome = "mismatch"; // recorded, nothing granted; the owner looks at it in Polar
      gated("UPDATE billing_orders SET status = 'mismatch' WHERE id = ? AND status = 'open' AND " + GATE, order.id);
    } else {
      outcome = order.kind === "credits" ? "granted" : "recorded";
      gated("UPDATE billing_orders SET status = 'paid', provider_order_id = ?, paid_at = ? WHERE id = ? AND status = 'open' AND " + GATE, ev.providerOrderId, ts, order.id);
      if (order.kind === "credits" && product) {
        // The credits row's id is the order's, so a second paid event for the same order adds nothing either.
        gated(`INSERT OR IGNORE INTO credits (id, org_id, events_granted, events_used, expires_at, reason, granted_by, created_at)
               SELECT ?, org_id, ?, 0, ?, ?, 'polar', ? FROM billing_orders
               WHERE id = ? AND org_id IS NOT NULL AND status = 'paid' AND provider_order_id = ? AND ` + GATE,
          `polar_${order.id}`, product.credits, ts + product.days * DAY_MS, `card:${order.product}`, ts, order.id, ev.providerOrderId);
      }
    }
  } else if (ev?.kind === "refunded") {
    if (!order || !["paid", "part_refunded"].includes(order.status)) outcome = "no_order";
    else if (ev.fullRefund) {
      outcome = "refunded";
      gated("UPDATE billing_orders SET status = 'refunded', refunded_at = ? WHERE id = ? AND status IN ('paid', 'part_refunded') AND " + GATE, ts, order.id);
      // Take back what is not used yet; events already run stay run.
      if (order.kind === "credits") gated("UPDATE credits SET events_granted = events_used WHERE id = ? AND " + GATE, `polar_${order.id}`);
    } else {
      outcome = "part_refunded";
      gated("UPDATE billing_orders SET status = 'part_refunded', refunded_at = ? WHERE id = ? AND status = 'paid' AND " + GATE, ts, order.id);
    }
  } else if (ev?.kind === "subscription") {
    if (!order || order.kind !== "plus" || !order.user_id || !ev.subscriptionId) outcome = "no_order";
    else if (!sameProduct || (ev.currency && !sameCurrency)) outcome = "mismatch";
    else {
      const until = ev.periodEnd && ev.periodEnd > ts && ev.periodEnd <= ts + 400 * DAY_MS ? ev.periodEnd : null;
      // Users first: an end only takes back Plus this subscription gave (plan_until still its period end).
      if (ev.ended) {
        outcome = "ended";
        gated(`UPDATE users SET plan_until = ? WHERE id = ? AND plan = 'plus' AND plan_until IS NOT NULL AND plan_until > ?
               AND plan_until = (SELECT current_period_end FROM billing_subscriptions WHERE provider = ? AND provider_subscription_id = ?) AND ` + GATE,
          ts, order.user_id, ts, p.name, ev.subscriptionId);
      } else if (ACTIVE.has(ev.status) && until) {
        outcome = "plus";
        // Never earlier than it already is, and a promo's "forever" (NULL) stays forever.
        gated(`UPDATE users SET plan = 'plus', plan_until = CASE WHEN plan = 'plus' AND plan_until IS NULL THEN NULL ELSE MAX(COALESCE(plan_until, 0), ?) END
               WHERE id = ? AND ` + GATE, until, order.user_id);
        gated("UPDATE billing_orders SET status = 'paid', paid_at = COALESCE(paid_at, ?) WHERE id = ? AND status = 'open' AND " + GATE, ts, order.id);
      } else outcome = "recorded";
      gated(`INSERT INTO billing_subscriptions (id, provider, provider_subscription_id, order_id, user_id, product, status, current_period_end, cancel_at_period_end, created_at, updated_at)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ` + GATE + `
             ON CONFLICT (provider, provider_subscription_id) DO UPDATE SET status = excluded.status,
               current_period_end = MAX(COALESCE(current_period_end, 0), COALESCE(excluded.current_period_end, 0)),
               cancel_at_period_end = excluded.cancel_at_period_end, updated_at = excluded.updated_at`,
        "bs_" + newToken(), p.name, ev.subscriptionId, order.id, order.user_id, order.product, String(ev.status || "unknown").slice(0, 30),
        until, ev.cancelAtPeriodEnd ? 1 : 0, ts, ts);
    }
  }

  const type = String(json?.type || "").slice(0, 60);
  const stmts = [
    db.prepare("INSERT INTO billing_events (webhook_id, provider, type, token, outcome, received_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (webhook_id) DO NOTHING")
      .bind(webhookId, p.name, type, token, outcome, ts),
    ...work.map(([sql, ...params]) => db.prepare(sql).bind(...params)),
  ];
  await db.batch(stmts);
  const stored = await one(db, "SELECT token FROM billing_events WHERE webhook_id = ?", webhookId);
  return stored?.token === token ? outcome : "duplicate";
}

/** A person's own orders, for their data download. */
export const exportBillingOrders = (db, col, id) =>
  db.prepare(`SELECT product, amount_pence, currency, status, created_at, paid_at, refunded_at FROM billing_orders WHERE ${col === "org" ? "org_id" : col === "host" ? "host_account_id" : "user_id"} = ? ORDER BY created_at`)
    .bind(id).all().then((r) => r.results || []).catch(() => []);
