---
tags: [roadmap, feature, promo]
id: F04
priority: P0
phase: 0
size: S
status: In progress
needs: []
---
# F04 Redeem page placeholder

**Priority:** P0 (the poster campaign is live) · **Phase:** 0 Quick fixes · **Size:** S · **Needs:** nothing · back to [[00 Master To-Do]]

## Problem
On `/redeem`, the example text in the code box is the real code: `src/views/Redeem.vue` ~104 has `placeholder="FIRST50"`. Anyone who opens the page gets the poster code without seeing the poster.

## Plan
- Placeholder becomes a format hint that is not a real code: `e.g. ABCD1234`. Check it doesn't match any row in `promo_codes`.
- Check no other copy, help text, admin default or example names a live code (`Admin.vue` promo form, `Settings.vue` link, emails).
- While here: make sure `GET /api/redeem/:code` is rate-limited per IP and per user (`worker/promo.js`), so people can't guess codes by trying thousands. The `attempts` column exists; check it's used. If not, add `bump()` limits (for example 30 lookups per 10 minutes per IP) and a test.

## Tasks
- [x] F04.1 Change the placeholder and sweep for other live-code mentions.
  - Sweep (2026-11-10, `src/`, `worker/`, `public/`, `migrations/`, `scripts/`, `index.html`, `test/`): the poster code `FIRST50` was in `src/views/Redeem.vue` (the placeholder, now `e.g. ABCD1234`). The Admin new-code box used `e.g. AISOC`, which is not a seeded code but names a society ([[F03 Neutral copy with no named university]]), so it is now `e.g. ABCD1234` too. No emails, `Settings.vue` links or other help text name a code.
  - Still named, on purpose: `migrations/0017_promo_codes.sql` (it seeds FIRST50 and a committed migration must not be edited) and `test/promo.mjs` (tests). Neither ships to the browser.
  - `ABCD1234` is not seeded by any local migration. **Production `promo_codes` was not checked** (no production access); the owner should confirm no live code is called `ABCD1234`.
- [ ] F04.2 Rate-limit code lookups, and extend `test/promo.mjs`.

## Acceptance checks
- [x] `/redeem` shows no real code anywhere in the page or its JS bundle (search `dist/` for `FIRST50` after a build). (After `npm run build`, no file in `dist/` contains `FIRST50`; `test/promo.mjs` guards the source.)
- [ ] The 31st lookup in 10 minutes from one IP gets a 429 with a friendly message.

## Log
-

Related: [[F20 Host promo codes for event credits]] · back to [[00 Master To-Do]]
