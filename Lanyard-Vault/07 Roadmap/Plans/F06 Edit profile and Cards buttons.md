---
tags: [roadmap, feature, ui]
id: F06
priority: P0
phase: 0
size: S
status: In progress
needs: []
---
# F06 Edit profile and Cards buttons

**Priority:** P0 · **Phase:** 0 Quick fixes · **Size:** S · **Needs:** nothing · back to [[00 Master To-Do]]

## What the owner asked for
On `/app`, rename "Edit" to "Edit profile" and make it a distinct button instead of a text link. It should not be bright, because it isn't the focus of the page. Do the same with "Cards". Place the two buttons next to each other.

## Current state
`src/views/MyCard.vue` ~192-195: two `topbar-link` text links ("Edit", "Cards") at the right of the "Your badge" heading.

## Plan
- New quiet button style in `src/styles/main.css`, for example `.btn-quiet`: paper background, 1 px `--rule` border, ink text, 36 px tall with a 44 px tap area, no fill, no shadow, small radius. On press only, the border darkens to `--ink`. It must sit below the Persimmon primary action in visual weight. See [[Design System]]: one primary action per screen.
- Labels: "Edit profile" and "Cards". Optionally use small 16 px icons (`note`, `card`), only if both buttons get one.
- Layout: a row of two equal-width buttons directly under the heading, above the badge. On wide screens (≥ 600 px), keep them right-aligned beside the heading instead. Never stack them vertically.

## Tasks
- [x] F06.1 Add `.btn-quiet` (light and dark tokens).
- [x] F06.2 Replace the two links in `MyCard.vue`.
- [x] F06.3 Check at 375 px and 1280 px, in light and dark. The badge stays the clear focus.

## Acceptance checks
- [ ] Both buttons look like buttons, sit side by side, are quieter than any primary button, and pass 4.5:1 text contrast.

## Log
-

Related: [[Design System]], [[F14 Onboarding revamp]] · back to [[00 Master To-Do]]
