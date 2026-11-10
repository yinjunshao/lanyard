---
tags: [roadmap, feature, host, auth, migration]
id: F10
priority: P1
phase: 1
size: XL
status: In progress
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

**Owner decision (pick one, record it here):** the owner chose **B, full wipe** on 2026-11-10. Agents write the script and dry-run it locally only; the owner runs it on production after taking a D1 export.
- **A. Reset accounts, keep events (recommended).** Delete all host profiles, memberships, transfers, invites, tickets and host sessions. Keep `orgs`, `events`, `checkins` and `credits`, but with no members ("unclaimed"). Admin can attach an org to a new host account by email. Attendees keep their event history and "met at" labels.
- **B. Full wipe.** Also delete `orgs`, `events`, `sponsors`, `credits`, `feedback_*` and event mail logs. Attendees lose their event history (connections stay, but lose the event label: `connections.event_id` has no foreign key, so set it to NULL first).
- In both: **keep `billing_requests`** (the business must keep billing records for 6 years; see `0006_keep_billing_records.sql`) and write a `consent_log` / admin log entry for the reset. Before running, export a D1 backup (`wrangler d1 export`); the owner keeps it offline.

### Admin
`worker/admin.js` and `Admin.vue` list and search hosts by `host_accounts`, and gain an "Attach org to host email" action (needed for option A).

## Tasks
- [x] F10.1 Owner decision A or B recorded above.
- [x] F10.2 Migration: new host tables and repointed org tables. Test on a fixture DB in `test/hosts-accounts.mjs`.
  - `migrations/0018_host_accounts.sql` only adds: `host_accounts`, `host_sessions`, `host_login_codes`, and the organisation tables on host accounts as new tables `host_org_members`, `host_org_transfers`, `host_org_invites`, `host_org_tickets`, plus `host_mail_log` for the owner recap (`event_mail_log.user_id` points at `users`). The old tables are **not** dropped or renamed: the migration has to be safe to apply on production before the reset, while the old code still runs, and must not delete data. The reset empties them; dropping them is a later migration once the reset is done.
  - `billing_requests` is rebuilt with every row copied: `org_id` is now `ON DELETE SET NULL` (it was `CASCADE`, so the full wipe would have deleted invoice records), the organisation's name is kept on the row (`org_name`), and `host_account_id` records who raised it from now on. Host Terms acceptance lives on `host_accounts` (`terms_version`, `terms_at`) plus a `consent_log` row, because `consents.user_id` points at `users`.
  - `test/hosts-accounts.mjs` applies 0018 on top of 0017 with `test/fixtures/old-hosts.sql` loaded: no row lost, invoices copied field by field, new tables empty and not pointing at `users`, and deleting an organisation keeps its invoices.
- [x] F10.3 Host session middleware and cookie isolation, with security tests: an attendee cookie gets 401 on `/api/host/me`, a host cookie gets 401 on `/api/me`, and main-origin calls to the host API are refused.
  - F10.3, F10.4 and F10.5 are one commit: the new middleware stops the attendee session reaching `/api/host/*`, so every host route had to move to the host account in the same change for the tests to pass.
  - `worker/host-auth.js`: `hostGuard` on `/api/host/*` refuses the main site (403 `wrong_site`), refuses any `Origin` other than the host site's own, any `Sec-Fetch-Site` other than `same-origin` (a typed address is allowed for reads only) and writes without `Origin` (403 `bad_origin`), then loads the host account from the host cookie only. Cookie: `__Host-lanyard_host` on https (`lanyard_host` on plain-http local dev), HttpOnly, Secure, SameSite=Strict, Path=/, no Domain, 30 days; the database keeps only its SHA-256 (`host_sessions`). `worker/index.js`: on the host site every non-host API route answers 401 `wrong_site`, and the attendee session is never loaded for `/api/host/*`. `worker/security.js`: the attendee API no longer accepts writes from `host.*` origins (both sites are the same "site" to the browser, so SameSite alone would not stop it).
  - What `/api/me` does with only a host cookie: on the host site, 401 `wrong_site`; on the main site, where a browser never sends it, `user: null` and no guest is made. Attendee routes that need a person (`/api/connections`, `/api/account/export`, ...) answer 401.
  - Tests: new `test/hostsecurity.mjs` (52 checks): every host route (read from `hostApp.routes`, 41 today) answers 401 to an attendee cookie and 403 on the main site; attendee routes answer 401 to the host cookie on both sites; the cookie's attributes; same-site, cross-site, other-origin and no-origin calls refused; signed in to both sites at once, each sign-out leaves the other alone.
