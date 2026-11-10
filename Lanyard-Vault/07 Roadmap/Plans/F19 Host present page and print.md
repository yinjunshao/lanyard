---
tags: [roadmap, feature, host]
id: F19
priority: P1
phase: 3
size: M
status: Not started
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
- [ ] F19.1 Present route and layout, plus QR rendering at large sizes. Decode-test the rendered QR at 3 m equivalent (the earlier poster work used OpenCV `QRCodeDetector` for this).
- [ ] F19.2 Live counter polling and code-rotation refresh.
- [ ] F19.3 Controls, fullscreen, wake lock.
- [ ] F19.4 Print route with A4 CSS, checked in Chrome's print preview and as a PDF.
- [ ] F19.5 Buttons on `HostLive.vue`.

## Acceptance checks
- [ ] On a 1280 × 720 screen, the QR scans from a phone 3 m away.
- [ ] The counter rises within 20 s of a test check-in.
- [ ] Print preview shows one A4 page, with no cut-off and no controls.

## Log
-

Related: [[Host Portal and Billing]], [[F18 Live previews for cards and events]] · back to [[00 Master To-Do]]
