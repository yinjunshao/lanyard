---
tags: [decision]
status: Accepted
date: 2026-11-10
---
# D024 Signed-in frame and heavy pieces load only where used

**Status:** Accepted  ·  **Date:** 2026-11-10

## Context
[[F28 Public-page JS budget]]: after F14 the Landing page loaded 60,677 B and a public card 55,704 B of gzip JS on first load, against a 50 KB (51,200 B) budget. The entry chunk (Vue, vue-router and the app shell, about 45.8 KB) is loaded by every page, so the page chunks could not be the only place to cut.

## Decision
- **The /app frame is its own chunk.** The top bar, account banner, tab bar and Terms pop-up are `src/components/AppShell.vue`. `App.vue` renders it for `meta.app` routes through `src/lib/shell.js`; the router's `beforeEach` starts its download in parallel with `/api/me` and waits for it, so an /app page never shows without its frame. A failed download can be tried again. Public pages and the welcome steps never load it.
- **Vue's Options API is off** (`__VUE_OPTIONS_API__: false` in `vite.config.js`). Every component is `<script setup>`; the only plain `<script>` blocks just export functions. A component written with `data`, `methods` or `computed` options would stop working, so do not write one.
- **The QR library loads when a badge draws** (a plain `import()` in `Badge.vue`), not with the Landing page. The demo QR still draws, for the same address, right after the page shows. My card imports the same file, so it does not wait.
- **The "Your connection" panel of a card is its own chunk** (`CardConnection.vue`), fetched once the card says the viewer is connected, with a plain `import()` and a `shallowRef` (not `defineAsyncComponent`, [[D018 Hand-built pickers outside the shared Vue chunk]]). The selfie photo code loads when a photo is picked.
- **The budget is enforced.** `test/budget.mjs` is the last step of `npm test`, builds first, and fails if any of the eight public pages is over 51,200 B.

## Consequences
First-load JS (gzip): Landing 60,677 to 44,595 B, public card 55,704 to 49,617 B, and every other public page is under the budget too. Chunks that load right after first paint (the QR library on Landing, 11.8 KB gzip) are not in the figure: the figure is the entry, its static imports and the page's chunks, with no `modulepreload` links in `index.html`. A connected viewer sees the connection panel a moment after the card, and the first badge on a page needs one more request. The service worker precaches only what `index.html` names, so the frame chunk is cached the first time `/app` is opened online, like every page chunk already was; offline opening of `/app` needs one earlier visit with the service worker in control.

**Evidence:** `src/lib/shell.js`, `src/components/AppShell.vue`, `src/components/CardConnection.vue`, `src/components/Badge.vue`, `vite.config.js`, `test/budget.mjs`

Related: [[Design System]], [[D019 Settings pages load from the layout, not the router]] · back to [[Decision Log]]
