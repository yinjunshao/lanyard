---
tags: [decision]
status: Accepted
date: 2026-10-16
---
# D003 Guest first with passkeys

**Status:** Accepted  ·  **Date:** 2026-10-16

## Context
Registration friction kills in-the-moment scans. v1 login used birthday + 4-hex code: guessable (65,536 combinations) and birthdays are public.

## Decision
Anyone can connect with a name and selfie (guest session). Claiming adds a passkey; email, TOTP and recovery code are optional. Drop birthday login.

> [!note] Hosts (2026-11-10)
> This applies to attendee accounts. Host accounts are separate and sign in with an email code, with no passkeys: [[D020 Host accounts separate from attendee accounts]].

## Consequences
Zero-friction connect, stronger accounts. Requires guest rate limits and a claim flow.

**Evidence:** Product plan 'Guest sign-up', migrations/0001, worker/session.js

Related: [[Auth and Sessions]] · back to [[Decision Log]]
