---
tags: [decision]
status: Accepted
date: 2026-10-27
---
# D016 Rotating card codes

**Status:** Accepted  ·  **Date:** 2026-10-27

## Context
Short 4-character codes are typeable but guessable and can leak.

## Decision
Codes rotate every 3 days with a 6-hour grace; owner can replace immediately; wrong guesses are rate-limited.

## Consequences
Old photos of a card stop working; owners must understand rotation.

**Evidence:** migrations/0003, worker/codes.js, index.js rotate-code route

Related: [[Features]], [[Security]] · back to [[Decision Log]]
