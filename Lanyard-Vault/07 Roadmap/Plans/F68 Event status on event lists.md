---
tags: [roadmap, feature, events, host, ui]
id: F68
priority: P1
phase: 11
size: S
status: Done
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
- [x] F68.1 Shared status chip and ordering for the host dashboard list and the Events tab; "Ongoing" to "In progress"; tests (ordering with a fixed clock, the host list uses `statusOf`, the words, contrast); vault notes ([[Screens and Routes]]); browser check at 375 and 1280 px, light, dark and midnight, on a host with one event of each status.

## Acceptance checks
- [x] A host with an ended, an in-progress and an upcoming event sees them in the order In progress, Upcoming, Ended, each with its chip (test with a fixed clock, and browser).
  - Verified: `test/event-status.mjs` (fixed clock, and the real Worker with four events: on now, later, over, stopped early); and in the Browser pane on a local host with four events: groups In progress, Upcoming (Later today, then Coming up Friday), Ended, with the chips and Live, Open and Report, at 1280 px in Light and Dark and at 375 px in Midnight.
- [x] The attendee Events tab shows the same chips and order (test and browser).
  - Verified: same test; and in the Browser pane with a local guest checked in to the same four events, at 375 px (Midnight) and 1280 px: In progress, Upcoming with "Starts 23:53" and "Starts Thu 26 Nov 2026, 02:53" beside the chip, then Past events with Ended. Light and Dark were read from computed colours on this page.
- [x] No screen says "Ongoing" any more (test searches the source).
  - Verified: `test/event-status.mjs` reads every `.vue`, `.js` and `.html` under `src` and `worker` (comments removed) and finds no capital-O "Ongoing"; the event hub's status word now reads "In progress" too.
- [x] Chip text passes 4.5:1 in light, dark and midnight (test).
  - Verified: the test works out each chip colour from the tokens in `main.css` on `--paper` and `--paper-raised` (lowest 4.6 to 4.7 in Light, 6.5 or more in Midnight), and the computed colours in the browser matched the tokens in all three themes.
- [x] `npm test` passes; public pages within budget.
  - `npm test` exit 0 and `npm run build` exit 0. First-load gzip B before to after: Landing 44,282 to 44,299; PublicCard 47,633 to 47,650; Hosts 42,636 to 42,650; Privacy 50,140 to 50,158; Terms 46,759 to 46,774; Redeem 45,992 to 46,010; SignIn 47,102 to 47,116; PrivacyRequest 49,823 to 49,835 (limit 51,200).

## Log
- 2026-11-24 (Claude subagent) F68.1 built (deccdf1). One `EventStatusChip` component (words In progress, Upcoming, Ended; a dot only on In progress; strap-deep text for the first two, graphite for Ended, tokens only, nothing moves, so there is no motion to stop under reduced motion), one `groupByStatus` and one `statusAt` in `src/lib/eventtext.js`, used by the Events tab and the host dashboard. Both lists are grouped In progress, Upcoming (soonest first), Ended (newest first); the host row action is Live, Open or Report.
- Host side: `GET /api/host/me` now also returns `now` (the server clock) and each event's `endedAt`; both read-only, no migration. `useEventClock().statusOf` gets the same rule for a list with no check-in: an event with no start, no end and not ended is Upcoming (the shared `eventStatus` would have said Ended). Status ids are unchanged (`ongoing`); `STATUS_LABEL` is now In progress, Upcoming, Ended.
- Guards changed in `test/events-hub.mjs`: the word is "In progress" not "Ongoing"; the Events page has In progress, Upcoming and Past events groups instead of "Happening now"; the Ended word comes from the chip component. Nothing weakened.
- Decisions without the owner: the plan said a "3-hour default", but the shared rule (D025) is 12 hours after the later of the start and check-in, so the host list uses the 12 hours (for a host, from the start); the attendee heading "Happening now" became "In progress" and the "Upcoming" group has its own heading; the order helper lives in `eventtext.js` (a separate file added about 20 B to every public page's entry).
- Not checked: nothing open. The 12-hour rule means a host event with a start but no end time shows Ended 12 hours after its start.

## Owner steps
- Front end and Worker only, no migration: `npm run deploy` (with the F63, F64 and F67 row in the Master To-Do), then look at "Your events" on the host site and the Events tab on a phone.

Related: [[F15 Events tab and event hub]] · back to [[00 Master To-Do]]
