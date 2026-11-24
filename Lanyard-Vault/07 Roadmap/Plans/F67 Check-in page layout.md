---
tags: [roadmap, feature, events, ui]
id: F67
priority: P1
phase: 11
size: S
status: Not started
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
- [ ] F67.1 Regroup and space `EventPage.vue`; tests (order of panels, no inline styles left, every tick a 44 px row, existing consent and pre-tick tests unchanged); vault notes ([[Screens and Routes]], [[Design System]]); browser check of an event with everything on and one with nothing extra, at 375 and 1280 px, light, dark and midnight, keyboard only.

## Acceptance checks
- [ ] On an event with questions, sponsors, suggestions and collects on, the page shows the panels About you, At this event and Sharing in that order, with equal gaps (browser, measured by script).
- [ ] Every tick row is at least 44 px tall (browser, measured by script).
- [ ] Sponsors are still never pre-ticked; Suggest me and collects still are (existing tests pass unchanged).
- [ ] The check-in page's gzip JS grows by 100 B or less (budget numbers).
- [ ] `npm test` passes.

## Log
-

Related: [[F60 Intention at check-in and who to meet for everyone]] · [[F31 Named attendance with check-in notice]] · back to [[00 Master To-Do]]
