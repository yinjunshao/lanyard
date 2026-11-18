// F36: card payments through Polar, behind BILLING_ENABLED (D041). Every line of the payment bar in
// "F27 Lanyard Plus and billing" has a section here. No network: every Polar call goes to a fake
// fetch. Requests sent at once use withLatency, which gives every query a turn as real D1 does.
import { readFileSync } from "node:fs";
import { makeEnv, makeDb, check, summary, becomeHost, withLatency, migrationFiles, readMigration } from "./harness.mjs";
import { verifyWebhook } from "../worker/billing/polar.js";
import { PRODUCTS } from "../worker/billing/provider.js";
import { HOST_SKUS, PLUS_PRICE } from "../worker/plans.js";

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const KEY = crypto.getRandomValues(new Uint8Array(32));
const OTHER_KEY = crypto.getRandomValues(new Uint8Array(32));
const SECRET = "whsec_" + b64(KEY);
const TOKEN = "polar_oat_test_" + b64(crypto.getRandomValues(new Uint8Array(12))).replace(/[^A-Za-z0-9]/g, "");
const POLAR_IDS = Object.fromEntries(Object.keys(PRODUCTS).map((id) => [id, `prod_${id}_test`]));

// The fake Polar: records every call and answers like the real API's shape.
const calls = [];
let polarDown = false;
async function fakeFetch(url, init) {
  calls.push({ url, init, body: JSON.parse(init.body) });
  if (polarDown) throw new Error("network down " + TOKEN); // must never reach a response or a log
  if (url.endsWith("/checkouts/")) return Response.json({ id: `co_${calls.length}`, url: `https://sandbox.polar.test/checkout/co_${calls.length}` }, { status: 201 });
  if (url.endsWith("/customer-sessions/")) return Response.json({ customer_portal_url: "https://sandbox.polar.test/portal/s1" }, { status: 201 });
  return new Response("{}", { status: 404 });
}

// Everything printed while the file runs, to search for secrets at the end.
const printed = [];
for (const m of ["log", "error", "warn", "info"]) {
  const f = console[m].bind(console);
  console[m] = (...a) => { printed.push(a.map((x) => (x instanceof Error ? x.stack : typeof x === "string" ? x : JSON.stringify(x))).join(" ")); f(...a); };
}

const BASE = { POLAR_ACCESS_TOKEN: TOKEN, POLAR_WEBHOOK_SECRET: SECRET, POLAR_PRODUCTS: JSON.stringify(POLAR_IDS), SELLER_NAME: "Seller Name Ltd", SELLER_ADDRESS: "1 Example Street, Town, AB1 2CD", BILLING_FETCH: fakeFetch, POLAR_SERVER: "sandbox" };
const responses = [];
function wrap(T) {
  const client = (opts) => {
    const c = T.client(opts);
    for (const m of ["get", "post", "put", "del", "req"]) {
      const f = c[m];
      c[m] = async (...a) => { const r = await f(...a); responses.push(r.text + JSON.stringify([...r.headers])); return r; };
    }
    return c;
  };
  return { ...T, client };
}
let ipN = 0;
const ip = () => `192.0.2.${++ipN % 250}`;

async function claimedPerson(T, name = "Payer") {
  const c = T.client({ ip: ip() });
  await c.post("/api/profile", { name, acceptTerms: true, over18: true });
  const id = (await c.get("/api/me")).json.user.id;
  T.env.DB.raw.prepare("UPDATE users SET email_verified = 1, recovery_email = ? WHERE id = ?").run(`${id}@uni.test`, id);
  return { c, id };
}

