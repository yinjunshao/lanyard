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

> [!note] Owner decisions: the price is **£1.49 a month / £11.99 a year** (2026-11-10, what the code says). The provider is **Polar**, as merchant of record, behind one Worker module (2026-11-15, [[F36 Payment provider and billing pages]], [[D041 Polar as merchant of record behind one provider module]]): "we can change later on". What Plus includes, and the legal identity, are still open.

## What the owner asked for
Plan and build Lanyard Plus, with billing support, compliant with UK law.

## Current state
- `worker/plans.js`: `USER_PLANS` (Free: 3 cards; Plus: 12 cards and a custom strap), `PLUS_PRICE = { monthlyPence: 149, yearlyPence: 1199 }`, `planOf()` reads `users.plan` / `plan_until`.
- `plus_waitlist` table. The FIRST50 promo grants `plan = 'plus'` with `plan_until`.
- Hosts: credit packs in `HOST_SKUS`, paid by invoice request and granted by hand by an admin ([[D009 Manual invoicing before Stripe]]).

> [!note] Price settled 2026-11-10: £1.49 a month / £11.99 a year, as the code says. [[Pricing]] was corrected on 2026-11-15 ([[F36 Payment provider and billing pages]]).

## What Plus includes (proposal; the owner confirms)
Still a proposal. The Plan page shows the list from `PLUS_INCLUDES` in `worker/plans.js` (F36.3), so changing it is one place.

| | Free | Plus |
| --- | --- | --- |
| Cards | 3 | 12 |
| Strap colour ([[F55 Card colour presets and a Plus colour wheel]], [[D052 Free accounts save only preset strap colours; Plus any colour and a text colour, checked in the Worker]]) | ten presets | any colour on the wheel |
| Card text colour | no | yes |
| AI follow-up drafts ([[F22 AI follow-up drafts]]) | 3 a day / 15 a month | 15 a day / 150 a month |
| "Do I know someone who…" ([[F24 Do I know someone who]]) | 5 a day | 30 a day |
| Never paywalled | connecting, selfies, profile, notes, People, events | same |

## Payments: Polar (merchant of record)
Chosen 2026-11-15 ([[D041 Polar as merchant of record behind one provider module]]; research in [[Payment providers 2026-11-15]]). Polar sells to the customer in its own name ("Polar Software, Inc." on receipts), charges and files VAT and sales tax, and pays out to us through Stripe Connect Express. Cost at the Starter rate: about 32% of a £1.49 monthly charge, about 10% of £11.99 a year, about 8% of a £25 pack (worth revisiting the yearly-only option or a higher monthly price).

**One provider module.** Everything that knows about Polar is in `worker/billing/polar.js`; `worker/billing/provider.js` is the interface and our own product table. Our tables (`billing_orders`, `billing_subscriptions`, `billing_events`) hold the facts with a `provider` column, so moving to Stripe or another provider means a new module with the same functions, not new data. Every call goes through an injectable `fetch`, so the tests never touch the network.

