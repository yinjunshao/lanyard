---
tags: [decision]
status: Partly overtaken
date: 2026-10-16
---
# D007 Validate before building

**Status:** Partly overtaken  ·  **Date:** 2026-10-16

## Context
The strategy doc advised 4-6 weeks of organiser interviews and 3-5 free pilots before building any host features.

## Decision
Intended: interview first, fake the report by hand, build only after signal.

## Consequences
In practice the host portal, credits, billing requests, reports, feedback and integrations were built in v2 before pilots. The learning goal still stands: the next phase must be pilots and interviews, not more features.

**Evidence:** docs/ACTIVITY-MODE-STRATEGY.md sections 7 and 9 vs worker/hosts.js and migrations 0003-0013

Related: [[Go-to-Market]], [[Metrics and Kill Criteria]] · back to [[Decision Log]]
