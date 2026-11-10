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
- Free: 3 cards. **Plus:** 12 cards and custom strap colour, £2.99/month or £24/year (waitlist stage).
- Never paywalled: connecting, the selfie, a basic profile. See [[D001 Hosts pay, attendees free]].

## Billing mechanics now
Invoice / purchase order requests, manual credit grant by admin. Stripe later. See [[D009 Manual invoicing before Stripe]] and [[Host Portal and Billing]].

## Planned phases (from the plan docs)
1. Free pilots (0-6 months): show list price on free invoices ("£25, waived"), credits expire to create a natural ask.
2. First paid customers (6-18 months): early-adopter discount 30-50% for first paid year.
3. Mature (18+ months): annual university licences (~£3,000-10,000 by student population), sponsor marketplace, organiser tiers.

## Open pricing questions
- What do careers services already pay for event tools? (see [[Open Questions]])
- Societies usually say yes to under £30 without a vote: check.

Related: [[Business Model]], [[Customers and Buyers]]
