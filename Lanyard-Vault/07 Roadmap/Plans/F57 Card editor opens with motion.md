---
tags: [roadmap, feature, ui, motion]
id: F57
priority: P1
phase: 10
size: S
status: Not started
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
- [ ] F57.1 Animate the editor and New card open and close in `Cards.vue` (and any shared helper); keep focus right; extend `test/loading.mjs` or the motion guard so the new rules use tokens and stay under 300 ms; browser check at 375 and 1280 px, light and dark, with reduced motion, keyboard only.

## Acceptance checks
- [ ] Pressing Edit on a card eases the editor open in about 200 ms; nothing jumps after it settles.
- [ ] Cancel eases it closed, then focus is on that card's Edit button.
- [ ] Opening a second card's editor closes the first smoothly.
- [ ] With reduced motion, it fades quickly with no height motion.
- [ ] `/app/cards?edit=<id>&section=code` opens that editor with the motion and shows its code section.
- [ ] `npm test` passes.

## Log
-

Related: [[F40 Motion for sheets panels and tabs]] · [[F33 Card code in the card editor]] · back to [[00 Master To-Do]]
