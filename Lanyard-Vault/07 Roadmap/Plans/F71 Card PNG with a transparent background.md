---
tags: [roadmap, feature, card, export]
id: F71
priority: P1
phase: 13
size: S
status: Not started
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
- [ ] F71.1 Draw the card alone on a transparent canvas, with anti-aliased rounded corners and no margin or shadow; test the result.
- [ ] F71.2 Vault notes, Log, Master To-Do.

## Acceptance checks
- [ ] A test (a canvas stub, or a pixel check in the browser pane) reads the exported PNG: the top-left pixel (0, 0) has alpha 0, the centre pixel has alpha 255, and the image is 1056 px wide (352 x 3).
- [ ] In the browser pane, the downloaded PNG drawn on a dark page and on a light page shows no paper border and no shadow, with round corners, for the light, formal and night themes and one Plus material.
- [ ] The on-screen badge on My card looks the same as before.

## Log
-

Related: [[F55 Card colour presets and a Plus colour wheel]] · back to [[00 Master To-Do]]
