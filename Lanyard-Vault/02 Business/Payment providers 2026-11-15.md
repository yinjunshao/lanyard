---
tags: [business, payments, billing, research]
created: 2026-11-15
---
# Payment providers (2026-11-15)

Desk research for [[F36 Payment provider and billing pages]]. Polar and Dodo Payments are the owner's two options. Stripe is the baseline, as planned in [[F27 Lanyard Plus and billing]]. Not legal or tax advice.

## Summary
- Both Polar and Dodo are **merchants of record** (MoR): they sell to the customer and handle VAT and sales tax. Stripe Payments does not; Stripe's own MoR product, Managed Payments, costs 3.5% extra.
- **Cost on small charges is the big difference.** Using the assumption below, a £1.49 monthly charge costs about 32% in fees on Polar, about 26% on Dodo and about 15% on plain Stripe. On a £25 pack it is about 8%, 7% and 2%.
- **Polar** is the better fit of the two: Standard Webhooks, clear per-customer discount limits (by customer, email or card), documented UK payouts, sandbox, a funded seed-stage company. Its fees are the highest.
- **Dodo** is cheaper on the fixed fee but has a $100 default payout threshold, a $5 fee on payouts under $1,000, twice-monthly payouts, conflicting docs, and public complaints about holds. It is a smaller company.
- **Neither** shows bank transfer or purchase-order invoicing for universities. Keep the manual invoice path ([[D009 Manual invoicing before Stripe]]) whichever is chosen.
- All pages read on 2026-11-15. Fees are in USD for Polar and Dodo and GBP for Stripe. Pages the fetch tool could not open are listed at the end.

## Assumption used for cost sums
Polar and Dodo list fixed fees in US cents. I assumed **$1 = £0.75** to compare. This is my assumption, not a quoted rate. Each sum is: percentage of price plus fixed fee. Payout fees, disputes and VAT are left out (see section 2). All three charge UK cards as "international" or UK-card rates as shown.

| Charge | Polar Starter | Dodo | Stripe UK card | Stripe non-UK card | Stripe + Managed Payments (UK card) |
| --- | --- | --- | --- | --- | --- |
| Rate used | 5% + 50c + 1.5% non-US card = 6.5% + 50c | 4% + 40c + 1.5% non-US + 0.5% subscription = 6% + 40c (5.5% + 40c for one-off) | 1.5% + 20p | 3.15% + 20p | 1.5% + 3.5% + 20p |
| £1.49 monthly | about £0.47 (32%) | about £0.39 (26%) | about £0.22 (15%) | about £0.25 (17%) | about £0.27 (18%) |
| £11.99 yearly | about £1.15 (10%) | about £1.02 (8.5%) | about £0.38 (3.2%) | not worked | about £0.80 (6.7%) |
| £25 one-off | about £2.00 (8.0%) | about £1.68 (6.7%) | about £0.58 (2.3%) | about £0.99 (3.9%) | about £1.45 (5.8%) |

