---
tags: [decision]
status: Accepted
date: 2026-11-11
---
# D030 Present and the poster share one route, one address and one QR path

**Status:** Accepted  ·  **Date:** 2026-11-11

## Context
[[F19 Host present page and print]] adds a projector page and an A4 poster for hosts. A room sees the projector page, so it must hold nothing about a person ([[D004 Aggregate-only host analytics]]). Every public page loads the entry chunk's list of lazy chunks, and two of them (the card page and the privacy request page) had under 1 KB of room under the 50 KB budget ([[D024 Signed-in frame and heavy pieces load only where used]]).

## Decision
- **Only the event and one count.** Both pages read the host-only `GET /api/host/events/:id/live` and use the event's name, venue, time, code, theme and colour, and `checkins`. They name no connection, selfie, feedback or presence figure, no name, photo or list. They are reachable only by a signed-in host of the event's organisation, on the host site: the page's data is that API (401, 403 on the main site, 404 for another organisation's event).
- **One address.** `src/lib/checkinlink.js` builds the check-in address from the main site's origin. The live tab, Present and the poster all use it, so the QR, the printed address and the typed one cannot differ, and none is `host.*`.
- **One QR path.** `src/lib/qrpath.js` returns a QR as one SVG path with a 4-module quiet zone. It is vector (sharp on a 4K screen and on paper), drawn without a canvas, and testable by turning the path into pixels and decoding it with jsQR.
- **One route, one small file.** `/events/:id/:screen(present|print)?` goes to `HostEvent.vue`, which loads the live page, Present or the poster with a plain `import()`. Three separate lazy routes added about 100 bytes to the card page; `defineAsyncComponent` added about 770 bytes. This way the entry's chunk list gains no new name (the card page moved by a few bytes).
- **No link that works without signing in.** A venue screen that cannot sign in would need a secret address; the plan does not specify one, so none was built (a question is in the plan note).
- **Codes do not rotate by themselves.** An event code changes only when the host presses New check-in code, so a poster stays valid until then. There is no "print on the day" warning; the poster page says it works until the host presses that button.

## Consequences
Present and the poster follow any change to how check-in addresses are made. A host who rotates the code must print the poster again (Present updates itself). The Present page's QR sits on a white square even in dark mode, because scanners need dark on light.

**Evidence:** `src/views/HostEvent.vue`, `HostPresent.vue`, `HostPrint.vue`, `src/lib/checkinlink.js`, `qrpath.js`, `test/present.mjs`

Related: [[D029 A preview is the real component fed from the same data]], [[D010 Paper, ink and one strap colour]] · back to [[Decision Log]]
