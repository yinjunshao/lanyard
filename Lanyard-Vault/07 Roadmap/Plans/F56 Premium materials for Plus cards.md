---
tags: [roadmap, feature, ui, design, plus]
id: F56
priority: P2
phase: 10
size: M
status: Not started
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
- [ ] F56.1 Materials: CSS, the editor row, the migration and server rule, the sheen; tests (Plus only, allowed names, free 400); vault notes; browser check of each material on the card page and My card at 375 and 1280 px, light, dark and midnight, and with reduced motion.

## Acceptance checks
- [ ] A Plus account picks Gold; the strap on My card and the card page shows the gold material with readable text.
- [ ] Moving the pointer over the card on desktop moves the highlight; with reduced motion it does not move.
- [ ] A free account's request with `material: "gold"` is refused with 400.
- [ ] Each material's strap text passes 4.5:1 (test).
- [ ] `npm test` passes; public pages within budget.

## Log
-

Related: [[F55 Card colour presets and a Plus colour wheel]] · [[F27 Lanyard Plus and billing]] · back to [[00 Master To-Do]]