- **Checkout sessions made on the Worker.** The browser sends only our product id (`plus_month`, `plus_year`, or a host pack id from `HOST_SKUS`) and the express-start tick. The Worker reads the price, currency and the Polar product id from its own table (prices from `PLUS_PRICE` and `HOST_SKUS`; Polar product ids from the `POLAR_PRODUCTS` var, one per product id, set by the owner after making the products in Polar), writes an `open` row in `billing_orders` with our price, then calls Polar's `POST /v1/checkouts/` with that one product, our order id in `metadata`, `external_customer_id` (`u_<user id>` or `o_<org id>`) and **discount code entry off** (`allow_discount_codes: false`). The browser is sent to Polar's hosted page; card details never touch us, and Polar handles Strong Customer Authentication. Any price, amount or currency in the request is ignored; a quantity other than 1 is a 400.
- **Customer Portal** for "Manage or cancel": `POST /api/billing/portal` asks Polar for a customer session for the signed-in person (`POST /v1/customer-sessions/` with the external customer id) and sends them to its `customer_portal_url`. Cancel, change card and download receipts happen there. Cancelling must be as easy as joining: our Plan page has one "Manage or cancel" button, and Polar's portal one Cancel.
- **Webhooks** → `POST /api/webhooks/polar`, outside the session middleware (it never makes a guest) and outside the same-origin check (Polar sends no Origin). Verified with the **Standard Webhooks** scheme: headers `webhook-id`, `webhook-timestamp`, `webhook-signature`; the secret is `whsec_` plus base64 (decoded to the key); the signed text is `id.timestamp.body` over the **raw** body; HMAC-SHA256, base64; the header may hold several `v1,<signature>` entries separated by spaces and any one matching is enough; compared in constant time; refused if the timestamp is more than 5 minutes from now either way. Anything that fails is a 400 and writes nothing.
- **Each `webhook-id` once.** `billing_events.webhook_id` is UNIQUE. The event row goes in with a random token for this delivery (`INSERT ... ON CONFLICT DO NOTHING`), and every write that grants or changes something is in the **same batch** and runs only `WHERE EXISTS` that row with this delivery's token. A replay, or the same event sent 20 times at once, finds the first delivery's token and changes nothing. A failed batch rolls back the event row too, so Polar's retry can still do the work.
- **Events handled:** `order.paid` for a host pack (marks our order paid and adds the credits row `polar_<order id>`, whose primary key is a second lock); `subscription.created`, `subscription.active`, `subscription.updated`, `subscription.canceled`, `subscription.uncanceled`, `subscription.revoked` (one `billing_subscriptions` row per Polar subscription; while active, `users.plan = 'plus'` and `plan_until` is moved to the period end, never earlier than it already is, so promo Plus is never cut short); `order.refunded` (marks the order refunded and takes back the pack's unused credits). Who gets the grant comes from **our** `billing_orders` row (matched by Polar's checkout id), never from the event body, and only if the product and currency in the event match that row. Anything else is stored and ignored.
- **The redirect back proves nothing.** Polar's `success_url` brings the person to Settings > Plan or host Billing with a "Thanks, it starts once the payment is confirmed" note; no route takes a checkout id from the browser to confirm a payment.
- **Refunds only from Polar.** They start in Polar's dashboard (or Polar refunds on its own within 60 days to prevent a chargeback) and reach us as `order.refunded`. No route takes a refund, amount or quantity from the browser.
- **Promo first:** someone with FIRST50 Plus until Nov 2027 is told on the page that they already have Plus, and checkout is refused (409) while any Plus is active. Later (F27.3): a trial in days up to the promo end (Polar trials take a number and a unit; no end date found).
- **Payment failed:** a 7-day grace period with an email and an in-app banner, then Free. Cards above 3 are **hidden, not deleted**, and come back on resubscribe (F27.6).
- **Universities and most hosts pay by our own invoice**, as now ([[D009 Manual invoicing before Stripe]]): Polar shows no bank-transfer or purchase-order invoicing. The Billing page keeps "Request invoice" beside card payment.
- **Off until the owner says so.** A checkout needs `BILLING_ENABLED = "1"` and `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRODUCTS`, `SELLER_NAME` and `SELLER_ADDRESS`; the webhook needs the switch and the secret. Without them every billing write is a 503 "Card payments are not switched on yet." and nothing is written. Production sets none of them.

