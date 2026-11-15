---
tags: [decision, billing, payments]
status: Accepted
date: 2026-11-15
---
# D041 Polar as merchant of record behind one provider module

**Status:** Accepted  ·  **Date:** 2026-11-15

## Context
The owner asked how Lanyard takes money ([[F36 Payment provider and billing pages]]) and named Polar and Dodo Payments. Both are merchants of record (MoR): they sell in their own name and charge and file VAT and sales tax, which plain Stripe does not. The research ([[Payment providers 2026-11-15]]) found Polar the better of the two (Standard Webhooks, per-customer code limits, documented UK payouts, sandbox, a funded team) but the dearest: about 32% of a £1.49 monthly charge at the Starter rate, against about 15% on plain Stripe. Neither shows bank-transfer or purchase-order invoicing, which universities use. The owner chose: "Lets do polar first, we can change later on." Nothing may take money yet: the legal entity, address and ICO registration are not done ([[F27 Lanyard Plus and billing]]).

## Decision
- **Polar first, as merchant of record**, for Lanyard Plus (£1.49 a month, £11.99 a year) and host credit packs.
- **One provider module.** `worker/billing/polar.js` is the only code that knows Polar (checkout, webhook check, portal link); `worker/billing/provider.js` holds the interface, the switch and our own product table. Our tables (`billing_orders`, `billing_subscriptions`, `billing_events`, migration 0031) keep the facts with a `provider` column, so a later move to Stripe or another provider is a new module, not new data.
- **The payment bar from [[F35 Security audit against common attacks]]**, for Polar: checkout made on the Worker from our table (the browser sends a product id only; discount code entry off); paid only on a webhook verified by Standard Webhooks (HMAC-SHA256 over `id.timestamp.body`, base64 secret, constant-time compare, 5 minutes, several signatures); each `webhook-id` stored once; every grant one conditional write in the same batch, gated on this delivery's token; who gets it from our order row, never the event body; the redirect proves nothing; refunds only from Polar.
- **Off by default.** Every billing write needs `BILLING_ENABLED = "1"` and the Polar secrets, product ids and the seller's name and address; otherwise 503 and nothing written. Production sets none of them.
- **Hosts keep our own invoices** ([[D009 Manual invoicing before Stripe]]) beside card payment.
- **What stays ours** under a MoR: pre-contract information on our page, the unticked express-start box, our own renewal reminders, cancel in two taps, records for 6 years.

## Consequences
Higher fees on small charges (worth revisiting a yearly-only Plus or a higher monthly price). No VAT or EU and US tax filing for us on these sales. Polar's own Customer Portal does cancel and receipts, so there is less for us to build, and Polar's buyer terms sit beside ours. A switch later changes one module and the owner's provider setup. The pages can be seen and tested now without taking money.

**Evidence:** `worker/billing/provider.js`, `worker/billing/polar.js`, `migrations/0031_billing.sql`, `test/billing.mjs`, [[Payment providers 2026-11-15]]

Related: [[D009 Manual invoicing before Stripe]], [[D040 Limits and claims are enforced in the write itself, and a guess is counted before it is checked]], [[D001 Hosts pay, attendees free]] · back to [[Decision Log]]
