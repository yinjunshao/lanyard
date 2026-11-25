---
tags: [roadmap, feature, motion, scan, card]
id: F73
priority: P1
phase: 13
size: M
status: In progress
needs: []
---
# F73 Scan and card arrival motion

**Priority:** P1 · **Phase:** 13 Owner requests (2026-11-25, second batch) · **Size:** M · **Needs:** none · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-25)
> "Perhaps make like or start designing an animation for when users scan another user's QR code. So make the loading animation or whatever cleaner. And also make card loading animation, so when after they arrive on another person's card, the card smoothly comes out as well."

## Current state
- `src/views/Scan.vue`: the camera reads a QR, `resolveScanned` resolves it, and `go()` (about line 28) calls `router.push('/c/<cardId>...')` straight away. Nothing says "got it".
- `src/views/PublicCard.vue` (a public page): while loading it shows a skeleton (`.sk-wrap.sk-profile`, about line 98), then the card appears at once.
- Motion rules live in the Motion section of `src/styles/main.css` (about lines 39, 914 and 1006): with reduced motion, slides become short fades. The keyframes `m-fade`, `m-fade-out` and `shutter` already exist. See [[F40 Motion for sheets panels and tabs]] and [[F42 Elastic slides for tabs and notches]].
- **JS budget:** PublicCard loads 47,699 B gzip against 51,200 B. Keep its growth under 600 B, and prefer CSS.

## Plan
- **Scan, when a code is read:**
  - The scan frame locks onto the code. The four corner marks close in and turn the strap colour, then a short soft pulse and a tick, about 350 ms in all, with a light haptic (`navigator.vibrate(15)` where it exists). Then the page moves on.
  - If resolving takes longer than the animation, the frame holds a calm "Opening card" state: a thin progress line along the frame, not a spinner.
  - A code that is not a Lanyard code shakes the frame once and shows the existing hint.
- **Card arrival on `/c/<id>`:**
  - The skeleton keeps the card's real shape and size, so nothing jumps, and its shimmer stays as it is.
  - When the data arrives, the badge rises into place (about 16 px up, with a fade, about 320 ms, using the easing the Motion section already uses). The panels under it follow 60 ms later.
- **Reduced motion:** both become a plain 150 ms fade, with no movement, no shake and no haptic.
- **How it is built:**
  - No animation library: CSS keyframes and classes, plus the smallest JS to add a class when the code is read or the data has arrived.
  - Once the answer is back, the route change waits for nothing longer than the animation.
  - Name the classes generally (for example `.scan-lock`, `.arrive`), so the Connect flow can reuse the same lock later.

## Tasks
- [x] F73.1 The scan lock, the opening state and the miss shake in Scan.
- [x] F73.2 The card rising into place on the public card page, with the panels after it.
- [ ] F73.3 Tests (source guards for the reduced-motion fallbacks, and the budget), vault notes, Log, Master To-Do.

## Acceptance checks
- [ ] Typing a card code on Scan (or a test that calls the same handler) shows the lock state for about 350 ms and then opens the card. A wrong code shakes once and shows the hint.
- [ ] On `/c/<id>` with the network throttled in the browser pane, the skeleton has the card's size. When the card loads, the badge rises in with no layout jump (the page height above the badge does not change).
- [ ] With reduced motion emulated, both are plain fades, checked in the computed styles.
- [ ] PublicCard stays under budget and grows by less than 600 B gzip, with the numbers in the Log.
- [ ] Owner check (cannot be ticked by an agent): scan a real badge with a phone camera and judge whether it feels clean.

## Log
-

Related: [[F40 Motion for sheets panels and tabs]] · [[F38 Loading states]] · back to [[00 Master To-Do]]
