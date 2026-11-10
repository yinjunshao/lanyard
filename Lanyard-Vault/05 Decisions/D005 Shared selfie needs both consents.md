---
tags: [decision]
status: Accepted
date: 2026-10-16
---
# D005 Shared selfie needs both consents

**Status:** Accepted  ·  **Date:** 2026-10-16

## Context
The shared selfie is the hook and the most sensitive item.

## Decision
Both people agree (tick box at capture; consent_a/consent_b stored). Either can delete the selfie or connection and it disappears for both. No face recognition, never sold, not visible to hosts or sponsors.

## Consequences
Extra step at capture; strong GDPR position; consent records kept 6 years.

**Evidence:** migrations/0001 (connections), worker/purge.js, product plan

Related: [[Privacy and Data Retention]] · back to [[Decision Log]]
