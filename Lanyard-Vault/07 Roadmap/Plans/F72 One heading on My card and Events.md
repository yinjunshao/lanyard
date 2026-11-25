---
tags: [roadmap, feature, ui, card, events]
id: F72
priority: P1
phase: 13
size: S
status: In progress
needs: []
---
# F72 One heading on My card and Events

**Priority:** P1 · **Phase:** 13 Owner requests (2026-11-25, second batch) · **Size:** S · **Needs:** none · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-25)
> "Perhaps move the card selector at the top below the edit profile and cards area. And we don't need another text saying your badge. Just make it one text being called my card and make that the size and stylization of your badge instead. You don't need two of the things. Similar to the events page as well."

## Current state
- `src/views/MyCard.vue` (about line 157): `.card-head` has a small `label` "My card" above an `h1` "Your badge", with Edit profile and Cards beside it. The empty state (about line 148) has the label "My card" and the `h1` "Make your badge".
- The card switcher (`UiSelect`, label "Switch card") is the last thing on the page (about line 281).
- `src/views/Events.vue` (about line 38): the label "Your events" above the `h1` "Events".

## Plan
- My card gets one heading, the `h1` "My card", styled the way "Your badge" is today. The small label goes, and Edit profile and Cards stay where they are.
- The "Switch card" selector moves to directly under the Edit profile and Cards row, above the finish-your-card panel and the badge. Same component and behaviour. If today it shows only when there is more than one card, keep that; if it always shows, keep that too.
- The empty state gets one `h1`, "My card", and keeps its sub line.
- Events gets one `h1`, "Events", and the "Your events" label goes.
- Change other attendee pages with the same label-over-heading pair only where the owner's "similar to the events page" clearly covers them. Do not change host pages, and list any page you left in the Log.
- Copy and source guards (`test/copycheck.mjs`, `test/ui.mjs`, the F06 and F68 tests) may pin the old text. Update them without weakening them.

## Tasks
- [x] F72.1 One heading on My card and Events, and the switcher under the buttons.
- [ ] F72.2 Vault notes ([[Screens and Routes]] if it names the headings), Log, Master To-Do.

## Acceptance checks
- [ ] My card shows exactly one heading, "My card", at the size "Your badge" had, and the text "Your badge" is nowhere in `src/`.
- [ ] With two cards, the switcher sits directly under Edit profile and Cards, and switching still changes the badge.
- [ ] Events shows one heading, "Events", and no "Your events" label.
- [ ] At 375 px and 1280 px, light and dark, the heading and buttons line up as before.

## Log
-

Related: [[F06 Edit profile and Cards buttons]] · [[F68 Event status on event lists]] · back to [[00 Master To-Do]]
