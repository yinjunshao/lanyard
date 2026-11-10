---
tags: [decision]
status: Accepted
date: 2026-11-10
---
# D020 Host accounts separate from attendee accounts

**Status:** Accepted  ·  **Date:** 2026-11-10

## Context
Until F10 a host account was the attendee `users` row: any account with a passkey, recovery key, authenticator or verified email could become a host, and the host portal ran on the attendee session. That mixed a person's card with an organisation's events and invoices, made the setup steps easy to get stuck in ([[F07 Host setup sign-out fix]]), and meant the portal promoted passkeys to people who mostly sign in at work. `lanyd.fyi` and `host.lanyd.fyi` are the same "site" to the browser, so SameSite cookies alone do not keep the two apart. The owner asked for separate host accounts, email first, no passkeys, on `host.lanyd.fyi`, and for every existing host account to be reset (option B, full wipe).

## Decision
- A host account is its own record (`host_accounts`), keyed by email, with its own sessions (`host_sessions`) and its own cookie, `__Host-lanyard_host` (HttpOnly, Secure, SameSite=Strict, Path=/, no Domain), set only on the host site. Organisations, memberships, transfers, invites and tickets point at host accounts (`host_org_*`).
- Sign-in is a 6-digit email code from `hosts@lanyd.fyi` (stored hashed, 10 minutes, 5 tries, single use; 5 codes per email and 20 per IP an hour; replies never say whether an account exists). The first code for a new email creates the account. No passkeys, recovery keys or authenticator on the host site for now; TOTP can be added to `host_accounts` later.
- The host portal is served only on `host.<domain>`, its pages at the root. `/api/host/*` only answers there and only to the host site's own pages (Origin and Sec-Fetch-Site checked on reads and writes); the host site refuses the attendee API, and the attendee API refuses writes from the host site. Old `/host...` addresses answer 301 to the host site.
- Setup progress (details, Host Terms, organisation) is saved on the host account, so the page always shows the step the server says. Host Terms acceptance is recorded on the host account and in `consent_log`.
- This supersedes the session and passkey parts of [[D014 Separate host subdomain]] (one session cookie per hostname on the same user; a parent-domain RP_ID so one passkey works on both sites) and the host part of [[D003 Guest first with passkeys]]. Attendee accounts are unchanged.

## Consequences
- One person can be signed in to both sites at once, separately; signing out of one leaves the other.
- Existing host accounts, organisations and events are deleted by the reset (`scripts/reset-hosts.mjs`, option B); invoice records are kept with the organisation's name. Hosts start again with an email code.
- Invoices, team invites, transfers and admin actions find people by host email. Changing a host account's email (an admin-approved ticket) changes how it signs in.
- Needs the custom domain `host.lanyd.fyi` on the Worker. The old host tables stay until a later migration drops them.

**Evidence:** `migrations/0018_host_accounts.sql`, `worker/host-auth.js`, `worker/hosts.js`, `src/router/routes.host.js`, `src/components/HostSetup.vue`, `test/hostsecurity.mjs`, `test/hostsetup.mjs`, `test/hostsite.mjs`, `test/hosts-accounts.mjs`, [[F10 Separate host accounts on host subdomain]]

Related: [[Auth and Sessions]], [[Host Portal and Billing]], [[Security]] · back to [[Decision Log]]
