---
tags: [roadmap, feature, motion, scan, card]
id: F73
priority: P1
phase: 13
size: M
status: In progress
needs: []
---
# F73 Scan and card arrival motion

**Priority:** P1 · **Phase:** 13 Owner requests (2026-11-25, second batch) · **Size:** M · **Needs:** none · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-25)
> "Perhaps make like or start designing an animation for when users scan another user's QR code. So make the loading animation or whatever cleaner. And also make card loading animation, so when after they arrive on another person's card, the card smoothly comes out as well."

## Current state
- `src/views/Scan.vue`: the camera reads a QR, `resolveScanned` resolves it, and `go()` (about line 28) calls `router.push('/c/<cardId>...')` straight away. Nothing says "got it".
- `src/views/PublicCard.vue` (a public page): while loading it shows a skeleton (`.sk-wrap.sk-profile`, about line 98), then the card appears at once.
- Motion rules live in the Motion section of `src/styles/main.css` (about lines 39, 914 and 1006): with reduced motion, slides become short fades. The keyframes `m-fade`, `m-fade-out` and `shutter` already exist. See [[F40 Motion for sheets panels and tabs]] and [[F42 Elastic slides for tabs and notches]].
- **JS budget:** PublicCard loads 47,699 B gzip against 51,200 B. Keep its growth under 600 B, and prefer CSS.

## Plan
- **Scan, when a code is read:**
  - The scan frame locks onto the code. The four corner marks close in and turn the strap colour, then a short soft pulse and a tick, about 350 ms in all, with a light haptic (`navigator.vibrate(15)` where it exists). Then the page moves on.
  - If resolving takes longer than the animation, the frame holds a calm "Opening card" state: a thin progress line along the frame, not a spinner.
  - A code that is not a Lanyard code shakes the frame once and shows the existing hint.
- **Card arrival on `/c/<id>`:**
  - The skeleton keeps the card's real shape and size, so nothing jumps, and its shimmer stays as it is.
  - When the data arrives, the badge rises into place (about 16 px up, with a fade, about 320 ms, using the easing the Motion section already uses). The panels under it follow 60 ms later.
- **Reduced motion:** both become a plain 150 ms fade, with no movement, no shake and no haptic.
- **How it is built:**
  - No animation library: CSS keyframes and classes, plus the smallest JS to add a class when the code is read or the data has arrived.
  - Once the answer is back, the route change waits for nothing longer than the animation.
  - Name the classes generally (for example `.scan-lock`, `.arrive`), so the Connect flow can reuse the same lock later.

## Tasks
- [x] F73.1 The scan lock, the opening state and the miss shake in Scan.
- [x] F73.2 The card rising into place on the public card page, with the panels after it.
- [x] F73.3 Tests (source guards for the reduced-motion fallbacks, and the budget), vault notes, Log, Master To-Do.

## Acceptance checks
- [x] Typing a card code on Scan (or a test that calls the same handler) shows the lock state for about 350 ms and then opens the card. A wrong code shakes once and shows the hint.
- [x] On `/c/<id>` with the network throttled in the browser pane, the skeleton has the card's size. When the card loads, the badge rises in with no layout jump (the page height above the badge does not change).
- [x] With reduced motion emulated, both are plain fades, checked in the computed styles.
- [x] PublicCard stays under budget and grows by less than 600 B gzip, with the numbers in the Log.
- [ ] Owner check (cannot be ticked by an agent): scan a real badge with a phone camera and judge whether it feels clean.

