---
tags: [roadmap, feature, billing, plus, compliance]
id: F27
priority: P2
phase: 5
size: XL
status: Not started
needs: [F09, F21]
---
# F27 Lanyard Plus and billing

**Priority:** P2 (blocked by legal identity items; see below) · **Phase:** 5 Revenue and mail · **Size:** XL · **Needs:** [[F09 Settings in category pages]], [[F21 AI foundation]] (the AI allowance is part of Plus) · back to [[00 Master To-Do]]

## What the owner asked for
Plan and build Lanyard Plus, with billing support, compliant with UK law.

## Current state
- `worker/plans.js`: `USER_PLANS` (Free: 3 cards; Plus: 12 cards and a custom strap), `PLUS_PRICE = { monthlyPence: 149, yearlyPence: 1199 }`, `planOf()` reads `users.plan` / `plan_until`.
- `plus_waitlist` table. The FIRST50 promo grants `plan = 'plus'` with `plan_until`.
- Hosts: credit packs in `HOST_SKUS`, paid by invoice request and granted by hand by an admin ([[D009 Manual invoicing before Stripe]]).

> [!warning] Price mismatch
> The code says £1.49 a month / £11.99 a year. [[Pricing]] in this vault says £2.99 a month / £24 a year. **The owner must pick one** before anything is built. Record it here and fix the other place.

## What Plus includes (proposal; the owner confirms)
| | Free | Plus |
| --- | --- | --- |
| Cards | 3 | 12 |
| Custom strap colour | no | yes |
| AI follow-up drafts ([[F22 AI follow-up drafts]]) | 3 a day / 15 a month | 15 a day / 150 a month |
| "Do I know someone who…" ([[F24 Do I know someone who]]) | 5 a day | 30 a day |
| Never paywalled | connecting, selfies, profile, notes, People, events | same |

## Payments: Stripe
- **Stripe Checkout** (hosted page) for the Plus monthly and yearly subscriptions, and for host credit packs as one-off payments (keep the invoice/PO path for societies and universities). Card details never touch our servers, and Checkout handles Strong Customer Authentication.
- **Stripe Customer Portal** for "Manage or cancel", linked from Settings → Plan. Cancelling must be as easy as signing up: two taps and no "are you sure" maze.
- **Webhooks** → `POST /api/webhooks/stripe`, verifying the `Stripe-Signature` header with Web Crypto (HMAC-SHA256 of `timestamp.payload`, 5-minute tolerance). Handle `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`. Store each event id in `stripe_events` so retries are ignored (idempotency).
- **Tables:** `subscriptions(user_id, stripe_customer_id, stripe_subscription_id, status, interval, current_period_end, cancel_at_period_end, updated_at)` and `payments(id, user_id or org_id, stripe_id, amount_pence, currency, kind, created_at)` (kept 6 years, like `billing_requests`).
- `planOf()` reads the subscription (active or trialing until `current_period_end`) **or** a promo `plan_until`, whichever is later.
- **Promo first:** someone with FIRST50 Plus until Nov 2027 who subscribes is charged only from the promo end date. Set the Checkout `trial_end` to `plan_until`, and say so on the page.
- **Payment failed:** a 7-day grace period with an email and an in-app banner, then Free. Cards above 3 are **hidden, not deleted**, and come back on resubscribe.

## UK compliance checklist (not legal advice; have a lawyer or legal clinic check before the first charge)
**Blockers, before taking any money:**
- [ ] Legal entity and a full **geographic address** shown on the site and in pre-contract info ([[UK GDPR Audit 2026-11-01]] High 3)
- [ ] ICO registration and fee paid
- [ ] Terms of Service updated with subscription terms (price, renewal, cancellation, refunds), and the Privacy Policy updated with Stripe

**Before checkout (Consumer Contracts Regulations 2013):** show clearly, before the Pay button: who we are and our address, the total price including any VAT, the billing interval and that it **renews automatically** until cancelled, how to cancel, and the 14-day cancellation right.

