---
tags: [roadmap, feature, ui, matching]
id: F16
priority: P1
phase: 2
size: M
status: Done
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
- [x] F16.1 `worker/inCommon.js` with normalisers and unit tests (no leaks: a hidden card field never produces a fact).
  - `worker/inCommon.js`: normalisers, `visibleSide` (only what each person shows: their mode's fields and the shared card's tags), `inCommon` (pure) and `sharedGround` (reads the database, nothing stored). `test/inground.mjs` is in `npm test` before the budget check.
- [x] F16.2 Add `inCommon` to the two endpoints.
  - `GET /api/c/:cardId` (signed-in viewers, not the owner) and `GET /api/connections/:id` return `inCommon: [{ kind, text }]`, at most 3, worked out on the request from the two profiles and the cards each person shared; the people list and hosts get none. No migration, nothing stored.
- [x] F16.3 PublicCard layout reorder to the order above, plus the "In common" line.
  - `PublicCard.vue`: one "In common" line under the name and headline (first two facts joined by " · ", the third folds to "+1" under 600 px), then Come to me for, About, Projects, Find online; the shared selfie and its prompts moved from above the tags to after the links. The line is drawn inline, not a lazy chunk: public card +162 B gzip.
- [x] F16.4 Screenshots in light and dark at 375 px and 1280 px, added to the Log.
  - Checked in the browser pane against the local Worker and database (emulated 375 and 1280 px, light and dark, not a real phone); four screenshots are in `attachments/`, embedded in the Log. There is no "before" shot (the page had no such line); the vault, D026 and the Log are in the same commit.

## Acceptance checks
- [x] Two profiles with the same institution and an overlapping tag show "Both into <tag> · Both at <institution>". (`test/inground.mjs`: through `GET /api/c/:cardId` two students on one institution show tags, then institution, with the texts "Both into robotics" and "Both at <institution>"; with the same course the course sits between them. Browser: at 1280 px the line read "Both into Chess · Same course · Both at Example University".)
- [x] A tag hidden on the card the viewer connected through never appears. (`test/inground.mjs`: a profile tag left off the card the viewer opens is not a fact; a tag left off the card someone scanned is not a fact for either person.)
- [x] The card page shows no more than one line of "in common". (Source guard: one block, one line of text, no chips; browser: one line at 375 and 1280 px, the third fact folds to "+1" under 600 px. At 375 px a long line wraps onto a second visual row inside the same block.)

## Log
- 2026-11-10 (Claude subagent): A person's card page now has one "In common" line under their name and headline ("Both into robotics · Same course", the third fact folds to "+1" on a phone). It is built by `worker/inCommon.js` on each request from only what each of you shows the other, with no AI, no migration and nothing stored. It comes back as `inCommon: [{ kind, text }]` on `GET /api/c/:cardId` and `GET /api/connections/:id`. See [[D026 Shared ground is worked out from what each person shows, and never stored]].
- Privacy: both sides are filtered by `visibleSide`: the mode's fields (a career profile's kept course and a student's kept company are never used, in either direction) and the tags of the card each person shared. Events only count when past and either the event you connected at or one whose directory the other joined. Blocked pairs, signed-out viewers, your own card, the people list and every host file get nothing. `test/inground.mjs` (79 checks, in `npm test` before the budget check) covers each rule with the negative case.
- First-load JS (gzip, `test/budget.mjs`), before F16 (commit 310cdae) and after: public card 49,689 to 49,851 B (+162, the line is drawn inline; a lazy chunk would have cost preload-list bytes on every page), PrivacyRequest 50,060 to 50,064 B (hash noise), Landing unchanged at 44,671 B. Headroom now: PublicCard about 1.3 KB, PrivacyRequest about 1.1 KB.
- Decisions I made without the owner: event facts are narrower than the plan (only the connection's own event or a joined directory, and only past events, so a connection does not reveal every event the other attended); a student and a career profile at one institution read "Both studied at"; courses match only at the same institution; institutions match by id, or by the same words when one is typed in; two shared tags read "Both into x and y"; before connecting, your side is your default card (what the other person would receive); the shared selfie and its prompts moved below the links to follow the plan's order. The Terms and Privacy version was not bumped (no new data is collected or kept).
- Not done or not checked: no "before" screenshot; a real phone and a screen reader (the "+1" is hidden from screen readers on a phone, the third fact is hidden with it); the person page (`Person.vue`) does not show the line yet (the API returns it); F17 can use `sharedGround()` for the "reason", F22 can pass the texts to its prompt.
- Screenshots: 375 px dark ![[F16-375-dark.jpg]] · 375 px light, connected ![[F16-375-light-connected.jpg]] · 1280 px light ![[F16-1280-light.jpg]] · 1280 px dark ![[F16-1280-dark.jpg]]

### Owner steps
- Review the F16 commits, `git push`, then `npm run deploy`. No migration for F16 (0018 to 0022 are still to be applied from earlier features).

Related: [[Design System]] · back to [[00 Master To-Do]]