// Standard Webhooks signing, done here independently of the Worker's code.
async function sign(keyBytes, id, ts, body) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`))));
}
let whN = 0;
async function delivery(json, { id = `msg_${++whN}`, ts = Math.floor(Date.now() / 1000), key = KEY, body } = {}) {
  const raw = body ?? JSON.stringify(json);
  return { id, ts, raw, headers: { "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": `v1,${await sign(key, id, ts, raw)}`, "content-type": "application/json" } };
}
const send = (polar, d, headers = d.headers, raw = d.raw) => polar.req("POST", "/api/webhooks/polar", raw, headers);
const orderPaid = (o, extra = {}) => ({ type: "order.paid", timestamp: new Date().toISOString(), data: {
  id: `ord_${o.id}`, checkout_id: o.checkout_id, product_id: POLAR_IDS[o.product], currency: "gbp", subtotal_amount: o.amount_pence,
  status: "paid", metadata: { lanyard_order: o.id }, ...extra } });
const subEvent = (type, o, sub, extra = {}) => ({ type, timestamp: new Date().toISOString(), data: {
  id: sub, checkout_id: o.checkout_id, product_id: POLAR_IDS[o.product], currency: "gbp", status: "active",
  current_period_end: new Date(Date.now() + 30 * 864e5).toISOString(), cancel_at_period_end: false, metadata: { lanyard_order: o.id }, ...extra } });
const count = (T, t) => T.q1(`SELECT COUNT(*) n FROM ${t}`).n;
const billingRows = (T) => ["billing_orders", "billing_subscriptions", "billing_events"].map((t) => count(T, t)).join(",");

/* ------------------------------------------------------------------------------------------ */
console.log("\n# Migration 0031 is additive, and the host reset keeps its records");
{
  const sql = readMigration("0031_billing.sql");
  const code = sql.replace(/--.*$/gm, "");
  check("0031 is the next migration after 0030", migrationFiles().indexOf("0031_billing.sql") === migrationFiles().indexOf("0030_drop_replaced.sql") + 1 && migrationFiles().includes("0030_drop_replaced.sql"));
  check("it only creates three tables and their indexes: no ALTER, DROP, UPDATE, INSERT or DELETE", !/\b(ALTER|DROP|UPDATE|INSERT|DELETE)\b/i.test(code.replace(/ON DELETE SET NULL/g, "")) && (code.match(/CREATE TABLE/g) || []).length === 3);
  check("no billing row can cascade away: every reference is ON DELETE SET NULL", !/CASCADE/i.test(code) && (code.match(/REFERENCES/g) || []).length === (code.match(/ON DELETE SET NULL/g) || []).length);
  check("billing_events.webhook_id is UNIQUE", /webhook_id\s+TEXT NOT NULL UNIQUE/.test(code));
  const db = makeDb({ before: "0031_billing.sql" });
  const tables = () => db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
  const before = tables();
  db.raw.exec("INSERT INTO users (id, created_at, is_guest) VALUES ('u1', 1, 0)");
  db.exec(sql);
  const after = tables();
  check("applied to a database with data, three tables appear and nothing else changes", after.length === before.length + 3 && before.every((t) => after.includes(t)) && db.raw.prepare("SELECT COUNT(*) n FROM users").get().n === 1);

  const reset = await import("../scripts/reset-hosts.mjs");
  check("the reset's schema check still counts its 8 tables with 0031 applied", makeDb().raw.prepare(reset.SCHEMA_SQL).get().n === 8);
  check("the reset never empties a billing table", !reset.WIPED.some((t) => t.startsWith("billing")));
  const r = makeDb();
  const raw = r.raw;
  raw.exec(`INSERT INTO host_accounts (id, email, created_at) VALUES ('h1', 'h@x.test', 1);
    INSERT INTO orgs (id, name, plan, created_at) VALUES ('o1', 'Kept Org', 'free', 1);
    INSERT INTO users (id, created_at, is_guest) VALUES ('u9', 1, 0);
    INSERT INTO billing_orders (id, provider, product, kind, amount_pence, currency, org_id, org_name, host_account_id, status, created_at) VALUES ('bo1', 'polar', 'standard_5', 'credits', 4950, 'gbp', 'o1', 'Kept Org', 'h1', 'paid', 1);
    INSERT INTO billing_orders (id, provider, product, kind, amount_pence, currency, user_id, status, created_at) VALUES ('bo2', 'polar', 'plus_year', 'plus', 1199, 'gbp', 'u9', 'paid', 1);
    INSERT INTO billing_subscriptions (id, provider, provider_subscription_id, user_id, product, status, created_at, updated_at) VALUES ('bs1', 'polar', 'sub1', 'u9', 'plus_year', 'active', 1, 1);
    INSERT INTO billing_events (webhook_id, provider, type, token, received_at) VALUES ('w1', 'polar', 'order.paid', 't', 1);`);
  const pre = raw.prepare(reset.COUNT_SQL).get();
  raw.exec("BEGIN"); raw.exec(reset.wipeSql(pre, 1794300000000)); raw.exec("COMMIT");
  const o = raw.prepare("SELECT org_id, org_name, host_account_id FROM billing_orders WHERE id = 'bo1'").get();
  check("after a host reset on a copy, every billing row is still there", raw.prepare("SELECT (SELECT COUNT(*) FROM billing_orders) + (SELECT COUNT(*) FROM billing_subscriptions) + (SELECT COUNT(*) FROM billing_events) n").get().n === 4);
  check("…the organisation and host ids are empty and the organisation's name stays", o.org_id === null && o.host_account_id === null && o.org_name === "Kept Org" && raw.prepare("SELECT COUNT(*) n FROM orgs").get().n === 0);
  raw.exec("DELETE FROM users WHERE id = 'u9'");
  check("deleting an account keeps its orders and subscription with the id emptied", raw.prepare("SELECT user_id FROM billing_orders WHERE id = 'bo2'").get().user_id === null && raw.prepare("SELECT user_id FROM billing_subscriptions WHERE id = 'bs1'").get().user_id === null);
}

/* ------------------------------------------------------------------------------------------ */
console.log("\n# Billing off (production sets nothing): every billing write is a 503 and writes nothing");
{
  const T = wrap(await makeEnv({ ...BASE }));
  T.env.DB = withLatency(T.env.DB);
  const p = await claimedPerson(T);
  const users = count(T, "users");
  const plans = await p.c.get("/api/billing/plans");
  check("the Plan page's data says card payments are off, with no seller, and lists Plus at £1.49 and £11.99",
    plans.status === 200 && plans.json.cardPayments === false && plans.json.seller === null
      && plans.json.products.map((x) => x.pence).join() === `${PLUS_PRICE.monthlyPence},${PLUS_PRICE.yearlyPence}` && PLUS_PRICE.monthlyPence === 149 && PLUS_PRICE.yearlyPence === 1199);
  check("…and what Plus includes comes from the server", Array.isArray(plans.json.includes) && plans.json.includes.length >= 3 && plans.json.includes.every((x) => x.title));
  const co = await p.c.post("/api/billing/checkout", { product: "plus_year", startNow: true });
  check("Plus checkout: 503 billing_off with a plain message", co.status === 503 && co.json.code === "billing_off" && co.json.error === "Card payments are not switched on yet.");
  check("portal: 503", (await p.c.post("/api/billing/portal", {})).status === 503);
  const polar = T.client({ origin: null });
  const d = await delivery({ type: "order.paid", data: {} });
  check("a correctly signed webhook: 503", (await send(polar, d)).status === 503);
  const h = T.client({ site: "host", ip: ip() });
  await becomeHost(h, { kind: "company", name: "Off Co" });
  const hco = await h.post("/api/host/billing/checkout", { product: "standard_5", startNow: true });
  check("host pack checkout: 503", hco.status === 503 && hco.json.code === "billing_off");
  const hb = await h.get("/api/host/billing");
  check("host Billing says card payments are off and offers Pay on no pack", hb.json.cardPayments === false && hb.json.seller === null && hb.json.skus.every((s) => s.card === false));
  check("nothing was written: no order, subscription, event or new user", billingRows(T) === "0,0,0" && count(T, "users") === users);
  check("…and Polar was never called", calls.length === 0);
  const prod = readFileSync("wrangler.production.toml", "utf8") + readFileSync("wrangler.toml", "utf8");
  check("neither wrangler config switches billing on or holds a Polar secret", !/^\s*BILLING_ENABLED\s*=/m.test(prod) && !/^\s*POLAR_(ACCESS_TOKEN|WEBHOOK_SECRET)\s*=/m.test(prod));
  const half = wrap(await makeEnv({ ...BASE, BILLING_ENABLED: "1", SELLER_NAME: "" }));
  const hp = await claimedPerson(half);
  check("switched on but with no seller name and address: still 503 (the page must say who sells it)", (await hp.c.post("/api/billing/checkout", { product: "plus_year", startNow: true })).status === 503 && (await hp.c.get("/api/billing/plans")).json.cardPayments === false);
  const noIds = wrap(await makeEnv({ ...BASE, BILLING_ENABLED: "1", POLAR_PRODUCTS: "" }));
  check("switched on but with no Polar product ids: still 503", (await (await claimedPerson(noIds)).c.post("/api/billing/checkout", { product: "plus_year", startNow: true })).status === 503);
  check("…and neither wrote an order or called Polar", billingRows(half) === "0,0,0" && billingRows(noIds) === "0,0,0" && calls.length === 0);
}

/* ------------------------------------------------------------------------------------------ */
const T = wrap(await makeEnv({ ...BASE, BILLING_ENABLED: "1" }));
T.env.DB = withLatency(T.env.DB);
const { q1, env } = T;
const polar = T.client({ origin: null, ip: "198.51.100.77" });

console.log("\n# Prices from the server only (payment bar line 1)");
{
  const users = count(T, "users");
  const anon = T.client({ ip: ip() });
  const out = await anon.post("/api/billing/checkout", { product: "plus_year", startNow: true });
  check("signed out: 401, and no guest account is made", out.status === 401 && count(T, "users") === users && !anon.jar.size);
  const guest = T.client({ ip: ip() });
  await guest.post("/api/profile", { name: "Guesty", acceptTerms: true, over18: true });
  check("a card with no way to sign in back (a guest): 403 needs_signin", (await guest.post("/api/billing/checkout", { product: "plus_year", startNow: true })).json?.code === "needs_signin");

  const p = await claimedPerson(T, "Prices");
  const bad = ["nope", "", null, 5, ["plus_month"], { id: "plus_month" }, "__proto__", "constructor", "toString", "standard_1", "quote_service", "PLUS_MONTH", " plus_month"];
  const badRes = await Promise.all(bad.map((product) => p.c.post("/api/billing/checkout", { product, startNow: true })));
  check(`${bad.length} unknown or wrong product ids (strings, numbers, arrays, objects, a host pack, prototype names): all 400 unknown_product`, badRes.every((r) => r.status === 400 && r.json.code === "unknown_product"), badRes.map((r) => r.status));
  const quantities = [0, -1, 1.5, 2, 1e9, Number.MAX_SAFE_INTEGER + 2, "1", "2", "-1", [1], { n: 1 }, null, true];
  const qRes = await Promise.all(quantities.map((quantity) => p.c.post("/api/billing/checkout", { product: "plus_month", quantity, startNow: true })));
  check(`${quantities.length} quantities other than 1 (0, -1, 1.5, huge, strings, arrays, null): all 400 bad_quantity`, qRes.every((r) => r.status === 400 && r.json.code === "bad_quantity"), qRes.map((r) => r.status));
  const starts = [undefined, false, "true", 1, "yes", [true]];
  const sRes = await Promise.all(starts.map((startNow) => p.c.post("/api/billing/checkout", { product: "plus_month", startNow })));
  check("without the express-start tick (missing, false, \"true\", 1): 400 express_start", sRes.every((r) => r.status === 400 && r.json.code === "express_start"));
  check("…and none of those wrote an order or called Polar", count(T, "billing_orders") === 0 && calls.length === 0);

  const n = calls.length;
  const ok = await p.c.post("/api/billing/checkout", { product: "plus_month", quantity: 1, startNow: true, price: 1, amount: -100, amount_pence: 0, pence: 0, currency: "usd", total: "0.01", products: ["prod_cheap"], product_price_id: "price_cheap", discount_id: "d1", allow_discount_codes: true });
  const order = q1("SELECT * FROM billing_orders WHERE user_id = ?", p.id);
  check("with price, amount, currency, discount and product fields added: 201 with Polar's checkout address", ok.status === 201 && ok.json.url === `https://sandbox.polar.test/checkout/co_${n + 1}` && Object.keys(ok.json).join() === "url");
  check("…our order has our own price (149 pence, gbp), express start time and Polar's checkout id", order.amount_pence === 149 && order.currency === "gbp" && order.status === "open" && order.express_start_at > 0 && order.checkout_id === `co_${n + 1}`);
  const sent = calls.at(-1);
  check("…Polar is sent exactly our product id from the server table, discount codes off, our customer reference",
    sent.url === "https://sandbox-api.polar.sh/v1/checkouts/" && JSON.stringify(sent.body.products) === JSON.stringify([POLAR_IDS.plus_month])
      && sent.body.allow_discount_codes === false && sent.body.external_customer_id === `u_${p.id}` && sent.body.metadata.lanyard_order === order.id);
  check("…and nothing the browser sent about price, amount, currency or discount reaches Polar",
    Object.keys(sent.body).sort().join() === "allow_discount_codes,customer_email,external_customer_id,metadata,products,success_url" && !/cheap|usd|"amount|price/.test(JSON.stringify(sent.body)));
  check("…the success address is our Plan page, which proves nothing", sent.body.success_url === "https://lanyard.test/app/settings/plan?checkout=done");
  const yr = await p.c.post("/api/billing/checkout", { product: "plus_year", startNow: true });
  check("the yearly product is £11.99 on the order", yr.status === 201 && q1("SELECT amount_pence a FROM billing_orders WHERE product = 'plus_year' AND user_id = ?", p.id).a === 1199);

  // Host packs: the same rules, plus the organisation's own price list.
  const h = T.client({ site: "host", ip: ip() });
  await becomeHost(h, { kind: "company", name: "Pack Co" });
  const org = q1("SELECT id FROM orgs WHERE name = 'Pack Co'");
  const hb = await h.get("/api/host/billing");
  check("host Billing offers Pay on its own packs and says who sells them", hb.json.cardPayments === true && hb.json.seller?.name === "Seller Name Ltd" && hb.json.skus.length === 3 && hb.json.skus.every((s) => s.card === true));
  const hBad = await Promise.all(["society_5", "institution_1", "quote_service", "plus_month", "", null, ["standard_5"], "__proto__"].map((product) => h.post("/api/host/billing/checkout", { product, startNow: true })));
  check("a company asking for a society, institution, quote or Plus product, or nonsense: 400 unknown_product", hBad.every((r) => r.status === 400 && r.json.code === "unknown_product"), hBad.map((r) => r.status));
  const hQ = await Promise.all([0, -1, 1.5, 3, 1e12, "5", [5]].map((quantity) => h.post("/api/host/billing/checkout", { product: "standard_5", quantity, startNow: true })));
  check("host quantities 0, -1, 1.5, 3, huge, strings, arrays: 400 bad_quantity", hQ.every((r) => r.status === 400 && r.json.code === "bad_quantity"));
  check("host without the express-start tick: 400", (await h.post("/api/host/billing/checkout", { product: "standard_5" })).json.code === "express_start");
  const hOk = await h.post("/api/host/billing/checkout", { product: "standard_5", startNow: true, pence: 1, credits: 999, days: 9999, currency: "usd" });
  const ho = q1("SELECT * FROM billing_orders WHERE org_id = ?", org.id);
  check("a company's 5-event pack: 201, our price £49.50, the organisation and the host who pressed Pay on the row", hOk.status === 201 && ho.amount_pence === HOST_SKUS.standard_5.pence && ho.org_name === "Pack Co" && ho.host_account_id && ho.kind === "credits" && calls.at(-1).body.external_customer_id === `o_${org.id}`);
  check("…its success address is the host Billing page", calls.at(-1).body.success_url === "https://host.lanyard.test/billing?checkout=done");
  check("signed out on the host site: 401", (await T.client({ site: "host", ip: ip() }).post("/api/host/billing/checkout", { product: "standard_5", startNow: true })).status === 401);
  const s = T.client({ site: "host", ip: ip() });
  await becomeHost(s, { email: "lead@campus.ac.uk", kind: "society", name: "Pending Soc", extra: { leaderName: "Lead Person", orgLink: "https://example.org/soc", university: "Example Campus" } });
  check("a society still being reviewed cannot pay: 403", (await s.post("/api/host/billing/checkout", { product: "society_5", startNow: true })).status === 403);
}

