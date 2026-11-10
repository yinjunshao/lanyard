---
tags: [decision]
status: Accepted
date: 2026-11-10
---
# D018 Hand-built pickers outside the shared Vue chunk

**Status:** Accepted  ·  **Date:** 2026-11-10

## Context
[[F08 Custom pickers and dropdowns]] replaces every native select and date input. Public pages are already over the 50 KB JS budget ([[F28 Public-page JS budget]]) and every public page loads one shared Vue runtime chunk, so anything the new controls add to that chunk is paid by visitors who never see a picker.

## Decision
- Build the controls by hand, with no new dependency.
- Keep them out of the shared Vue chunk: `UiSheet` moves itself to `<body>` instead of using `Teleport`, uses a counter instead of `useId`, and calls the slot function instead of a compiled `<slot>`. `PublicCard` loads the calendar with a plain `import()`, not `defineAsyncComponent`. Measured: each of these added code to the runtime chunk (about 2 KB raw for `defineAsyncComponent` alone). `test/pickers.mjs` guards it.
- Date-time values are unix ms (or null), read and written in the viewer's own zone, the same as `fromLocalInput` gave. Date-only values stay `YYYY-MM-DD`, times `HH:mm`.

## Consequences
Public-page JS did not grow (see the F08 Log). A new picker must follow the same rules, and `UiSheet` must be the last child of its parent because it moves itself. In a clock change a time that does not exist becomes the next hour and a time that happens twice is the first one, as with the native control.

**Evidence:** `src/components/ui/`, `src/lib/dates.js`, `test/dates.mjs`, `test/pickers.mjs`

Related: [[Design System]] · back to [[Decision Log]]