- [x] F10.4 Email-code sign-in and sign-up endpoints, with rate limits and generic errors (tests).
  - `POST /api/host/auth/start` emails a 6-digit code from the hosts sender (`decisions` key, `hosts@lanyd.fyi`); the reply is the same for any valid address, and a disabled account gets the same reply and no email. Limits: 5 codes per email per hour (from any network), 20 per IP per hour. `POST /api/host/auth/verify`: code stored as a peppered SHA-256, 10 minutes, 5 tries per code, single use, and a new code replaces the old one; wrong guesses are also throttled per IP and per email (10 per 10 minutes). Every failure gets the same reply. A new email gets its account only when the right code is entered. The email has no code in its link. `POST /api/host/logout` works from any state. All covered in `test/hostsecurity.mjs`.
- [x] F10.5 Move every `hostApp` route from `hostUser(c)` to the host account.
  - `hostUser()` is gone. Setup is three server-side steps on `host_accounts`: details (`POST /api/host/account/details`), Host Terms (`POST /api/host/terms`, recorded on the account and in `consent_log` with `ref = 'host_account'`), then the organisation. `GET /api/host/me` returns `step` (`details`, `terms`, `org`, `ready`); until setup is done other routes answer 403 `details_required` or `terms_required`. The organisation, team, transfer, ticket and billing routes use `host_org_*` and `host_accounts`; billing requests record `host_account_id` and the organisation's name. New: host devices (`GET /api/host/sessions`, `DELETE /api/host/sessions/:id`, `POST /api/host/sessions/signout-others`) and a host data export (`GET /api/host/account/export`). The attendee export no longer carries host data, and erasing an attendee no longer touches organisations. Admin's queue and ticket handling and the owner recap mail (`host_mail_log`) moved too, because they read the same tables. An approved email-change ticket also changes how that account signs in.
  - A source guard in `test/hostsecurity.mjs` checks `worker/hosts.js` and `worker/host-auth.js` never read `c.get("user")`, `users`, `sessions`, `consents` or the old host tables. Hosts still see only aggregates: the live view, report, CSV and dashboard name nobody who checked in (same file).
  - The host pages in `src/` still call the old flow until F10.6 and F10.7; nothing is deployed in between.
- [x] F10.6 Host router split. Host pages at root paths on the host site, 301 redirects from `lanyd.fyi/host*`.
  - `src/router/routes.attendee.js` and `src/router/routes.host.js`; `src/router/index.js` picks one by `ON_HOST_SITE`. Host site: `/`, `/signin`, `/events/:id`, `/billing`, `/account`, `/signout`; its old `/host/...` addresses redirect to the root, anything else goes to the main site. Main site: `/host` and `/host/...` go to the host site in the router guard, and the Worker answers `301` for them too (`worker/index.js`, both sites; `/hosts` and `/host-icon.svg` are left alone). The host site never waits on the attendee `/api/me`.
  - Host API calls moved out of `src/lib/api.js` (which every page loads) into `src/lib/hostapi.js`, imported only by host pages. That made the public pages a little smaller: Landing 65,437 to 65,088 B, public card 59,486 to 59,136 B (gzip, entry + static imports + page chunk).
  - Where the host site is: `HOST_ORIGIN` in `src/lib/site.js` comes from the build (`vite.config.js` defines `https://host.lanyd.fyi` for a production build, or `VITE_HOST_ORIGIN` if set), else `host.` + the current address (`http://host.localhost:5173` in dev). The Worker uses the `HOST_ORIGIN` var.
  - The pitch page's "Open the host portal" and Settings > Account link to the host site. `/host/signin` on the main site's sign-in page is gone (the host site has its own).
  - New `test/hostsite.mjs` (37 checks): the 301s, the browser mapping, both route tables, and that host code stays out of `api.js`. Changed: `test/settings.mjs` and `test/pickers.mjs` read the main route table where it now lives (same checks), `test/settings.mjs` looks for the host portal link instead of `to="/host"`, `test/homepath.mjs` expects `/` as the host home, `test/hostsetup.mjs` checks `/signout` and the old-address redirect instead of `/host/signout`.