console.log("\n# The redirect back proves nothing; refunds only from Polar (payment bar lines 2 and 4)");
{
  const p = await claimedPerson(T, "Redirect");
  await p.c.post("/api/billing/checkout", { product: "plus_month", startNow: true });
  const o = q1("SELECT * FROM billing_orders WHERE user_id = ?", p.id);
  await p.c.get(`/app/settings/plan?checkout=done&checkout_id=${o.checkout_id}&customer_session_token=x`);
  const confirm = await Promise.all(["/api/billing/confirm", "/api/billing/success", `/api/billing/checkout/${o.checkout_id}`].map((u) => p.c.post(u, { checkout_id: o.checkout_id })));
  check("coming back from Polar's page with its checkout id changes nothing, and no route takes a checkout id to confirm", confirm.every((r) => r.status === 404) && (await p.c.get("/api/me")).json.plan.tier === "free" && q1("SELECT status FROM billing_orders WHERE id = ?", o.id).status === "open");
  const refunds = await Promise.all([
    p.c.post("/api/billing/refund", { order: o.id, amount: 149 }), p.c.post(`/api/billing/orders/${o.id}/refund`, {}),
    T.client({ site: "host", ip: ip() }).post("/api/host/billing/refund", { quantity: -1 }),
  ]);
  check("no route takes a refund, amount or quantity from the browser (404, or 401 on the host site before any route)", refunds[0].status === 404 && refunds[1].status === 404 && [401, 404].includes(refunds[2].status));
}

