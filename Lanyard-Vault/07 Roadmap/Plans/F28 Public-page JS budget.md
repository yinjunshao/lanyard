---
tags: [roadmap, feature, performance]
id: F28
priority: P1
phase: 1
size: S
status: Not started
needs: []
---
# F28 Public-page JS budget

**Priority:** P1 · **Phase:** 1 Foundations · **Size:** S · **Needs:** nothing · back to [[00 Master To-Do]]

## Why
[[Design System]] sets a budget of under 50 KB of JS on public pages. F02 measured the pages and found they were already over it before that feature. The owner chose to close F02 and fix this separately (2026-11-10).

## Current state (measured during F02, gzip, from `dist/` after `npm run build`)
Entry chunk plus its static imports plus the page's own chunk:
- Landing: 64.1 KB. It loads the QR chunk (11.6 KB gzip) for the demo badge.
- Public card: 58.2 KB.
- The Vue runtime chunk alone is about 24 KB and the entry chunk about 25 KB.

## Plan
- Write the measure down first: a script `test/budget.mjs` that builds nothing itself but reads `dist/` (after `npm run build`), follows the static imports of the entry and of each public page chunk, and prints gzip totals for Landing, PublicCard, Hosts, Privacy, Terms, Redeem and SignIn.
- Find what the entry chunk pulls in that public pages do not need (store, API client, passkey library, offline code, icons) and move it behind dynamic imports or into the app-only routes.
- Landing: draw the demo QR without the QR library (a static SVG), or load it after first paint.
- Do not change behaviour; this is a packaging change only.

## Tasks
- [ ] F28.1 Add `test/budget.mjs` and record the starting numbers here.
- [ ] F28.2 Trim the entry chunk for public pages.
- [ ] F28.3 Landing demo QR without the QR library on first load.
- [ ] F28.4 Make the script fail over 50 KB for the public pages and wire it into `npm test` after a build step, or document why it runs separately.

## Acceptance checks
- [ ] Landing and a public card each load under 50 KB of gzip JS by the script's measure.
- [ ] `npm test` and `npm run build` pass, and the pages behave as before signed in and signed out.

## Log
-

Related: [[F02 Logo goes to My card when signed in]], [[Design System]] · back to [[00 Master To-Do]]
