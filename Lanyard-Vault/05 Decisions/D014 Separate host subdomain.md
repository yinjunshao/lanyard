---
tags: [decision]
status: Accepted
date: 2026-10-28
---
# D014 Separate host subdomain

**Status:** Accepted  ·  **Date:** 2026-10-28

## Context
Host accounts and personal cards of the same person should stay separate; B2B pages deserve their own address.

## Decision
Serve the same Worker on `host.<domain>`; only `/host/*` works there; sessions are per hostname; RP_ID set to the parent domain so one passkey can work on both.

## Consequences
Passkeys made on workers.dev stay tied to the old RP_ID. Needs two custom domains.

**Evidence:** DEPLOY-V2.md, src/router/index.js, wrangler.production.toml

Related: [[Deployment]], [[Auth and Sessions]] · back to [[Decision Log]]
