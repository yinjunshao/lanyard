---
tags: [decision]
status: Accepted
date: 2026-10-27
---
# D011 Retention limits

**Status:** Accepted  ·  **Date:** 2026-10-27

## Context
UK GDPR storage limitation; selfies are sensitive.

## Decision
Selfies and feedback text deleted after 12 months, inactive guests after 30 days, consent records kept 6 years, daily cron purge. Users keep what they keep in their own account.

## Consequences
Needs the cron to run; privacy policy must match exactly.

**Evidence:** worker/purge.js, wrangler.production.toml

Related: [[Privacy and Data Retention]] · back to [[Decision Log]]
