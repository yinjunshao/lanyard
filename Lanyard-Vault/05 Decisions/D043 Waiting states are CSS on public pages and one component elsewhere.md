---
tags: [decision, performance, design]
status: Accepted
date: 2026-11-17
---
# D043 Waiting states are CSS on public pages and one component elsewhere

**Status:** Accepted  ·  **Date:** 2026-11-17

## Context
[[F38 Loading states]]: people should always see that something is happening, a busy button must not fire twice, and a slow page should say so and offer Try again. Public pages are held to 51,200 B of first-load JavaScript ([[F28 Public-page JS budget]], [[D024 Signed-in frame and heavy pieces load only where used]]) and the public card had about 150 B to spare. A shared Vue component, a composable or any new file named in the entry's chunk list costs every public page bytes.

## Decision
- **Public pages (the card, the event check-in page, Redeem) wait with CSS and markup only.** The classes are in `src/styles/main.css` under "Waiting (F38)": `.sk-wrap` (the region, `aria-busy="true"`, with one soft sweep that is a single animation and stops under `prefers-reduced-motion`), `.sk` blocks in `--rule` grey, `.sk-profile` (the whole card drawn by one element with layered gradients) and `.sk-slow`. The "taking longer than usual" note and its Try again link are in the markup from the start and **appear by a CSS animation 8 seconds later** (`visibility` flipped by `sk-in`), so there is no timer and no state in the page; Try again is a plain link to the same address, which reloads. One visually hidden `role="status"` line says what is loading. A public page imports nothing for this, and `test/loading.mjs` fails if one does.
- **Signed-in, host and admin pages use `src/components/Waiting.vue`.** It draws shapes (`list`, `panel`, `form`, `lines`, with an optional heading and three figure tiles), carries `aria-busy`, hides the blocks from a screen reader, keeps one polite message that changes once when the page is slow, and after 8 seconds shows the note and a Try again button that calls the page's own load function (`:retry="load"`), or reloads if none is given. A page waits again when its load function is called again.
- **One press at a time.** `useBusy()` (exported from `Waiting.vue`, so it adds no new file name) returns `once(fn)`, which ignores a call while one is running, and `working`, the wrapped function that is running; a button is `:disabled="!!working"` and says "Saving…" only when `working === thatFunction`. Where a page already had a busy flag it keeps it, and the handler returns early on it. `test/loading.mjs` checks every button and form that sends something: disabled while it waits, and its handler ignores a second call.
- **Pages with their own colours** (Present, Print) say "Opening the event…" and use the same timed link, not blocks.
- **A skeleton only where content will certainly come.** Small extras that may stay empty (the follow-up panels on My card, the AI allowance list, the lists of who checked in) keep showing nothing until they arrive, because a skeleton would promise something that may not appear.
- The error wording is not touched here; that is [[F39 Informative error messages]].

## Consequences
- A new public page that waits must use the CSS classes and add no import; a new signed-in page imports `Waiting`. Both are guarded by `test/loading.mjs`.
- The shared `Waiting` chunk adds one file name and a few indices to the preload list in the entry, about 45 B gzip on every public page (measured in the F38 Log); the public card's own markup was paid for by moving four inline styles into `main.css`.
- Public Try again reloads the whole page, which is a heavier retry than the in-place retry the signed-in pages have; it was the only way without script.
- Screen readers hear one message when a page starts waiting and one more if it turns slow; the blocks themselves are silent.

**Evidence:** `src/styles/main.css`, `src/components/Waiting.vue`, `src/views/PublicCard.vue`, `src/views/EventJoin.vue`, `src/views/Redeem.vue`, `test/loading.mjs`

Related: [[Design System]], [[D018 Hand-built pickers outside the shared Vue chunk]], [[D024 Signed-in frame and heavy pieces load only where used]] · back to [[Decision Log]]
