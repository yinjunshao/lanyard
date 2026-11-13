---
tags: [decision]
status: Accepted
date: 2026-10-16
---
# D004 Aggregate-only host analytics

**Status:** Accepted  ·  **Date:** 2026-10-16

## Context
Who-met-whom is a social graph; per-person leaderboards are creepy and risk GDPR/PIPL problems.

## Decision
Hosts see aggregate stats only. Named exports include only people who opted in, with a separate box per sponsor. Hosts never see who connected with whom or selfies.

## Consequences
Slightly less data to sell, much stronger trust and compliance story.

> [!note] Narrowed 2026-11-13 by [[D038 Named attendance is per event, shown on the check-in page and pre-ticked by the owner's choice]]. A host may keep a list of named attendees for an event that has switched it on, for people who left the tick on and only for the items they left ticked. Everything else above still holds.

**Evidence:** Product plan 'Data rules (GDPR)', docs/ACTIVITY-MODE-STRATEGY.md section 5.3

Related: [[Privacy and Data Retention]], [[Host Portal and Billing]] · back to [[Decision Log]]
