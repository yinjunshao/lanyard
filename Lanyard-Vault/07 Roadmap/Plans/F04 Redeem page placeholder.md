---
tags: [roadmap, feature, promo]
id: F04
priority: P0
phase: 0
size: S
status: Not started
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
- [ ] F04.1 Change the placeholder and sweep for other live-code mentions.
- [ ] F04.2 Rate-limit code lookups, and extend `test/promo.mjs`.

## Acceptance checks
- [ ] `/redeem` shows no real code anywhere in the page or its JS bundle (search `dist/` for `FIRST50` after a build).
- [ ] The 31st lookup in 10 minutes from one IP gets a 429 with a friendly message.

## Log
-

Related: [[F20 Host promo codes for event credits]] · back to [[00 Master To-Do]]
