---
tags: [business, pricing]
---
# Pricing

**Source of truth is the code** (`worker/plans.js`, `src/views/Hosts.vue`). Older prices in [[Source Documents]] (e.g. £20-40 per society event) were suggestions and have been superseded.

## Hosts
| Host type | Price |
| --- | --- |
| Student societies (approval needed) | Free: 1 event a week, up to 200 check-ins. Beyond: £5 for 1, £20 for 5, £25 term pass |
| Universities and institutions (approval needed) | £15 per event, £59 for 5, £149 for 15 (about 40% off standard) |
| Companies and organisers | £25 per event, £99 for 5, £249 for 15 |
| Careers services and students' unions | From £300 per term (quoted, not self-serve) |
| Enterprise / university licence | Quoted; own subdomain, DPA, SSO, integrations |

- 1 credit = 1 event up to 300 check-ins; larger events use 2 credits; 1,000+ quoted. Credits last 365 days; term pass = 99 credits for 120 days.
- A new organisation gets 3 free events (365 days).
- Societies are hard-capped at 200 check-ins per event.

## Individuals
- Free: 3 cards. **Plus:** £1.49 a month or £11.99 a year (`PLUS_PRICE` in `worker/plans.js`; the owner's decision of 2026-11-10). What Plus includes is still a proposal: 12 cards, any card colour (the whole colour wheel; free cards choose from ten presets) and your own text colour, your own card code and bigger AI allowances (table in [[F27 Lanyard Plus and billing]]). Waitlist stage: no money is taken until the legal identity is done.
- Never paywalled: connecting, the selfie, a basic profile. See [[D001 Hosts pay, attendees free]].

## Billing mechanics now
Invoice / purchase order requests, manual credit grant by admin. Card payment through **Polar** (merchant of record) is built behind a switch that is off ([[D041 Polar as merchant of record behind one provider module]], [[F36 Payment provider and billing pages]]); invoices stay for universities and anyone who wants one. See [[D009 Manual invoicing before Stripe]] and [[Host Portal and Billing]].

**Fees:** Polar's Starter rate is 5% + 50c plus 1.5% for non-US cards, so about 32% of a £1.49 monthly charge, about 10% of £11.99 a year and about 8% of a £25 pack (assuming $1 = £0.75). Sums, sources and the Dodo and Stripe comparison: [[Payment providers 2026-11-15]]. Worth revisiting a yearly-only Plus or a higher monthly price.

## Planned phases (from the plan docs)
1. Free pilots (0-6 months): show list price on free invoices ("£25, waived"), credits expire to create a natural ask.
2. First paid customers (6-18 months): early-adopter discount 30-50% for first paid year.
3. Mature (18+ months): annual university licences (~£3,000-10,000 by student population), sponsor marketplace, organiser tiers.

## Open pricing questions
- What do careers services already pay for event tools? (see [[Open Questions]])
- Societies usually say yes to under £30 without a vote: check.

Related: [[Business Model]], [[Customers and Buyers]]
