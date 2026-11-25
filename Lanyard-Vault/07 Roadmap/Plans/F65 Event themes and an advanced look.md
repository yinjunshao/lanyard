---
tags: [roadmap, feature, host, design]
id: F65
priority: P1
phase: 11
size: M
status: In progress
needs: [F63, F55]
---
# F65 Event themes and an advanced look

**Priority:** P1 · **Phase:** 11 Owner requests (2026-11-24, second batch) · **Size:** M · **Needs:** [[F63 Create event form refresh]], [[F55 Card colour presets and a Plus colour wheel]] · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-24)
"the color schemes as well need to be refreshed because the color wheel is also really old. So perhaps have a few themes."

Asked what hosts choose from, the owner said: "Themes, but they can customize more in advanced mode, where they can even put some of their company branding onto it." The company name and logo are [[F66 Host branding on event pages]].

## Current state
- Step 2 of Create event (`src/components/EventStepLook.vue`) offers three themes in a select: Default (Persimmon), Formal (navy strap) and Night (dark). They are `THEME_OPTIONS` in `src/lib/eventform.js`.
- The brand colour is a native `<input type="color">` with a Reset button.
- The Worker accepts only `default`, `formal` and `night` (`worker/hosts.js` line 335) and any `#rrggbb` for `strap_color`.
- The themes are drawn on the check-in page head (`EventPage.vue`, `.event-brand` and the theme class), on the Present page (`src/views/HostPresent.vue`, around line 86) and in print (`HostPrint.vue`).
- [[F55 Card colour presets and a Plus colour wheel]] built a newer colour picker for cards (`src/components/CardColourPanel.vue`) with presets and a colour wheel. It is Plus-only on cards, but hosts are not on Plus.

## Plan
- **About eight designed themes**, each a named set of tokens:
  - the strap colour;
  - the ink on the strap, passing 4.5:1;
  - a page tint for the check-in page head and the Present page background;
  - light or dark.

  They keep Default, Formal and Night under their ids, so existing events do not change, and add, for example, Forest, Ocean, Plum, Sand and Graphite. Final names and colours are chosen to the [[Design System]] and checked for contrast in a test.
- **Choosing a theme.** Step 2 shows the themes as a grid of small swatch cards, each a mini check-in page head with its name. It is a radio group, keyboard-friendly, with the selected one ringed. The preview beside the form updates as now.
- **Advanced** is a disclosure under the grid (`UiReveal`), with:
  - the brand colour, using the F55 picker component (presets plus the wheel; free for hosts, so the Plus gate is not applied here, and the component takes a prop for that);
  - the text colour on the strap, worked out automatically for contrast, with an override only if it still passes 4.5:1;
  - "Use our company branding", disabled with a line pointing to [[F66 Host branding on event pages]] until F66 is built.

  A colour that fails contrast with its ink is refused with a plain message.
- **Worker.** Accept the new theme ids (an exact list in one shared file the Worker and the front end both read, like `src/lib/cardmaterial.js`). The Worker still cleans `strap_color`. No migration is needed if `events.theme` is free text: confirm, and add a migration only if a CHECK constraint stops it.
- **Every surface** draws each theme: the check-in page head, the Present page, print, and the attendee event hub head if it uses the theme. A test reads the theme list and the CSS, and fails when a theme has no rules.
- **The check-in page is public:** keep its budget growth under 300 B gzip. The CSS is not counted, but keep it small.

## Tasks
- [x] F65.1 The theme list (shared file), the Worker accepting it, CSS for every surface, the contrast test. ([[D060 Event themes are one shared list drawn by CSS, and a chosen text colour must read]]; eight themes in `src/lib/eventthemes.js`, rules in `src/styles/eventthemes.css`, the text-colour column in migration 0043, `test/event-themes.mjs`)
- [x] F65.2 The step 2 theme grid and the Advanced disclosure with the F55 picker (free for hosts); the same on the Details tab; tests (unknown theme falls back to default, colour contrast refused, Plus gate not applied for hosts); vault notes ([[Design System]], [[Screens and Routes]]); browser check of every theme on the check-in page, Present and print at 375 and 1280 px, light, dark and midnight.

## Acceptance checks
- [ ] Step 2 shows at least eight themes as swatches; picking Forest changes the preview head and, after Create, the real check-in page and the Present page (browser).
- [ ] Events saved with `formal` or `night` look as they did (browser and test).
- [ ] The text on every theme's strap passes 4.5:1 (test).
- [ ] Advanced opens with motion, the brand colour picker works for a host without Plus, and a colour whose best ink fails 4.5:1 is refused (test and browser).
- [ ] The Worker saves `theme: "forest"` and turns `theme: "made-up"` into `default` (test).
- [ ] `npm test` passes; public pages within budget.

## Log
-

Related: [[F66 Host branding on event pages]] · [[F55 Card colour presets and a Plus colour wheel]] · back to [[00 Master To-Do]]
