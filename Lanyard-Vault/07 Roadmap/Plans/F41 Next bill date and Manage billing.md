---
tags: [roadmap, feature, billing]
id: F41
priority: P1
phase: 8
size: S
status: Not started
needs: [F36]
---
# F41 Next bill date and Manage billing

**Priority:** P1 · **Phase:** 8 Owner requests (2026-11-18) · **Size:** S · **Needs:** [[F36 Payment provider and billing pages]] · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-18)
"I'm not sure if the billing page is done yet. Currently in settings/plan, it just displays the user's current plan, but not a billing page or any connection to go to their managing billing page. And also, for example, information about when their plan expires, or actually call it when their next bill is."

## Current state (survey 2026-11-18)
- `src/views/settings/SettingsPlan.vue` shows the plan label, Plus prices from `GET /api/billing/plans`, PayBox, and "Manage or cancel" (`POST /api/billing/portal`), but that button only shows when `plans.cardPayments` is true. Production does not set `BILLING_ENABLED`, so production shows "Paid plans are coming soon".
- `worker/billing/routes.js`: `GET /api/billing/plans` (about 65-74), `POST /api/billing/portal` (about 92-100, needs a paid or refunded `billing_orders` row). The webhook (`applyEvent`, about 124-209) writes `users.plan_until` and `billing_subscriptions.current_period_end` and `cancel_at_period_end`; nothing reads them for the UI.
- `GET /api/me` (`worker/index.js`) has no plan end date. `worker/index.js` has the owner's uncommitted changes, so this feature does not touch it.
- Plus from a promo code sets `users.plan_until` with no order, so the portal 404s for those members.

## Plan
1. `GET /api/billing/plans`, when signed in, adds a `mine` object: `{ tier, until, renews, cancelAtPeriodEnd, managed }`. `until` is `users.plan_until` (ISO date or null). `renews` is true only when there is an active subscription row for this user with `cancel_at_period_end = 0`. `managed` is true when a paid or refunded order exists (the portal would answer). Signed out: no `mine`. It works whether or not billing is on (reads only, takes no money). Only the user's own rows, never another user's.
2. Settings > Plan, a "Your plan" block under the plan label:
   - Plus, renewing: "Next bill on 12 December 2026" plus the price for that interval if known.
   - Plus, cancelled at period end: "Plus ends on 12 December 2026. You won't be charged again."
   - Plus from a code (no subscription): "Plus until 12 December 2026, from a code."
   - Free: nothing extra.
   - Dates in `en-GB` long form, in the user's local time.
3. "Manage billing" button (rename from "Manage or cancel") shows whenever `mine.managed` is true, even if new checkouts are switched off, with the hint "Change your card, see invoices or cancel on Polar's secure page." Keep the existing working state from [[F38 Loading states]] and errors from [[F39 Informative error messages]].
4. No new migration. No change to the webhook, checkout or prices.

## Tasks
- [ ] F41.1 Worker: `mine` on `GET /api/billing/plans`, with tests in `test/billing.mjs`: signed out has no `mine`; free user; renewing subscriber; cancelled at period end; promo-only Plus (`managed` false); user A never sees user B's subscription; works with billing off.
- [ ] F41.2 SettingsPlan: the "Your plan" block and the Manage billing button rules; browser check at 375 and 1280 px, light and dark, by seeding local rows; vault notes ([[API Surface]], [[Screens and Routes]], [[Host Portal and Billing]] if touched).

## Acceptance checks
- [ ] A local user with an active, renewing subscription whose period ends 2026-12-12 sees "Next bill on 12 December 2026" and a Manage billing button, with `BILLING_ENABLED` unset.
- [ ] The same user with `cancel_at_period_end = 1` sees "Plus ends on 12 December 2026" and no "Next bill".
- [ ] A promo-code Plus user sees "Plus until ..., from a code." and no Manage billing button.
- [ ] A free user sees neither line nor the button.
- [ ] `npm test` passes.

## Log
-

Related: [[F27 Lanyard Plus and billing]] · [[F36 Payment provider and billing pages]] · back to [[00 Master To-Do]]