**The 14-day cancellation right:** Plus is a service that starts straight away, so at checkout ask for an **express request** to start now, with an acknowledgement. For example, an unticked box: "Start Plus now. I understand that if I cancel within 14 days I'll get a refund minus the days I've used." If someone cancels within 14 days, refund the unused part (pro rata). Send a confirmation email (a durable medium) with the contract details and cancellation info. ([BIS guidance on the regulations](https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/429300/bis-13-1368-consumer-contracts-information-cancellation-and-additional-payments-regulations-guidance.pdf))

**Get ready now for the DMCC Act subscription rules**, expected **January 2027** according to a recent law-firm update ([DWF, Oct 2026](https://dwfgroup.com/fr-be/news-and-insights/insights/2026/10/dmcca-subscription-contracts-regime-preparing-for-the-new-restrictions)); earlier reports said spring 2027 ([Bristows](https://inquisitiveminds.bristows.com/post/102mp7u/uk-government-confirms-new-subscription-contracts-rules-for-spring-2027)). Check the final regulations when published. Build now:
- [ ] Renewal reminder email before each yearly renewal (and for monthly plans at the interval the regulations set) with the price, date and a one-click route to cancel
- [ ] Cancel online in the app, as easy as joining
- [ ] Cooling-off after a free trial or promo converts to paid, and after a 12-month renewal (proportionate refund)
- [ ] Notices sent by email (a durable medium) and at least as prominent as other information

**Prices and practices (DMCC Act consumer protection, in force):** show the full price up front (no fees added at the end), no fake countdowns or "only 3 left", no fake reviews.

**VAT:** registration is required once taxable turnover passes **£90,000** in 12 months (check gov.uk when close). Until registered, don't charge VAT and don't show a VAT number. Watch the running total on the admin page.

**Records:** keep payment and invoice records for 6 years. Receipts come from Stripe.

## Tasks
- [ ] F27.1 Owner decides the price and Plus contents. Fix `plans.js` and [[Pricing]] to match.
- [ ] F27.2 Tables, a webhook endpoint with signature verification and idempotency, and tests with signed fixture events.
- [ ] F27.3 Checkout session endpoints (Plus monthly and yearly; host packs) and the promo-aware start date.
- [ ] F27.4 Settings → Plan: the current plan, renewal date, Upgrade (pre-contract box, express-start tick box), Manage or cancel (Portal).
- [ ] F27.5 Lifecycle emails (`accounts` stream): welcome to Plus, renewal reminder, payment failed, cancelled, refund confirmation.
- [ ] F27.6 Downgrade behaviour (hide extra cards, keep data) and resubscribe restores them, with tests.
- [ ] F27.7 Host card payments for credit packs. Grant credits on `checkout.session.completed`. Keep the invoice path.
- [ ] F27.8 Terms and Privacy text drafts for the owner's lawyer review (don't publish them without the owner's approval).
- [ ] F27.9 Admin: subscriptions list, revenue total over the last 12 months (VAT watch), refunds link to the Stripe dashboard.

## Owner steps
1. A Stripe account for the business (UK). Products and prices for Plus monthly and yearly, plus the host packs. Turn on the Customer Portal with cancellation allowed.
2. A webhook endpoint `https://lanyd.fyi/api/webhooks/stripe` with the events above. `wrangler secret put STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
3. Clear the blockers above: entity, address, ICO, and a lawyer review.
4. Test in Stripe test mode on a staging or local site first. A live switch-on only after the owner signs off.

## Acceptance checks
- [ ] In Stripe test mode: subscribe, renew (test clock), fail payment → grace → Free, resubscribe → cards back.
- [ ] Cancelling from Settings takes two taps and ends Plus at the period end. Cancelling within 14 days refunds pro rata.
- [ ] Someone with promo Plus is not charged before their promo end date.
- [ ] A replayed webhook does nothing the second time.

## Log
-

Related: [[Pricing]], [[Business Model]], [[Host Portal and Billing]] · back to [[00 Master To-Do]]
