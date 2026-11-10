---
tags: [technical, database]
---
# Data Model

D1 schema from `migrations/0001`-`0022`. Conventions: ids are 10-character unguessable hex; timestamps are unix milliseconds.

## Identity
- `users` (is_guest, recovery_email, email_domain, verified_student, has_passkey, over_18, plan, plan_until, notify_events)
- `sessions` (hashed token, expiry, user agent)
- `webauthn_credentials`, `webauthn_challenges`
- `rate_limits` (fixed-window counters)

## Profile and cards
- `profiles` (name, photo_key, **mode** `student`|`career` default `student`, **company** and **role** up to 80 characters each, uni, **institution_id**, course, year, headline, about, links JSON, tags JSON, projects JSON up to 3, is_public, show_age). **onboarding_step** (1 to 6, or NULL = not in the welcome steps) and **onboarding_max** (furthest step reached, default 0) are F14, migration 0022: NULL for every profile made before it and for anyone who has finished; a new card made through the steps starts at 2, and a guest's stub profile (made by connecting) starts at 1. Mode, company and role are F11, migration 0019. `uni`, `course` and `year` are kept in both modes; in Career mode `uni` reads "Studied at". Switching mode deletes nothing; only the chosen mode's fields are shown or searched. `institution_id` (F12, migration 0020) is a slug from `src/data/institutions-uk.json`, or NULL for typed or empty text; `uni` stays the display text (the official name for a listed institution, what was typed otherwise, up to 120 characters)
- `onboarding_stats` (day, step, reached, completed; primary key day + step): daily counts for the welcome-steps funnel, nothing about who (F14, migration 0022). Rows over 400 days old are purged
- `cards` (code, name, note, visible_links, tags, theme default|formal|night|host, strap_color, event_id, code_rotates_at)
- `card_codes` (current and grace codes with valid_until)

## Connections
- `connections` (user_a, user_b, event_id, selfie_key, consent_a, consent_b, **via**; unique per pair). `via` (F13, migration 0021) is how the first scan happened: `qr`, `code` or `link`. Rows made before 0021 are NULL, which means unknown and is shown as just "Connected"; nothing is guessed for them. It is written once, when the connection is made, and a later scan by either person never changes it. It is one value for the pair, so both people see the same wording. `event_id` has no foreign key: when an event is deleted or the host reset sets it to NULL, `via` stays and the event simply drops out of the wording
- `notes` (private per user), `messages` (thread), `blocks`, `reports`
- `consents` (record of who agreed to what, kept 6 years)

## Hosts and events
- Nothing is stored for shared ground (F16, no migration): `worker/inCommon.js` reads `profiles` (`mode`, `uni`, `institution_id`, `course`, `company`, `tags`), the card each person shared, `checkins`, `events`, `consents` and `blocks` on each request and returns text. There is no table, so nothing to export or delete ([[D026 Shared ground is worked out from what each person shows, and never stored]])
- `event_presence` (F17, migration 0023): `id` (opaque, unique), `event_id`, `user_id` (both cascade), `selfie_key` (R2, `presence/...`, private), `intro` (80), `looking_for` (120), `created_at`, `updated_at`; primary key (event_id, user_id). A row exists only while the person has presence on: turning it off deletes it. Deleted 48 hours after the event ends by `purgePresence` in `worker/purge.js`. `events.presence_used` is a counter of people who ever turned it on (the only thing a host sees). Consent scope `event_presence:<eventId>`.
- Nothing is stored for the Events tab or the event hub (F15, no migration): the list and the hub read `checkins`, `events` and `connections` and work out upcoming, ongoing or ended on each request with `worker/eventstatus.js`. `connections.event_id` may point at an event that no longer exists (F10 reset); the hub then returns 404 and the list leaves it out
- `host_accounts` (email UNIQUE lower-case, email_verified_at, full_name, use_case, event_frequency, typical_size, referral, terms_version, terms_at, status active|disabled, created_at, last_login_at, deleted_at): host accounts, separate from `users` (F10, migration 0018)
- `host_sessions` (SHA-256 of the cookie token, host_account_id, expiry, user agent), `host_login_codes` (email, hashed code, attempts, expiry, used_at)
- `orgs` (plan, org_type society|institution|company|individual, verification_status, leader, university, **institution_id** (F12, as on `profiles`), review notes)
- `host_org_members` (owner|staff|sponsor_viewer), `host_org_transfers`, `host_org_invites` (optional email), `host_org_tickets`: all on host accounts. `host_mail_log`: the owner recap, once per event
- Old, before F10: `host_profiles`, `org_members`, `org_transfers`, `org_invites`, `host_tickets` point at `users`. No code reads them; the host reset empties them and a later migration can drop them
- `events` (code, name, starts_at, venue, theme, strap_color, perks, directory_on, checkin_questions, is_paid)
- `checkins` (answers JSON, sponsor opt-ins)
- `sponsors`
- `credits` (events_granted, events_used, expires_at, reason, granted_by), `promo_redemptions`
- `billing_requests` (org_id nullable, org_name kept on the row, host_account_id, user_id before F10, sku, quantity, amount_pence, po_number, status open|invoiced|paid|cancelled). Since 0018 deleting an organisation sets org_id to NULL instead of deleting the invoice record
- `plus_waitlist`
- `feedback_responses`, `feedback_done`
- `org_integrations` (webhook url/secret, API key)
- `broadcasts`, `broadcast_sends`, `event_mail_log`

## Privacy by design
- Host reports are aggregate; named exports need per-sponsor opt-in. See [[Privacy and Data Retention]].
- Billing rows are kept when an org is erased (0018: `ON DELETE SET NULL`). Erasing an attendee no longer touches organisations (F10).

Related: [[Architecture]], [[Host Portal and Billing]]
