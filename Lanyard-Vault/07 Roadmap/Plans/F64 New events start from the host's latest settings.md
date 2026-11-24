---
tags: [roadmap, feature, host, privacy]
id: F64
priority: P1
phase: 11
size: S
status: Done
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
- 2026-11-24 (Claude subagent) F64.1 built (68ead22). `GET /api/host/me` carries `eventDefaults`: exactly `directoryOn`, `suggestOn`, `feedbackOn`, `collectOn`, `collectEmail`, `collectCard`, `collectWhy`, from the organisation's most recently created event (`created_at`, then insertion order), found through the existing `findOrg`; the fixed defaults (collects off) when it has none. A field on the existing response rather than a new route: it adds the least (no route, no client call, no second request). Events are never soft-deleted (only removed outright by the reset script or by hand), so "not deleted" is every row there. A fresh form (no draft, after Cancel, after Create) takes the seven; a draft keeps its own; a form still exactly as it started is not saved as a draft. Start from: the seven follow the chosen event once its live route is read (collects off while reading), and back to the latest for "A blank event"; the duplicate route is unchanged and still copies no list by itself. [[D056 New events start from the organisation's latest event's switches, collects included, flagged on the form]], with a pointer in D038.
- Lines: decided to show "As on your last event" only under copied settings that differ from the fixed default (room, suggest, feedback, the email and card ticks, the why line), not under every copied switch, so the line marks the unusual and is not noise. The collects switch says, in bold ink, "On because your last event collected names. Untick to stop."; for a copy the words say "the event you started from". Review adds "(as on your last event)" to those rows. Details shows no such line.
- How each line of the bar is tested (`test/event-defaults.mjs`, 60 checks, before `test/budget.mjs`): (1) through the real Worker: signed out 401, an attendee cookie on the host site 401, on the main site 403, a host with no organisation gets no `eventDefaults`; two organisations each get only their own values, a team member gets the organisation's; a source check that the route uses `findOrg` and one query on `org_id`. (2) the exact sorted keys are checked on every answer; an attendee on A's named list (email and card ticked) leaves no name, email, id or number in it. (3) a first event and an organisation whose events were all deleted get the fixed defaults. (4) an organisation that changed every other switch but never the list starts with it off and its fresh form sends no `collect`. (5) after an event with suggestions off and collects on with email, the answer and the fresh form have suggestions off, list and email on, why filled in. (6) `copiedKeys` (differ-only rule), the rendered step 3 and 4 (which `data-copied` lines show and their words), Review rows, a first event with no line, Details with none. (7) `formFromDraft` keeps a draft's values; source checks that the dashboard reads a draft as it is and fills only a fresh form. (8) the chosen event's live route gives its seven (not the latest's), Create for the copy sends its collects, and the copy reads back with them.
- Browser (local Worker with `MAIL_LOG`, Vite, host.localhost:5173, `f68host@example.com`): made "F64 first source" (suggestions off, list on with email and a why line); New event then showed step 3 with Suggest off, the list and email ticked, the why line filled in and the four lines, at 1280 px light and dark and 375 px light and dark (no sideways scroll); Review at 375 px light listed the three marked rows. Unticking the list in that draft and reloading kept it off (draft wins). Start from "Form check night" gave collects off and Suggest on (that event's, not the latest's); Start from "F64 first source" gave the list on with "On because the event you started from collected names. Untick to stop." and Review marked "(as on the event you started from)". A brand-new local organisation (`f64new@example.com`, company) had room and Suggest on, the list off and no line. Not checked: Midnight, a real phone, a screen reader, keyboard-only through the new lines (they are text, not controls).
- Public pages: no change. Before (F67's last run): Landing 44,301, PublicCard 47,655, Hosts 42,655, Privacy 50,270, Terms 46,778, Redeem 46,011, SignIn 47,123, PrivacyRequest 49,842 B. After: 44,297, 47,649, 42,651, 50,266, 46,775, 46,007, 47,117, 49,835 B (a few bytes of chunk names; no public page imports anything changed).
- Guards changed: none; every existing test passes unchanged. F60 is built but unticked (waiting on its real-model check); this builds on F60 as it stands, with the owner's standing say-so for AI items (2026-11-11). No migration.

## Owner steps
- Front end and Worker only, no migration: `npm run deploy` (with the F63, F67 and F68 row in the Master To-Do). Then on the host site make one event with "Suggest people to each other" off and the list on, open New event and check the lines and Review, and untick the list before creating if you do not want it.
- The D038 caution carries over: the email and card items have no settled lawful basis yet, and a host who ticked them once now finds them ticked on the next event too.

Related: [[F63 Create event form refresh]] · [[F31 Named attendance with check-in notice]] · back to [[00 Master To-Do]]
