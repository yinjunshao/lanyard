---
tags: [roadmap, feature, host, promo]
id: F20
priority: P2
phase: 3
size: M
status: Done
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
- [x] F20.1 Migration and admin create/list for host codes, with tests.
  - Migration `0025_host_promo_codes.sql` (adds only; safe before the new code is deployed): `promo_codes` gets `audience` (default `user`), `credits`, `credit_days`, `org_kinds`; new `host_promo_claims` with a database rule of one claim per code and organisation and one per code and host account. A host code stores `reward = credits` and its days in `days` as well (that column is NOT NULL). The attendee flow in `worker/promo.js` now asks for `audience = user` everywhere, so a host code looks like any unknown code there.
  - Admin (`worker/admin.js`): create takes `audience: host` with credits (1 to 50), credit days (1 to 730, default 365), a limit that is required (1 to 10,000), optional start and end dates and optional organisation kinds; the list carries claims, held and credits issued per code (totals only); a new `/edit` route changes the limit (never below the number used, never cleared for a host code), the dates and the note; switching off works as before and a missing code is a 404.
  - `scripts/reset-hosts.mjs` and `test/hosts-accounts.mjs` updated, see the Log.
  - Tests: `test/promo-host.mjs`, new, in `npm test` before the budget check.
- [x] F20.2 Host redeem endpoint: limits, approval hold, once per org and per host, credit row. Tests include the 51st claimant and a duplicate press.
  - `worker/host-promo.js`, registered from `hosts.js`: `GET /api/host/redeem/:code` (what it gives, and your own organisation's claim) and `POST /api/host/redeem/:code`. Host cookie only: signed out 401, the attendee cookie or the admin token is not a host sign-in, the main site answers 403 `wrong_site`. Needs a finished host account (details, Host Terms), a verified email, an organisation, and the role owner or staff (a sponsor viewer gets 403). The organisation is always the signed-in host's own; one in the request is ignored.
  - One transaction (`db.batch`): insert the claim only if the code is on, started, not ended and not full at that moment; count the use only if that claim was inserted; insert the credits row (`promo_<CODE>_<org id>`, so it can exist once only) when the organisation is approved. The claim records who, the organisation, credits, days, position, the credits row and when. Unique rules on (code, organisation) and (code, host account) stop a second claim; if two presses race, the loser's transaction is undone and it is shown the winner's claim as "already claimed".
  - Pending societies and institutions: the claim is held (takes a slot, credits issued on approval); Billing lists held claims. Rejected organisations are refused like an unknown code.
  - Rate limits with `bump()`: lookups 30 per 10 minutes per IP and per host account; wrong codes 30 an hour per IP and per host account; redeem presses 20 an hour per host account and 30 an hour per IP.
  - The host data export gains `promoCodes` (code, organisation, credits, days, when, held).
  - Tests, including the 51st claimant and a duplicate press: see `test/promo-host.mjs`. `test/harness.mjs` now runs one `db.batch` at a time, like D1, so racing requests meet the database rules instead of a nested BEGIN; the race tests hold every request at the door until all have arrived (checked: with the cap taken out of the SQL, the race tests fail).
  - Decision: a full, ended, switched-off, not-yet-started, unknown or wrong-audience code gets one identical 404, so nobody can find out which codes exist. That drops the plan's "you're number 63" message and waiting list for hosts (it would say a code exists). A claim number is kept in the record only.
- [x] F20.3 Host redeem page and Billing link.
  - `/redeem` and `/redeem/:code` on the host site: `HostRedeem.vue` (the same ticket look as the attendee page): "Add 3 free events to <organisation>", how long they last, how many are left, an explicit Add button (credits are money, so it does not claim on its own), then the result: added, held until approved, or already used. A code that cannot be used shows one message and a pointer to the main site for Plus codes. Not signed in: it keeps the code (host site, its own storage key) and the dashboard takes the host back to it once, after setup. No picker: an account has one organisation. A code box with the hint `e.g. ABCD1234`.
  - Billing: "Have a promo code?" link, a note for claims held until approval, and promo credits named in the history. Admin (`Admin.vue`): choose person or host code; host codes have credits, days, a required limit and organisation kinds; each code shows totals (claimed, credits issued, held) and a limit and end date can be changed.
  - Bundle: the page is inside the Billing chunk (one component serves both routes) so the entry's chunk list gains no name; the new route record itself costs 31 B gzip in the entry (PublicCard 50,981 to 51,013 B, PrivacyRequest 50,499 to 50,529 B; see the Log). Alternatives tried (an alias, one regex route, inline imports) were no smaller.
  - Browser (local servers, 1280 and 375 px, light and dark): the code page with a ticket and Add button, the added result (4 credits after 3 added to 1), the already-used result, an unknown code, the typed-code page, Billing with the link and "Promo code ..." in the history, the admin form for a host code, created through the page. Not checked in a browser: the held result (see F20.4) and the signed-out hand-back.
- [x] F20.4 Grant held claims when an admin approves an org (hook into the approval code in `worker/admin.js`).
  - `/api/admin/orgs/:id/review`: approving now runs the organisation's status change and the release of its held claims in one `db.batch`, so an approved organisation never has a claim left waiting and a failed step undoes both. The answer says how many were issued (`released`). Rejecting issues nothing; the claim stays held. A claim whose code was switched off meanwhile is not issued (the slot stays taken); it is issued the next time the host opens Billing or presses the code's button, once the code is on again. The same release runs, as a safety net, when an approved organisation opens Billing or presses a code it already holds. Credits last the code's days from the day they are issued.
  - Browser (local servers): a local organisation set to pending held a code ("Held until your organisation is approved", the Billing note), the admin approved it through the API (`released: 1`), and the page then showed it as added with 6 credits in Billing. Not checked: the admin page's Approve button for this (unchanged, it calls the same route).

## Acceptance checks
- [x] A new individual host redeems a 3-credit code and can create 3 events.
  - `test/promo-host.mjs`: a host with no credits gets a 402, redeems, creates 3 events (201 x3), and the fourth is a 402. Also seen in the local browser (credits 1 to 4).
- [x] A pending society's claim shows "held until approved", and the credits appear after approval.
  - Tests (held claim, approval issues it in the same transaction, once only) and the local browser: held message and Billing note, then after the admin approved, the page showed it added and Billing showed 6 credits.
- [x] The same host can't claim the same code again with a second org.
  - Test: the account moved to a second organisation gets "already claimed" and no credits; the database also refuses the insert (unique on code and host account), and keeps the rule if the first organisation is deleted.

## Log
- 2026-11-11 (owner decision, relayed by the orchestrator): F20 lists "Needs: F10, F04". F04 is done. F10 is fully built and committed but not ticked, because its last checks need the production subdomain. The owner said to build the items behind F10 now, on F10's code as it stands. Anything F10's production rollout changes (the host site address, the host cookie, `HOST_ORIGIN`, host account ids) may need rework here: the host pages call `HostApi`, the claims point at `host_accounts` and `orgs`, and the reset script is the one F10 owns.
- 2026-11-11: claimed by Claude subagent.
- F10 reset (option B, full wipe) and host promo claims: the claims are **wiped with the organisations and host accounts**, like the credits they led to; they are not billing records (nothing was paid). The promo codes themselves are kept, with `uses` set back to 0 so it matches the claims that exist; the counts wiped are in the `admin_audit` row. The script now needs migration 0025 as well, and also clears the `hpromo:` throttle counters. Tested in `test/promo-host.mjs`; `test/hosts-accounts.mjs` changed to expect five host tables and to check the script refuses a database without 0025 (a stricter check, not a weaker one).

Related: [[Pricing]], [[Host Portal and Billing]] · back to [[00 Master To-Do]]

- 2026-11-11 (Claude subagent): **Done.** Built on F10 as it stands (owner's say-so, see above). Migration 0025, `worker/host-promo.js`, host page `HostRedeem.vue` served by the Billing route, admin form, approval hook, reset script change. Decision: [[D031 Host promo codes are one table, one claim per organisation and one generic refusal]].
- How the correctness and abuse bar is tested (`test/promo-host.mjs`, 158 checks): exactly once per organisation and host account, also for two presses at once (requests held at the door until all have arrived; with the cap taken out of the SQL the race tests fail) and a database-level refusal; cap (the 51st claimant, four and five organisations racing for the last slots), dates, switched off, unknown, wrong kind, rejected and the attendee audience all give one identical 404 with no state change; lookups and presses limited per IP and per host account; credits recorded (claim row, credits row `promo:CODE`, host export, admin totals); admin token only for create, edit and switch off; signed-out 401, attendee cookie and admin token not a host sign-in, main site 403, sponsor viewer 403; attendee codes and host codes refused in each other's flow; no live code in `dist/` (searched after the build: none of the codes used in tests or the poster code; only the format hint `ABCD1234`).
- Bundle (gzip, `test/budget.mjs`), before and after: PublicCard 50,981 to 51,033 B (about 167 B left), PrivacyRequest 50,499 to 50,546 B, all under 51,200. The only entry change is the new route record `/redeem/:code?` (an alias, a regex route and inline imports were no smaller); the rest of the difference is hash noise in the chunk list. Nothing was added to `Redeem.vue`, `redeem.js`, `api.js`, `store.js` or other shared files.
- Tests changed: `test/harness.mjs` (one `db.batch` at a time, like D1), `test/hosts-accounts.mjs` and `test/presence.mjs` (the reset script's schema check now needs five tables, 0025 included; hosts-accounts also checks it refuses a database without 0025).
- Decisions without the owner: one 404 for every unusable code, so no "number 63" waiting list for hosts; no organisation picker (an account has one organisation); owner and staff may redeem, sponsor viewers may not; a host code must have a limit (max 10,000), credits 1 to 50, days 1 to 730; admin cannot edit a code's credits, days or audience; a rejected organisation keeps its slot; held claims are not issued while the code is off; claims wiped by the reset, codes kept with `uses` 0. The plan's friendly pointer: the host pages point to the main site for Plus codes; the attendee `Redeem.vue` is unchanged (public-page budget), so it has no pointer to the host portal.
- Not verified: the admin page's Approve button (same route, checked by API), a real email sign-in on production, behaviour on the production host subdomain.

### Owner steps
- Review the F20 commits, `git push`. Apply `npm run db:remote` (0025 is additive and safe before the deploy; 0018 to 0024 are still pending), then `npm run deploy`.
- If the host reset has not run yet, `scripts/reset-hosts.mjs` now needs 0025 and also wipes host promo claims.
- Make a first host code on /admin (Promo codes, "A host") and try it with a test host account.
