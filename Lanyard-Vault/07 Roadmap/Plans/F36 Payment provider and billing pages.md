---
tags: [roadmap, feature, billing, research]
id: F36
priority: P1
phase: 7
size: M
status: Not started
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

## Plan
1. Research note `Lanyard-Vault/02 Business/Payment providers 2026-11-15.md`: Polar and Dodo Payments (and Stripe as the baseline) on fees, UK payouts, merchant of record and VAT, subscriptions, one-off packs, invoices or purchase orders for universities, customer portal and cancel, refunds, webhooks (signature scheme, retries, event ids), test mode, Cloudflare Worker support (fetch-only SDK or plain HTTP), what they need from us (entity, address, ID), acceptable-use limits, and their own reputation and age. Recommendation with reasons.
2. Owner picks the provider (and confirms the host prices and what Plus includes, F27.1).
3. Rewrite F27's Payments section for the chosen provider, keep its UK checklist (adjusted for a merchant of record), and add [[F35 Security audit against common attacks]]'s payment bar.
4. Billing page designs (no money yet): Settings > Plan for Plus and host Billing for credit packs, with the pre-contract information, the express-start tick box and cancel in two taps, drawn behind a "Coming soon" switch until the blockers are cleared.

## Acceptance checks
- [ ] The research note compares the providers with sources and dates, and recommends one.
- [ ] The owner's choice is recorded here, in F27 and in a decision note.
- [ ] F27 carries the payment bar from F35.

## Log
-

Related: [[F27 Lanyard Plus and billing]], [[Pricing]], [[Host Portal and Billing]] · back to [[00 Master To-Do]]
