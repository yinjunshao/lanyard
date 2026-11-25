---
tags: [decision, host, design]
status: Accepted
date: 2026-11-24
---
# D060 Event themes are one shared list drawn by CSS, and a chosen text colour must read

**Status:** Accepted  ·  **Date:** 2026-11-24  ·  Builds on [[D052 Free accounts save only preset strap colours; Plus any colour and a text colour, checked in the Worker]]

## Context
A host chose an event's look from three themes in a select and a native colour input ([[F65 Event themes and an advanced look]]). The owner asked for a few designed themes and an advanced mode with any brand colour, and later the company's own branding ([[F66 Host branding on event pages]]). The check-in page is a public page held to a script budget, and every theme has to be drawn the same on the check-in page head, the Present page and the printed poster.

## Decision
- **One list, `src/lib/eventthemes.js`, with no imports.** Eight themes: Persimmon (`default`), Formal, Night (the three that existed, under the same ids), then Forest, Ocean, Plum, Rose and Sand. Each has an id, a plain name, the strap colour, the ink on it, a tint for the page and a dark flag. The Worker keeps only an exact id and turns anything else into `default`; the host's swatches and the preview read the same list. `events.theme` was always free text, so a new id needs no migration.
- **Themes are CSS, never script.** `src/styles/eventthemes.css` (imported once by `main.css`, so no script chunk fetches a stylesheet and the entry's preload map does not grow) has a rule for every id on each surface: `.profile.event-brand.<id>` (the head), `main.present.<id>` (the stripe, and the light-look tint) and `.poster.<id>` (the top rule). Formal's and Night's head rules stay in `main.css`, unchanged. The check-in page puts the id on the head as a class and sets two custom properties as data; it imports no theme code.
- **A brand colour is any `#RRGGBB`, free for hosts.** The F55 colour panel is reused with the Plus gate off (a prop on the swatch row); a card's colours stay Plus-only. White or black, whichever reads better, always reaches 4.58:1 or more on any colour, so a colour on its own is never refused.
- **The words on the strap** are Automatic, or White, or Dark (the card's near-black) as a host's choice. A chosen one is refused unless it reaches 4.5:1 on the strap the event will have, by the form (the unreadable choice cannot be picked) and by the Worker (400, `ink_low`, checked against the saved colour and theme on an edit too). It is one nullable column, `events.strap_ink` (migration 0043). The Worker serves the ink to the check-in page only when the host set a colour or a choice; a plain theme sends none.
- **Contrast is worked out from the CSS** in `test/event-themes.mjs`: every strap with its ink, every tint with the page's text and quiet text, and a sweep proving the automatic ink.

## Consequences
An existing custom brand colour now gets the better of white or black for its words (before, always white), so a pale colour reads better; no other existing look changes. A new theme is one list entry and three CSS rules, and the test fails if one is missing. "Use our company branding" is a disabled switch until F66.

**Evidence:** `src/lib/eventthemes.js`, `src/lib/eventlook.js`, `src/styles/eventthemes.css`, `worker/hosts.js` (`eventFields`), `worker/events.js`, `migrations/0043_event_strap_ink.sql`, `test/event-themes.mjs`

Related: [[F65 Event themes and an advanced look]], [[D045 Motion is CSS tokens and a few lines of script, never a library or Vue Transition]] · back to [[Decision Log]]