console.log("\n# Paid only when a verified webhook says so (payment bar line 2)");
let packOrder, packOrg;
{
  const h = T.client({ site: "host", ip: ip() });
  await becomeHost(h, { kind: "company", name: "Hook Co" });
  packOrg = q1("SELECT id FROM orgs WHERE name = 'Hook Co'").id;
  await h.post("/api/host/billing/checkout", { product: "standard_5", startNow: true });
  packOrder = q1("SELECT * FROM billing_orders WHERE org_id = ?", packOrg);
  const credits = () => q1("SELECT COUNT(*) n, COALESCE(SUM(events_granted), 0) g FROM credits WHERE org_id = ? AND granted_by = 'polar'", packOrg);
  const events = () => count(T, "billing_events");
  const good = await delivery(orderPaid(packOrder));
  const tries = {
    "no webhook-id": { ...good.headers, "webhook-id": "" },
    "no timestamp": { ...good.headers, "webhook-timestamp": "" },
    "no signature": { ...good.headers, "webhook-signature": "" },
    "a timestamp that is not a number": { ...good.headers, "webhook-timestamp": "soon" },
    "a garbage signature": { ...good.headers, "webhook-signature": "v1,AAAA" },
    "the right signature under another version": { ...good.headers, "webhook-signature": good.headers["webhook-signature"].replace("v1,", "v2,") },
    "the right signature for another webhook-id": { ...good.headers, "webhook-id": "msg_other" },
  };
  for (const [what, headers] of Object.entries(tries)) {
    const r = await send(polar, good, headers);
    check(`${what}: 400 and nothing written`, r.status === 400 && events() === 0 && credits().n === 0, r.status);
  }
  const forged = await delivery(orderPaid(packOrder), { key: OTHER_KEY });
  check("forged (signed with another secret): 400", (await send(polar, forged)).status === 400 && events() === 0);
  const old = await delivery(orderPaid(packOrder), { ts: Math.floor(Date.now() / 1000) - 301 });
  check("old (signed 5 minutes and 1 second ago): 400", (await send(polar, old)).status === 400);
  const future = await delivery(orderPaid(packOrder), { ts: Math.floor(Date.now() / 1000) + 301 });
  check("from the future (5 minutes and 1 second ahead): 400", (await send(polar, future)).status === 400);
  const richer = JSON.stringify(orderPaid(packOrder, { subtotal_amount: 4950 })).replace(`"checkout_id":"${packOrder.checkout_id}"`, `"checkout_id":"${packOrder.checkout_id}","extra":1`);
  check("a valid signature with the body changed after signing: 400", (await send(polar, good, good.headers, richer)).status === 400);
  const reSigned = await delivery(null, { body: JSON.stringify(orderPaid(packOrder, { product_id: "prod_x" })), key: OTHER_KEY });
  check("a changed body re-signed with a guessed key: 400", (await send(polar, reSigned)).status === 400);
  check("…none of those wrote an event or a credit", events() === 0 && credits().n === 0 && q1("SELECT status FROM billing_orders WHERE id = ?", packOrder.id).status === "open");
  check("the signature is compared over every byte (no early exit), with a 5-minute window, in the provider module",
    /diff \|= a\[i\] \^ b\[i\]/.test(readFileSync("worker/billing/polar.js", "utf8")) && /TOLERANCE_SECONDS = 5 \* 60/.test(readFileSync("worker/billing/polar.js", "utf8")));

  // Several signatures in the header (Standard Webhooks key rotation): one good one is enough.
  const twoSigs = { ...good.headers, "webhook-signature": `v1,${await sign(OTHER_KEY, good.id, good.ts, good.raw)} ${good.headers["webhook-signature"]}` };
  const okRes = await send(polar, good, twoSigs);
  check("a valid event with two signatures in the header (the first wrong, the second right): 200, granted", okRes.status === 200 && okRes.json.outcome === "granted", okRes.json);
  check("…the order is paid and 5 credits are added to the organisation on our row, for 365 days", q1("SELECT status, provider_order_id p FROM billing_orders WHERE id = ?", packOrder.id).status === "paid" && credits().g === 5 && q1("SELECT expires_at - created_at d FROM credits WHERE id = ?", `polar_${packOrder.id}`).d === 365 * 864e5);
  check("a valid event signed 4 minutes 50 seconds ago is accepted (the window is real)", (await send(polar, await delivery({ type: "checkout.updated", data: {} }, { ts: Math.floor(Date.now() / 1000) - 290 }))).status === 200);
  check("verifyWebhook on its own: right is true; the secret without whsec_ works; a short or empty secret is false",
    await verifyWebhook(good.headers, good.raw, SECRET, good.ts * 1000) && await verifyWebhook(good.headers, good.raw, SECRET.slice(6), good.ts * 1000)
      && !(await verifyWebhook(good.headers, good.raw, "whsec_c2hvcnQ=", good.ts * 1000)) && !(await verifyWebhook(good.headers, good.raw, "", good.ts * 1000)));
}

