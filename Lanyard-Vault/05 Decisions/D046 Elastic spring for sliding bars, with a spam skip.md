---
tags: [decision, design, performance]
status: Accepted
date: 2026-11-19
---
# D046 Elastic spring for sliding bars, with a spam skip

**Status:** Accepted  ·  **Date:** 2026-11-19

## Context
[[F42 Elastic slides for tabs and notches]]: the owner asked for the orange bar under the tabs, and any sliding notch, to overshoot a little and settle, the way a rubber-banded thing does, and for a fast run of taps not to queue slides. [[D045 Motion is CSS tokens and a few lines of script, never a library or Vue Transition]] set a 300 ms limit on every duration and no library, so the spring has to be CSS.

## Decision
- **One spring token:** `--ease-spring` in `:root` (`src/styles/main.css`) is a `linear()` curve with about 7% overshoot, one settle and a 420 ms run. Where the browser cannot run `linear()`, `@supports not (transition-timing-function: linear(0, 1))` sets a `cubic-bezier(0.34, 1.4, 0.64, 1)` instead.
- **One named exception to the 300 ms rule:** `--dur-elastic` 420 ms, never over 450 ms, and 0 ms under reduced motion (it jumps). It replaces `--dur-glide`. The guard in `test/loading.mjs` checks that it is used only by the two sliding bars.
- **Only real sliders:** the tab bar's bar in AppShell, and a segmented control that glides (`glideSeg` in `src/lib/segGlide.js`: the host event tabs and Settings' appearance control). No toggle switch exists in the app. Chips, the other plain `.seg` pickers (card preview, event preview, the mode picker, Admin) do not slide and stay as they are.
- **Spam skip:** a tap while the bar is still moving, or a third tap within about 600 ms, sets `.jump` on the same change, which sets `transition: none`, so the bar jumps there. The next calm tap takes the spring again. Nothing is queued. The rule is `makeGlideCalm`, written out in `src/lib/segGlide.js` and again in `AppShell.vue`, because the app frame must not load the glide code (it would add to the shared entry that every public page loads). A guard keeps the two copies the same.
- Only `transform` moves. A jump is a class, never a time written in a component.

## Consequences
- A new sliding bar uses `--ease-spring` and `--dur-elastic`, and the spam skip; it does not add its own transition.
- The F40 guards for the glide now check the elastic token and spring in place of the 200 ms ease-out. Nothing was loosened: the 300 ms limit still holds for every other token.
- The entry chunk stays as it was: the helper is not in shared code (a first attempt in a shared module added 14 B gzip to every public page and was moved).
- Browsers without `linear()` get the cubic-bezier, whose overshoot is smaller.

**Evidence:** `src/styles/main.css` (Motion (F40), tabbar, `.seg.glides`), `src/lib/segGlide.js`, `src/components/AppShell.vue`, `src/views/settings/SettingsAppearance.vue`, `test/loading.mjs` (F40.1, F40.5, F40.6, F42.1 sections)

Related: [[Design System]], [[D045 Motion is CSS tokens and a few lines of script, never a library or Vue Transition]] · back to [[Decision Log]]
