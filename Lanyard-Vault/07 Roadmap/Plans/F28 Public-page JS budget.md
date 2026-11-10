---
tags: [roadmap, feature, performance]
id: F28
priority: P1
phase: 1
size: S
status: In progress
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

## Starting numbers (F28.1, `node test/budget.mjs --no-build` on the build at commit 6290287)
Gzip bytes of the entry chunk (45,810 B: Vue, vue-router and the app shell, one file) plus everything it statically imports, plus the page's own chunk and its static imports. `index.html` has no `modulepreload` link, so there is nothing to add. The 50 KB budget is 51,200 B (50 x 1024).

| Page | Start (B) | Over 51,200 B by |
| --- | --- | --- |
| Landing | 60,677 | 9,477 |
| PublicCard | 55,704 | 4,504 |
| Hosts | 47,385 | under |
| Privacy | 51,158 | under (by 42 B) |
| Terms | 51,442 | 242 |
| Redeem | 50,723 | under |
| SignIn | 52,005 | 805 |
| PrivacyRequest | 53,504 | 2,304 |

## Plan
- Write the measure down first: a script `test/budget.mjs` that builds nothing itself but reads `dist/` (after `npm run build`), follows the static imports of the entry and of each public page chunk, and prints gzip totals for Landing, PublicCard, Hosts, Privacy, Terms, Redeem and SignIn.
- Find what the entry chunk pulls in that public pages do not need (store, API client, passkey library, offline code, icons) and move it behind dynamic imports or into the app-only routes.
- Landing: draw the demo QR without the QR library (a static SVG), or load it after first paint.
- Do not change behaviour; this is a packaging change only.

## Tasks
- [x] F28.1 Add `test/budget.mjs` and record the starting numbers here.
- [x] F28.2 Trim the entry chunk for public pages.
- [x] F28.3 Landing demo QR without the QR library on first load.
- [x] F28.4 Make the script fail over 50 KB for the public pages and wire it into `npm test` after a build step, or document why it runs separately.

## Acceptance checks
- [ ] Landing and a public card each load under 50 KB of gzip JS by the script's measure.
- [ ] `npm test` and `npm run build` pass, and the pages behave as before signed in and signed out.

## Log
-

Related: [[F02 Logo goes to My card when signed in]], [[Design System]] · back to [[00 Master To-Do]]
