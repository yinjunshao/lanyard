---
tags: [roadmap, feature, design]
id: F40
priority: P1
phase: 8
size: L
status: Not started
needs: [F38]
---
# F40 Motion for sheets, panels and tabs

**Priority:** P1 · **Phase:** 8 Owner requests (2026-11-18) · **Size:** L · **Needs:** [[F38 Loading states]] · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-18)
"The little frames that pop up from the bottom. And when they click off of it, it slides down smoothly with good UI practice. Right now, it just completely disappears instantly, which is a bit non-modern. So do that whenever possible. And think of other additional UI information that we can do. For example, we need a loading state for the events page as well when they click into events, which has already been done, but I don't know if it's possible to make it smoother."

## Current state (survey 2026-11-18)
- No `<Transition>` anywhere in `src`. Every overlay unmounts instantly.
- `src/components/ui/UiSheet.vue` (shared: pickers, DevicesSheet, EventDrops, EventPresence, EventDetail perk and choices): `v-if="open"` at about line 172; enter only (`ui-fade` 120 ms, `ui-rise` 12 px), keyframes about 250, reduced-motion block about 252. Bottom sheet under 600 px, centred modal or popover from 600 px.
- Own sheets with no motion at all: `ConnectSheet.vue` (public card page, so under the JS budget), `FollowupComposer.vue`, `PeopleAsk.vue`, global `.sheet-backdrop` / `.sheet` in `src/styles/main.css` about 736-751.
- `EventPreview.vue` mobile panel toggled by an `.open` class (instant). `EventPage.vue` native `<dialog>` with `showModal()`. `Lightbox.vue` fades in, vanishes on close. `PhotoCropper.vue`, `TermsGate.vue` (not dismissible) no motion.
- `Waiting.vue` skeletons swap to content with no crossfade. `App.vue` and `AppShell.vue` use a bare `<router-view>`. Tabs: AppShell tab bar (`.tab::before` jumps), EventDetail tabs (`v-if`), HostLive segmented tabs (`v-show`). `<details>` in ConsentHistory and SettingsPrivacy.
- No easing or duration tokens; durations are hard-coded (90, 120, 140, 450 ms).

## Plan
1. **Tokens** in `:root` of `main.css`: `--ease-out: cubic-bezier(.2,.8,.2,1)`, `--ease-in: cubic-bezier(.4,0,1,1)`, `--dur-fast: 120ms`, `--dur: 200ms`, `--dur-sheet: 260ms` (exit about 70% of enter: `--dur-sheet-out: 200ms`). One global `@media (prefers-reduced-motion: reduce)` rule that turns slides into short fades (not off entirely, so state changes still read).
2. **Sheets and modals exit before they unmount.** Bottom sheets slide down (`translateY(100%)`) while the backdrop fades; centred modals and popovers fade and drop 8 px with a slight scale (0.98). Enter mirrors it (slide up from the bottom, not the current 12 px). Use Vue `<Transition>` in signed-in and host code; on the public card page (`ConnectSheet`) use whichever adds fewer bytes (measure `<Transition>` against a CSS class plus `animationend` / a timeout fallback) and report the numbers. Focus returns to the opener after the exit, as today. Body scroll lock is released after the exit ends.
3. **Swipe down to close** on phone bottom sheets (UiSheet and the `.sheet` ones): drag the handle or the sheet top down, past about 30% of the height or a fast flick closes, otherwise it springs back. Only from the handle or when the sheet content is scrolled to the top, so scrolling inside a sheet still works. Show the `.sheet-handle` bar on bottom sheets.
4. **Other overlays:** EventPreview mobile panel slides in from the right and out again; EventPage `<dialog>` fades and rises on open, and plays an exit before `close()`; Lightbox fades out; PhotoCropper fades in and out. TermsGate fades in only.
5. **Smoother loading:** content replaces the `Waiting` skeleton with a short crossfade (`--dur`), and list rows rise in with a small stagger (first 6 rows, 30 ms apart, then none). Route changes inside the app shell fade quickly (`mode="out-in"` is too slow; use a 120 ms fade-in of the new page only, no wait for the old one). No change to `App.vue`'s first-paint wordmark.
6. **Tabs and small things:** AppShell tab indicator and HostLive segmented control slide between tabs (transform, not width); EventDetail tab panels fade in; `<details>` open with a height ease where the browser supports `interpolate-size` / `::details-content`, otherwise as now; "Copied" and "Saved" label swaps get a short fade. No toasts (not asked for).
7. Only animate `transform` and `opacity`. Nothing longer than 300 ms. No new colours, follow [[Design System]].

## Tasks
- [ ] F40.1 Motion tokens and the global reduced-motion rule in `main.css`; a guard in `test/loading.mjs` (or a new section of it) that the tokens exist and that sheet components contain an exit transition.
- [ ] F40.2 UiSheet: enter and exit for bottom sheet, modal and popover; swipe down to close on phones; focus and scroll lock after exit.
- [ ] F40.3 ConnectSheet (public, measure bytes), FollowupComposer, PeopleAsk and the global `.sheet` styles: the same enter and exit and swipe.
- [ ] F40.4 EventPreview panel, EventPage dialog, Lightbox, PhotoCropper, TermsGate.
- [ ] F40.5 Waiting to content crossfade, list stagger, in-shell route fade.
- [ ] F40.6 Tab indicators, EventDetail tab fade, `<details>`, label-swap fades.
- [ ] F40.7 Browser check (375 and 1280 px, light and dark, reduced motion on), acceptance checks, vault: [[Design System]] gets a Motion section with the tokens and rules; decision D045.

## Acceptance checks
- [ ] On a 375 px screen, opening any picker (for example the date picker in Create event) slides a sheet up; tapping the backdrop slides it down over about 200 ms before it is removed from the page.
- [ ] Dragging a bottom sheet's handle down past a third of its height closes it; a short drag springs back; scrolling a long sheet's list does not close it.
- [ ] At 1280 px the same picker opens as a popover or modal and fades out on Escape; focus returns to the button that opened it.
- [ ] ConnectSheet on `/c/:id`, FollowupComposer and PeopleAsk slide down on backdrop click and on Escape.
- [ ] Going from Events to an event shows the skeleton, then the content fades in rather than snapping.
- [ ] With reduced motion on, no sheet slides; things fade in under 150 ms.
- [ ] `npm test` passes, including the public-page budget, with before and after numbers in the Log.

## Log
-

Related: [[F38 Loading states]] · [[Design System]] · back to [[00 Master To-Do]]
