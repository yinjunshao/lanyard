---
tags: [technical, host, billing]
---
# Host Portal and Billing

## Host accounts and organisations
- Host signs up with a profile (use case, frequency, size, referral), creates an organisation of type society, institution, company or individual.
- **Societies and institutions need admin approval** (university email, society proof). Companies and individuals pay standard prices straight away.
- Roles: owner, staff, sponsor_viewer. Ownership can be transferred (new owner must accept). Support tickets cover leader or email changes.

## Event lifecycle
Create event (uses a credit) → event QR + rotating code → attendees check in → live view → end event → report, feedback, summary email. Events can be duplicated.

## Credits
`credits` table with expiry; first org gets 3 free events; societies get 1 free event a week up to 200 check-ins; packs defined in `worker/plans.js` (`HOST_SKUS`). See [[Pricing]].

## Billing without Stripe
1. Host submits a request under Host portal → Billing (sku, quantity, contact, PO).
2. Admin lists open requests with a D1 query, invoices, receives payment.
3. Admin inserts a `credits` row and sets the request to `paid`. Exact SQL is in `DEPLOY-V2.md`.
See [[D009 Manual invoicing before Stripe]].

## Data hosts get
Aggregate report (attendance, connections per person, courses/tags), CSV, feedback results, optional sponsor leads (opt-in only). Hosts never see who connected with whom. See [[D004 Aggregate-only host analytics]].

Related: [[Integrations and Email]], [[API Surface]]
