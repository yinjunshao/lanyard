---
tags: [roadmap, feature, ui, motion]
id: F57
priority: P1
phase: 10
size: S
status: In progress
needs: [F40]
---
# F57 Card editor opens with motion

**Priority:** P1 · **Phase:** 10 Owner requests (2026-11-24) · **Size:** S · **Needs:** [[F40 Motion for sheets panels and tabs]] · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-24)
"Also for my cards, when they press the edit button, make sure there's an animation. Currently, it just expands instantly, and it's not very aesthetically pleasing."

## Current state
- `src/views/Cards.vue` lines 15-95 and 140-158: `editingId` switches a card row between its summary and the editor (`CardPreview` + `CardForm` + Save / Cancel) with `v-if`, so the editor appears and disappears at once. "New card" (`creating`) works the same way.
- F40's motion rules (`src/styles/main.css` about 910-930): only transform and opacity move, except that "a details panel may also ease its height where the browser" supports it; tokens `--dur`, `--dur-out`, `--ease-out`, `--ease-in`; one reduced-motion block. [[D045 Motion is CSS tokens and a few lines of script, never a library or Vue Transition]] forbids Vue `<Transition>` and libraries.

## Plan
- Pressing Edit: the row's height eases open (the same height technique F40 allows for details panels, for example a `grid-template-rows: 0fr` to `1fr` wrapper, or `interpolate-size` where supported), and the editor's content fades in and rises by `--shift`, in about `--dur` (200 ms), with the preview and form following 30 ms apart (`--stagger`).
- Cancel or Save: the reverse, faster (`--dur-out`), and only then is the editor removed from the DOM (the F40 pattern for things leaving: no clicks meanwhile, focus moves back to that card's Edit button afterwards).
- Opening another card's editor closes the first with the same motion. The page scrolls the opened editor into view smoothly (instant under reduced motion) only if its top is off screen.
- "New card" opens and closes the same way.
- Opening from the address (`?edit=<card>&section=code`, F33) should also animate, then scroll to the code section.
- Reduced motion: a short fade, no height change.
- No library, no `<Transition>`, nothing over 300 ms, tokens only. Not a public page.

## Tasks
- [x] F57.1 Animate the editor and New card open and close in `Cards.vue` (and any shared helper); keep focus right; extend `test/loading.mjs` or the motion guard so the new rules use tokens and stay under 300 ms; browser check at 375 and 1280 px, light and dark, with reduced motion, keyboard only.

## Acceptance checks
- [x] Pressing Edit on a card eases the editor open in about 200 ms; nothing jumps after it settles.
  - Verified in the Browser pane at 375 px: after Edit the page holds the running transitions (read with `getAnimations()`): the editor's `grid-template-rows` 0fr to 1fr over 200 ms with `--ease-out`, its content opacity over 200 ms, the parts' `m-rise` 200 ms with delays of 30, 60 and 90 ms, and the summary's row folding over 140 ms; afterwards the block is `reveal open settled` (overflow free, a focus ring is not cut) and the height does not change. The pane draws only a few frames a second, so I read the timings rather than watching 60 fps.
- [x] Cancel eases it closed, then focus is on that card's Edit button.
  - Verified with a click on Cancel and with the keyboard (Edit with Enter, Tab into the editor, Cancel with Enter), and after Save: the editor is `inert` at once (no clicks or keys), is still in the page for 220 ms, is then gone, and `document.activeElement` is `card-edit-<id>`. The saved name showed in the summary.
- [x] Opening a second card's editor closes the first smoothly.
  - Verified: pressing Edit on card A while B's editor was open left A `reveal open settled` and B's editor gone after the exit; focus stayed in A's editor (the closing editor does not take it back). New card open then Edit on a card did the same, and New card closed by its own button gives focus back to it.
- [ ] With reduced motion, it fades quickly with no height motion.
- [x] `/app/cards?edit=<id>&section=code` opens that editor with the motion and shows its code section.
  - Verified by loading the address at 375 px: the editor opened with the reveal, then scrolled (smooth) towards `#card-code-<id>`; the pane's frame rate stalled the smooth scroll part way, so I repeated it with the reduced-motion media query faked in the page (instant scroll): the editor opened and the page ended with the code panel on screen (the card is last, so the page cannot scroll it to the very top). It also found a bug now fixed (a `const` used before it was defined, which blanked the page).
- [x] `npm test` passes.
  - `npm test` exit 0 and `npm run build` exit 0 at the F57.1 commit; budget in the Log.

## Log
- 2026-11-24 (Claude subagent) F57.1: the card editor, the New card form and each card's summary go through one small component, `src/components/ui/UiReveal.vue`. Height is the grid-row ease (0fr to 1fr, `--dur-reveal` 200 ms in and `--dur-reveal-out` 140 ms out), the one height ease D045 allows beside `<details>` (allowed in the `test/loading.mjs` motion bar as `grid-template-rows`, written only in the `.reveal` rules); the content fades and the parts rise 30 ms apart. Closing keeps the editor in the page, `inert`, until a 220 ms timer ends. Reduced motion: both height tokens are 0 and the row folds after the 100 ms fade (`--reveal-wait`), so it is a short fade. No `<Transition>`, no library, no duration written in a component.
- **Left unticked: reduced motion.** The browser pane cannot emulate `prefers-reduced-motion`, and a source guard is not enough to tick it. To check: turn on reduced motion in the operating system, press Edit and Cancel in My cards: it should fade in about 120 ms with no height movement and no slide. Item stays In progress until then.
- **Guard changed:** `test/codes.mjs` checked that the code panel sits under `v-if="editingId === c.cardId"`; the editor is now inside `<UiReveal :open="editingId === c.cardId">` (it is in the page only while open or closing), so the guard now checks that, with the same strength. `test/loading.mjs` grew from 238 to 250 checks (an F57 section) and its transition list now allows `grid-template-rows`.
- **Decisions without the owner:** the summary folds away as the editor opens (a second reveal, kept in the page and inert while folded, so Edit stays for focus); the opened editor takes focus (a labelled group) only if nothing else has it, because the Edit button that opened it is hidden by then; New card returns focus to its button. Scroll into view only when the editor's top is off screen, after the opening ends.
- Public pages: not touched (budget after F57.1: Landing 44,013, PublicCard 47,353, Hosts 42,524, Privacy 49,426, Terms 46,649, Redeem 45,863, SignIn 46,991, PrivacyRequest 49,720 B).

Related: [[F40 Motion for sheets panels and tabs]] · [[F33 Card code in the card editor]] · back to [[00 Master To-Do]]
