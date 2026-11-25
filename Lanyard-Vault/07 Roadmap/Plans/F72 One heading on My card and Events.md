---
tags: [roadmap, feature, ui, card, events]
id: F72
priority: P1
phase: 13
size: S
status: Done
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
- [x] F72.2 Vault notes ([[Screens and Routes]] if it names the headings), Log, Master To-Do.

## Acceptance checks
- [x] My card shows exactly one heading, "My card", at the size "Your badge" had, and the text "Your badge" is nowhere in `src/`.
- [x] With two cards, the switcher sits directly under Edit profile and Cards, and switching still changes the badge.
- [x] Events shows one heading, "Events", and no "Your events" label.
- [x] At 375 px and 1280 px, light and dark, the heading and buttons line up as before.

## Log
- 2026-11-25 (Claude subagent) F72.1 built (38bf172). `src/views/MyCard.vue`: one `h1` "My card" (28 px, the same global `h1` rule "Your badge" had) in the `.card-head` row beside Edit profile and Cards, which stay where they were; the small label is gone, and the two buttons now centre against the single line (they were bottom-aligned against a label and heading). The "Switch card" `UiSelect` moved from the last element to directly under that row, above the finish panels and the badge; same component, same model and options, and it still always shows (it did before; with one card it lists that card). The empty state has one `h1` "My card" and keeps its sub line and "Set up your card". `src/views/Events.vue`: one `h1` "Events", the "Your events" label removed. Both headings carry `margin-top:0` inline, because `.page-head h1` adds 6 px for a label that is no longer there (`main.css` is not touched).
- Checks: `test/card-heading.mjs` (new, in `npm test` before `rederive-fixes`) compiles both templates and guards: no "Your badge" or "Make your badge" anywhere in `src/`, exactly one h1 "My card" in each of the two My card states, no "My card" label, Edit profile and Cards unchanged, one Switch card selector straight after the action row and before the finish panels and the badge (not at the bottom), Events has one h1 and no "Your events" label, and the host dashboard keeps its own. No existing guard needed changing (`test/ui.mjs`, `test/codes.mjs`, `test/copycheck.mjs` and the rest passed as they were). Seen in the browser pane at 375 px and 1280 px, light and dark: My card (one heading, buttons level with it, the switcher under them), Events (one heading); with two cards the switcher sheet picked "Second" and the badge and the code line changed to that card (KHY8).
- Other attendee pages with a label over a heading, left alone: Feedback ("Feedback" over "How was ...?"), Redeem ("Redeem" over "Got a code?"), Connect ("Connect with" over the person's name) and Landing ("Networking for events" over the headline). In each the label says something the heading does not, so "similar to the events page" does not clearly cover them. The host dashboard keeps its "Your events" label (host pages are out of scope); Development-only UiTest was not touched.
- Vault updates: [[Screens and Routes]] has a new "My card and Events headings (F72)" paragraph. Pending (owner-modified note): `Testing.md` is modified in the working tree, so it was not edited. Add this row to its test table: `| node test/card-heading.mjs | F72: My card has one h1 "My card" (and the empty state too), Events one h1 "Events", the Switch card selector sits directly under Edit profile and Cards, "Your badge" and the "Your events" label are gone from the attendee pages. Source guards; the look is checked in a browser. |`

## Owner steps
- Front end only, no migration: `npm run deploy` (with F71). Then look at My card and Events on a phone, with two cards on My card.

Related: [[F06 Edit profile and Cards buttons]] · [[F68 Event status on event lists]] · back to [[00 Master To-Do]]
