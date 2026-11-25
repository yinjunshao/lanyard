---
tags: [roadmap, feature, card, export]
id: F71
priority: P1
phase: 13
size: S
status: Done
needs: []
---
# F71 Card PNG with a transparent background

**Priority:** P1 · **Phase:** 13 Owner requests (2026-11-25, second batch) · **Size:** S · **Needs:** none · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-25)
> "Please work on the card export again. I want the background to be transparent, so output in a PNG. So obviously the export cannot just be a screenshot anymore. It needs to be the actual card and the corners, because they're rounded. The background should be transparent, and no background at all, so they don't have to crop."

## Current state
- My card's "Download PNG" (`src/views/MyCard.vue` `savePng`, about line 133) calls `downloadBadge` in `src/lib/qr.js` (about line 322).
- The export is already not a screenshot: `drawBadge` (`src/lib/qr.js` about line 104) redraws the badge on a canvas at 3x, as a replica of the on-screen badge. But it adds a 28 px margin (`PAD`) filled with the paper colour (`PAPER`, `#F4F1EA`, "page backdrop", about line 164) and a drop shadow. That margin is what the owner has to crop.
- `badgeDataUrl` (about line 316) also calls `drawBadge`. Check every caller before changing shared behaviour.

## Plan
- The PNG is the card alone: the canvas is exactly the card's size (352 CSS px wide by its height, times 3), with no margin, no paper fill and no shadow. Outside the 8 px rounded corners every pixel is fully transparent (alpha 0), and the corner curve is anti-aliased, not jagged.
- Everything inside the card stays as it is: strap, materials, Plus text colour, photo, chips, note, QR, footer and code. The night theme's dark card is still drawn on its own dark fill inside the corners.
- If another caller needs the old framed version, give `drawBadge` an option rather than keeping two copies. Otherwise remove the backdrop outright.
- The file name stays `lanyard-badge.png`, and the 3x scale stays.

## Tasks
- [x] F71.1 Draw the card alone on a transparent canvas, with anti-aliased rounded corners and no margin or shadow; test the result.
- [x] F71.2 Vault notes, Log, Master To-Do.

## Acceptance checks
- [x] A test (a canvas stub, or a pixel check in the browser pane) reads the exported PNG: the top-left pixel (0, 0) has alpha 0, the centre pixel has alpha 255, and the image is 1056 px wide (352 x 3).
- [x] In the browser pane, the downloaded PNG drawn on a dark page and on a light page shows no paper border and no shadow, with round corners, for the light, formal and night themes and one Plus material.
- [x] The on-screen badge on My card looks the same as before.

## Log
- 2026-11-25 (Claude subagent) F71.1 built (d9604dc, then the whole-pixel fix 94c4742). `drawBadge` in `src/lib/qr.js` now draws the card alone: the canvas is 352 x 3 = 1056 px wide and the card's height x 3 tall, with no `PAD` margin, no paper fill (`PAPER` is gone) and no shadow. The rounded 8 px clip is anti-aliased, so everything outside the corners stays alpha 0. The card height is rounded up to a whole picture pixel (at most a third of a CSS px), because the first look in the browser showed the bottom edge half transparent. The unused `caption` line under the card is gone too. `badgeDataUrl` has no caller and `savePng` in `MyCard.vue` is the only caller of `downloadBadge`, so no option to keep the framed version was needed. File name and 3x scale are as before.
- Checks: `test/card-png.mjs` (new, in `npm test` before `rederive-fixes`) runs the real `drawBadge` in node on a recording canvas stub: 1056 px wide, a clip set before anything is painted, a rounded rectangle from (0, 0) with an 8 px radius at every corner, no fill outside the card, no shadow, no paper colour, the border last, the height a whole picture pixel, and light, formal, night and Plus gold all drawn. Real pixels were read in the browser pane: the button was pressed, the PNG drawn on a canvas and read back for light, formal, night and Plus gold (gold with the local plan set to Plus): 1056 x 1250, pixels (0, 0), (W-1, 0), (0, H-1) and (W-1, H-1) all `0,0,0,0`, the middle of every edge alpha 255 (the border colour), the centre alpha 255. The PNG laid on a dark and on a light page showed no paper border, no shadow and round corners in all four.
- On-screen badge: `Badge.vue`, `CardView.vue` and `drawQR` are not touched; only the export function changed, so My card looks as before (seen in the browser pane).
- Budget: `qr.js` is a lazy chunk (Landing and PublicCard list it under "loads lazily"); no public page loads it up front. Privacy 50,362 B and PublicCard 47,697 B after, against 50,365 B and 47,699 B before (only chunk file names moved).
- Vault updates pending (owner-modified notes): `Testing.md` is modified in the working tree, so it was not edited. Add this row to its test table: `| node test/card-png.mjs | F71: the card image is the card alone. drawBadge run on a recording canvas: 1056 px wide, nothing painted before the rounded 8 px clip, nothing outside the card, no paper fill or shadow, the height a whole picture pixel, all three themes and a Plus material. Real pixels are read in a browser. |`

## Owner steps
- Front end only, no migration: `npm run deploy` (with F72). Then on My card press Download PNG and open the file on a dark page: no paper border, no shadow, round corners.

Related: [[F55 Card colour presets and a Plus colour wheel]] · back to [[00 Master To-Do]]
