---
tags: [roadmap, feature, host, privacy]
id: F64
priority: P1
phase: 11
size: S
status: In progress
needs: [F63, F31, F60]
---
# F64 New events start from the host's latest settings

**Priority:** P1 · **Phase:** 11 Owner requests (2026-11-24, second batch) · **Size:** S · **Needs:** [[F63 Create event form refresh]], [[F31 Named attendance with check-in notice]], [[F60 Intention at check-in and who to meet for everyone]] · back to [[00 Master To-Do]]

> [!note] Owner decision 2026-11-24: "What this event collects" is copied from the latest event too, with a line saying where it came from and spelled out on Review. This narrows [[D038 Named attendance is per event, shown on the check-in page and pre-ticked by the owner's choice]], which said the host chooses again for every event.

> [!warning] Risk the owner accepted (2026-11-24): a host who switched on named attendance once now has it on for every new event unless they untick it. They could collect names at an event where they did not mean to. Lower the risk with the "From your last event" line on the switch, the Review row, and a test that a host who never switched it on still starts with it off.

## What the owner asked for (2026-11-24)
"for the host account, if they have checked, basically use the latest setting that they have used for the previous event. For example, applies for what this event collects, suggest people to each other. These are ticked or unticked depending on their latest choice for the latest event."

Asked whether that should include "What this event collects", the owner chose **"Copy it, flag it"**.

## Current state
- A new form starts from fixed defaults in `src/views/HostDashboard.vue`:
  - "Show the live attendee room" on;
  - "Suggest people to each other" on ([[F60 Intention at check-in and who to meet for everyone]]);
  - feedback on;
  - "What this event collects" off ([[D038 Named attendance is per event, shown on the check-in page and pre-ticked by the owner's choice]]).
- "Start from" an earlier event (F30) copies the venue, perks, questions, feedback form and sponsors, but not collects.

## Plan
- **What follows the latest event:** the switches and the collects choice only, not the content.
  - The switches: `directoryOn`, `suggestOn` and `feedbackOn`.
  - The collects choice: `collectOn`, `collectEmail`, `collectCard` and `collectWhy`.
- **The latest event** is the organisation's most recently created event that is not deleted. It is per organisation, not per team member, since the events belong to the organisation.
- **The defaults come from the server.** A small read, either `GET /api/host/events/defaults` or a field on the existing dashboard response: whichever adds the least. It returns only those seven values, and it is limited to the host's own organisation.
- **A first event,** or an organisation whose events are all deleted, gets today's fixed defaults.
- **On the form:**
  - each copied switch shows a small muted line, "As on your last event";
  - the collects switch, when it comes on from the last event, shows "On because your last event collected names. Untick to stop.";
  - Review lists every copied setting under its step.
- **Start from an earlier event:** these values come from the event chosen, not the latest, so the two never disagree. The F30 copy rules are otherwise unchanged.
- **Drafts:** a draft the host already has keeps its own values, and the defaults only fill a fresh form.
- **Decision note:** new D056, recording that D038 is narrowed. Add a pointer line in D038.

## Tasks
- [x] F64.1 The defaults read, the form filled from it, the lines on the form and Review, Start from using the chosen event; tests (first event gets the fixed defaults; after an event with suggestions off and collects on with email, the next form has them so; another organisation's events never leak; a draft is not overwritten); D056 and the D038 pointer; vault notes ([[API Surface]], [[Screens and Routes]]); browser check at 375 and 1280 px.

## Acceptance checks
- [x] A host whose latest event had "Suggest people to each other" off opens Create event and finds it off, with "As on your last event" (test and browser).
  - Test (`test/event-defaults.mjs`): after an event with suggestions off, the real Worker's `eventDefaults` has `suggestOn: false`; step 3 rendered on the server has the switch unticked with "As on your last event" under it. Browser (local, `f68host@example.com`): made "F64 first source" with suggestions off, then New event: step 3 had the switch off with the line, at 375 and 1280 px, light and dark.
- [x] A host whose latest event collected names with email opens Create event: the collects switch and the email tick are on, the why line is filled in, the "On because your last event collected names" line shows, and Review lists it (test and browser).
  - Test: `eventDefaults` is exactly `{ directoryOn: true, suggestOn: false, feedbackOn: true, collectOn: true, collectEmail: true, collectCard: false, collectWhy: <the line> }`; step 3 shows the bold "On because your last event collected names. Untick to stop." and "As on your last event" under the email tick and the why line (not the card tick or the room switch); Review rows end "(as on your last event)". Browser: step 3 had the list and email ticked, the why line filled in and the four lines (measured: display block, muted grey, the collects line in ink); Review at 375 px light said "Suggest people to each other: No (as on your last event)", "Attendance list: On: names and check-in times, with email address for people who leave that tick on (as on your last event)" and the why line likewise.
- [x] A host who has never switched collects on starts with it off (test).
  - Test: an organisation with two events that changed every other switch but never the list gets `collectOn: false`, email and card off, no why line, and its fresh form sends no `collect`; a first event and an organisation whose events were all deleted get the fixed defaults. Browser: a brand-new local organisation's first Create event had the room and Suggest on, the list off and no line anywhere (375 px light).
- [x] Organisation A's defaults never come from organisation B's events (test, through the real Worker).
  - Test: two organisations with different settings each get their own seven, with no value of the other's in the answer; a team member who joins A gets A's; deleting all of A's events gives A the fixed defaults while B keeps its own. Signed out 401, an attendee cookie on the host site 401, on the main site 403.
- [x] `npm test` passes.
  - Passes, with `test/event-defaults.mjs` (60 checks) before `test/budget.mjs`; `npm run build` passes; no public page changed (see the Log).

## Log
-

Related: [[F63 Create event form refresh]] · [[F31 Named attendance with check-in notice]] · back to [[00 Master To-Do]]