- [x] F10.7 New host onboarding UI: email → code → details → terms → org. Back and Sign out on every step, progress from the server. No passkey copy anywhere.
  - New `src/components/HostSetup.vue` holds email, code, details (step 1 of 3) and Host Terms (step 2 of 3); the organisation step (3 of 3) stays on `HostDashboard.vue`. The step on screen is `step` from `/api/host/me`; Back only shows an earlier saved step with its saved answers (code to email, terms to details, organisation to terms); Back from the details step is "Use a different email", which signs out. The header has "Back to Lanyard" and, once signed in, Sign out on every step. `/signin` shows the same page.
  - `HostAccount.vue`: the passkey, recovery key, authenticator, attendee email and "sign in on another device" parts are gone. It says which email the account signs in with, lists the host account's signed-in devices with Sign out per device and for all others, and links the host data export. Team members are host accounts (name and email).
  - `HostLive.vue` puts the main site in the check-in QR and feedback link (`MAIN_ORIGIN`), because attendees check in there, not on the host portal. Host pages handle `signed_out`, `details_required` and `terms_required`.
  - `test/hostsetup.mjs` source guards now check: Sign out on every signed-in step, the step comes from the server, each step has Back, host sign-out ends the server session before reloading, and no host file mentions a passkey, recovery key or authenticator. The browser walk-through is in the Log.
- [x] F10.8 Emails link to the host site. Team invites and transfers find people by host email.
  - Every host email takes its links from `hostOrigin()` (`HOST_ORIGIN`, else `host.` + the main address) and points at the portal's root pages: application received, approved or not (`decisionEmail`), ticket decisions, the owner's event recap (`/events/:id`), and two new ones: a transfer waiting for you (`transferEmail`, sent when an owner hands over or an admin approves a leader change) and a team invite (`teamInviteEmail`, link to `/account#join`). All go from the hosts sender.
  - Team invites can name an email (`host_org_invites.email`): it is emailed to them and only the host account with that email can use it; anyone else gets the same "isn't valid" reply as a wrong code. An invite without an email is a code to pass on, as before. Transfers and leader-change tickets find the person by `host_accounts.email`.
  - Tests: `test/features.mjs` (10 new checks: links in every host email, the transfer and invite emails, an email-bound invite refused for another account, used by the right one, open invites, removing a member) and `test/eventmail.mjs` (the recap links to `host.lanyard.test/events/<id>`).
- [x] F10.9 Admin: host list, attach org to email.
  - `GET /api/admin/hosts?q=` lists host accounts (newest 50, or searched by email, name or organisation) with their organisation and role, and the organisations that have no members. `POST /api/admin/orgs/:id/attach {email}` makes the host account with that email the owner of an organisation with no members (the account must exist, be active, have no organisation, and meet the email rule for the organisation type); billing and leader email follow it. `POST /api/admin/hosts/:id/status {active|disabled}`: switching off ends every session of that account and stops sign-in (the sign-in reply stays the same). All go through the admin token and the audit log. `Admin.vue` has a Host accounts section with search, switch off and on, and an Attach form for each organisation with no host.
  - After the full wipe (option B) there are no organisations without a host, so Attach is for later cases (an owner whose account was removed, or a future partial reset). Tests: 13 new checks in `test/features.mjs`.
