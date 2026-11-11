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
- [x] F19.5 Buttons on `HostLive.vue`.
  - Present (a link that opens a new tab, `rel="noopener"`) and Print poster (a link to the poster page) side by side where the old "Print / full-screen" button was; the Report tab keeps its own "Print or save as PDF". Two small fixes on the way: the QR on the live tab was never drawn on first load (it was asked for before the page had rendered the canvas; it only appeared after changing tab or code), now it waits a tick; and Present scrolls instead of clipping when the screen is portrait (a phone), because the QR sat below the fold. Checked in the browser pane: 1280 x 720 live tab with both buttons and the QR; Present at 375 x 812 (scrolls to the QR) and 1280 x 720 with a 120-character name; the poster at 375 x 812.

## Acceptance checks
- [ ] On a 1280 × 720 screen, the QR scans from a phone 3 m away.
  - Not ticked: no phone was used. What was checked: the real Present page was screenshotted in headless Edge at 1280 x 720 (code 518 px wide, about 14 px a module) and at 1920 x 1080, and jsQR read the address from the screenshot and from copies shrunk to a quarter and a fifth of the size (a code 104 px wide, about 2.8 px a module, still read, with a little blur); `test/present.mjs` reads the same path back at 3 px a module with softness. A phone at 3 m sees a laptop-screen code at about that size. Owner step: put it on a screen or projector and scan it from 3 m with a phone.
- [x] The counter rises within 20 s of a test check-in.
  - Browser, local Worker: a test check-in showed on the page 7.4 s later (the page asks every 15 s, so the worst case is about 15 s plus the request). `test/present.mjs` checks the 15 s timing with a fake clock and that a check-in raises the count the route returns.
- [x] Print preview shows one A4 page, with no cut-off and no controls.
  - Checked through the browser engine's own PDF output (Edge, not Chrome's dialog): one page, "1 of 1" in the viewer, for a short event and for a 120-character name with a 120-character venue; margins, strap rule and QR all inside the page; no buttons or note. See F19.4. The print dialog itself and a printer were not used.

## Log
- 2026-11-11 (owner decision, relayed by the orchestrator): F19 lists "Needs: F10". F10 is fully built and committed but not ticked, because its last checks need the production subdomain. The owner said to build the items behind F10 now, on F10's code as it stands. Anything F10's production rollout changes (the host site address, the host cookie, `HOST_ORIGIN`) may need rework here: the present and print pages are host pages that call `HostApi.hostLive`, and the check-in address comes from `lib/checkinlink.js` (the main site's origin).
- 2026-11-11: claimed by Claude subagent.

- 2026-11-11 (Claude subagent): Built, all five tasks. **Left In progress** (not Done): the first acceptance check needs a phone and a screen, which I did not have. Present (`/events/:id/present`) and the A4 poster (`/events/:id/print`) are in, with two buttons on the live tab. Decision: [[D030 Present and the poster share one route, one address and one QR path]]. No migration, no new dependency.
- First-load JS (gzip, `test/budget.mjs`), before (HEAD at the start, 8facd82) and after: PublicCard 50,979 to 50,981 B, PrivacyRequest 50,462 to 50,499 B, Landing 45,073 to 45,092 B (all under 51,200). Three separate lazy routes would have cost PublicCard +97 B and, with `defineAsyncComponent`, +770 B, so one route goes to a small `HostEvent.vue` that loads the live page, Present or the poster with a plain `import()`. **The card page has about 220 B of headroom, PrivacyRequest about 700 B, as before.**
- Tests: new `test/present.mjs` (85 checks: address, QR decoded with jsQR, access rules and nothing per person, polling with a fake clock, rotated code, controls and wake lock with fakes, the poster's A4 rules, the buttons, budget source guards), wired into `npm test` before the budget check. Changed: `test/hostsite.mjs` (the host route table check now looks for `/events/:id/:screen(present|print)?` where it looked for `/events/:id`; the same check, one route).
- Decisions I made without the owner: (1) the page shows the check-in count only, always (the live tab shows it raw too; nothing per person; connections, selfies, feedback and the presence figure are not on the page). (2) The typed address reads "Or go to lanyd.fyi/e/CODE", not "go to lanyd.fyi and enter", because the landing page has no code box (the code box is on /app/scan). (3) A Night event starts dark and anything else starts light; the Light/Dark button is for the page only and nothing is saved. (4) No "Codes rotate. Print on the day." warning: event codes only change when the host presses New check-in code, so the poster stays valid; the screen note says so. (5) Present's QR sits on a white square in dark mode too. (6) `?auto=0` on the poster stops the print dialog opening (needed for checking it; also useful if someone wants to look first). (7) Fixed the live tab's QR not being drawn on first load, and Present scrolls on a portrait screen.
- Checked, and how: see each task and acceptance check above. Not checked: the Fullscreen button in a real browser (the browser pane blocks it), the wake lock being held, the real print dialog and a printer, a phone scanning from 3 m, a screen reader.
- Found on the way, not changed: `Decision Log.md` has the D028 row above its table separator (D030 is placed after the separator, with D029).

> [!question] A link for a venue screen that works without signing in. The plan says Present is for a screen or projector, and a venue's own screen or a spare laptop cannot sign in as a host. The plan does not say how such a page would be reached, and an address that works without signing in would be a secret link on the open internet, so I did not build it. Owner: do you want one (for example a long random link per event that you can switch off, showing only the same name, QR, code and count)? Today the host signs in on the machine that drives the screen.

> [!question] Wording on the poster and Present. "Add your name. No app to install." and "Keep a face and a name for everyone you meet." are mine (plain words, no named societies). Owner: change them if you want other words; they are in `HostPrint.vue`.

### Owner steps
- Review the F19 commits, `git push`, then `npm run deploy`. No migration. Present and the poster need the host site (`host.lanyd.fyi`) to be live, as F10 does.
- Open Present on a real screen or projector at 1280 x 720 and 1920 x 1080 and scan the QR from 3 m with a phone (the first acceptance check). Try the Fullscreen button and check the screen stays awake.
- Print a poster on paper (Chrome's print dialog, A4, margins Default) and scan it. Check the strap rule prints (it is a border, so it should, even with background graphics off).
- F10 rework risk: this was built on F10 as it stands. If the production rollout changes the host site address or cookie, only the host pages and `HostApi` change; the check-in address comes from `lib/checkinlink.js` (the main site's origin).

Related: [[Host Portal and Billing]], [[F18 Live previews for cards and events]] · back to [[00 Master To-Do]]
