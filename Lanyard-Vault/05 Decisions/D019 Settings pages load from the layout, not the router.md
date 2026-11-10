---
tags: [decision]
status: Accepted
date: 2026-11-10
---
# D019 Settings pages load from the layout, not the router

**Status:** Accepted  ·  **Date:** 2026-11-10

## Context
[[F09 Settings in category pages]] splits Settings into seven pages. The router file is part of the entry chunk that every public page loads. Registering the seven pages there as nested routes (with their titles, and a redirect for old `#plus` links) added about 0.4 KB gzip to the first load of the landing page and the public card, which F09 must not do ([[F28 Public-page JS budget]] owns the existing overage).

## Decision
- Settings is one route, `/app/settings/:page?`. `src/views/Settings.vue` holds the page table (title and a dynamic `import()` per page), loads the page named in the address, and shows the list when there is none or the name is unknown.
- The old `#plus`, `#signin` and `#install` links are redirected by `Settings.vue` too (`src/router/settingsRedirect.js`), not by the router's `beforeEach`.
- The two-column width on wide screens is CSS (`:has()`), so `App.vue` carries no extra class bindings.
- Later features add a row by editing the page's file, and a page by adding one entry to `PAGES` and one row to the list.

## Consequences
Measured from `dist/`: landing and public card first-load JS (gzip) is a little smaller than before F09, not larger (see the F09 Log). Settings pages are not separate router records, so a route guard cannot be set per page; none is needed because the whole `/app` area already waits for `/api/me`.

**Evidence:** `src/views/Settings.vue`, `src/router/index.js`, `test/settings.mjs`

Related: [[D018 Hand-built pickers outside the shared Vue chunk]] · back to [[Decision Log]]
