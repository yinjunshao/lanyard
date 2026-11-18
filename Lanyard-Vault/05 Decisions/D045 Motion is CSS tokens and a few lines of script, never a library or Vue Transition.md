---
tags: [decision, performance, design]
status: Accepted
date: 2026-11-18
---
# D045 Motion is CSS tokens and a few lines of script, never a library or Vue Transition

**Status:** Accepted  ·  **Date:** 2026-11-18

## Context
[[F40 Motion for sheets panels and tabs]]: every sheet, modal and panel vanished the moment it was dismissed. The owner asked for sheets that slide down and dialogs that fade out, and for smoother loading and tab changes. Public pages are held to 51,200 B of first-load JavaScript ([[F28 Public-page JS budget]], [[D024 Signed-in frame and heavy pieces load only where used]]) and the card page and the privacy request page had little to spare.

## Decision
- **Tokens in `:root`** (`src/styles/main.css`, "Motion (F40)"): `--ease-out`, `--ease-in`, `--dur-fast` 120 ms (`--dur-fast-out` 90), `--dur` 200 ms (`--dur-out` 140), `--dur-sheet` 260 ms (`--dur-sheet-out` 200, about 70%), `--dur-glide` 200 ms, `--stagger` 30 ms, and the travel `--slide`, `--slide-fade`, `--shift`. Nothing is written over 300 ms and a thing leaves faster than it arrives.
- **One global `prefers-reduced-motion: reduce` block redefines those tokens** (no distance, opacity from 0, durations 80 to 120 ms, glide and stagger 0), so every slide becomes a short fade without a rule per component.
- **Only `transform` and `opacity` move.** A leaving dialog may flip `visibility`, `display` or `overlay`, and a `<details>` panel may ease `block-size` where the browser supports `interpolate-size`; `test/loading.mjs` scans every keyframe and transition in `src/`.
- **A dialog that is dismissed keeps its place in the page until its exit ends.** It gets `.is-leaving` (CSS plays the exit and the element takes no clicks), then removes itself: `UiSheet` by `animationend` with a 260 ms timer behind it; the `.sheet` dialogs, the photo cropper and the preview panel through `src/lib/sheetMotion.js` (`useSheetExit`) with a 220 ms timer. The page behind stays locked and focus returns to the opener only when the exit is over. A page must not take a sheet out of the page with its own `v-if` on the open state (a guard fails if it does); `UiSheet` shows what it showed last while it leaves.
- **Swipe down to close** on phone sheets is `src/lib/sheetSwipe.js`, fetched with a plain `import()` when a phone sheet opens (so in no first load). Past 30% of the height or a quick flick closes, a short drag springs back, and nothing closes while the content is scrolled, the drag goes up or sideways, or a range slider is being used.
- **No library and no Vue `<Transition>`.** Measured on the card page, the class-and-timer version of the connect sheet cost 63 B; `<Transition>` cost 2,367 B on every public page (it lands in the shared Vue chunk), and pushed Privacy and PrivacyRequest over the limit. Content that has just loaded fades in (it is new elements, so a CSS animation plays), and a new page in the signed-in frame fades in at once with no wait for the old one (a keyed wrapper). A true crossfade between a skeleton and its content would need `<Transition>` and is not done.
- **The card page fetches `ConnectSheet` with a plain `import()` beside the card** instead of importing it, so the sheet, its motion and its swipe are off the card's first load (PublicCard 51,066 to 48,715 B before the Lightbox change).
- The Lightbox stays in the page (every page loads it) and fades by `visibility` and `opacity`; the check-in page's native `<dialog>` fades and drops by CSS transitions alone, with no script on that public page.

## Consequences
- A new sheet or dialog must exit through one of these routes; the guards in `test/loading.mjs` check each named component.
- Every public page entry is about 60 B heavier for the Lightbox change; the privacy request page, which loads `UiSheet`, has about 100 B left (51,093 of 51,200), and the card page about 2.4 KB.
- A browser without `allow-discrete` transitions or `::details-content` shows and hides those two as before.
- Nothing here changes what a screen reader or the keyboard does: Escape, focus trapping and the dialog roles are as they were.

**Evidence:** `src/styles/main.css`, `src/components/ui/UiSheet.vue`, `src/lib/sheetMotion.js`, `src/lib/sheetSwipe.js`, `src/lib/segGlide.js`, `src/components/Lightbox.vue`, `test/loading.mjs`

Related: [[Design System]], [[D043 Waiting states are CSS on public pages and one component elsewhere]], [[D018 Hand-built pickers outside the shared Vue chunk]], [[D024 Signed-in frame and heavy pieces load only where used]] · back to [[Decision Log]]