- [x] F10.10 Reset script for the chosen option, plus a dry-run mode that prints counts. Run it locally on an export copy and paste the counts here.
  - `scripts/reset-hosts.mjs`, option B. Dry run by default (counts only, nothing changed); `--apply` wipes. Targets: `--sqlite <file>` (a copy), `--local` (local D1 through wrangler) or `--remote` (production D1; `--apply` there also needs `--confirm=RESET-ALL-HOSTS`; the owner runs it). It refuses a database without migration 0018. In order: one `admin_audit` row (`host_reset`, with the counts), keep the organisation's name on every billing request, set `connections.event_id` and `cards.event_id` to NULL, delete the Host Terms, event directory and sponsor consents, then empty the host tables (old and new), organisations and everything under them, and the host rate-limit keys. Kept: `billing_requests` (org_id becomes NULL, name kept), `consent_log`, attendees, cards and connections. After `--apply` it counts again and fails loudly if a host table is not empty or the billing, user or connection counts moved. Sponsor logos in R2 are listed for the owner to delete by hand (`sponsors.logo_key`; nothing uploads them today).
  - Tests: 16 checks in `test/hosts-accounts.mjs` on the fixture plus new-model rows (counts, every host table empty, billing rows field by field, consents, audit row, no dangling foreign keys, safe to run twice).
  - Local run, 2026-11-10, on a copy of the local D1 file (`.wrangler/state/v3/d1/...sqlite` copied to a scratch folder; the local database itself was not changed), first as it was, then with `test/fixtures/old-hosts.sql` added so every table has rows. `--local` dry run through wrangler gave the same counts as the copy before the fixture.

    | Count | Local copy, dry run | With fixture, dry run | After `--apply` |
    | --- | --- | --- | --- |
    | orgs | 2 | 4 | 0 |
    | events | 2 | 4 | 0 |
    | org_members (old) | 2 | 4 | 0 |
    | host_profiles (old) | 2 | 4 | 0 |
    | credits | 1 | 2 | 0 |
    | checkins, sponsors, feedback_responses, feedback_done | 0 | 3, 1, 1, 1 | 0 |
    | event_mail_log, promo_redemptions, org_integrations | 0 | 2, 1, 1 | 0 |
    | org_invites, org_transfers, host_tickets (old) | 0 | 1, 1, 1 | 0 |
    | host_accounts and the other new host tables | 0 | 0 | 0 |
    | host consents (Host Terms, event directory, sponsor) | 4 | 7 | 0 |
    | connections / cards with an event label | 0 / 0 | 1 / 1 | 0 / 0 |
    | **billing_requests** | 0 | **2** | **2** (same rows; org_id NULL, name kept) |
    | users | 8 | 12 | 12 |
    | connections | 0 | 1 | 1 |
    | consent_log | 10 | 11 | 11 |

    One `admin_audit` row `host_reset` was written. A second dry run after the apply showed every host count at 0 and billing at 2.
- [x] F10.11 Config: add `https://host.lanyd.fyi` to `APP_ORIGIN` in `wrangler.production.toml`, set `VITE_HOST_ORIGIN=https://host.lanyd.fyi` for the build. Write the owner steps below.
  - `wrangler.production.toml`: `https://host.lanyd.fyi` added to `APP_ORIGIN`, and `HOST_ORIGIN = "https://host.lanyd.fyi"` (email links, the 301s). The custom domain itself is not put in the file: a `routes` entry would make `wrangler deploy` change the Worker's domains, which is the owner's call (step 3 below).
  - The build: `vite.config.js` sets the host address to `https://host.lanyd.fyi` for every production build (`npm run build`, and so `npm run deploy`), so no environment variable is needed; setting `VITE_HOST_ORIGIN` overrides it. `.env.*` files are ignored by git, which is why it lives in `vite.config.js`.
  - `wrangler.toml` (local): `HOST_ORIGIN = "http://host.localhost:5173"` and `MAIL_LOG = "1"`, so local dev prints every email (with the host sign-in code) in the wrangler console and never sends one, even with real keys in `.dev.vars`. Production has no `MAIL_LOG`.
  - Passkeys no longer accept a `host.*` origin (`worker/passkeys.js`).
  - Checked in `test/hostsite.mjs` (6 checks). How to run both sites locally is in [[Deployment]].
