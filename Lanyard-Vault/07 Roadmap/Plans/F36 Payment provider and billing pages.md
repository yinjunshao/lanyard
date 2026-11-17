---
tags: [roadmap, feature, billing, research]
id: F36
priority: P1
phase: 7
size: M
status: In progress
needs: [F35]
---
# F36 Payment provider and billing pages

**Priority:** P1 · **Phase:** 7 Owner requests (2026-11-15) · **Size:** M · **Needs:** [[F35 Security audit against common attacks]] + owner decision (provider) · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-15)
"We have to start thinking about pricing and the billing pages, and also how to get the payment working. So therefore, I think we are either using polar.sh or Dodo payments. They can't fake the payment and redeem multiple of limited promo codes. They can't order a negative one item, which would give them a refund."

## Current state
- [[F27 Lanyard Plus and billing]] was planned around Stripe, and is blocked on the legal entity, a postal address and ICO registration.
- Hosts pay by invoice request with credits granted by hand ([[D009 Manual invoicing before Stripe]]); prices in `worker/plans.js` (`HOST_SKUS`, `PLUS_PRICE` £1.49 / £11.99) and [[Pricing]].
- Polar and Dodo Payments are both **merchants of record**: they sell to the customer in their own name and handle VAT and sales tax, which Stripe does not. That changes F27's compliance list.

> [!note] Owner decision 2026-11-15: **Polar**. "Lets do polar first, we can change later on." So the code keeps the provider behind one Worker module (checkout, webhook verify, portal link), with our own tables holding the facts (orders, subscriptions, event ids), so a later switch to Stripe or another provider changes one module and not the data. Research: [[Payment providers 2026-11-15]] (Polar about 32% of a £1.49 charge at the Starter rate; worth revisiting the yearly-only option or a higher monthly price). Hosts at universities still pay by our own invoice (Polar shows no purchase-order or bank-transfer invoicing).

## Plan
- [x] Research note: [[Payment providers 2026-11-15]] (Polar, Dodo Payments and Stripe as the baseline; sources and dates; recommends Polar of the two). Written 2026-11-15 before this plan was worked.
- [x] Owner picks the provider: **Polar** (2026-11-15, above). Plus price £1.49 / £11.99 (2026-11-10). What Plus includes is still open.

## Tasks
Nothing here takes money: the legal entity, address and ICO registration ([[F27 Lanyard Plus and billing]] blockers) are not done, so everything is behind `BILLING_ENABLED = "1"`, which production does not set.
- [x] F36.1 Rewrite F27's "Payments" section for Polar (server-side checkout from our own product table, Customer Portal, Standard Webhooks, each `webhook-id` once, grants as one conditional write, the redirect proves nothing, refunds only from Polar), adjust its UK checklist for a merchant of record, keep manual invoices for universities, keep its tasks consistent; decision note D041; [[Pricing]] says £1.49 / £11.99 and links the research.
- [x] F36.2 Worker: `worker/billing/provider.js` and `worker/billing/polar.js` (injectable fetch, no network in tests), `POST /api/billing/checkout`, `POST /api/webhooks/polar` (and the host pack checkout), all off unless `BILLING_ENABLED = "1"`; migration `0031_billing.sql` (additive); `test/billing.mjs` for every line of the payment bar.
  - `worker/billing/provider.js` (switch, product table from `PLUS_PRICE` and `HOST_SKUS`, `POLAR_PRODUCTS` ids, seller), `worker/billing/polar.js` (checkout, portal, Standard Webhooks check, event reader; `env.BILLING_FETCH` in tests), `worker/billing/routes.js` (`GET /api/billing/plans`, `POST /api/billing/checkout`, `POST /api/billing/portal`, `POST /api/webhooks/polar`) and `POST /api/host/billing/checkout` in `hosts.js`. Checkout needs `BILLING_ENABLED = "1"`, both Polar secrets, the product's Polar id and `SELLER_NAME` and `SELLER_ADDRESS`; otherwise 503 `billing_off`. Migration 0031 (three tables, no cascade). `/api/billing/*` never makes a guest; `/api/webhooks/*` gets no session. `test/billing.mjs` (99 checks), run before `test/budget.mjs`. The slow-D1 helper `withLatency` moved from `test/security-audit.mjs` to `test/harness.mjs`.
- [x] F36.3 Billing pages behind the same switch: Settings > Plan (Free and Plus, price, what Plus includes from the server; "Paid plans are coming soon" and the waitlist when off; the pre-contract box and an unticked express-start box before Pay when on) and host Billing (credit packs from `HOST_SKUS`, the same pattern, the invoice request path kept).
  - New `src/components/PayBox.vue` (who sells it from `SELLER_NAME` and `SELLER_ADDRESS`, the full price, renewal or one-off, how to cancel, the 14 days, an unticked express-start box that enables Pay, "You'll pay on Polar's secure page"). Settings > Plan reads `/api/billing/plans` (prices and `PLUS_INCLUDES` from the server): off, "Paid plans are coming soon." and the waitlist as before; on, "Get Plus for £11.99 a year" or "£1.49 a month", then the box; Plus members get "Manage or cancel" (portal) when on. Host Billing: "Pay by card" on each pack the server marks `card`, beside "Request invoice", then the box; the invoice and quote paths are unchanged. Both pages say "starts as soon as the payment is confirmed" on `?checkout=done` and grant nothing. API calls are in the views; no shared front-end file changed. Looked at with local servers, off and on (on with throwaway values; Pay was never pressed, so Polar was never called), at 375 px and 1280 px in light and dark: the box opens unticked with Pay disabled, ticking enables it. The "Coming first" line (features not built yet) is no longer listed as part of Plus.
- [ ] F36.4 Vault: [[API Surface]], [[Data Model]], [[Codebase Map]], [[Testing]], [[Deployment]] (owner steps for Polar), [[Host Portal and Billing]], [[Security]].

## Acceptance checks
- [x] The research note compares the providers with sources and dates, and recommends one.
  - [[Payment providers 2026-11-15]]: each fact has a linked source read on 2026-11-15, a comparison table and a recommendation (Polar of the two).
- [x] The owner's choice is recorded here, in F27 and in a decision note.
  - Here (the note above), [[F27 Lanyard Plus and billing]] (the owner-decision note and the Payments section) and [[D041 Polar as merchant of record behind one provider module]].
- [x] F27 carries the payment bar from F35.
  - The "Payment bar" section, with the Polar secrets named; the Payments section says how each line is met.

## Log
-

Related: [[F27 Lanyard Plus and billing]], [[Pricing]], [[Host Portal and Billing]] · back to [[00 Master To-Do]]
