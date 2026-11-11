---
tags: [roadmap, feature, host]
id: F19
priority: P1
phase: 3
size: M
status: In progress
needs: [F10]
---
# F19 Host present page and print

**Priority:** P1 (useful at every real event) · **Phase:** 3 Host tools · **Size:** M · **Needs:** [[F10 Separate host accounts on host subdomain]] · back to [[00 Master To-Do]]

## What the owner asked for
A **Present** page for hosts that displays the event better and more stylised, for a screen or projector, with a **separate button to print**.

## Present page: `host.lanyd.fyi/events/:id/present`
- Full screen, landscape-first, readable from the back of a room:
  - event name (large), venue and time (small)
  - **big QR** for the event join URL, at least 40% of the screen height, with a proper quiet zone
  - the short event code in large tabular figures, with "or go to lanyd.fyi and enter"
  - "Scan to check in" in one line
  - **live check-ins** counter (polls `GET /api/host/events/:id/live` every 15 s; pauses when the tab is hidden)
  - the event theme and strap colour; the host brand colour on the strap only ([[D010 Paper, ink and one strap colour]])
- The event code rotates. When it rotates, the QR and code update without a page reload.
- Controls appear on mouse move and hide after 3 s: Fullscreen, Theme (light/dark for bright or dim rooms), Exit. The cursor hides with them.
- Keep the screen awake with the Wake Lock API where supported (fail silently).
- Works on a laptop plugged into a projector at 1280 × 720 and on a 4K TV.

## Print: `…/events/:id/print`
- An A4 portrait poster built with print CSS (`@page { size: A4; margin: 12mm }`): event name, date and venue, a QR at least 70 mm wide, the code, three short steps ("Scan · Check in · Meet people"), and the Lanyard wordmark small at the bottom.
- No live counter, no controls. The browser print dialog opens on load, with a "Print" button as backup.
- The QR uses the **non-rotating** join link if one exists; otherwise a warning: "Codes rotate. Print on the day."

## Where the buttons go
On the host live page (`HostLive.vue`), two buttons side by side: **Present** (opens a new tab) and **Print poster**.

## Tasks
- [x] F19.1 Present route and layout, plus QR rendering at large sizes. Decode-test the rendered QR at 3 m equivalent (the earlier poster work used OpenCV `QRCodeDetector` for this).
  - `/events/:id/present` on the host site. `HostPresent.vue` draws the event name, venue and time, "Scan to check in", the code and "Or go to lanyd.fyi/e/CODE" (the address as typed, because the landing page has no code box), and the QR as one SVG path (`lib/qrpath.js`, 4-module quiet zone, 72 vh or 44 vw, whichever is smaller). The address comes from `lib/checkinlink.js`, which `HostLive` now uses too. Decoded in `test/present.mjs` with jsQR (already a dependency; OpenCV is not): reads back exactly, and still reads at 3 px a module with camera softness (the 1280 x 720 code is 15.7 px a module).
  - Routing: one route, `/events/:id/:screen(present|print)?`, to a small `HostEvent.vue` that loads the live page, Present or the poster. This keeps the chunk list in the entry (which every public page loads) to the same number of names: PublicCard 50,979 to 50,982 B, PrivacyRequest 50,462 to 50,458 B. Three separate routes cost PublicCard +97 B and, with `defineAsyncComponent`, +770 B.
- [x] F19.2 Live counter polling and code-rotation refresh.
  - `lib/presentpoll.js` asks `GET /api/host/events/:id/live` every 15 s, one request at a time, nothing while the tab is hidden and straight away when it is shown. The page shows the check-in count only (the live tab also shows connections, selfies and feedback; none of those is on a screen a room can see). The QR, the code and the spoken address are all worked out from the polled event, so a new code needs no reload. If a refresh fails the page keeps what it has and says "Not updating". The `/live` route is untouched: its check-in count is not hidden when small (nobody is named by it, and it is the same number the host already sees); `presenceUsed`, which the live tab hides under 3, is not on the page at all.
  - Browser (local Worker): a test check-in showed on the page 7.4 s later; pressing New check-in code changed the code, the spoken address and the QR path 13 s later with no reload.
- [x] F19.3 Controls, fullscreen, wake lock.
  - `lib/presentui.js` holds the timing and the wake lock so both are tested with a fake clock and a fake browser. Fullscreen, Dark/Light and Exit show on movement, touch or a key and hide 3 s later with the cursor (a control with keyboard focus keeps them up). The theme button is for this page only (it sets `data-theme` and puts the host's own choice back on leaving; nothing is saved); a Night event starts dark, everything else light. The wake lock is asked for when the page opens and again when the tab is shown, and a refusal or a browser without it is silent.
  - Browser (local, 1920 x 1080): controls shown and hidden after 3 s, cursor `none` while hidden, Dark and Light switch the page, Exit goes back to the live tab and the portal's theme returns. Not checked: the Fullscreen button did nothing in the browser pane (it blocks fullscreen requests), and the wake lock was not observed; both are guarded by tests of the code only.
- [x] F19.4 Print route with A4 CSS, checked in Chrome's print preview and as a PDF.
  - `/events/:id/print` (`HostPrint.vue`): `@page { size: A4; margin: 12mm }`, a 186 x 272 mm sheet laid out in `cqw` (a share of the sheet's width) so the screen and the paper are one design. Black on white whatever the app's theme; the only colour is a 3 mm strap rule across the top (event colour, Formal's navy-grey, or the Lanyard strap); no filled areas. Event name (3 lines at most), date, venue, QR 100 mm square with its quiet zone (dark part 76 mm or more), the code, the address as typed, Scan / Check in / Meet people, the wordmark. The print dialog opens when the page is ready (`?auto=0` stops that) and the Print button opens it again. The codes here do not rotate on their own (only when the host presses New check-in code), so there is no "print on the day" warning; the screen note says the poster works until then.
  - Checked with Microsoft Edge (Chromium, headless; Chrome is not installed here) driven over the DevTools protocol against the local servers: `Page.printToPDF` gave a one-page A4 PDF for a short name and for a 120-character name with a 120-character venue; the PDF opened in Edge's viewer reads "1 of 1", has the margins, no controls and the strap rule, and jsQR decodes the QR in that render to the check-in address. Print-media emulation measured the sheet at 186 x 272 mm and the QR at 100.4 mm. `window.print` was replaced by a counter: one call on load, none with `?auto=0`, one more per press of Print. Not checked: the real print dialog and a real printer (owner step: print one on paper and scan it).
- [ ] F19.5 Buttons on `HostLive.vue`.

## Acceptance checks
- [ ] On a 1280 × 720 screen, the QR scans from a phone 3 m away.
- [ ] The counter rises within 20 s of a test check-in.
- [ ] Print preview shows one A4 page, with no cut-off and no controls.

## Log
- 2026-11-11 (owner decision, relayed by the orchestrator): F19 lists "Needs: F10". F10 is fully built and committed but not ticked, because its last checks need the production subdomain. The owner said to build the items behind F10 now, on F10's code as it stands. Anything F10's production rollout changes (the host site address, the host cookie, `HOST_ORIGIN`) may need rework here: the present and print pages are host pages that call `HostApi.hostLive`, and the check-in address comes from `lib/checkinlink.js` (the main site's origin).
- 2026-11-11: claimed by Claude subagent.

Related: [[Host Portal and Billing]], [[F18 Live previews for cards and events]] · back to [[00 Master To-Do]]
