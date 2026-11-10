---
tags: [roadmap, feature, performance]
id: F28
priority: P1
phase: 1
size: S
status: Done
needs: []
---
# F28 Public-page JS budget

**Priority:** P1 · **Phase:** 1 Foundations · **Size:** S · **Needs:** nothing · back to [[00 Master To-Do]]

## Why
[[Design System]] sets a budget of under 50 KB of JS on public pages. F02 measured the pages and found they were already over it before that feature. The owner chose to close F02 and fix this separately (2026-11-10).

## Current state (measured at the start of F28, after F14)
See "Starting numbers" and "End numbers" below. The first F02 numbers (64.1 KB and 58.2 KB) were already out of date.

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

## End numbers (after F28.4, `npm test` prints these)
| Page | Start (B) | End (B) | Change |
| --- | --- | --- | --- |
| Landing | 60,677 | 44,595 | -16,082 |
| PublicCard | 55,704 | 49,617 | -6,087 |
| Hosts | 47,385 | 43,065 | -4,320 |
| Privacy | 51,158 | 46,840 | -4,318 |
| Terms | 51,442 | 47,122 | -4,320 |
| Redeem | 50,723 | 46,405 | -4,318 |
| SignIn | 52,005 | 47,688 | -4,317 |
| PrivacyRequest | 53,504 | 49,988 | -3,516 |

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
- [x] Landing and a public card each load under 50 KB of gzip JS by the script's measure. (Verified by `node test/budget.mjs`: 44,595 B and 49,617 B, under 50,000 B as well as 51,200 B.)
- [x] `npm test` and `npm run build` pass, and the pages behave as before signed in and signed out. (Both pass. Checked by hand in the built app served by `vite preview`, with the local Worker and database, and in the dev server: see the Log.)

## Log
- 2026-11-10 (Claude subagent): Every public page is now under 50 KB of first-load gzip JS, and `npm test` fails if one goes over. Landing 60,677 to 44,595 B, public card 55,704 to 49,617 B; the other six public pages dropped about 4.3 KB each and are all under too (table above). A packaging change only ([[D024 Signed-in frame and heavy pieces load only where used]]).
- **The measure** (`test/budget.mjs`): gzip of the entry chunk named in `dist/index.html`, everything it statically imports, the page's chunk and its static imports, each file once. `index.html` has no `modulepreload` link, so there is nothing extra to add, and the figure does not include chunks started later by a dynamic `import()`. It is gzip level 6, which reproduced F14's 60,677 and 55,704 exactly. The QR library (11.8 KB gzip) is still downloaded by the Landing page right after it shows, so that page moves about 56 KB in all; it is out of the first-load figure, not out of the page. That is what "load it after first paint" in the plan meant. The alternative, a static SVG of the QR, is wrong because the demo QR encodes the site's own address, which differs between local, staging and production.
- **What moved:** (1) the /app frame (top bar, banner, tab bar, Terms pop-up) into `AppShell.vue`, loaded by the router only for `/app` pages: about -2 KB on every public page; (2) Vue's Options API turned off in `vite.config.js`: -1.65 KB on every public page; (3) the QR library out of the Landing page's static imports: -11.8 KB there; (4) the card's "Your connection" panel (`CardConnection.vue`) and the selfie photo code out of the card's first load: -2.3 KB on a scanned card. Nothing was removed and no copy changed.
- **Changed tests** (same strength): `test/ui.mjs` (tab bar guards now read `AppShell.vue`), `test/homepath.mjs` (the logo guard reads `AppShell.vue` instead of `App.vue`), `test/onboarding.mjs` (the Terms pop-up guard checks `AppShell.vue` holds `<TermsGate />`, `App.vue` shows the shell for every `meta.app` route and the router loads it), `test/pickers.mjs` (the date picker guard reads `CardConnection.vue`, and also checks `PublicCard.vue` loads the panel only with a plain `import()`). New: `test/budget.mjs`, the last step of `npm test`, which therefore now builds.
- **Checked in a browser** (built app on `vite preview`, local Worker and database, Chrome engine; then the dev server): signed out, Landing (demo QR draws, non-blank canvas), a scanned card with `?s=`, the connect sheet and Connect, sign in, redeem (and a bad code), privacy, terms, hosts, privacy requests and a 404; signed in, My card (QR draws), the email form from the banner, Scan, People, Settings and its Security page, Edit profile and Cards; after connecting, the connection panel appeared, the date picker opened, a reminder saved and the vCard text was right. No chunk returned an error. Not checked: a real camera, the selfie picker (its photo chunk is untested in a browser), the service worker offline, Safari, a screen reader, and 375 px (the pane's viewport made layout checks unreliable; no CSS changed).
- **Left over / notes:** the Landing QR and the first badge on a page now need one more request after the page shows (a blank square for a moment on a slow connection). A connected viewer sees the connection panel a moment after the card. `Connect.vue` is not routed anywhere (dead code that still imports `photo.js`); left alone. The entry chunk is still about 41.5 KB, nearly all Vue and vue-router, so the next feature that adds to the entry or to a public page will hit the budget quickly (PrivacyRequest has 1.2 KB of room, the card 1.5 KB). The local database now holds two test accounts (`.wrangler/`, not committed).

### Owner steps
- Review the F28 commits, `git push`, `npm run deploy`. No migration.
- After deploying, open the live landing page, a card and `/app` once with the network panel open and check there are no failed requests; then open `/app` with the phone in flight mode to confirm the offline card still opens (it should, after one earlier online visit).

Related: [[F02 Logo goes to My card when signed in]], [[Design System]] · back to [[00 Master To-Do]]
