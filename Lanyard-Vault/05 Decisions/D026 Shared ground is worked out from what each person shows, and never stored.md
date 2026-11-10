---
tags: [decision]
status: Accepted
date: 2026-11-10
---
# D026 Shared ground is worked out from what each person shows, and never stored

**Status:** Accepted  ·  **Date:** 2026-11-10

## Context
[[F16 Shared ground without AI]] tells a viewer what they have in common with a person ("Both into robotics", "Same course", "Both at an event"). It must never show a field the viewer could not otherwise see, never tell the other person about something you chose to keep hidden, and never reach hosts ([[D004 Aggregate-only host analytics]]).

## Decision
- One module, `worker/inCommon.js`, builds the facts. It is computed on each request and not stored: no table, no column, nothing in the export, nothing to delete. [[F17 Event presence and who to meet]] (scoring) and [[F22 AI follow-up drafts]] (prompt input) call `sharedGround()` or `inCommon()` from the Worker and use `kind` and `text`; they must not widen what it reads.
- **Both sides go through the same filter** (`visibleSide`): only what that person shows the other. Their mode's fields (Student: institution and course; Career: institution as "Studied at", company), and the tags of the card they shared with the other (the card the connection was made through, else their default card; a card's own tags replace the profile's, as on the page). A kept-but-hidden field, such as a career profile's course or a student's company, never produces a fact in either direction, so the other person cannot learn it from "Both at ...".
- Kinds, most specific first, at most three: tags, course (same institution and same normalised course), company (career), event, institution. Institutions match by `institution_id` when both have one, otherwise by the same words. Tags, courses and companies are compared after folding case, accents, punctuation, plurals, degree prefixes and Ltd/plc.
- Event facts only for past events the viewer may already know the other was at: the event the connection was made at, or one whose attendee directory the other joined ([[D015 Profile split from cards]] consents). A connection alone does not reveal every event the other checked in to. An event still on is not shown.
- Mutual-connection counts are not used. Blocked pairs get nothing. Signed-out viewers and the card's owner get nothing. The people list and the host side get nothing.
- It is returned as `inCommon: [{ kind, text }]` on `GET /api/c/:cardId` and `GET /api/connections/:id`. `institution_id` is read on the server and never added to a payload.

## Consequences
Pre-connection, a viewer is matched against the card they are looking at (already fully visible to them) and their own default card, which is what the other person would receive on connecting, so the two sides agree. The plan said "most recent event only" and "both checked in"; this decision is narrower for events on purpose. Each call costs about five reads (two profiles, two cards, one events join, one block check); `/api/c` and the person page are the only callers.

**Evidence:** `worker/inCommon.js`, `test/inground.mjs`

Related: [[Privacy and Data Retention]], [[D022 Record how a connection was made, once and without guessing]] · back to [[Decision Log]]
