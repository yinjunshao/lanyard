---
tags: [roadmap, feature, design]
id: F42
priority: P1
phase: 8
size: S
status: In progress
needs: [F40]
---
# F42 Elastic slides for tabs and notches

**Priority:** P1 · **Phase:** 8 Owner requests (2026-11-18) · **Size:** S · **Needs:** [[F40 Motion for sheets panels and tabs]] · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-19)
"Let's add ... rubber banded or elastic animations for the settings where there is a sliding notch or whenever there is one on the website."
"Let's add a animation for when user switches different pages, such as from my card to scan to people to events, where the little orange bar on top of the selected thing, it slides across to the other side ... Make this also kind of elastic. And on second, if they spam it, then obviously you can't do the animation. So just skip that."

## Current state
- F40 added `--dur-glide` and a sliding bar to the AppShell tab bar (`src/components/AppShell.vue` about line 70, `--tab` index; CSS in `src/styles/main.css`), and `src/lib/segGlide.js` for `.seg` segmented controls (host event page). Both use an ease-out, no overshoot.
- Other sliding notches: any `.seg`, toggle switches and chip groups in Settings and elsewhere. Survey them first.

## Plan
1. One elastic easing token in `:root`: a spring written with CSS `linear()` (a small overshoot of about 6-8% and one settle, about 420 ms), with a `cubic-bezier(.34,1.4,.64,1)` fallback where `linear()` is not supported. Only `transform` moves.
2. Use it for the tab bar's orange bar between My card, Scan, People and Events, and for every sliding notch: `.seg` (via `segGlide`), toggle switch knobs, and any other sliding indicator the survey finds. Make Settings use `.seg` + `segGlide` where it has a hand-made picker that would read better as one (survey first; do not restyle what is not a slider).
3. The tab bar bar keeps its place across route changes (it lives in the shell, so it survives the page swap). If the person taps another tab while the bar is still moving (within the glide time) or more than twice in about 600 ms, the bar jumps straight to the new tab with no animation, and the elastic comes back on the next calm tap.
4. Reduced motion: no overshoot, no slide; it jumps (as F40).
5. F40's motion rules hold, with one named exception: the elastic token may run up to 450 ms. Update the F40 guard in `test/loading.mjs` for that one exception without weakening the rest.

## Tasks
- [x] F42.1 The elastic token, the tab bar bar with the spam skip, guards in `test/loading.mjs`.
- [ ] F42.2 Every other sliding notch (survey listed in the Log), browser check at 375 and 1280 px, light and dark, reduced motion; [[Design System]] Motion section and D045 updated (or D046 if it is a new decision).

## Acceptance checks
- [ ] Tapping My card then People moves the orange bar across with a slight overshoot and settle.
- [ ] Tapping four tabs quickly makes the bar jump to the last one, with no queued slides.
- [ ] A segmented control in Settings or the host event page slides with the same overshoot.
- [ ] With reduced motion on, the bar jumps.
- [ ] `npm test` passes with budget numbers in the Log.

## Log
-

Related: [[F40 Motion for sheets panels and tabs]] · back to [[00 Master To-Do]]
