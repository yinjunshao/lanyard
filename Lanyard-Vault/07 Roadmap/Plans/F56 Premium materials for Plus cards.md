---
tags: [roadmap, feature, ui, design, plus]
id: F56
priority: P2
phase: 10
size: M
status: In progress
needs: [F55]
---
# F56 Premium materials for Plus cards

**Priority:** P2 · **Phase:** 10 Owner requests (2026-11-24) · **Size:** M · **Needs:** [[F55 Card colour presets and a Plus colour wheel]] · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-24)
"for plus users we can also introduce materials too i.e. gold, silver, and a few other premium materials that could fit the platform." And: "maybe later we can design specific themes and designs for plus member, and also different reflectivenesses etc."

## Current state
- After F55 the strap has a colour (preset or, for Plus, any) and a Plus text colour. Nothing gives a card a surface finish.
- The card is drawn by `Badge.vue` / `CardView.vue` and `.badge*` rules in `src/styles/main.css`, including on the public card page (tight JS budget; CSS is not counted by the budget, but keep it small).

## Plan
- A **material** for the strap (and its edge on the badge), Plus only, chosen in the card editor below the colours as a row of small material swatches:
  Gold, Silver, Rose gold, Copper, Pearl, Carbon. Each is a CSS gradient with a soft highlight band (a "sheen"), drawn with CSS only, for example gold `linear-gradient(115deg, #8a6a1f, #e9c968 38%, #fff3c4 50%, #d4a93c 62%, #7d5d17)`. Text on each passes 4.5:1 (use dark ink on light metals).
- **Sheen motion:** on the card page and My card, the highlight drifts slowly once when the card appears, and follows the pointer on desktop (a CSS custom property updated in a few lines of script, transform or background-position only, under 300 ms per update, never on a loop). On phones, no device-orientation permission prompt: one slow pass when the card appears. Off under reduced motion. If background-position animation breaks [[D045 Motion is CSS tokens and a few lines of script, never a library or Vue Transition]], move a transformed highlight layer instead.
- Server: a nullable `material` column on `cards` (next free migration, additive), one of the six names, Plus only (free accounts 400). A lapsed Plus account keeps what it saved.
- Free accounts see the material row with a "Plus" mark; tapping opens the Plus page.
- Later, not in this item: Plus-only card themes and adjustable reflectiveness (the owner said "maybe later").

## Tasks
- [x] F56.1 Materials: CSS, the editor row, the migration and server rule, the sheen; tests (Plus only, allowed names, free 400); vault notes; browser check of each material on the card page and My card at 375 and 1280 px, light, dark and midnight, and with reduced motion.

## Acceptance checks
- [ ] A Plus account picks Gold; the strap on My card and the card page shows the gold material with readable text.
- [ ] Moving the pointer over the card on desktop moves the highlight; with reduced motion it does not move.
- [x] A free account's request with `material: "gold"` is refused with 400.
  - Verified by `test/materials.mjs` against the real Worker: all six names and 12 other shapes from a free account are 400 and nothing else in the request is saved; also with a forged plan in the body, query or header; new cards too.
- [x] Each material's strap text passes 4.5:1 (test).
  - `test/materials.mjs` reads the colours from `main.css` and works out the ink on the mid tone, on 101 points along each finish, and with the moving highlight added: every one is 4.5:1 or better.
- [x] `npm test` passes; public pages within budget.
  - `npm test` and `npm run build` exit 0. Gzip B before to after (limit 51,200): PublicCard 47,479 to 47,633; Landing 44,166 to 44,282; Hosts 42,628 to 42,636; Privacy 50,134 to 50,140; Terms 46,752 to 46,759; Redeem 45,964 to 45,992; SignIn 47,094 to 47,102; PrivacyRequest 49,811 to 49,823.

## Log
- 2026-11-24 (Claude subagent) F56.1 built and tested; **not yet looked at in a browser**, so two acceptance checks and the 375/1280 px, Light/Dark/Midnight look are open (they wait on someone running the local servers with a local Plus account).
- **How it works:** `cards.material` (migration 0042, nullable) holds one of six exact ids (`gold`, `silver`, `rose-gold`, `copper`, `pearl`, `carbon`). The rule is in `worker/cardcolour.js` beside the colours (D052): free or lapsed accounts may clear it or send back what they have; a new one is 400 `plus_material`; a wrong name or type is 400 `bad_material`; the plan comes from the `users` row and the check is inside the write. Card views carry `material`; `Badge` and `CardView` add one class (`mat mat-gold`) and CSS draws the finish, so the public card page gained 154 B and no script. The pointer sheen is `src/lib/sheen.js`, fetched by a plain `import()` only for a card with a material on a hover device.
- **Decisions without the owner:** the one pass when a card appears is 300 ms (D045 and `test/loading.mjs` allow nothing longer; the plan said slow); a material replaces the strap colour on screen (both stay stored); ids are lower case; the card image export draws the gradient without a highlight; "Strap materials" added to the Plus list and the redeem page.
- **Guards changed:** `test/card-colours.mjs`, `test/people-search.mjs` and `test/stages.mjs` list or expect migration 0042; nothing weakened.
- **Not checked:** a Plus account picking Gold and seeing it on My card and the card page; the highlight following the pointer and standing still under reduced motion (the script and CSS are tested as source and as functions only).

## Owner steps
- Apply `migrations/0042_card_material.sql` (`npm run db:remote`, additive, safe before or after the deploy), then `npm run deploy`.
- Look at the Strap material row and a gold card once on a phone and a laptop, in Light, Dark and Midnight, and move the mouse over the card.

Related: [[F55 Card colour presets and a Plus colour wheel]] · [[F27 Lanyard Plus and billing]] · back to [[00 Master To-Do]]