- If the £1.49 price is VAT-inclusive, one sixth (20% UK VAT) goes to the tax authority first, so the share lost to fees is larger. Whether Polar and Dodo show prices with tax added or included: unclear. Check in the sandbox.
- Stripe Billing is extra for subscriptions: 0.7% of Billing volume on pay as you go ([Stripe pricing](https://stripe.com/gb/pricing), 2026-11-15). Not in the Stripe columns above.

## 1. Fees and payouts
**Polar** ([fees](https://polar.sh/docs/merchant-of-record/fees), 2026-11-15)
- Starter: free plan, 5% + 50c. Pro $20 a month, 3.8% + 40c. Growth $100 a month, 3.6% + 35c. Scale $400 a month, 3.4% + 30c. Early Member (orgs created before 27 May 2026): 4% + 40c, plus 0.5% on subscriptions.
- International (non-US) cards: +1.5%. Disputes: $15 each, not refundable. Initial fees are not returned on a refund.
- Payout fees are passed through from Stripe: $2 a month with active payouts, 0.25% + $0.25 per payout, currency conversion 0.25% (EU) to 1% (other countries).
- UK is on the payout country list ([supported countries](https://polar.sh/docs/merchant-of-record/supported-countries)). Payouts use Stripe Connect Express. Minimum payout: the docs page was not opened; a search summary of [payouts](https://polar.sh/docs/features/finance/payouts) says the default is $10. Treat as unconfirmed. Payout currency to a UK bank: unclear.

**Dodo Payments** ([pricing](https://dodopayments.com/pricing), 2026-11-15)
- 4% + 40c per domestic US transaction. Non-US cards +1.5%. Subscriptions +0.5%. PayPal and buy-now-pay-later +3%. Refunds $1 each. Disputes $30 each. No setup or monthly fee.
- UK-specific pricing: not found. Currency conversion: "standard foreign exchange rates apply", no figure.
- Payouts ([docs](https://docs.dodopayments.com/features/payouts)): balances held in USD, GBP and EUR wallets. Default minimum $100 (lowest settable $50). Fee $5 for payouts under $1,000. Default twice a month (4th and 18th). The pricing page lists standard payouts as "Free" but its FAQ shows the $5 fee, so the page conflicts with itself.
- UK is on the accepted list for merchant accounts and payouts, but only where the ID used for checks was issued in a listed country ([accepted countries](https://docs.dodopayments.com/miscellaneous/accepted-countries-and-territories)).

**Stripe** ([pricing](https://stripe.com/gb/pricing), 2026-11-15)
- UK standard cards 1.5% + 20p, UK premium cards 2.8% + 20p, EEA 2.5% + 20p, international 3.15% + 20p. Extra 2% where currency conversion is needed.
- Standard payouts to a UK bank: free. Disputes £20 each.
- Stripe Tax: 0.5% of a transaction in places you are registered, or £0.40 per transaction by API.
- Managed Payments: 3.5% per transaction on top of the Payments fees.

## 2. Merchant of record, VAT and consumer law
- **Polar:** MoR for all transactions. It "handles sales taxes" including US sales tax, EU VAT and Canadian GST, and files and remits them using Stripe Tax ([MoR introduction](https://polar.sh/docs/merchant-of-record/introduction)). You stay responsible for your own income tax. Seller on receipts is Polar Software, Inc. ([buyer terms](https://polar.sh/legal/checkout-buyer-terms)).
- **Dodo:** MoR. It handles VAT, GST and sales tax, files returns, issues invoices, and reverses tax on refunds. Chargebacks stay the merchant's responsibility ([MoR docs](https://docs.dodopayments.com/features/mor-introduction)). Seller is Dodo Payments, Inc.; its buyer terms give no address ([buyer terms](https://dodopayments.com/archive/buyer-terms)).
- **Stripe:** not MoR by default. Stripe Tax calculates tax but does not file it. Managed Payments makes Stripe the MoR for digital products in more than 80 countries, with Checkout and Payment Links only. UK businesses are on the supported list ([eligibility](https://docs.stripe.com/payments/managed-payments/eligibility)).
- **UK VAT:** F27 says registration is needed above £90,000 turnover in 12 months. Our own UK VAT is a non-issue until then. A MoR still charges VAT on its own sales; how it appears to us in payouts: unclear.
- **EU and US consumers:** a UK seller to EU consumers owes VAT from the first sale, I believe, and US states set their own thresholds. This is the main thing a MoR removes. Not checked against a source today. Ask an accountant. For a UK-student-first product the exposure may be small.
- **Consumer duties (pre-contract information, 14-day cancellation, refunds):** the MoR is the seller, so duties at its checkout fall mainly on it. Neither buyer-terms page states the 14-day right. Polar keeps "non-waivable consumer rights" and says cancelling takes effect at the next billing cycle, with elapsed periods non-refundable "except as required by law". Dodo says withdrawal rights are lost once digital content is transmitted, says refunds are at its "sole discretion", and asks for notice 48 hours before the period ends. UK law needs the express-start request and acknowledgement F27 describes; whether either checkout captures it: not found. Our own pages must still show price, renewal and how to cancel. A lawyer should confirm who owes what.
- **Renewal reminders (DMCC subscription rules, expected early to spring 2027 per F27):** who sends them when a MoR bills: not found for either provider. Plan to send our own.
- **Refunds in 60 days:** Polar and Stripe Managed Payments may refund within 60 days at their discretion to prevent chargebacks ([Polar refunds](https://polar.sh/docs/features/refunds) via search; Stripe eligibility page above). That can reverse a credit pack we have already granted, so the webhook handler must claw back credits.

## 3. Billing features
| Need | Polar | Dodo | Stripe |
| --- | --- | --- | --- |
| Monthly and yearly plans | Yes ([products](https://polar.sh/docs/features/products)) | Yes, interval in months or years ([subscriptions](https://docs.dodopayments.com/features/subscription)) | Yes (Billing) |
| Trials | Yes, a number and a unit (days to years); no end-date field found | `trial_period_days` per checkout, 0 to 10,000 | `trial_end` assumed in F27; not confirmed on the API page read |
| Start later for promo users | Work out the days from today; not tested | Same, in days | Same, or a timestamp |
| One-off packs | Yes | Yes (single payment) | Yes |
| Quantities | Seat pricing only; other quantity: not found | `quantity` set by us in the cart | `quantity` per line item |
| Codes: cap per code | Yes, across all customers | Yes ([codes](https://docs.dodopayments.com/features/discount-codes)) | `max_redemptions` ([coupons](https://docs.stripe.com/billing/subscriptions/coupons)) |
| Codes: cap per customer | Yes. Matches by customer ID, email (ignoring plus-aliases) or card ([discounts](https://polar.sh/docs/features/discounts)) | Yes, "by any single customer"; how a customer is matched: not found | Restrict to one customer or first-time orders only; no plain "N per customer" |
| Code dates, product limits, repeat cycles | Yes: start, end, once, several months, forever | Yes: start, expiry, cycle limit, percentage or flat | Yes |
| Customer portal, self-serve cancel | Yes; cancel, update card, download invoices ([portal](https://polar.sh/docs/features/customer-portal)) | Yes; cancel now or at period end ([portal](https://docs.dodopayments.com/features/customer-portal)) | Yes (Customer Portal) |
| Refunds | Dashboard and API; fees not returned | Dashboard, $1 per refund, tax reversed | Dashboard and API |
| Invoices for universities (purchase order or bank transfer) | Portal invoices only; bank transfer or purchase order: not found | PDF invoice per sale; bank transfer or purchase order: not found | Invoicing (0.4% Starter) and bank-debit methods exist; **not** available under Managed Payments ("one-off invoice" unsupported) |

## 4. Webhooks and trust
- **Polar:** Standard Webhooks. Headers `webhook-id`, `webhook-timestamp`, `webhook-signature`. Secrets created from 8 September 2026 are plain Standard Webhooks; older secrets use a Polar variant. Retries up to 10 times with exponential backoff; 10-second timeout; endpoint disabled after 10 straight failures ([delivery](https://polar.sh/docs/integrate/webhooks/delivery)). The page does not say `webhook-id` is the event id, but it is the Standard Webhooks message id. A database outage delayed webhooks on 12 June 2026 ([status](https://status.polar.sh/incident/922011), via search).
- **Dodo:** Standard Webhooks, same three headers; `webhook-id` is documented "for idempotency checks". Retries: the docs conflict (8 attempts over about 28 hours on one page, 10 retries on another). Manual replay from the dashboard ([webhooks](https://docs.dodopayments.com/developer-resources/webhooks)).
- **Stripe:** `Stripe-Signature` header (`t=` and `v1=`, HMAC-SHA256 of `timestamp.body`). Live retries for up to three days; event ids are the idempotency key; delivery order is not guaranteed ([webhooks](https://docs.stripe.com/webhooks)).
- **Price tampering:** Polar uses catalogue prices unless our server passes ad-hoc prices; a customer can only change the amount on a pay-what-you-want product, and can pick among the products we list or type a code if we allow it ([checkout create](https://docs.polar.sh/api-reference/checkouts/create-session)). Dodo's `amount` is editable only on pay-what-you-want products; code entry and add-on editing are flags we set ([checkout create](https://docs.dodopayments.com/api-reference/checkout-sessions/create.md)). Stripe prices come from Price ids we pass. For all three: build the session on the Worker, set the product, quantity and code ourselves, and turn customer code entry off if we apply the promo.
- **Negative or zero quantity:** not found in any docs. Test in each sandbox. Never accept a quantity from the browser.
- **Redirect:** Polar's `success_url` can carry `checkout_id`, meant for fetching the order from our backend; the docs do not warn about trusting it. Treat every provider's redirect as a hint only. Grant plans and credits only from a verified webhook (or a server-side fetch of the order), once per event id.

## 5. Running on a Cloudflare Worker, and test mode
- **Polar:** plain HTTPS API; the TypeScript SDK wraps `fetch` and takes a custom fetcher. Cloudflare Workers support is not stated; the old repo is archived and points to a newer SDK in `polarsource/polar` ([polar-js](https://github.com/polarsource/polar-js)). Sandbox at sandbox.polar.sh and `sandbox-api.polar.sh`, a separate account, test card 4242 4242 4242 4242 ([sandbox](https://polar.sh/docs/integrate/sandbox)).
- **Dodo:** REST API and Node SDK; Workers not covered. Test mode: switch off Live Mode, use `test_` keys; live and test keys do not cross ([testing](https://docs.dodopayments.com/miscellaneous/testing-process), via search).
- **Stripe:** plain HTTPS works from a Worker; Web Crypto for signatures (already planned in F27). Sandboxes and `stripe listen` for testing.
- Either MoR can be called with `fetch` and a bearer token, and verified with Web Crypto HMAC. I did not run code.

## 6. Onboarding and acceptable use
- **Polar:** individuals allowed if Stripe Connect Express supports "individual" in your country; a payout account is needed before going live; the account owner is the legal recipient ([accounts](https://polar.sh/docs/features/finance/accounts)). SaaS and digital products are allowed. Banned: physical goods, services, marketplaces, resale of licences. Polar may refuse any product ([acceptable use](https://polar.sh/docs/merchant-of-record/acceptable-use)). A first-payout review is documented ([account reviews](https://docs.polar.sh/merchant-of-record/account-reviews), via search). Whether the UK individual type is on the list: unclear.
- **Dodo:** individuals allowed; the account must match the verified person or entity. Business verification for registered entities. Reviews at activation, before first payout, on triggers and periodically; payouts may be withheld on non-response ([monitoring policy](https://docs.dodopayments.com/miscellaneous/review-monitoring-policy)). Prohibited list is in a separate policy that was not opened.
- **Stripe:** UK sole traders allowed for Payments (my knowledge; not checked today). Managed Payments is by eligibility review, direct accounts only, and excludes professional services and "live in-person events". Host event packs are software credits, but Stripe could read them as event sales. Ask Stripe before relying on it.
- Lanyard's host side (credit packs for check-ins) and Plus (cards and AI allowance) are software, which both MoRs accept on their pages. The owner should still say plainly at sign-up what Lanyard does. See the legal-entity blockers in [[F27 Lanyard Plus and billing]].

## 7. Company, reputation and support
- **Polar:** Polar Software Inc.; CEO Birk Jernström; $10m seed led by Accel, June 2025 ([TechCrunch](https://techcrunch.com/2025/06/17/after-shopify-bought-his-last-startup-birk-jernstrom-wants-to-help-developers-build-one-person-unicorns)); MoR product launched September 2024 (search results); open source. Prices moved to tiers in 2026 (5% + 50c entry). One review site says support speed is the most common complaint (learnwithhasan.com, audited April 2026, via search; not verified). No reports of frozen or delayed Polar payouts found.
- **Dodo:** founded 2023, Bengaluru-linked, $1.1m pre-seed in February 2025 ([company post](https://dodopayments.com/blogs/dodo-payments-raises-1-1m-to-simplify-global-payments)); legal name Dodo Payments, Inc., address not shown. Trustpilot reviews (about 113) and a help-forum thread report payouts on hold and verification stuck for weeks ([Trustpilot](https://uk.trustpilot.com/review/dodopayments.com?page=2), [forum](https://dodopayments.featurebase.app/p/business-verification-stuck-for-almost-a-month-still-showing-submitted)). These are anecdotes; Dodo replies that holds follow risk review. Comparison pages written by Dodo (about Polar) are marketing, so ignored for facts.
- **Stripe:** long established; the baseline for reliability and documentation. Account freezes happen to some merchants with high disputes; I did not research Stripe complaints today.

## 8. Comparison
| | Polar | Dodo Payments | Stripe |
| --- | --- | --- | --- |
| MoR | Yes | Yes | No (Managed Payments adds it, +3.5%) |
| £1.49 monthly cost | about 32% | about 26% | about 15% (18% with Managed Payments) |
| £25 one-off cost | about 8% | about 6.7% | about 2.3% (5.8% with Managed Payments) |
| Payout to UK bank | Yes, via Stripe; $2 a month + 0.25% + $0.25 | Yes; $100 default minimum; $5 under $1,000; twice a month | Yes; free |
| Webhooks | Standard Webhooks, 10 retries | Standard Webhooks, 8 or 10 retries (docs conflict) | Own scheme, 3 days of retries |
| Per-customer code cap | Yes, by ID, email or card | Yes, matching unknown | First-time or one-customer only |
| University invoice by transfer or PO | Not found | Not found | Yes outside Managed Payments |
| Sandbox | Yes | Yes | Yes |
| Individuals / sole traders | If Stripe supports it in the UK; unclear | Allowed | Allowed (unchecked today) |
| Reputation | Funded, open source, few complaints found | Small, public hold complaints | Best known |
| Main risk | Highest fees; thin support reports; Stripe underneath anyway | Payout holds and a high payout floor; docs that disagree | We own VAT, EU and US tax and consumer duties |

## 9. Recommendation
- **Choose Polar of the two** if the owner wants a merchant of record. It has the clearest discount limits, documented UK payouts, Standard Webhooks and a funded team. Pay the higher fee knowingly: about 32p of every £1.49 charge at the Starter rate.
- **Consider plain Stripe seriously.** It costs about half as much on small charges and gives bank-transfer invoices for hosts. The price is that we handle tax and consumer duties ourselves. That may be acceptable while sales are UK students and turnover is below the VAT threshold, but it needs the entity, address and ICO steps in F27.
- **Do not pick Dodo first.** The cheaper fixed fee is outweighed by payout friction, conflicting docs and hold complaints.
- **Either way:** keep invoices for hosts by hand; grant only from a verified webhook; add a replay and refund claw-back test; send our own renewal reminders.

**Questions for the owner**
1. Is paying about 30p on every £1.49 charge acceptable for not handling VAT and tax filings?
2. Are you comfortable that most hosts will pay by invoice, outside the provider?
3. What is the legal entity or sole-trader status for the provider account? ID checks and payouts follow the account owner.

## Not found
- Dodo and Polar bank-transfer or purchase-order support; negative-quantity behaviour; MoR renewal-reminder duty; Dodo's per-customer matching rule; Polar payout minimum (unconfirmed); Dodo prohibited-business list; UK sole-trader acceptance for Polar and Dodo.
- Not opened (404 or blocked): [Polar refunds (guessed URL)](https://polar.sh/docs/merchant-of-record/refunds), [Polar sandbox feature page](https://polar.sh/docs/features/sandbox), [Dodo features/webhooks](https://docs.dodopayments.com/features/webhooks), [Dodo test mode page](https://docs.dodopayments.com/features/test-mode), [Dodo supported countries (old URL)](https://docs.dodopayments.com/miscellaneous/supported-countries).

Related: [[Pricing]], [[Host Portal and Billing]] · back to [[00 Home]]
