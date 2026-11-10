---
tags: [roadmap, feature, host, promo]
id: F20
priority: P2
phase: 3
size: M
status: Not started
needs: [F10, F04]
---
# F20 Host promo codes for event credits

**Priority:** P2 · **Phase:** 3 Host tools · **Size:** M · **Needs:** [[F10 Separate host accounts on host subdomain]], [[F04 Redeem page placeholder]] · back to [[00 Master To-Do]]

## What the owner asked for
Promo codes for event hosts too, giving them **event credits**.

## Current state
- `promo_codes` / `promo_claims` (migration 0017) and `worker/promo.js` give attendees Lanyard Plus (`reward`, `days`, `max_uses`, first-N with queue position, waitlist).
- Host credits live in `credits` (`events_granted`, `events_used`, `expires_at`, `reason`, `granted_by`). Admin grants them by hand.

## Plan
### Data
Migration:
- `promo_codes` adds `audience TEXT NOT NULL DEFAULT 'user'` (`user` | `host`), `credits INTEGER` (event credits for host codes), `credit_days INTEGER` (how long they last, default 365), and optionally `org_kinds TEXT` (JSON list, e.g. `["society"]`).
- `host_promo_claims (code, org_id, host_account_id, position, granted, created_at, PRIMARY KEY (code, org_id))`. A code is claimed once per organisation **and** once per host account. That stops someone making five orgs to farm credits.

### Rules
- Must be signed in to a host account with a verified email ([[F10 Separate host accounts on host subdomain]]).
- Must have an organisation. A society or institution must be **approved** before credits are granted. Before approval, the claim is held and granted when an admin approves; tell the host so.
- First-N limits and the "you're number 63" message work the same way as user codes. Reuse the batch insert pattern from `promo.js`.
- Granting inserts a `credits` row: `events_granted = credits`, `expires_at = now + credit_days`, `reason = 'promo:<CODE>'`, `granted_by = 'promo'`.
- User codes can't be redeemed on the host site and host codes can't be redeemed on the main site. Show a friendly pointer to the other site.

### UI
- Host site `/redeem` and `/redeem/:code`: the same ticket-style card as the attendee `Redeem.vue` (copy that component's look), "Add 3 free events to <org>". If the host has more than one org, a picker.
- The Billing page shows "Have a promo code?".
- Admin promo form: an audience selector, and for host codes the credit and days fields.
- The placeholder is never a real code ([[F04 Redeem page placeholder]]).

## Tasks
- [ ] F20.1 Migration and admin create/list for host codes, with tests.
- [ ] F20.2 Host redeem endpoint: limits, approval hold, once per org and per host, credit row. Tests include the 51st claimant and a duplicate press.
- [ ] F20.3 Host redeem page and Billing link.
- [ ] F20.4 Grant held claims when an admin approves an org (hook into the approval code in `worker/admin.js`).

## Acceptance checks
- [ ] A new individual host redeems a 3-credit code and can create 3 events.
- [ ] A pending society's claim shows "held until approved", and the credits appear after approval.
- [ ] The same host can't claim the same code again with a second org.

## Log
-

Related: [[Pricing]], [[Host Portal and Billing]] · back to [[00 Master To-Do]]
