---
tags: [roadmap, feature, host]
id: F30
priority: P1
phase: 6
size: M
status: In progress
needs: [F08, F18]
---
# F30 Create event in steps

**Priority:** P1 · **Phase:** 6 Owner requests 2026-11-13 · **Size:** M · **Needs:** [[F08 Custom pickers and dropdowns]], [[F18 Live previews for cards and events]] · back to [[00 Master To-Do]]

## What the owner asked for
"When creating a new event in the host page, make steps separated by stage instead of just one long page." (2026-11-13)

## Current state
Create event on the host dashboard (`src/views/HostDashboard.vue`) is one long form: name, venue, start and end ([[F08 Custom pickers and dropdowns]]), theme and brand colour, "Start from" an earlier event, perks, the room/directory tick, check-in questions, sponsors. [[F18 Live previews for cards and events]] draws the real check-in page beside it from 1000 px, and behind a Preview button below that.

## Plan
- A stepper, one stage per screen, in this order (adjust if the code shows a better grouping, and say why in the Log):
  1. **Basics:** name, start, end, venue, and "Start from an earlier event" (which fills the later steps).
  2. **Look:** theme and brand colour.
  3. **At the event:** room/directory, perks, and the "What this event collects" settings that [[F31 Named attendance with check-in notice]] adds (leave a clearly marked slot for them; F31 fills it).
  4. **Questions:** check-in questions and sponsors.
  5. **Review:** a summary of every choice with "Change" links back to each step, the F18 preview full size, and Create event.
- Progress shown as "Step 2 of 5" plus step names; Back and Next at the bottom (thumb zone), one primary action per screen ([[Design System]]). Next validates only that step's fields; errors appear next to the field.
- The draft is kept while moving between steps and survives a refresh (session storage, wrapped in try/catch; cleared on Create or Cancel). Nothing is saved to the server until Create.
- The step is in the address (`?step=2`) so the browser Back button moves between steps.
- The F18 preview stays beside the form from 1000 px on every step and updates live; below that, Preview stays a button.
- Edit (the Details tab) stays a single page: only creation becomes steps.
- Keyboard: focus moves to the step heading on each step change; Enter on the last field of a step is Next.

## Tasks
- [x] F30.1 Split the create form into step components with shared draft state; no change to what is sent on Create.
  - Four field-group components (`EventStepBasics`, `EventStepLook`, `EventStepAtEvent`, `EventStepQuestions`, plus `CopiedFacts`) take the one `form` object; `lib/eventsteps.js` holds the blank form, `submitPlan` (the old Create choice, unchanged), per-step checks and the copy summary; `lib/eventdraft.js` is the session-storage draft. The dashboard still shows them as one page until F30.2. All in the existing host chunk.
- [x] F30.2 Stepper UI, per-step validation, step in the address, refresh-safe draft.
  - `EventCreate.vue` draws one step at a time with "Step N of 5", the step names (earlier ones go back), Back and Next in a sticky bar at the bottom, Cancel at the top. The dashboard owns the form, the address (`?step=N`: Next and Back push entries, so the browser Back button moves between steps; Cancel and Create replace), the draft and the request. Next checks only that step (`validateStep`), shows the problem by the field and moves focus to it; Enter in a field is Next; focus goes to the step heading on every step. Someone who lands on a later step without finishing an earlier one is sent to the first step with a problem. A server refusal for the name or the end time brings the host back to that step with the message at the field; anything else (no credits, network) stays on Review. The draft is in session storage, keyed to the host's email and organisation, cleared on Create, Cancel and sign-out (`hostSignOutAndReload` in `hostapi.js`, which only host pages use, so no shared code changed). The preview now shows for a copy of an earlier event too, from its details read through the host's own live route.
- [x] F30.3 Review step with Change links and the full preview.
  - The Review step (built with the stepper in F30.2) lists every choice in four groups, each with a Change link back to its step, the cost, and the one Create button. This task adds the full preview: from 1000 px it is the sticky frame beside the form on every step, as before; below 1000 px it stays a Preview button on steps 1 to 4, and on Review (`EventPreview` `inline`) the whole check-in page is drawn under the summary, with no button or dialog, so the host sees it before pressing Create. For a copy it shows the earlier event's details.
- [x] F30.4 Tests (the created event is identical to the old single form for the same inputs; validation per step; draft survives a refresh; Cancel clears it) and a browser check at 375 and 1280 px, light and dark.
  - `test/steps.mjs` (93 checks, wired into `npm test` before the budget check): the stepper's request equals the old single form's (the old choice is copied into the test word for word; eight forms and two copies), events made both ways against the real Worker store and read back the same (stored row, host live route, attendee route, feedback form, sponsors), checks per step, the server's own refusals map to the right step, `?step=N`, the draft (round trip, per host and organisation, cleared by Create, Cancel and sign-out, storage that throws), every screen rendered on the server with the pickers stubbed, and guards that no shared file, route or chunk changed. Browser (local Worker and database, host.localhost:5173, the browser pane): see the Log.

## Acceptance checks
- [x] A host can create an event going through every step by keyboard only, and the event matches what they entered.
  - Browser, keys only after focusing New event: Enter opens step 1 and puts focus on the heading; Tab and typing for name and venue; Enter in a field is Next (an empty name shows the message by the field and keeps focus there); the theme picker by Enter, Arrow keys, Enter; perks, access, food and sign-ups typed; Space unticked the attendee room; Enter in the last question field went on to Review; Tab to Create and Enter. The saved event (read from the host's live route) had the name, venue, Night theme, perk, access, food, 25 sign-ups, no attendee room and both check-in questions as typed, and the draft was gone. Dates were left empty: the date and time pickers' keyboard use is F08's.
- [x] Refreshing on step 3 keeps what was entered in steps 1 and 2.
  - Browser: after typing a name, choosing Formal and typing two perks, a reload on `?step=3` came back on step 3 with both perks, and Back (the browser button) showed step 2 with Formal still chosen; the preview kept the name. `test/steps.mjs` covers the draft round trip.
- [x] "Start from an earlier event" on step 1 fills the later steps.
  - Browser: choosing "A copy of Old social" showed its venue on step 1, its theme and colour on step 2, perks, access, food, sign-ups and the attendee room on step 3, its check-in question, feedback and sponsors on step 4, all of it on Review, and the preview showed the old event. Create sent the copy; it read back with the same venue, theme, perks and questions. They are shown, not editable, because Create has always sent only the name and times for a copy (D037).
- [x] No public page gets heavier ([[F28 Public-page JS budget]]).
  - `test/budget.mjs` after the last code commit: PublicCard 51,030 B (51,020 before F30, +10 B from the longer chunk names in the entry's map, 170 B left), PrivacyRequest 50,578 B (50,569), Landing 45,144 B (45,134), all under 51,200. No new route, no shared file changed and no new lazy chunk (the step components are in the dashboard's chunk); `test/steps.mjs` guards each.

## Log
-

Related: [[Host Portal and Billing]], [[Design System]] · back to [[00 Master To-Do]]
