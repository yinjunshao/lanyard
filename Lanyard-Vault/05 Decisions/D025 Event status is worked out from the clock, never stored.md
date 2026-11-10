---
tags: [decision]
status: Accepted
date: 2026-11-10
---
# D025 Event status is worked out from the clock, never stored

**Status:** Accepted  ·  **Date:** 2026-11-10

## Context
[[F15 Events tab and event hub]] labels each event Ongoing, Ended or upcoming for the person looking at it. Hosts end events by hand, many events have no end time, and people can check in early.

## Decision
- Status is never stored. One function, `eventStatus(event, checkedInAt, now)` in `worker/eventstatus.js`, works it out, and `src/lib/eventstatus.js` is a byte-identical copy (a test fails if they differ). Ended: the host ended it, or `ends_at` has come (at that exact moment), or, with no end time, more than 12 hours since the later of the start and your check-in. Upcoming: `starts_at` is still ahead. Otherwise Ongoing.
- The server works out `status` on every request, so a host ending an event shows Ended on the next load. The app works it out again with the server's clock (`now` is in the API response, so a wrong phone clock changes nothing) every minute, so an open page turns to Ended by itself.
- The tab dot is on while any event you checked in to is Ongoing. Upcoming does not count.
- The hub's people list and its count come from one join, so they agree. The routes are in `worker/myevents.js`, not `events.js`, because they return how two people met and `events.js` is held to never reading it for hosts ([[D022 Record how a connection was made, once and without guessing]]).
- The Events glyph is drawn in `AppShell.vue`, not `Icon.vue`, so public pages pay nothing for it ([[D024 Signed-in frame and heavy pieces load only where used]]).
- The hub's back arrow goes to My card; only if you came from the Events list does it go back there. A check-in from the Scan page therefore does not land you back on Scan.

## Consequences
No migration and no job to flip a status. An event with no end time that a host never ends turns Ended 12 hours after the later of its start and each person's check-in, so two people can see it end at different times. F17 (who to meet) can use the same helper to ask whether an event is still Ongoing.

**Evidence:** `worker/eventstatus.js`, `worker/myevents.js`, `src/lib/eventlive.js`, `test/events-hub.mjs`

Related: [[Privacy and Data Retention]], [[D004 Aggregate-only host analytics]] · back to [[Decision Log]]
