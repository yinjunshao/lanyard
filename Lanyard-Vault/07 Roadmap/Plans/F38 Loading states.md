---
tags: [roadmap, feature, design]
id: F38
priority: P2
phase: 7
size: M
status: Not started
needs: []
---
# F38 Loading states

**Priority:** P2 · **Phase:** 7 Owner requests (2026-11-15) · **Size:** M · **Needs:** none · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-15)
"There should be loading states for content that hasn't loaded, so people don't feel like something isn't happening, where even though it is. This improves the aesthetical properties of the website."

## Plan
1. Survey every page and panel that waits on the API (attendee app, public card, event join, host site, admin) and list what each shows while waiting today: nothing, a word "Loading", or a spinner.
2. One small shared skeleton style (grey blocks the shape of the content, a gentle shimmer that stops under `prefers-reduced-motion`), in CSS only so no public page gets heavier. Follow [[Design System]] (paper and ink, no new colours).
3. Use it wherever content loads: the card, lists (People, Events, host events), event detail, host dashboard and live page, settings pages.
4. Buttons that send something show they are working (disabled, a short "Saving…" label) and cannot be pressed twice.
5. A slow request (over about 8 seconds) says so and offers Try again, rather than shimmering forever.
6. Screen readers: the waiting region has `aria-busy="true"` and one polite announcement, not one per block.

## Acceptance checks
- [ ] Every page that waits on the API shows a skeleton or a clear waiting state (checked with the network throttled in a browser, at 375 and 1280 px, light and dark).
- [ ] No button that sends something can be pressed twice while it waits.
- [ ] Motion stops with reduced motion on.
- [ ] No public page gets heavier than its budget ([[F28 Public-page JS budget]]).

## Log
-

Related: [[Design System]], [[F39 Informative error messages]] · back to [[00 Master To-Do]]
