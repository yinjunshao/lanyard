---
tags: [decision, plus, security, design]
status: Accepted
date: 2026-11-24
---
# D052 Free accounts save only preset strap colours; Plus any colour and a text colour, checked in the Worker

**Status:** Accepted  ·  **Date:** 2026-11-24

## Context
[[F55 Card colour presets and a Plus colour wheel]]: the owner decided on 2026-11-24 that free users choose a card's strap colour only from presets ("which means they wont mess up the appearance"), and Plus users get the whole colour wheel and can change the card's text colour. Hiding a control is not a rule, so the Worker has to refuse what the plan does not include, and it has to do it so that two requests at the same moment, a plan that lapses mid-request or a replayed request cannot get round it ([[D040 Limits and claims are enforced in the write itself, and a guess is counted before it is checked]]). The plan is known from the `users` row, which the payment provider's events move ([[D041 Polar as merchant of record behind one provider module]], [[F27 Lanyard Plus and billing]]).

## Decision
- **Ten presets, one list.** `STRAP_PRESETS` in `src/lib/cardcolour.js` (no imports), read by the Worker and by the swatches. Each reaches 4.5:1 with white strap text (a test works it out; Ochre is `#9A6410`, not the planned `#A86F12` at 4.2:1).
- **Free (and a lapsed Plus account) may save a preset, clear the colour, or send back the colour the card already has.** Any other value is 400 and nothing in that request is saved. Plus may save any `#RRGGBB`. The Worker accepts only `#` and six hex digits (any case, kept in capitals); the colour panel expands `#RGB` before it sends.
- **The plan comes from the database, never the request.** Fields like `plan`, `tier` or `customStrap` in a body, query or header are ignored. A quick check gives the friendly answer; the same rule is inside the writing statement: `UPDATE cards ... AND <Plus now>` and `INSERT ... WHERE (under the card limit) AND (colour is a preset or <Plus now>)`, where "Plus now" is `plan = 'plus'` and `plan_until` empty, 0 or in the future (the same as `planOf`). So a plan that ends between the read and the write, or twenty requests sent together, cannot get a custom colour in.
- **A lapsed Plus account keeps what it saved.** Nothing is rewritten; the card keeps drawing it. Saving the card again with the same colour writes nothing for the colour. A new custom colour is refused; a preset or clearing is fine.
- **The text colour (Plus only)** is a nullable `cards.text_color`, held to the same plan rule, and must reach 3:1 against the card's background (the card theme's paper) or the save is refused with a plain message; between 3:1 and 4.5:1 it saves and the editor says "Hard to read". Details and tests in F55.3.
- **The colour reaches the page as data.** Card views carry `strapColor` and `strapInk` (white or black, whichever reads at 4.5:1), applied with CSS custom properties, so the public card page gains no code.

## Consequences
- A free account that used to see only "Custom colours are part of Lanyard Plus" now picks from ten. The older refusal was 402 `plan_limit`; it is now 400 `plus_colour`.
- Plus can no longer be bypassed by editing the form, but a free account cannot have a brand colour that is not a preset. Hosts' event colours are separate ([[F18 Live previews for cards and events]]) and unchanged.
- [[F56 Premium materials for Plus cards]] adds a materials choice under the same rule.

**Evidence:** `src/lib/cardcolour.js`, `worker/cardcolour.js`, `worker/index.js` (`/api/cards`), `src/components/CardSwatches.vue`, `test/card-colours.mjs`

Related: [[Pricing]], [[Design System]] · back to [[Decision Log]]