console.log("\n# Replays do nothing; one grant even when sent 20 times at once (payment bar line 3)");
{
  const credits = () => q1("SELECT COUNT(*) n, COALESCE(SUM(events_granted), 0) g FROM credits WHERE org_id = ? AND granted_by = 'polar'", packOrg);
  const replay = await delivery(orderPaid(packOrder), { id: q1("SELECT webhook_id w FROM billing_events WHERE type = 'order.paid'").w });
  const r = await send(polar, replay);
  check("the same webhook-id again, freshly signed: 200 duplicate, nothing added", r.status === 200 && r.json.outcome === "duplicate" && credits().g === 5);

  const h = T.client({ site: "host", ip: ip() });
  await becomeHost(h, { kind: "company", name: "Burst Co" });
  const org = q1("SELECT id FROM orgs WHERE name = 'Burst Co'").id;
  await h.post("/api/host/billing/checkout", { product: "standard_15", startNow: true });
  const o = q1("SELECT * FROM billing_orders WHERE org_id = ?", org);
  const d = await delivery(orderPaid(o));
  const burst = await Promise.all(Array.from({ length: 20 }, () => send(polar, d)));
  const c15 = q1("SELECT COUNT(*) n, COALESCE(SUM(events_granted), 0) g FROM credits WHERE org_id = ? AND granted_by = 'polar'", org);
  check("one valid order.paid sent 20 times at once: every answer 200, exactly one says granted", burst.every((x) => x.status === 200) && burst.filter((x) => x.json.outcome === "granted").length === 1, burst.map((x) => x.json?.outcome));
  check("…one credits row of 15 events and one stored event", c15.n === 1 && c15.g === 15 && q1("SELECT COUNT(*) n FROM billing_events WHERE webhook_id = ?", d.id).n === 1);
  const copies = await Promise.all(Array.from({ length: 20 }, async () => send(polar, await delivery(orderPaid(o)))));
  const after = q1("SELECT COUNT(*) n, COALESCE(SUM(events_granted), 0) g FROM credits WHERE org_id = ? AND granted_by = 'polar'", org);
  check("the same order paid again under 20 new webhook ids at once: still one row of 15 (the order is paid once, and the credits id is the order's)", copies.every((x) => x.status === 200) && after.n === 1 && after.g === 15);

  // Plus by subscription: 20 copies of subscription.active at once.
  const p = await claimedPerson(T, "Plus Burst");
  await p.c.post("/api/billing/checkout", { product: "plus_month", startNow: true });
  const po = q1("SELECT * FROM billing_orders WHERE user_id = ?", p.id);
  const active = await delivery(subEvent("subscription.active", po, "sub_burst"));
  const sb = await Promise.all(Array.from({ length: 20 }, () => send(polar, active)));
  const u = q1("SELECT plan, plan_until FROM users WHERE id = ?", p.id);
  check("subscription.active sent 20 times at once: one grant, Plus until the period end, one subscription row", sb.filter((x) => x.json.outcome === "plus").length === 1 && u.plan === "plus" && Math.abs(u.plan_until - (Date.now() + 30 * 864e5)) < 60e3 && q1("SELECT COUNT(*) n FROM billing_subscriptions WHERE provider_subscription_id = 'sub_burst'").n === 1);
  check("…the order is paid and /api/me says Plus", q1("SELECT status FROM billing_orders WHERE id = ?", po.id).status === "paid" && (await p.c.get("/api/me")).json.plan.tier === "plus");
  check("…and a second checkout is refused while Plus is active (409)", (await p.c.post("/api/billing/checkout", { product: "plus_year", startNow: true })).status === 409);
  const until = u.plan_until;
  const earlier = await delivery(subEvent("subscription.updated", po, "sub_burst", { current_period_end: new Date(Date.now() + 5 * 864e5).toISOString() }));
  await send(polar, earlier);
  check("an out-of-order update with an earlier period end never shortens Plus", q1("SELECT plan_until u FROM users WHERE id = ?", p.id).u === until);
  const far = await delivery(subEvent("subscription.updated", po, "sub_burst", { current_period_end: new Date(Date.now() + 900 * 864e5).toISOString() }));
  await send(polar, far);
  check("a period end more than 400 days away is not believed", q1("SELECT plan_until u FROM users WHERE id = ?", p.id).u === until);

  // A promo's Plus is never cut short.
  const forever = await claimedPerson(T, "Forever");
  await forever.c.post("/api/billing/checkout", { product: "plus_month", startNow: true });
  const fo = q1("SELECT * FROM billing_orders WHERE user_id = ?", forever.id);
  env.DB.raw.prepare("UPDATE users SET plan = 'plus', plan_until = NULL WHERE id = ?").run(forever.id);
  await send(polar, await delivery(subEvent("subscription.active", fo, "sub_forever")));
  check("someone whose Plus has no end (a promo) keeps no end after a subscription event", q1("SELECT plan, plan_until FROM users WHERE id = ?", forever.id).plan_until === null);
  await send(polar, await delivery(subEvent("subscription.revoked", fo, "sub_forever", { status: "revoked" })));
  check("…and keeps it when the subscription is revoked", q1("SELECT plan, plan_until FROM users WHERE id = ?", forever.id).plan_until === null);
  const promo = await claimedPerson(T, "Promo Later");
  await promo.c.post("/api/billing/checkout", { product: "plus_month", startNow: true });
  const pr = q1("SELECT * FROM billing_orders WHERE user_id = ?", promo.id);
  const promoUntil = Date.now() + 300 * 864e5;
  env.DB.raw.prepare("UPDATE users SET plan = 'plus', plan_until = ? WHERE id = ?").run(promoUntil, promo.id);
  await send(polar, await delivery(subEvent("subscription.active", pr, "sub_promo")));
  await send(polar, await delivery(subEvent("subscription.revoked", pr, "sub_promo", { status: "revoked" })));
  check("Plus from a promo that runs past the period end is neither shortened by the subscription nor ended by its revoke", q1("SELECT plan_until u FROM users WHERE id = ?", promo.id).u === promoUntil);
  const rv = await send(polar, await delivery(subEvent("subscription.revoked", po, "sub_burst", { status: "revoked" })));
  check("revoked: Plus that came from this subscription ends now", rv.json.outcome === "ended" && q1("SELECT plan_until u FROM users WHERE id = ?", p.id).u <= Date.now() && (await p.c.get("/api/me")).json.plan.tier === "free");
}

