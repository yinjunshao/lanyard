---
tags: [roadmap, feature, host, auth, migration]
id: F10
priority: P1
phase: 1
size: XL
status: Not started
needs: [F07]
---
# F10 Separate host accounts on host subdomain

**Priority:** P1 · **Phase:** 1 Foundations · **Size:** XL · **Needs:** [[F07 Host setup sign-out fix]] · **Unlocks:** [[F18 Live previews for cards and events]], [[F19 Host present page and print]], [[F20 Host promo codes for event credits]], [[F23 AI feedback summary for hosts]] · back to [[00 Master To-Do]]

## What the owner asked for
- Reset all host accounts.
- Host accounts are no longer tied to user (attendee) accounts. They are a separate account.
- Serve the portal at `host.lanyd.fyi` instead of `/host/...`.
- Email first for hosts. Do not promote "create account with a passkey", and do not support passkeys for hosts yet.
- Fix the bug where a remembered setup step blocks going back or logging out (stopgap in [[F07 Host setup sign-out fix]]; this feature removes the cause).

## Current state
- Host identity is the attendee `users` row. `hostUser()` in `worker/hosts.js` accepts any user with a passkey, recovery key, TOTP or verified email.
- `host_profiles(user_id → users.id, email UNIQUE, full_name, survey…)`. `org_members.user_id`, `org_transfers.from_user_id / to_user_id`, `host_tickets.user_id` and `org_invites` all point at `users`.
- The host UI (`HostDashboard.vue`) leads with "Create account with a passkey" and offers a recovery key.
- The host subdomain already half-exists: `src/lib/site.js` (`ON_HOST_SITE`, `MAIN_ORIGIN`, `HOST_ORIGIN` from `VITE_HOST_ORIGIN`) and the router guard serve only `/host*` on `host.*`. `wrangler.production.toml` `APP_ORIGIN` does not list `https://host.lanyd.fyi` yet. See [[D014 Separate host subdomain]].

## Target design
### Identity
New tables, in a new migration (next free number; 0017 is the latest today):
- `host_accounts`: `id`, `email` (lower-case, UNIQUE), `email_verified_at`, `full_name`, `use_case`, `event_frequency`, `typical_size`, `referral`, `status` (`active` / `disabled`), `created_at`, `last_login_at`, `deleted_at`
- `host_sessions`: `id` (SHA-256 of the token, like `sessions`), `host_account_id`, `created_at`, `expires_at`, `user_agent`
- `host_login_codes`: hashed 6-digit code, `email`, `expires_at` (10 min), `attempts`, `used_at`. Reuse the pattern in `worker/email-auth.js`.
- Repoint the org tables to `host_account_id`: `org_members`, `org_transfers`, `host_tickets`, `org_invites`. D1/SQLite can't change a foreign key in place, so create the new tables, copy what survives the reset, drop the old ones and rename.
- Consents: Host Terms acceptance is recorded against the host account (scope `host_terms:v…`, keyed by host account id in `consent_log`).

### Sessions and cookies
- Cookie `lanyard_host` is set **only on `host.lanyd.fyi`**, with no `Domain` attribute, so the browser never sends it to `lanyd.fyi`, and the attendee cookie never reaches the host site.
- New middleware `hostSession` for `/api/host/*` reads only `lanyard_host`. The attendee `sessionMiddleware` ignores host routes, and the host middleware ignores `lanyard_session`. One person can be signed into both, completely separately.
- Requests to `/api/host/*` from the main origin are refused (check `Origin`/`Host` in `worker/security.js`).

### Sign-in (email first, no passkeys)
1. Enter email → we send a 6-digit code from `hosts@lanyd.fyi` (the decisions key, or a new `RESEND_HOSTS_KEY`).
2. Enter the code → signed in. A new email creates the host account at this point.
3. New accounts continue: full name and survey → Host Terms → "Under my own name or an organisation" (existing kinds). Each step is saved on the server (`host_accounts` columns), so a refresh or another device resumes at the right step. Every step has **Back** and **Sign out**.
- Limits: 5 codes per email per hour, 20 per IP per hour, 5 attempts per code. Generic replies, so email existence isn't leaked.
- No passkey, recovery key or TOTP UI on the host site. Leave room for TOTP later.

