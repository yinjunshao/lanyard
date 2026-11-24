---
tags: [roadmap, feature, ui, design, plus]
id: F55
priority: P1
phase: 10
size: M
status: In progress
needs: []
---
# F55 Card colour presets and a Plus colour wheel

**Priority:** P1 · **Phase:** 10 Owner requests (2026-11-24) · **Size:** M · **Needs:** none · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-24)
"...More personalization, and also the color picker. Right now, it's really default one. It's not that aesthetically pleasing. So perhaps redesign that part."

Asked what is free and what is Plus, the owner answered (2026-11-24): "static colours are all free, maybe later we can design specific themes and designs for plus member, and also different reflectivenesses etc. actually for free users, just make them only able to choose between some presets, which means they wont mess up the appearance. for plus users static colours gets the entire colour wheel, and they can change the font colour too. for plus users we can also introduce materials too i.e. gold, silver, and a few other premium materials that could fit the platform."

> [!note] Owner decision 2026-11-24: free users choose the strap colour from a set of presets; Plus users get the whole colour wheel and can also change the card's text colour. Materials (gold, silver and others) are Plus and are [[F56 Premium materials for Plus cards]]. Plus-only themes and "reflectiveness" are for later. This is part of "what Plus includes", still an open owner decision for [[F27 Lanyard Plus and billing]].

## Current state
- `src/components/CardForm.vue` lines 12-16: card themes Default, Formal, Night (`CARD_THEMES` in the Worker). Lines 73-85: strap colour is a native `<input type="color">`, shown only when `me.plan.customStrap` (Plus); free users see "Custom colours are part of Lanyard Plus".
- Worker: `worker/index.js` about 637-650 checks the theme against `CARD_THEMES` and saves `strap_color` (confirm how it is validated and whether the plan is checked on the server).
- The card is drawn by `Badge.vue` / `CardView.vue` with `.badge-strap` in `src/styles/main.css` (about 400-460), also on the public card page (`PublicCard.vue`, budget about 100-400 B headroom: check).

## Plan
- **Presets (free, everyone):** ten strap colours that look good with the card on paper, night and midnight, each with white strap text at 4.5:1 or better (adjust any that fail):
  Persimmon `#C4441E` (default, deepened by F55.0), Graphite `#2B3138`, Navy `#1F3A5F`, Cobalt `#2F5BD3`, Teal `#12817A`, Forest `#2E7D4F`, Ochre `#9A6410` (was `#A86F12`, 4.2:1 with white; deepened in F55.1), Rose `#C23B66`, Plum `#7A3E8E`, Slate `#55606E`.
  Shown as a row of round swatches (44 px tap targets, a ring on the chosen one, the name as its accessible label and a tooltip), with the chosen name written under the row.
