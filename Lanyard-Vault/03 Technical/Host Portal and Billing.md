---
tags: [technical, host, billing]
---
# Host Portal and Billing

## Host accounts and organisations
- The portal is its own site, `host.lanyd.fyi`, with its own account: an email that receives a sign-in code ([[Auth and Sessions]], [[D020 Host accounts separate from attendee accounts]]). It has nothing to do with a person's Lanyard card.
- Setup, each step saved on the server: email code, then details (full name, use case, frequency, size, referral), then the Host Terms, then "under my own name" or an organisation of type society, institution or company. Every step has Back and Sign out.
- Before F10 (2026-11-10) a host account was the attendee account. Those accounts, with their organisations and events, are wiped by the host reset (option B, `scripts/reset-hosts.mjs`, owner step); invoice records are kept.
- **Societies and institutions need admin approval** (university email, society proof). Companies and individuals pay standard prices straight away.
- Roles: owner, staff, sponsor_viewer. Ownership can be transferred to another host account by its email (new owner must accept, and gets an email). Team invites can name the colleague's host email (emailed to them, only that account can use it) or be a plain code. Support tickets cover leader or email changes; an approved email change also changes how that account signs in.
- Admin (`/admin`): host account list and search, switch an account off, attach an organisation with no members to a host email.

## Event lifecycle
Create event (uses a credit) → event QR + rotating code → attendees check in → live view → end event → report, feedback, summary email. Events can be duplicated.

## Credits
`credits` table with expiry; first org gets 3 free events; societies get 1 free event a week up to 200 check-ins; packs defined in `worker/plans.js` (`HOST_SKUS`). See [[Pricing]].

## Billing without Stripe
1. Host submits a request under Host portal → Billing (sku, quantity, contact, PO).
2. Admin lists open requests with a D1 query, invoices, receives payment.
3. Admin inserts a `credits` row and sets the request to `paid`. Exact SQL is in `DEPLOY-V2.md`.
See [[D009 Manual invoicing before Stripe]].

## Emails
From `hosts@lanyd.fyi`: sign-in codes, application received and decided, ticket decisions, transfers waiting, team invites, and the recap a day after an event. All link to the host portal's pages (`host.lanyd.fyi/`, `/events/:id`, `/account#join`).

## Present and print (F19)
The live tab has two buttons. **Present** opens `/events/:id/present` in a new tab: a page for a screen or projector with the event name, venue and time, a large QR (the main site's check-in address, never `host.*`), the code, "Or go to lanyd.fyi/e/CODE" and how many people have checked in. It asks the same host-only `/live` route every 15 s (not while the tab is hidden) and shows nothing but the event's own details and that one count, so a room can see it ([[D004 Aggregate-only host analytics]]); a new check-in code appears without a reload. **Print poster** opens `/events/:id/print`: one A4 portrait page of black ink on white with a thin strap rule, a QR about 100 mm wide, the code and three steps. Both are reachable only by a signed-in host of the event's organisation (the page's data comes from `/live`: 401 signed out, 404 for another organisation's event). There is no link that works without signing in (see the plan note's question).

## Data hosts get
Aggregate report (attendance, connections per person, courses/tags), CSV, feedback results, optional sponsor leads (opt-in only). Hosts never see who connected with whom. See [[D004 Aggregate-only host analytics]].

Related: [[Integrations and Email]], [[API Surface]]
