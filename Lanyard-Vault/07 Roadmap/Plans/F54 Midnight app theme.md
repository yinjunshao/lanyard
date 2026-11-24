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
- [x] F54.1 Add the Midnight tokens, the theme choice and the pre-paint; make every dark check include Midnight; tests (theme.js applies `midnight`, the meta colour, the setting is saved); browser check of My card, People, a person, Events, an event hub, Settings, a sheet and a picker in Midnight at 375 and 1280 px, and the Light and Dark themes unchanged.

## Acceptance checks
- [x] Choosing Midnight in Settings > Appearance turns the app background pure black (`#000000`) at once and the browser bar black; reloading keeps it with no flash of light.
  - Verified in the browser: choosing Midnight gave `data-theme="midnight"`, body `rgb(0, 0, 0)`, the `theme-color` tag `#000000` and `localStorage` `midnight`; after a reload the theme was still midnight, and `/theme-init.js` is a same-origin blocking script that finished before the app's module started. The pre-paint behaviour is also run in `test/theme.mjs` for every choice. I could not photograph the first frame in the pane (it draws a few frames a second), so "no flash" rests on the blocking script plus the splash following the theme.
- [ ] Text, muted text, buttons, chips, inputs, sheets and pickers are all readable in Midnight (each text colour at least 4.5:1 on its background, checked with computed colours).
  - Left unticked: a scan of computed colours (My card, People, a person, Events, an event hub, Settings and its pages, Edit profile, My cards, Scan, with animations finished) found every theme-coloured pair at 4.5:1 or better (the weakest, a picker placeholder, is about 4.6:1), but white text on the brand strap orange `#D9502B` is 4.09:1 (primary buttons, the strap on a card), and 3.24:1 for the small event line on a card's strap. That orange and white are the same in Light and Dark, and a card is a physical object. Changing them would change Light and Dark, so see the question in the Log.
- [x] Dark and Light look exactly as before.
  - Verified by reading the computed tokens in the browser under each theme (Dark paper `#141311`, raised `#201e1a`, rule `#3a362f`; Light `#f4f1ea`, `#fffdf8`, `#d8d2c5`, shadows unchanged) and by `test/theme.mjs`, which pins Dark's token values. The Dark block's selector became a `:is()` group, which has the same specificity. One small change to both: the start-up splash now follows the chosen theme, not only the device, so a person who chose Light on a dark device no longer sees a dark splash first.
- [x] A card using the card theme "Night" looks the same in every app theme.
  - Verified in the browser: a `.badge.night` element has the same `--paper`, background and shadow under Dark and Midnight (Light differs only by the shadow, as before). In Midnight the card keeps Dark's shadow (a rule for `.badge, .profile`).
- [x] `npm test` passes; public pages within budget.
  - Exit 0 and `npm run build` exit 0 at the F54.1 commit; numbers in the Log.

## Log
- 2026-11-24 (Claude subagent) F54.1: Midnight added. `theme.js` gives `light`, `night` or `midnight` (and `#F4F1EA`, `#141311`, `#000000` for the browser bar); Settings > Appearance offers Auto, Light, Dark, Midnight and, with Auto only, a second choice "When my device is dark": Dark or Midnight (about 20 lines, so kept). CSS: the dark tokens are a `:root:is([data-theme="night"], [data-theme="midnight"])` group; Midnight overrides paper `#000000`, raised `#0d0d0d`, graphite `#9a958b`, rule `#262422`, `--shadow-1` none and `--shadow-2` a 1px rule edge; the success text rule names both; no JS compares the attribute to night (a guard). A card's own Night theme is unchanged.
- **Pre-paint:** the content security policy allows no inline script (`script-src 'self'`), so the few lines that set the theme before first paint are a separate plain file, `public/theme-init.js` (about 0.7 KB, gzip about 0.4 KB): a blocking `<script src="/theme-init.js">` in the head after the theme-color tag, from the same origin (no other origin is involved). It is not counted by the JS budget (`test/budget.mjs` measures the entry chunk and the page chunks under `dist/assets`); it is one extra small request on every page load, cached by the browser and not in the service worker's list (offline, the app sets the theme when it starts, as before). The splash `.boot` follows the chosen theme too.
- **Budget** (first-load gzip B, at 62f7dc9 before to after): Landing 44,013 to 44,099; PublicCard 47,353 to 47,441; Hosts 42,524 to 42,613; Privacy 49,426 to 49,514; Terms 46,649 to 46,738; Redeem 45,863 to 45,946; SignIn 46,991 to 47,082; PrivacyRequest 49,720 to 49,800 (limit 51,200). About 90 B each, from `theme.js`.
- **Left unticked: contrast of white on the strap orange** (see the check). Item stays In progress.
- Not checked: a real OLED phone, and the very first frame of a reload. Walked in Midnight at 375 px: Settings > Appearance, My card, People, a person, Events, an event hub (a made-up check-in on local data), Settings, Edit profile, My cards, Scan, and a picker popover (the picker as a bottom sheet and 1280 px were not walked for every page).
- **Guard note:** `test/loading.mjs` requires `onBeforeUnmount(() => stopGlide?.())` in SettingsAppearance, so the second control's cleanup is its own line; no guard was changed for F54.

> [!note] Owner decision 2026-11-24: **deepen the orange slightly** to `#C4441E` everywhere (5.0:1 with white), done as F55.0 in [[F55 Card colour presets and a Plus colour wheel]]; this check is ticked once F55.0 lands.

> [!question] (answered 2026-11-24, see the note above) White on the strap orange `#D9502B` is 4.09:1, under 4.5:1, in every theme (primary buttons, the card strap). It is the brand colour and a card is a physical object, so I left it. Should the primary button text or a slightly deeper strap fix this in all themes (it would change Light and Dark)?
- 2026-11-24 (Claude subagent) F54.0: **why every public page grew by 15-50 B per feature.** The entry chunk (the one file every public page loads) carries Vite's preload map: a list of every lazy chunk and its imports and styles by hashed file name (90 names, about 2.7 KB raw). Hashes do not compress, so each new chunk anywhere in the app added a name there, and each lazy import another. Fix: `build.modulePreload: false` in `vite.config.js`. The map now keeps only the 26 style files (a lazy chunk's CSS still loads with it, checked in the built entry); a lazy chunk's own script imports start when the chunk has arrived instead of beside it (one extra round trip on a lazy route; no behaviour change). Entry 42,154 to 40,739 B gzip. First-load gzip before to after: Landing 45,537 to 44,019; PublicCard 48,847 to 47,360; Hosts 43,943 to 42,529; Privacy 50,845 to 49,430; Terms 48,065 to 46,651; Redeem 47,283 to 45,865; SignIn 48,411 to 46,995; PrivacyRequest 51,143 to 49,728 (1,472 B left, was 57). Nothing on the page itself changed, so UiSelect and UiSheet still load with it. New lazy chunks now cost public pages far less than before.

Related: [[Design System]] · [[F55 Card colour presets and a Plus colour wheel]] · back to [[00 Master To-Do]]
