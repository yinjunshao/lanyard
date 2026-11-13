---
tags: [roadmap, feature, host]
id: F30
priority: P1
phase: 6
size: M
status: Not started
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
- [ ] F30.1 Split the create form into step components with shared draft state; no change to what is sent on Create.
- [ ] F30.2 Stepper UI, per-step validation, step in the address, refresh-safe draft.
- [ ] F30.3 Review step with Change links and the full preview.
- [ ] F30.4 Tests (the created event is identical to the old single form for the same inputs; validation per step; draft survives a refresh; Cancel clears it) and a browser check at 375 and 1280 px, light and dark.

## Acceptance checks
- [ ] A host can create an event going through every step by keyboard only, and the event matches what they entered.
- [ ] Refreshing on step 3 keeps what was entered in steps 1 and 2.
- [ ] "Start from an earlier event" on step 1 fills the later steps.
- [ ] No public page gets heavier ([[F28 Public-page JS budget]]).

## Log
-

Related: [[Host Portal and Billing]], [[Design System]] · back to [[00 Master To-Do]]
