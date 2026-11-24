---
tags: [decision]
status: Accepted
date: 2026-10-16
---
# D012 18 plus only

**Status:** Accepted  ·  **Date:** 2026-10-16

## Context
Some students are 17; school events are different; Discovery mode is a safety risk for minors.

## Decision
Users must be 18 or over (age confirmation, over_18 flag). No Discovery mode for under-18. Age not shown on public profiles by default.

## Consequences
Excludes some school and college events for now.

- 2026-11-24, [[F51 Sign-up consent as a line by the button]]: at sign-up the 18+ confirmation is a line directly above the main button ("By pressing Connect, you confirm you're 18 or over and agree to the Terms and Privacy Policy."), not a tick. It is still a self-declaration and the Worker still needs `over18: true`; the history row records the line's words and the Terms version. The Terms pop-up for existing accounts keeps its tick.

**Evidence:** Product plan 'Age', migrations/0001

Related: [[Privacy and Data Retention]], [[Risks]] · back to [[Decision Log]]