- [ ] F10.12 Update the vault: [[Auth and Sessions]], [[Host Portal and Billing]], [[Data Model]], [[Screens and Routes]], [[API Surface]], and a new decision note "D020 Host accounts separate from attendee accounts" (D018 and D019 were taken by then) that supersedes the session part of [[D014 Separate host subdomain]] and the host part of [[D003 Guest first with passkeys]].

## Owner steps (outside the code)
In this order. Production runs Phase 0 today; F08, F09 and F10 are not deployed yet, so this deploy ships all three.
1. **Review and push.** Read the F08, F09 and F10 commits, then `git push`.
2. **Resend.** Check that `hosts@lanyd.fyi` sends with the key in `RESEND_DECISIONS_KEY` (the domain is verified for `accounts@` and `hosts@`). Host sign-in codes now go from it. *If it can't send, nobody can sign in to the host portal.*
3. **Cloudflare: the custom domain.** Workers & Pages > `lanyard-v2` > Settings > Domains & Routes > Add > Custom domain > `host.lanyd.fyi`. Wait until `https://host.lanyd.fyi/api/health` answers. *If the new code goes live first, every `lanyd.fyi/host...` link and host email points at an address that doesn't exist yet, so the portal can't be reached.*
4. **Back up D1.** `npx wrangler d1 export lanyard_db --remote --config wrangler.production.toml --output <a folder outside the repo>/lanyard-before-f10.sql`. Keep it offline; never commit it. *Without it the reset can't be undone.*
5. **Apply the migration.** `npm run db:remote` (applies `0018_host_accounts.sql`). It only adds tables and copies `billing_requests` into its new shape, so the Phase 0 code keeps working. *If the code is deployed before this, the host portal, the daily purge and the attendee data export fail (missing tables and columns).*
6. **Dry run the reset.** `node scripts/reset-hosts.mjs --remote`. Check the counts look like the live data and `billing_requests` will be kept. It refuses to run if step 5 hasn't happened.
7. **Reset.** `node scripts/reset-hosts.mjs --remote --apply --confirm=RESET-ALL-HOSTS`. It checks its own result and prints the counts after. Delete any sponsor logos it lists from R2 (`npx wrangler r2 object delete lanyard-media/<key> --remote`); none are expected, nothing uploads them today.
8. **Deploy, straight after the reset.** `npm run deploy`. *Between steps 7 and 8 the old portal still runs: anything a host does there is left without an owner (it shows under Admin > Organisations with no host). If the deploy comes before the reset instead, the reset also deletes host accounts made on the new portal in between.* So keep the gap short, and run step 6 again afterwards: every host count should be 0.
9. **Check.** On a phone and a laptop: `https://host.lanyd.fyi/` shows "Sign in to the host portal"; sign up with a real email, get the code, go through details, terms and "under my own name", sign out from a step. `https://lanyd.fyi/host/events/abc` goes to `https://host.lanyd.fyi/events/abc`. In the browser's storage view, the `__Host-lanyard_host` cookie is on `host.lanyd.fyi` only, and signing in there does not sign you in to `lanyd.fyi` (or the reverse). Then tick the acceptance checks below that need production.
10. **Later.** Once the reset is confirmed, a new migration can drop the old tables (`host_profiles`, `org_members`, `org_transfers`, `org_invites`, `host_tickets`). Attendee accounts that were made only to host stay as attendee accounts; the inactive-account purge removes them after 24 months unused.

## Acceptance checks
- [ ] A new host signs up with only an email code, on `host.lanyd.fyi`, and never sees the word passkey.
- [ ] Signing in to the host site does not sign you in to `lanyd.fyi`, and the reverse.
- [ ] Sign out works from every step, and a refresh never traps you in a step.
- [ ] `lanyd.fyi/host/events/abc` redirects to `host.lanyd.fyi/events/abc`.
- [ ] After the reset (local dry run), the counts match the chosen option and billing requests are untouched.

## Log
- 2026-11-10 (Claude subagent): started. First-load JS before F10 (gzip, entry + static imports + page chunk, from `dist/` at e9bed01): Landing 65,437 B, public card 59,486 B.

Related: [[Host Portal and Billing]], [[Auth and Sessions]], [[Security]] · back to [[00 Master To-Do]]
