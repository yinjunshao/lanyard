---
tags: [decision]
status: Partly superseded
date: 2026-10-28
---
# D014 Separate host subdomain

**Status:** Accepted, partly superseded by [[D020 Host accounts separate from attendee accounts]]  ·  **Date:** 2026-10-28

## Context
Host accounts and personal cards of the same person should stay separate; B2B pages deserve their own address.

## Decision
Serve the same Worker on `host.<domain>`; only `/host/*` works there; sessions are per hostname; RP_ID set to the parent domain so one passkey can work on both.

> [!note] Superseded in part (2026-11-10)
> The subdomain stays. Sessions are no longer the same user on both sites, and host accounts have no passkeys: see [[D020 Host accounts separate from attendee accounts]]. The host site's pages are at the root (`host.lanyd.fyi/`, `/events/:id` ...), not under `/host`.

## Consequences
Passkeys made on workers.dev stay tied to the old RP_ID. Needs two custom domains.

**Evidence:** DEPLOY-V2.md, src/router/index.js, wrangler.production.toml

Related: [[Deployment]], [[Auth and Sessions]] · back to [[Decision Log]]
