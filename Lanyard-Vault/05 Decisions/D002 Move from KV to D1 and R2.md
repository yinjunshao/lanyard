---
tags: [decision]
status: Accepted
date: 2026-10-27
---
# D002 Move from KV to D1 and R2

**Status:** Accepted  ·  **Date:** 2026-10-27

## Context
v1 stored everything in Cloudflare KV with base64 photos (90-day TTL). KV is poor for analytics and event-scoped queries; photos should live in object storage.

## Decision
v2 uses D1 (SQLite) for data and R2 for media. KV kept only for read-only export and audit; v1 stays live under its own Worker name.

## Consequences
Real schema and migrations; analytics possible; retention purge can delete R2 objects. Cost of a migration and a dual-deploy period.

**Evidence:** DEPLOY.md, DEPLOY-V2.md, migrations/, git commit 'v2 updated, pre-brag'

Related: [[Architecture]], [[Deployment]] · back to [[Decision Log]]
