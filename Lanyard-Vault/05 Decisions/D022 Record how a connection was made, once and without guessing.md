---
tags: [decision]
status: Accepted
date: 2026-11-10
---
# D022 Record how a connection was made, once and without guessing

**Status:** Accepted  ·  **Date:** 2026-11-10

## Context
[[F13 Connection provenance]] shows how and where two people met. How two people met is personal data about both of them, and [[D004 Aggregate-only host analytics]] says hosts never see who connected with whom. Connections made before F13 never recorded a method.

## Decision
- One value per connection, `connections.via` (`qr`, `code` or `link`), written when the connection is first made and never changed by a later scan by either person. Both people see the same wording.
- Old connections stay NULL and read just "Connected" (with the event if there is one). A re-scan of an old connection does not fill it in, because the new scan says nothing about how they first met.
- The server accepts only the three values; anything else, or nothing, is stored as `link` (a printed badge from before this has no `?s=`, and a link is the honest default).
- The card address carries `?s=q` (QR), `?s=c` (typed code) or `?s=l` (link). The in-app scanner always sets `q`, a typed code always sets `c`. The card page reads it once and removes it from the address bar so it is not copied on.
- Hosts never see it: no host, admin, report, CSV, webhook or event-mail code reads the column (guarded in `test/provenance.mjs`). It is in each person's data export and goes with the connection or the account.
- The helpers live in `src/lib/profile.js`, not a module of their own: a separate small module shared by four pages became a chunk of its own and added its file name to the preload list in the entry every page loads.

## Consequences
A connection whose event has been deleted, or reset by the F10 host reset (which sets `event_id` to NULL), keeps its method and loses only the event name, so no script change was needed. A page reload before connecting loses `?s=`, so that connection reads as a link. A phone camera opening a QR made before F13 also reads as a link.

**Evidence:** `migrations/0021_connection_via.sql`, `worker/index.js` (the `viaOf` whitelist), `src/lib/profile.js`, `test/provenance.mjs`

Related: [[Privacy and Data Retention]], [[Data Model]] · back to [[Decision Log]]
