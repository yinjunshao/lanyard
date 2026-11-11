---
tags: [decision]
status: Accepted
date: 2026-11-11
---
# D031 Host promo codes are one table, one claim per organisation and one generic refusal

**Status:** Accepted  ·  **Date:** 2026-11-11

## Context
[[F20 Host promo codes for event credits]] gives hosts codes for event credits. Credits are spent on events, so it is treated like money: a code must pay out once per organisation, never past its limit, and must not reveal which codes exist. Built on F10 as it stands.

## Decision
- **One table, two audiences.** Host codes are `promo_codes` rows with audience `host`. Every attendee query asks for audience `user`, so a host code is an unknown code to attendees; host routes ask for `host`, so an attendee code is unknown to hosts. A host code always has a limit.
- **A claim is one transaction.** Insert the claim only if the code is on, started, not ended and not full at that moment; count the use only if that claim was inserted; issue the credits (id `promo_<CODE>_<org id>`) if the organisation is approved. Unique rules on (code, organisation) and (code, host account) are the real guard; a racing loser is undone and shown the winner's claim.
- **One generic refusal.** Unknown, switched off, not started, ended, full, wrong kind of organisation, rejected organisation and the other audience all give the same 404. This drops the plan's "you're number 63" waiting list for hosts, because it would say a code exists. Lookups and presses are limited per IP and per host account.
- **Held until approved.** A pending society or institution's claim takes a slot and issues nothing. The admin approval issues it in the same transaction; opening Billing or pressing again issues it if that step was missed. A code switched off meanwhile is not issued.
- **The reset wipes claims** with the organisations and credits; codes stay with `uses` set to 0.

## Consequences
A rejected organisation keeps its slot. Admin edits cannot change a code's credits, days or audience (switch off and make a new one). Credits are issued by one function only.

**Evidence:** `worker/host-promo.js`, `migrations/0025_host_promo_codes.sql`, `test/promo-host.mjs`, `scripts/reset-hosts.mjs`

Related: [[D004 Aggregate-only host analytics]], [[D009 Manual invoicing before Stripe]], [[D020 Host accounts separate from attendee accounts]] · back to [[Decision Log]]
