---
tags: [roadmap, feature, events, ui]
id: F67
priority: P1
phase: 11
size: S
status: In progress
needs: [F63]
---
# F67 Check-in page layout

**Priority:** P1 · **Phase:** 11 Owner requests (2026-11-24, second batch) · **Size:** S · **Needs:** [[F63 Create event form refresh]] · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-24)
"The check-in page for user can be laid out better because currently the checkboxes and stuff are a bit scattered around and not equally spaced."

## Current state
- `src/components/EventPage.vue` draws the check-in page for the real page (`src/views/EventJoin.vue`) and the host's preview, in this order:
  1. the head;
  2. the info list;
  3. a notice;
  4. the attendee room tick, loose, with an inline `margin:4px 0`;
  5. the name field;
  6. the host's questions;
  7. a Sponsors panel;
  8. a "Who to meet" panel (intention and Suggest me);
  9. a "This event collects details" panel;
  10. a muted line;
  11. the error;
  12. the sticky Check in bar with the consent line ([[F51 Sign-up consent as a line by the button]]).
- Ticks sit in different containers with different gaps. Some are in panels and some are not, and several have inline styles.
- It is a public page: the JS budget applies ([[F28 Public-page JS budget]]).

## Plan
- **One even rhythm.** Every choice sits in a panel with a small label heading, in this order:
  1. "About you": the name if asked, and the host's questions.
  2. "At this event": the attendee room tick, and Who to meet (the intention and Suggest me).
  3. "Sharing": the sponsors, and This event collects.
- Each tick is a full-width row, at least 44 px, with the same gap between rows (one spacing token) and the same gap between panels. Panels with nothing to show are left out.
- The info list (food and drink after [[F63 Create event form refresh]]), the notice and the closing muted line keep their meaning. The notice moves under the head, and the muted line goes above the Check in bar.
- Inline styles become scoped classes. No new JS, so the page's gzip JS must not grow by more than 100 B.
- **No change to meaning.** Every rule stays as it is, and the existing tests that pin it keep passing unchanged:
  - what is pre-ticked: Suggest me and collects ticked, sponsors never;
  - every word of each notice;
  - consent recording.
- Same component, so the host's preview changes too.

## Tasks
- [x] F67.1 Regroup and space `EventPage.vue`; tests (order of panels, no inline styles left, every tick a 44 px row, existing consent and pre-tick tests unchanged); vault notes ([[Screens and Routes]], [[Design System]]); browser check of an event with everything on and one with nothing extra, at 375 and 1280 px, light, dark and midnight, keyboard only.

## Acceptance checks
- [x] On an event with questions, sponsors, suggestions and collects on, the page shows the panels About you, At this event and Sharing in that order, with equal gaps (browser, measured by script).
  - Browser, local event `/e/F67AA`, by script: the panels were About you, At this event, Sharing; every gap (notice to info, info to panel, panel to panel, panel to the muted line) was 24 px, and every gap between rows inside a panel 12 px; at 375 and 1280 px, in light, night (dark) and midnight; no sideways scroll. Also `test/checkin-layout.mjs` (order and presence).
- [x] Every tick row is at least 44 px tall (browser, measured by script).
  - Browser: the five tick rows measured 54, 95, 54, 54, 78 px at 375 px and 54, 74, 54, 48, 58 px at 1280 px, in all three themes, each as wide as its panel's inside; the CSS rule is `min-height: var(--tap)` (48 px), pinned in the test.
- [x] Sponsors are still never pre-ticked; Suggest me and collects still are (existing tests pass unchanged).
  - The consent, Who to meet, preview, steps and event-form tests pass unchanged; `test/named-attendance.mjs` changed only in its golden markup comparison and the row-height line (see the Log); `test/checkin-layout.mjs` pins the pre-ticks again.
- [x] The check-in page's gzip JS grows by 100 B or less (budget numbers).
  - EventPage chunk 3,589 B before, 3,686 B after (+97 B); the wording chunk `eventinfo` is unchanged at 319 B. Public page budgets: see the Log.
- [x] `npm test` passes.
  - Passes, ending with `test/budget.mjs`; `npm run build` passes.

## Log
-

Related: [[F60 Intention at check-in and who to meet for everyone]] · [[F31 Named attendance with check-in notice]] · back to [[00 Master To-Do]]
