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
- [ ] F30.4 Tests (the created event is identical to the old single form for the same inputs; validation per step; draft survives a refresh; Cancel clears it) and a browser check at 375 and 1280 px, light and dark.

## Acceptance checks
- [ ] A host can create an event going through every step by keyboard only, and the event matches what they entered.
- [ ] Refreshing on step 3 keeps what was entered in steps 1 and 2.
- [ ] "Start from an earlier event" on step 1 fills the later steps.
- [ ] No public page gets heavier ([[F28 Public-page JS budget]]).

## Log
-

Related: [[Host Portal and Billing]], [[Design System]] · back to [[00 Master To-Do]]
