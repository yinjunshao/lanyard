---
tags: [roadmap, feature, ai, events]
id: F25
priority: P3
phase: 4
size: S
status: Not started
needs: [F17, F24]
---
# F25 AI who-to-meet ranking

**Priority:** P3 (do last; only if F17's simple matching isn't good enough) · **Phase:** 4 AI · **Size:** S · **Needs:** [[F17 Event presence and who to meet]], [[F24 Do I know someone who]] (shares the ranking code) · back to [[00 Master To-Do]]

## What it adds
[[F17 Event presence and who to meet]] already suggests people with tag and word matching. This feature lets the model rank the same candidates when someone types "I want to meet someone who…". It understands meaning ("someone in climate tech" matches "battery recycling startup").

## Rules
- Candidates are only people opted in to presence at the **same ongoing** event, never blocked, capped at 100. Each record holds their intro, `looking_for`, visible tags, and subtitle.
- Reuse F24's sanitiser, the id mapping and the output check. The reason is one line, plain text.
- Quota: 3 per event (Free), 10 (Plus). Cache for 10 minutes per (event, query, presence snapshot).
- Fallback: F17's matching result, which is always computed first and shown at once. The AI result replaces it when it arrives, with "Improved with AI".

## Tasks
- [ ] F25.1 `POST /api/ai/who-to-meet/:eventId` (checked in, presence on, event ongoing).
- [ ] F25.2 Swap-in UI on the hub suggestions row.
- [ ] F25.3 Tests: ended event → 403; ids outside the event are never returned; injection in an intro.

## Acceptance checks
- [ ] With fixtures, a "climate tech" request ranks the battery-recycling person first.
- [ ] Turning AI off (kill switch) leaves F17's suggestions working.

## Log
-

Related: [[AI Safety and Cost Plan]] · back to [[00 Master To-Do]]
