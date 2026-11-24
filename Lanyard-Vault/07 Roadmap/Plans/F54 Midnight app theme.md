---
tags: [roadmap, feature, ui, design]
id: F54
priority: P1
phase: 10
size: S
status: In progress
needs: []
---
# F54 Midnight app theme

**Priority:** P1 · **Phase:** 10 Owner requests (2026-11-24) · **Size:** S · **Needs:** none · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-24)
"Perhaps use a design skill or something to find more potential themes for the cards and also the background. For example, now there's currently dark white background for the app. Make one there to be midnight, so it's like completely black background. That would be better. More personalization..."

## Current state
- `src/lib/theme.js`: Auto, Light, Dark; dark sets `<html data-theme="night">` and the `theme-color` meta to `#141311`. Stored in `localStorage` (`lanyard-theme`), per browser.
- `src/styles/main.css` lines 61-74: the `night` token set (`--paper #141311`, `--paper-raised #201e1a`, `--rule #3a362f`, ...).
- `src/views/settings/SettingsAppearance.vue` lines 14-32: a segmented control Auto / Light / Dark.
- Check whether `index.html` applies the theme before first paint (to avoid a flash); if not, a tiny inline script is part of this item.

## Plan
- A fourth app theme, **Midnight**: a true black background for OLED phones. Tokens (refine for contrast, all text pairs at least 4.5:1, rules visible but quiet):
  - `--paper: #000000`, `--paper-raised: #0d0d0d`, `--ink: #f4f1ea`, `--graphite: #9a958b`, `--rule: #262422`, `--rule-strong: #f4f1ea`, `--strap-deep: #ea7552`, shadows replaced by a 1px `--rule` edge (shadows do not show on black), `color-scheme: dark`, `theme-color` `#000000`.
- Settings > Appearance offers **Auto, Light, Dark, Midnight**. Add a second small choice under it, shown only when Auto is chosen: "When my device is dark, use: Dark / Midnight" (stored the same way). If that is more than a few lines, drop it and keep the four options.
- Every place that checks `data-theme === "night"` (CSS selectors and JS) must treat Midnight as dark too: use a shared attribute such as `data-theme="midnight"` plus `data-dark` (or a `:is()` selector), chosen so card themes keyed on `night` are not affected. Search for every use.
- Card themes are a separate thing ([[F55 Card colour presets and a Plus colour wheel]]); this item only changes the app background. A card's own "Night" theme is unchanged.
- No flash of light paper on load in Midnight (inline pre-paint, a few bytes, counted against the public-page budget).
- Public pages: the theme file is shared, so keep the cost to a few hundred bytes and report before/after.

## Tasks
- [x] F54.0 Win back JS budget headroom before the work (added 2026-11-24 by the orchestrator: PrivacyRequest had 57 B left).
- [ ] F54.1 Add the Midnight tokens, the theme choice and the pre-paint; make every dark check include Midnight; tests (theme.js applies `midnight`, the meta colour, the setting is saved); browser check of My card, People, a person, Events, an event hub, Settings, a sheet and a picker in Midnight at 375 and 1280 px, and the Light and Dark themes unchanged.

## Acceptance checks
- [ ] Choosing Midnight in Settings > Appearance turns the app background pure black (`#000000`) at once and the browser bar black; reloading keeps it with no flash of light.
- [ ] Text, muted text, buttons, chips, inputs, sheets and pickers are all readable in Midnight (each text colour at least 4.5:1 on its background, checked with computed colours).
- [ ] Dark and Light look exactly as before.
- [ ] A card using the card theme "Night" looks the same in every app theme.
- [ ] `npm test` passes; public pages within budget.

## Log
- 2026-11-24 (Claude subagent) F54.0: **why every public page grew by 15-50 B per feature.** The entry chunk (the one file every public page loads) carries Vite's preload map: a list of every lazy chunk and its imports and styles by hashed file name (90 names, about 2.7 KB raw). Hashes do not compress, so each new chunk anywhere in the app added a name there, and each lazy import another. Fix: `build.modulePreload: false` in `vite.config.js`. The map now keeps only the 26 style files (a lazy chunk's CSS still loads with it, checked in the built entry); a lazy chunk's own script imports start when the chunk has arrived instead of beside it (one extra round trip on a lazy route; no behaviour change). Entry 42,154 to 40,739 B gzip. First-load gzip before to after: Landing 45,537 to 44,019; PublicCard 48,847 to 47,360; Hosts 43,943 to 42,529; Privacy 50,845 to 49,430; Terms 48,065 to 46,651; Redeem 47,283 to 45,865; SignIn 48,411 to 46,995; PrivacyRequest 51,143 to 49,728 (1,472 B left, was 57). Nothing on the page itself changed, so UiSelect and UiSheet still load with it. New lazy chunks now cost public pages far less than before.

Related: [[Design System]] · [[F55 Card colour presets and a Plus colour wheel]] · back to [[00 Master To-Do]]
