---
tags: [roadmap, feature, ui, matching]
id: F16
priority: P1
phase: 2
size: M
status: Not started
needs: [F11, F12]
---
# F16 Shared ground without AI

**Priority:** P1 (F22 needs it) · **Phase:** 2 Events · **Size:** M · **Needs:** [[F11 Student and Career mode]], [[F12 Institution picker]] · **Unlocks:** [[F17 Event presence and who to meet]], [[F22 AI follow-up drafts]] (topic chips) · back to [[00 Master To-Do]]

## Why no AI here
"You both studied X, you met at Y" comes straight from fields we already have. A model adds cost, delay and a privacy question for no gain. The owner agreed, with one condition: think carefully about the UI, so it sorts things without being messy or stacked.

## What it computes
Server-side only, using only data the viewer is allowed to see: the peer's **visible** card fields plus the viewer's own profile.

| Kind | Rule | Text |
| --- | --- | --- |
| institution | same `institution_id` | "Both at University of Example" |
| course | same normalised course, same institution | "Same course" |
| company | same normalised company (career mode) | "Both at Acme" |
| tags | overlap of "come to me for" tags (normalised, singular/plural folded) | "Both into robotics" |
| event | both checked in to the same past events | "Both at Spring networking night" (most recent only) |

Skip mutual-connection counts. They expose who knows whom.

Return at most 3 facts, most specific first (tags and course over institution). Response field: `inCommon: [{ kind, text }]` on `GET /api/c/:cardId` (signed-in viewers only) and on `/api/connections/:id`.

## UI rules (to avoid a stacked page)
Content order on a person's card page (`PublicCard.vue`), top to bottom. Each block appears only if it has content:
```
[photo]  Name
         Role at Company / Course · University
IN COMMON   Both into robotics · Same course        ← one line, small caps label
COME TO ME FOR  [chip] [chip] [chip] [chip]
About text (3 lines, "more")
Links (icon buttons in one row)
───────────────
Your note · Follow up · Selfie                     ← connected only
Connected via QR code at … · Tue 4 Nov, 18:42      ← F13 footer
```
- "In common" is **one line** of plain text separated by " · ", not chips, so it doesn't compete with the "Come to me for" chips. It's truncated with "+1" after two facts on narrow screens.
- In People list rows: no "in common" (keep rows two lines).
- In event suggestions ([[F17 Event presence and who to meet]]): the first fact is the "reason".
- Give a design reviewer a 375 px screenshot before and after, attached to the Log below.

## Tasks
- [ ] F16.1 `worker/inCommon.js` with normalisers and unit tests (no leaks: a hidden card field never produces a fact).
- [ ] F16.2 Add `inCommon` to the two endpoints.
- [ ] F16.3 PublicCard layout reorder to the order above, plus the "In common" line.
- [ ] F16.4 Screenshots in light and dark at 375 px and 1280 px, added to the Log.

## Acceptance checks
- [ ] Two profiles with the same institution and an overlapping tag show "Both into <tag> · Both at <institution>".
- [ ] A tag hidden on the card the viewer connected through never appears.
- [ ] The card page shows no more than one line of "in common".

## Log
-

Related: [[Design System]] · back to [[00 Master To-Do]]