## Log
- 2026-11-25 (Claude subagent) All three tasks built: 55647b1 F73.1 (Scan), 7585b0c F73.2 (card page), and F73.3 (the test, vault lines, this note). No migration, no Worker change. F73 stays unticked in the Master To-Do: it waits on the owner's phone check (scan a real badge and judge the feel).
- **Scan (F73.1).** `src/lib/scanLock.js` (new) holds `LOCK_MS` 350, `LOCK_REDUCED_MS` 150, `WAIT_MS` 250 and `buzz()` (`navigator.vibrate(15)`, never under reduced motion, never throws). `Scan.vue` has `resolveAndOpen`, used by the camera path (`"q"`) and the typed path (`"c"`): an answer slower than 250 ms sets the frame to `scan-wait` (a thin strap line running along it, no spinner); a card or event sets `scan-lock` (four strap corner marks close in over 200 ms, a pulse ring and a tick at 150 ms, the plain reticle steps back), buzzes once, waits `lockMs()` and then calls `go(res, s)`; anything else shakes the reticle once (`scan-miss`, 300 ms) and shows the existing hint or error. One always-present visually hidden `role="status"` says "Opening card" (or "Opening event"), set by wait and kept by lock, so it is said once. Leaving the page during the lock never navigates. The classes are general (`.scan-lock-mark`, `.scan-bar`) for the Connect flow.
- **Card page (F73.2).** Scoped CSS in `PublicCard.vue` only: the notes and the card rise 16 px with a fade, 300 ms, `--ease-out`; the panels under the card (`.panel`, `.connected-foot`) follow 60 ms later. No script, no new live region. Timings are custom properties on `.profile-page` and `.scan-frame` (F40's guard forbids literal durations in components); `main.css` is untouched.
- **Choices made without the owner.** The rise is 300 ms, not the plan's about 320, to keep F40's "nothing over 300 ms" (the waiting line's 1.4 s loop is the same kind of thing as the skeleton sweep, and is a custom property, not a literal). The lock is 350 ms in total, each piece at most 200 ms. The tick keeps a static `rotate(-45deg)` as its shape under reduced motion; nothing animates it there.
- **Motion bar, and how each line is checked.** (1) Reduced motion: `test/motion-scan.mjs` runs `scanLock.js` with a fake `matchMedia` and `navigator.vibrate` (350 vs 150 ms; vibrate called once with 15 normally and never when reduced; no throw without matchMedia or vibrate) and guards the reduced blocks (`m-fade` at 150 ms, no transform, no shake keyframe, no ring). In the browser pane I applied the declarations of the real reduced block (the pane cannot set the OS option, as in F40 and F52) and read the animations: Scan lock, wait and miss, and the card, notes and panels were all `m-fade` 150 ms, keyframes `opacity` only, panels delayed 60 ms. (2) Route wait: a guard pins one `pause(lockMs())` between the answer and `go(res, s)`; measured with the typed code, the answer came at 111 ms, the lock class at 112 ms and `pushState` at 488 ms (the lock plus timer slop). A slow answer showed `scan-wait`, then the lock, then the route. (3) Skeleton size: `.sk-profile` is 400 px at the card's width; with the card response delayed 2.5 s the header stayed at top 25 px, height 40 px, and the card sat at top 81 px both as skeleton and as card (the card is 282 to 434 px tall depending on content; nothing sits below it). For the owner's own card the existing "This is how others see your card" note sits above and moves it down, as it did before. (4) Only transform and opacity: a guard reads every keyframe in both style blocks, and F40's guards in `loading.mjs` (no literal durations, none over 300 ms) pass. (5) Screen readers: guards for the single polite status line, set once, and for the card page keeping exactly its two existing `role="status"` lines.
- **Camera path.** The pane cannot drive the camera. The camera and typed paths call the same `resolveAndOpen`; I drove the typed path (code CE7E) in the pane and did not run the camera handler.
- **Seen in the pane** (375 px and 1280 px, light and dark, a local guest account): the lock frozen at 120 ms (corners closing) and at 300 ms (corners, tick, faint ring); a wrong code shaking once for 300 ms with the existing error text; the card arrival with a connected viewer (card 300 ms, panels +60 ms). The pane did not advance animation frames while in the background, so the arrival's motion was read from the Web Animations data and frozen frames, not watched live.
- **Budget (JS gzip, before = HEAD built in a scratch copy, then after):** Landing 44,340 to 44,358; PublicCard 47,692 to 47,712 (+20, limit 600); Hosts 42,696 to 42,710; Privacy 50,365 to 50,381; Terms 46,907 to 46,922; Redeem 46,053 to 46,066; SignIn 47,163 to 47,178; PrivacyRequest 49,883 to 49,899; limit 51,200. The few bytes are the file names of the two CSS chunks in the entry's loader map. CSS: `main.css` unchanged (40,365 B, 8,907 gzip); `PublicCard.css` 125 to 1,487 B raw (137 to 397 gzip); `Scan.css` is new, 3,199 B raw (803 gzip), loaded only on the Scan page.
- **Tests and guards.** New `test/motion-scan.mjs` (35 checks, in `npm test` before `rederive-fixes.mjs`, budget last). Changed `test/provenance.mjs`: it pinned `go(res, "q")` and `go(res, "c")`; it now requires `{ camera: true }), "q")`, `resolveScanned(text), "c")`, `go(res, s)` and `withSource(res.search, s)`, the same facts at the new call sites. Final `npm test` exit 0 and `npm run build` exit 0.
- Vault updates done: [[Design System]] (Scan lock and card arrival bullet), [[Codebase Map]] (new row), [[Screens and Routes]] (one paragraph). **Vault updates pending (owner-modified notes):** `Testing.md` is modified in the working tree, so it was not edited. Add this row to its test table: `| node test/motion-scan.mjs | F73: the scan lock and the card arrival. Runs lib/scanLock.js with a fake matchMedia and vibrate (350 or 150 ms, one buzz, none under reduced motion) and guards Scan.vue and PublicCard.vue: one pause between the answer and the route, one polite "Opening card" line, only transform and opacity in the keyframes, the reduced-motion blocks are a 150 ms m-fade, no script added to the card page. Source guards; the look is checked in a browser. |`

## Owner steps
- Front end only, no migration: `npm run deploy` (with F71 and F72). Then scan a real badge with a phone camera and judge whether the lock and the card arrival feel clean (the one unticked check), and once more with the phone's reduced-motion setting on.

Related: [[F40 Motion for sheets panels and tabs]] · [[F38 Loading states]] · back to [[00 Master To-Do]]