console.log("\n# Who gets it comes from our own order, and only if the event matches it");
{
  const h = T.client({ site: "host", ip: ip() });
  await becomeHost(h, { kind: "company", name: "Match Co" });
  const org = q1("SELECT id FROM orgs WHERE name = 'Match Co'").id;
  await h.post("/api/host/billing/checkout", { product: "standard_1", startNow: true });
  const o = q1("SELECT * FROM billing_orders WHERE org_id = ?", org);
  const none = () => q1("SELECT COUNT(*) n FROM credits WHERE org_id = ? AND granted_by = 'polar'", org).n === 0;
  const cases = {
    "a lower amount (1p)": { subtotal_amount: 1 },
    "a negative amount": { subtotal_amount: -1250 },
    "an amount as a string": { subtotal_amount: "1250" },
    "another currency": { currency: "usd" },
    "another product (a cheaper pack in Polar)": { product_id: POLAR_IDS.society_1 },
    "an unknown Polar product": { product_id: "prod_unknown_000" },
  };
  for (const [what, extra] of Object.entries(cases)) {
    // A fresh open order each time, so each case is judged on its own.
    env.DB.raw.prepare("UPDATE billing_orders SET status = 'open' WHERE id = ?").run(o.id);
    const r = await send(polar, await delivery(orderPaid(o, extra)));
    check(`a signed order.paid with ${what}: recorded as mismatch, nothing granted`, r.status === 200 && r.json.outcome === "mismatch" && none() && q1("SELECT status FROM billing_orders WHERE id = ?", o.id).status === "mismatch", r.json);
  }
  env.DB.raw.prepare("UPDATE billing_orders SET status = 'open' WHERE id = ?").run(o.id);
  const stranger = await send(polar, await delivery(orderPaid({ ...o, checkout_id: "co_not_ours", id: "bo_not_ours" })));
  check("a signed event for a checkout we never made: no_order, nothing granted", stranger.json.outcome === "no_order" && none());
  const other = q1("SELECT * FROM billing_orders WHERE org_id = ?", packOrg);
  const steer = await send(polar, await delivery(orderPaid(o, { metadata: { lanyard_order: other.id }, customer: { external_id: `o_${packOrg}` } })));
  check("metadata or a customer naming another organisation changes nothing: the checkout's own order is paid", steer.json.outcome === "granted" && q1("SELECT COUNT(*) n FROM credits WHERE org_id = ? AND granted_by = 'polar'", org).n === 1 && q1("SELECT SUM(events_granted) g FROM credits WHERE org_id = ? AND granted_by = 'polar'", packOrg).g === 5);
  const ignored = await send(polar, await delivery({ type: "customer.updated", data: { id: "c1" } }));
  check("an event type we do not use is stored and ignored", ignored.status === 200 && ignored.json.outcome === "ignored");
}