## Payment bar (from F35, 2026-11-15; whatever provider [[F36 Payment provider and billing pages]] picks)
Every payment task here must meet this, with a test for each line. F36.2 built it for Polar; each line's test is in `test/billing.mjs` (listed in the F36 plan note's Log). It comes from [[F35 Security audit against common attacks]] and [[D040 Limits and claims are enforced in the write itself, and a guess is counted before it is checked]].
- **Prices from the server only.** The price, currency, product and quantity come only from the server's own table (`PLUS_PRICE` and `HOST_SKUS` in `worker/plans.js`, or the provider's price ids kept beside them). The browser sends a product id at most, and a quantity only where one makes sense, refused with 400 unless it is a whole number in range (as invoice requests are since F35.7). Any amount the browser sends is ignored, as `POST /api/host/billing/request` already ignores one.
- **Paid only when the provider says so.** An order is paid only when a webhook with a verified signature says so (HMAC over the raw body, compared in constant time, with a timestamp tolerance of a few minutes), or the provider's API confirms it. A redirect back to our site proves nothing. The webhook route sits outside the session middleware (like `/api/integrations/`), so it never mints a guest, and outside the same-origin check, which lets server-to-server calls through.
- **Replays do nothing.** Each provider event id is stored once with a unique constraint, and granting credits or Plus is one conditional write in the same batch that runs only if that event row went in. Test it with the same signed event sent 50 times at once: one grant.
- **Refunds only from the provider.** A refund starts only in the provider's dashboard or arrives as a webhook; no route takes a quantity or amount for a refund from the browser.
- **Limited promo codes stay one conditional write** per claim with a unique constraint behind it, proven under concurrent requests (as FIRST50 and host codes are in `test/security-audit.mjs` and `test/promo-host.mjs`).
- **Secrets** (`POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, or a later provider's own) are Worker secrets only: never in `[vars]`, a response, a log or the repo; add them to the secret search at the end of `test/security-audit.mjs`.

## UK compliance checklist (not legal advice; have a lawyer or legal clinic check before the first charge)
Polar is the **merchant of record**: it is the seller on the receipt, so some duties move to it. A lawyer should confirm who owes what; until then we do everything under "What stays ours".

**Blockers, before taking any money:**
- [ ] Legal entity and a full **geographic address** shown on the site and in pre-contract info ([[UK GDPR Audit 2026-11-01]] High 3). The Polar account owner is who gets the payouts and passes the ID checks.
- [ ] ICO registration and fee paid
- [ ] Terms of Service updated with subscription terms (price, renewal, cancellation, refunds, that Polar is the seller), and the Privacy Policy updated with Polar (draft wording below)
- [ ] A lawyer's view on the merchant-of-record split below

**What Polar now does:** charges and files VAT, GST and US sales tax on its sales (so EU and US tax from the first sale is not ours); issues receipts and invoices to the buyer; takes the card, handles Strong Customer Authentication, chargebacks and its own buyer terms; runs the Customer Portal for cancel, card change and receipts.

**What stays ours:**
- **Pre-contract information on our page** (Consumer Contracts Regulations 2013), before the Pay button: who we are and our address, the total price, the billing interval and that it **renews automatically** until cancelled, how to cancel, and the 14-day cancellation right. Polar's checkout may not show all of it, so ours always does (F36.3 draws it; the name and address come from `SELLER_NAME` and `SELLER_ADDRESS`, which the owner fills, and checkout is refused until they are set). `SELLER_NAME` is `Quantlink Investment Service Company Limited` (the owner's answer, 2026-11-22, [[F50 QuantLink as the operator]]); the postal address is still open and is needed here before any charge, since the site shows the name only.
- **The express-start request.** Plus is a service that starts straight away, so before Pay an **unticked** box: "Start Plus now. I understand that if I cancel within 14 days I'll get a refund minus the days I've used." It must be ticked to continue (the page and the server both check), and the time is kept on the order. Whether Polar's checkout captures this: not found, so we do. If someone cancels within 14 days, refund the unused part (pro rata) from Polar's dashboard. ([BIS guidance on the regulations](https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/429300/bis-13-1368-consumer-contracts-information-cancellation-and-additional-payments-regulations-guidance.pdf))
- **A confirmation email** (durable medium) with the contract details and how to cancel. Polar's receipt may cover part of it; ours covers the rest (F27.5).
- **Our own renewal reminders** (DMCC Act subscription rules, below): who sends them when a merchant of record bills was not found, so we send them.
- **Cancel in two taps:** Settings > Plan, "Manage or cancel", then Cancel in Polar's portal. No "are you sure" maze.
- **Records:** our `billing_orders`, `billing_subscriptions` and `billing_events` are kept 6 years, like `billing_requests`; the host reset and account deletion never delete them (a deleted account's or organisation's id becomes empty on the row).

**Get ready now for the DMCC Act subscription rules**, expected **January 2027** according to a recent law-firm update ([DWF, Oct 2026](https://dwfgroup.com/fr-be/news-and-insights/insights/2026/10/dmcca-subscription-contracts-regime-preparing-for-the-new-restrictions)); earlier reports said spring 2027 ([Bristows](https://inquisitiveminds.bristows.com/post/102mp7u/uk-government-confirms-new-subscription-contracts-rules-for-spring-2027)). Check the final regulations when published. Build now:
- [ ] Renewal reminder email before each yearly renewal (and for monthly plans at the interval the regulations set) with the price, date and a one-click route to cancel
- [ ] Cancel online in the app, as easy as joining
- [ ] Cooling-off after a free trial or promo converts to paid, and after a 12-month renewal (proportionate refund)
- [ ] Notices sent by email (a durable medium) and at least as prominent as other information

**Prices and practices (DMCC Act consumer protection, in force):** show the full price up front (no fees added at the end), no fake countdowns or "only 3 left", no fake reviews. Whether Polar shows our prices with VAT added or included: check in the sandbox before switching on, and make our page say the same.

**VAT:** Polar charges VAT on its own sales. Our own UK registration is needed once our taxable turnover passes **£90,000** in 12 months (check gov.uk when close; how Polar payouts count towards it is a question for an accountant). Until registered, don't show a VAT number. Watch the running total on the admin page.

**Draft wording for the owner's lawyer (not published; no Terms or Privacy version bump):**
- Terms, paid plans: "Lanyard Plus and host event packs are sold by our reseller Polar Software, Inc., which is the merchant of record for these orders and handles payment, tax and receipts. Polar's buyer terms also apply to your purchase. Plus renews automatically each month or year until you cancel. You can cancel at any time in Settings, Plan, Manage or cancel; Plus then runs to the end of the period you paid for. If you cancel within 14 days of starting, we refund you for the days you did not use."
- Privacy Policy, who we share data with: "Polar Software, Inc. (United States) sells our paid plans as merchant of record. When you buy, Polar receives your email address, a customer reference we create, and the product you chose, and collects your card details and billing address itself; we never see your card. Polar uses Stripe to take payments. We keep a record of each order (what was bought, the price, the dates and the payment status) for 6 years for accounting."
- Host Terms: the same paid-plans paragraph, with "event packs" and "invoice on request" kept for organisations that pay by invoice.

## Tasks
- [ ] F27.1 Owner decides the Plus contents (the price was decided 2026-11-10 and [[Pricing]] now matches). Fix `PLUS_INCLUDES` and `USER_PLANS` in `worker/plans.js` to match.
- [ ] F27.2 Tables, a webhook endpoint with signature verification and idempotency, and tests with signed fixture events. Built for Polar in [[F36 Payment provider and billing pages]] (F36.2: migration 0031, `POST /api/webhooks/polar`, `test/billing.mjs`); left: a sandbox run with Polar's real events by the owner.
- [ ] F27.3 Checkout session endpoints (Plus monthly and yearly; host packs): built in F36.2. Left: the promo-aware start date (a Polar trial in days up to `plan_until`) instead of refusing checkout while promo Plus is active.
- [ ] F27.4 Settings → Plan: the current plan, renewal date, Upgrade (pre-contract box, express-start tick box), Manage or cancel (Portal). F36.3 drew Upgrade, the boxes and Manage or cancel behind the switch; left: the renewal date and status from `billing_subscriptions`.
- [ ] F27.5 Lifecycle emails (`accounts` stream): welcome to Plus, renewal reminder, payment failed, cancelled, refund confirmation.
- [ ] F27.6 Downgrade behaviour (hide extra cards, keep data) and resubscribe restores them, with tests.
- [ ] F27.7 Host card payments for credit packs: checkout, the `order.paid` grant and the refund claw-back are built in F36.2 and the page in F36.3; the invoice path is kept. Left: a sandbox run by the owner.
- [ ] F27.8 Terms and Privacy text drafts for the owner's lawyer review (don't publish them without the owner's approval). First drafts are in the checklist above.
- [ ] F27.9 Admin: subscriptions list, revenue total over the last 12 months (VAT watch), refunds link to the Polar dashboard.

## Owner steps
1. A Polar account for the business (sandbox first at sandbox.polar.sh, then live). Products for Plus monthly and yearly and each self-serve host pack, priced as `PLUS_PRICE` and `HOST_SKUS`. Customer Portal on with cancellation allowed. Full list in [[Deployment]].
2. A webhook endpoint `https://lanyd.fyi/api/webhooks/polar` with the events above. `wrangler secret put POLAR_ACCESS_TOKEN` and `POLAR_WEBHOOK_SECRET`; set `POLAR_PRODUCTS`, `SELLER_NAME` and `SELLER_ADDRESS`.
3. Clear the blockers above: entity, address, ICO, and a lawyer review.
4. Test in Polar's sandbox on a staging or local site first. `BILLING_ENABLED = "1"` on the live site only after the owner signs off.

## Acceptance checks
- [ ] In Polar's sandbox: subscribe, renew, fail payment → grace → Free, resubscribe → cards back.
- [ ] Cancelling from Settings takes two taps and ends Plus at the period end. Cancelling within 14 days refunds pro rata.
- [ ] Someone with promo Plus is not charged before their promo end date.
- [ ] A replayed webhook does nothing the second time.

## Log
-

Related: [[Pricing]], [[Business Model]], [[Host Portal and Billing]] · back to [[00 Master To-Do]]
