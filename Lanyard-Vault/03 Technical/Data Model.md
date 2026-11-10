---
tags: [technical, database]
---
# Data Model

D1 schema from `migrations/0001`-`0013`. Conventions: ids are 10-character unguessable hex; timestamps are unix milliseconds.

## Identity
- `users` (is_guest, recovery_email, email_domain, verified_student, has_passkey, over_18, plan, plan_until, notify_events)
- `sessions` (hashed token, expiry, user agent)
- `webauthn_credentials`, `webauthn_challenges`
- `rate_limits` (fixed-window counters)

## Profile and cards
- `profiles` (name, photo_key, uni, course, year, headline, about, links JSON, tags JSON, projects JSON up to 3, is_public, show_age)
- `cards` (code, name, note, visible_links, tags, theme default|formal|night|host, strap_color, event_id, code_rotates_at)
- `card_codes` (current and grace codes with valid_until)

## Connections
- `connections` (user_a, user_b, event_id, selfie_key, consent_a, consent_b; unique per pair)
- `notes` (private per user), `messages` (thread), `blocks`, `reports`
- `consents` (record of who agreed to what, kept 6 years)

## Hosts and events
- `orgs` (plan, org_type society|institution|company|individual, verification_status, leader, university, review notes)
- `org_members` (owner|staff|sponsor_viewer), `org_transfers`, `host_profiles`, `host_tickets`
- `events` (code, name, starts_at, venue, theme, strap_color, perks, directory_on, checkin_questions, is_paid)
- `checkins` (answers JSON, sponsor opt-ins)
- `sponsors`
- `credits` (events_granted, events_used, expires_at, reason, granted_by), `promo_redemptions`
- `billing_requests` (sku, quantity, amount_pence, po_number, status open|invoiced|paid|cancelled)
- `plus_waitlist`
- `feedback_responses`, `feedback_done`
- `org_integrations` (webhook url/secret, API key)
- `broadcasts`, `broadcast_sends`, `event_mail_log`

## Privacy by design
- Host reports are aggregate; named exports need per-sponsor opt-in. See [[Privacy and Data Retention]].
- Billing rows are kept when an org is erased. See `eraseUser` in `worker/purge.js`.

Related: [[Architecture]], [[Host Portal and Billing]]