console.log("\n# Refunds arrive only from Polar and take back unused credits");
{
  const h = T.client({ site: "host", ip: ip() });
  await becomeHost(h, { kind: "company", name: "Refund Co" });
  const org = q1("SELECT id FROM orgs WHERE name = 'Refund Co'").id;
  await h.post("/api/host/billing/checkout", { product: "standard_5", startNow: true });
  const o = q1("SELECT * FROM billing_orders WHERE org_id = ?", org);
  await send(polar, await delivery(orderPaid(o)));
  env.DB.raw.prepare("UPDATE credits SET events_used = 2 WHERE id = ?").run(`polar_${o.id}`);
  const part = await send(polar, await delivery({ type: "order.refunded", data: { ...orderPaid(o).data, status: "partially_refunded" } }));
  check("a partial refund is recorded and changes no credits", part.json.outcome === "part_refunded" && q1("SELECT events_granted g FROM credits WHERE id = ?", `polar_${o.id}`).g === 5);
  const full = await delivery({ type: "order.refunded", data: { ...orderPaid(o).data, status: "refunded" } });
  const fr = await Promise.all(Array.from({ length: 10 }, () => send(polar, full)));
  const c = q1("SELECT events_granted g, events_used u FROM credits WHERE id = ?", `polar_${o.id}`);
  check("a full refund sent 10 times at once: refunded once, the 3 unused credits taken back, the 2 used stay used", fr.filter((x) => x.json.outcome === "refunded").length === 1 && c.g === 2 && c.u === 2 && q1("SELECT status FROM billing_orders WHERE id = ?", o.id).status === "refunded");
  const late = await send(polar, await delivery(orderPaid(o)));
  check("a paid event for a refunded order grants nothing again", late.json.outcome === "already" && q1("SELECT events_granted g FROM credits WHERE id = ?", `polar_${o.id}`).g === 2 && q1("SELECT status FROM billing_orders WHERE id = ?", o.id).status === "refunded", late.json);
}

console.log("\n# Promo codes stay one conditional write (payment bar line 5)");
{
  // Polar's own discount codes are switched off on every checkout we make (checked above); our codes
  // (FIRST50 and host codes) keep their concurrent proofs in test/security-audit.mjs and test/promo-host.mjs.
  check("every checkout sent to Polar had discount codes off", calls.filter((x) => x.url.endsWith("/checkouts/")).every((x) => x.body.allow_discount_codes === false));
  check("the promo proofs this line relies on are still in npm test", /security-audit\.mjs/.test(readFileSync("package.json", "utf8")) && /promo-host\.mjs/.test(readFileSync("package.json", "utf8")) && /60 people at once on FIRST50|FIRST50/.test(readFileSync("test/security-audit.mjs", "utf8")));
}

console.log("\n# Portal, provider failures and data downloads");
{
  const p = await claimedPerson(T, "Portal");
  check("Manage or cancel with nothing bought: 404", (await p.c.post("/api/billing/portal", {})).status === 404);
  await p.c.post("/api/billing/checkout", { product: "plus_year", startNow: true });
  const o = q1("SELECT * FROM billing_orders WHERE user_id = ?", p.id);
  await send(polar, await delivery(subEvent("subscription.active", o, "sub_portal", { current_period_end: new Date(Date.now() + 365 * 864e5).toISOString() })));
  const portal = await p.c.post("/api/billing/portal", {});
  check("after paying: Polar's portal address for this person only", portal.status === 200 && portal.json.url === "https://sandbox.polar.test/portal/s1" && calls.at(-1).body.external_customer_id === `u_${p.id}`);
  check("signed out, the portal is 401", (await T.client({ ip: ip() }).post("/api/billing/portal", {})).status === 401);
  const exp = await p.c.get("/api/account/export");
  check("the person's data download lists their order", exp.json.billingOrders?.length === 1 && exp.json.billingOrders[0].product === "plus_year");
  const q = await claimedPerson(T, "Down");
  polarDown = true;
  const down = await q.c.post("/api/billing/checkout", { product: "plus_month", startNow: true });
  polarDown = false;
  check("Polar unreachable: 502 with a plain message, the order marked failed", down.status === 502 && down.json.error === "We couldn't reach the payment page. Try again in a moment." && q1("SELECT status FROM billing_orders WHERE user_id = ?", q.id).status === "failed");
}

