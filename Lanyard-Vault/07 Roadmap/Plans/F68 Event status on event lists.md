---
tags: [roadmap, feature, events, host, ui]
id: F68
priority: P1
phase: 11
size: S
status: Not started
needs: [F15]
---
# F68 Event status on event lists

**Priority:** P1 · **Phase:** 11 Owner requests (2026-11-24, second batch) · **Size:** S · **Needs:** [[F15 Events tab and event hub]] · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-24)
"also on your events for host.lanyd.fyi, make it so it displays the status of the event, i.e. upcoming, ended or in progress. in progress is stickied on top. also apply this to user events."

## Current state
- **Host:** the "Your events" list on the host dashboard (`src/views/HostDashboard.vue`, around lines 360-371) shows each event with "Report ›" when ended or "Live ›" otherwise. There is no status, and the list is in server order.
- **Attendee:** the Events tab (`src/views/Events.vue`) already works out a status with `useEventClock().statusOf` (`src/lib/eventlive.js`). It shows events that are on now first, then upcoming (soonest first), then past. Labels come from `STATUS_LABEL` and `statusText` in `src/lib/eventtext.js`: "Ongoing", "Ended", or "Starts 18:00".

## Plan
- **One status, three words:** "In progress", "Upcoming" and "Ended", shown as a small chip on every event row in both lists.
  - Upcoming keeps its start time beside the chip ("Upcoming · Starts Fri 18:00").
  - "Ongoing" becomes "In progress" everywhere it is shown, to match the owner's word.
- **Order in both lists:**
  1. In progress, at the top, in its own group headed "In progress";
  2. Upcoming, soonest first;
  3. Ended, newest first.
- **Status rules** are the ones `statusOf` already uses (start, end, the 3-hour default, End event pressed, and the server clock from [[F15 Events tab and event hub]]). The host list uses the same function, so the two agree. An event with no start time is "Upcoming" until it is ended.
- **Chips:**
  - In progress uses the strap colour with a small dot (no animation, or a slow pulse that stops under reduced motion and follows [[D045 Motion is CSS tokens and a few lines of script, never a library or Vue Transition]]);
  - Upcoming is the deep strap text;
  - Ended is graphite.
  - Each passes 4.5:1, and the words carry the meaning, not colour alone.
- **The host row** keeps "Live ›" for an event in progress, "Open ›" for an upcoming one and "Report ›" for an ended one.
- **"Stickied on top"** means the In progress group always comes first. The page header is not made sticky.

## Tasks
- [ ] F68.1 Shared status chip and ordering for the host dashboard list and the Events tab; "Ongoing" to "In progress"; tests (ordering with a fixed clock, the host list uses `statusOf`, the words, contrast); vault notes ([[Screens and Routes]]); browser check at 375 and 1280 px, light, dark and midnight, on a host with one event of each status.

## Acceptance checks
- [ ] A host with an ended, an in-progress and an upcoming event sees them in the order In progress, Upcoming, Ended, each with its chip (test with a fixed clock, and browser).
- [ ] The attendee Events tab shows the same chips and order (test and browser).
- [ ] No screen says "Ongoing" any more (test searches the source).
- [ ] Chip text passes 4.5:1 in light, dark and midnight (test).
- [ ] `npm test` passes; public pages within budget.

## Log
-

Related: [[F15 Events tab and event hub]] · back to [[00 Master To-Do]]