- **Plus: the whole wheel and text colour.** A hand-built colour panel (no library, a lazy chunk, opened from a "Custom" swatch at the end of the row, which free users see with a small "Plus" mark and which opens the Plus page): a saturation and brightness square, a hue slider, a hex field, and the last five custom colours used. Keyboard: arrows move the point in the square and the slider; the hex field accepts `#RGB` and `#RRGGBB`. It previews live on the card preview beside the form ([[F18 Live previews for cards and events]]).
  - **Text colour (Plus):** a second control "Text colour" with Auto (the theme's ink, the default) and the same panel. If the chosen text colour is under 4.5:1 against the card background, show a warning line ("Hard to read") and still allow it only above 3:1; below 3:1 refuse to save with a plain message.
- **Server rules:** a free account may save only one of the ten preset values (or none); any other hex from a free account is refused with 400 and a plain message. Plus may save any `#RRGGBB`. A new nullable column for the text colour on `cards` (migration with the next free number, additive), validated the same way and Plus-only. If a Plus account lapses, keep showing what they saved (do not rewrite data); the editor then offers only presets for a new change.
- **Where it shows:** the badge on My card, the card page, previews, wallet and share images if they draw the strap (check). Keep the public card page within budget: colours arrive as data and are applied with CSS custom properties, no new JS on the public page.
- Design: follow [[Design System]] (one accent, 1px borders, 6px radius). The panel is a popover on wide screens and a sheet on phones, using the motion tokens.

## Tasks
- [x] F55.0 Deepen the brand strap orange from `#D9502B` to `#C4441E` everywhere it is the brand accent (`--strap` in `main.css`, the browser-bar and manifest colours if they use it, the preview image if cheap, email colours); keep `--strap-deep` darker than the new value for pressed states (adjust if needed); check white on it is at least 4.5:1 and the small event line on a card's strap reaches 4.5:1 or is made larger or bolder; a test pins the value and the ratio; a pointer in [[Design System]]. Owner decision 2026-11-24 from [[F54 Midnight app theme]].
- [x] F55.1 Presets: the swatch row in `CardForm.vue`, the server rule that free accounts save only presets, tests (free preset OK, free custom 400, Plus custom OK), browser check.
- [x] F55.2 Plus colour panel (lazy) for the strap, with keyboard support and recent colours; tests for hex parsing and the keyboard model.
- [ ] F55.3 Text colour: migration, server rule, contrast check, the card drawing it on every surface; tests (contrast refusal below 3:1, warning below 4.5:1, Plus only); vault notes ([[Data Model]], [[API Surface]], [[Features]], Plus contents line in [[Pricing]] or the F27 note); browser check at 375 and 1280 px, light, dark and midnight.

## Acceptance checks
- [x] A free account sees ten swatches; picking Teal changes the preview at once and saving shows a teal strap on My card and the public card page.
  - Verified in the Browser pane at 375 px in Midnight (a local free account): ten round swatches and a Custom one in the editor; pressing Teal drew a teal strap on the live Badge preview at once with the name "Teal" under the row; Save stored `#12817A`; My card's badge computed `rgb(18, 129, 122)` with a white event line, and the public card page (`/c/<id>`) drew the teal strap.
- [x] A free account's API request with `strapColor: "#123456"` is refused with 400; with a preset value it is saved.
  - Verified by `test/card-colours.mjs` against the real Worker (22 non-preset shapes refused with 400 and nothing saved, all ten presets saved, the Plus rule inside the write, concurrent and replayed requests); see the Log.
- [x] A free account pressing Custom is taken to the Plus page; nothing is saved.
  - Verified in the Browser pane: the Custom swatch (with its Plus mark) is a link; pressing it went to `/app/settings/plan` and the card's colour in the database was unchanged.
- [x] A Plus account picks any colour from the square and slider, or types `#1a2b3c`, and it is saved and shown.
  - Verified in the Browser pane with a local Plus account (made Plus in the local database only): Custom opened the panel (a popover at 1024 px, a bottom sheet at 375 px); the arrow keys moved the square (saturation 86 to 66 percent) and the hue slider (176 to 216 degrees), the live colour followed in the hex box and the caption; typing `#1a2b3c` set the colour; Enter kept it, Save stored `#1A2B3C`, and the Custom swatch then showed that colour with the ring. A mouse or finger drag on the square was not exercised (the pane's mouse coordinates were unreliable); the pointer code is a small handler on the same `set()`.
- [x] The panel works with the keyboard alone (arrows move, Enter or Done closes and keeps, Escape closes without keeping).
  - Verified in the Browser pane with keys only: Enter on Custom opened it with focus in the square; Tab moved to the hue slider, then the hex box, then (in the code) the recent colours, Cancel and Done, with Tab kept inside the panel; Enter in the hex box kept the colour, closed the panel and put focus back on Custom; Escape closed it with the old colour (Teal) still on the card. The keyboard model (`squareKey`, `hueKey`) is also tested as pure functions in `test/card-colours.mjs`.
- [ ] A Plus text colour of white on the Default (light) card is refused (under 3:1); a mid grey shows "Hard to read" and saves.
- [x] Every preset passes 4.5:1 with its strap text (test).
  - `test/card-colours.mjs` works out white on each preset (lowest Teal 4.72:1); Ochre was deepened to `#9A6410` (5.0:1) because the planned `#A86F12` was 4.2:1.
- [ ] `npm test` passes; public pages within budget (report the card page before/after).

## Log
-

Related: [[F56 Premium materials for Plus cards]] · [[F27 Lanyard Plus and billing]] · [[F54 Midnight app theme]] · back to [[00 Master To-Do]]