console.log("\n# F41: the Plan page's own next bill date and Manage billing (reads only, own rows only)");
{
  const raw = T.env.DB.raw;
  const when = Date.now() + 25 * 864e5;
  const iso = (ms) => new Date(ms).toISOString();
  const seed = (id, { plan = "plus", until = null, sub, order } = {}) => {
    raw.prepare("UPDATE users SET plan = ?, plan_until = ? WHERE id = ?").run(plan, until, id);
    if (sub) raw.prepare("INSERT INTO billing_subscriptions (id, provider, provider_subscription_id, user_id, product, status, current_period_end, cancel_at_period_end, created_at, updated_at) VALUES (?, 'polar', ?, ?, ?, ?, ?, ?, 1, 1)")
      .run("bs_" + id, "psub_" + id, id, sub.product || "plus_month", sub.status || "active", until, sub.cancel ? 1 : 0);
    if (order) raw.prepare("INSERT INTO billing_orders (id, provider, product, kind, amount_pence, currency, user_id, status, created_at) VALUES (?, 'polar', 'plus_month', 'plus', 149, 'gbp', ?, ?, 1)").run("bo_" + id, id, order);
  };
  const mineOf = async (p) => (await p.c.get("/api/billing/plans")).json.mine;
  const users = count(T, "users");
  const out = await T.client({ ip: ip() }).get("/api/billing/plans");
  check("signed out: the plans answer as before, with no mine", out.status === 200 && !("mine" in out.json) && Array.isArray(out.json.products) && out.json.cardPayments === true);
  check("…and asking while signed out made no guest", count(T, "users") === users);
  const free = await claimedPerson(T, "FreeF41");
  const f = await mineOf(free);
  check("a free user: tier free, until null, renews false, managed false", f.tier === "free" && f.until === null && f.renews === false && f.managed === false && f.cancelAtPeriodEnd === false);
  const ren = await claimedPerson(T, "RenewF41");
  seed(ren.id, { until: when, sub: { product: "plus_year" }, order: "paid" });
  const r = await mineOf(ren);
  check("a renewing subscriber: Plus, renews true, until is plan_until, yearly, managed", r.tier === "plus" && r.renews === true && r.until === iso(when) && r.interval === "year" && r.managed === true && r.cancelAtPeriodEnd === false);
  const can = await claimedPerson(T, "CancelF41");
  seed(can.id, { until: when, sub: { cancel: true }, order: "paid" });
  const cn = await mineOf(can);
  check("cancelled at period end: still Plus until the date, renews false, still managed", cn.tier === "plus" && cn.renews === false && cn.cancelAtPeriodEnd === true && cn.until === iso(when) && cn.managed === true);
  const promo = await claimedPerson(T, "PromoF41");
  seed(promo.id, { until: when });
  const pm = await mineOf(promo);
  check("promo-only Plus (a date, no order): Plus, renews false, managed false", pm.tier === "plus" && pm.until === iso(when) && pm.renews === false && pm.managed === false && pm.interval === null);
  const forever = await claimedPerson(T, "ForeverF41");
  seed(forever.id, { until: null });
  const fv = await mineOf(forever);
  check("Plus with no end date: until null, renews false", fv.tier === "plus" && fv.until === null && fv.renews === false);
  const ref = await claimedPerson(T, "RefundF41");
  seed(ref.id, { plan: "free", order: "refunded" });
  const rf = await mineOf(ref);
  check("a refunded order is managed even when back on Free", rf.tier === "free" && rf.managed === true && rf.until === null && rf.renews === false);
  const open = await claimedPerson(T, "OpenF41");
  seed(open.id, { plan: "free", order: "open" });
  check("an unpaid (open) order is not managed", (await mineOf(open)).managed === false);
  const ended = await claimedPerson(T, "EndedF41");
  seed(ended.id, { until: Date.now() - 864e5, sub: { status: "canceled" }, order: "paid" });
  const en = await mineOf(ended);
  check("Plus that has ended: Free, no date, renews false, still managed to see invoices", en.tier === "free" && en.until === null && en.renews === false && en.managed === true);
  // Privacy: B's rows sit in the same database; A (free) and the promo user look.
  const A = JSON.stringify(await mineOf(free));
  check("user A (free) sees none of B's date, interval or order", A.includes('"until":null') && A.includes('"interval":null') && A.includes('"managed":false') && !A.includes(iso(when)) && !A.includes("year"));
  const otherUntil = Date.now() + 99 * 864e5;
  seed(ren.id, { until: otherUntil });
  check("B's new date shows for B and nowhere in A's or the promo user's answer", (await mineOf(ren)).until === iso(otherUntil) && !JSON.stringify(await mineOf(free)).includes(iso(otherUntil)) && !JSON.stringify(await mineOf(promo)).includes(iso(otherUntil)));
  check("the response holds no provider ids or user ids", !JSON.stringify(r).includes("psub_") && !JSON.stringify(r).includes(ren.id) && !JSON.stringify(r).includes("bo_"));
  check("the portal's own rules are unchanged: a promo user still gets 404, a paid one the portal", (await promo.c.post("/api/billing/portal", {})).status === 404 && (await can.c.post("/api/billing/portal", {})).status === 200);
  const off = wrap(await makeEnv({ ...BASE }));
  const op = await claimedPerson(off, "OffF41");
  off.env.DB.raw.prepare("UPDATE users SET plan = 'plus', plan_until = ? WHERE id = ?").run(when, op.id);
  off.env.DB.raw.prepare("INSERT INTO billing_orders (id, provider, product, kind, amount_pence, currency, user_id, status, created_at) VALUES ('bo_off', 'polar', 'plus_month', 'plus', 149, 'gbp', ?, 'paid', 1)").run(op.id);
  const offMine = (await op.c.get("/api/billing/plans")).json;
  check("with BILLING_ENABLED unset: cardPayments false, yet mine says Plus, managed true", offMine.cardPayments === false && offMine.mine.tier === "plus" && offMine.mine.managed === true && offMine.mine.until === iso(when));
}

console.log("\n# Secrets (payment bar line 6)");
{
  const all = responses.join("\n");
  check(`none of ${responses.length} responses holds the Polar access token or the webhook secret`, !all.includes(TOKEN) && !all.includes(SECRET) && !all.includes(SECRET.slice(6)));
  const out = printed.join("\n");
  check(`nothing printed while this file ran (${printed.length} lines) holds either secret`, !out.includes(TOKEN) && !out.includes(SECRET.slice(6)));
  check("the access token goes only to Polar, in the Authorization header", calls.every((x) => x.init.headers.authorization === `Bearer ${TOKEN}` && x.url.startsWith("https://sandbox-api.polar.sh/")) && calls.every((x) => !JSON.stringify(x.body).includes(TOKEN)));
  check("no file in src/ names a Polar secret", !/POLAR_ACCESS_TOKEN|POLAR_WEBHOOK_SECRET/.test(readFileSync("src/views/settings/SettingsPlan.vue", "utf8") + readFileSync("src/views/HostBilling.vue", "utf8")));
}

summary();