### Addresses
- Host site routes drop the `/host` prefix: `host.lanyd.fyi/` (dashboard), `/signin`, `/events/:id`, `/events/:id/present` ([[F19 Host present page and print]]), `/billing`, `/account`, `/redeem/:code` ([[F20 Host promo codes for event credits]]).
- Main site `lanyd.fyi/host*` returns a 301 to the matching `host.lanyd.fyi` page. `/hosts` (the pitch page) stays on the main site, and its "Open the portal" link goes to `HOST_ORIGIN`.
- Split the router into `routes.attendee.js` and `routes.host.js`, chosen by `ON_HOST_SITE`, so the host bundle doesn't carry attendee pages and the reverse.
- Local dev: `http://host.localhost:5173` works in modern browsers. Set Vite `server.allowedHosts` and add it to `wrangler.toml` `APP_ORIGIN`.
- Emails (decisions, team invites, transfers, recap) link to `host.lanyd.fyi`.

### Reset of existing host accounts
> [!warning] Irreversible on production. Needs the owner's answer to the decision below, and the owner runs it. Agents only write and test the migration locally on a copy.

**Owner decision (pick one, record it here):**
- **A. Reset accounts, keep events (recommended).** Delete all host profiles, memberships, transfers, invites, tickets and host sessions. Keep `orgs`, `events`, `checkins` and `credits`, but with no members ("unclaimed"). Admin can attach an org to a new host account by email. Attendees keep their event history and "met at" labels.
- **B. Full wipe.** Also delete `orgs`, `events`, `sponsors`, `credits`, `feedback_*` and event mail logs. Attendees lose their event history (connections stay, but lose the event label: `connections.event_id` has no foreign key, so set it to NULL first).
- In both: **keep `billing_requests`** (the business must keep billing records for 6 years; see `0006_keep_billing_records.sql`) and write a `consent_log` / admin log entry for the reset. Before running, export a D1 backup (`wrangler d1 export`); the owner keeps it offline.

### Admin
`worker/admin.js` and `Admin.vue` list and search hosts by `host_accounts`, and gain an "Attach org to host email" action (needed for option A).

## Tasks
- [ ] F10.1 Owner decision A or B recorded above.
- [ ] F10.2 Migration: new host tables and repointed org tables. Test on a fixture DB in `test/hosts-accounts.mjs`.
- [ ] F10.3 Host session middleware and cookie isolation, with security tests: an attendee cookie gets 401 on `/api/host/me`, a host cookie gets 401 on `/api/me`, and main-origin calls to the host API are refused.
- [ ] F10.4 Email-code sign-in and sign-up endpoints, with rate limits and generic errors (tests).
- [ ] F10.5 Move every `hostApp` route from `hostUser(c)` to the host account.
- [ ] F10.6 Host router split. Host pages at root paths on the host site, 301 redirects from `lanyd.fyi/host*`.
- [ ] F10.7 New host onboarding UI: email → code → details → terms → org. Back and Sign out on every step, progress from the server. No passkey copy anywhere.
- [ ] F10.8 Emails link to the host site. Team invites and transfers find people by host email.
- [ ] F10.9 Admin: host list, attach org to email.
- [ ] F10.10 Reset script for the chosen option, plus a dry-run mode that prints counts. Run it locally on an export copy and paste the counts here.
- [ ] F10.11 Config: add `https://host.lanyd.fyi` to `APP_ORIGIN` in `wrangler.production.toml`, set `VITE_HOST_ORIGIN=https://host.lanyd.fyi` for the build. Write the owner steps below.
- [ ] F10.12 Update the vault: [[Auth and Sessions]], [[Host Portal and Billing]], [[Data Model]], [[Screens and Routes]], [[API Surface]], and a new decision note "D018 Host accounts separate from attendee accounts" that supersedes the session part of [[D014 Separate host subdomain]] and the host part of [[D003 Guest first with passkeys]].

## Owner steps (outside the code)
1. Cloudflare: add the custom domain `host.lanyd.fyi` to the `lanyard-v2` Worker, or add a `routes` entry with `custom_domain = true`.
2. Resend: confirm `hosts@lanyd.fyi` can send (the domain is already verified for `accounts@` and `hosts@`).
3. Take a D1 export. Apply the migration (`npm run db:remote`). Run the reset script. Deploy.

## Acceptance checks
- [ ] A new host signs up with only an email code, on `host.lanyd.fyi`, and never sees the word passkey.
- [ ] Signing in to the host site does not sign you in to `lanyd.fyi`, and the reverse.
- [ ] Sign out works from every step, and a refresh never traps you in a step.
- [ ] `lanyd.fyi/host/events/abc` redirects to `host.lanyd.fyi/events/abc`.
- [ ] After the reset (local dry run), the counts match the chosen option and billing requests are untouched.

## Log
-

Related: [[Host Portal and Billing]], [[Auth and Sessions]], [[Security]] · back to [[00 Master To-Do]]
