---
tags: [roadmap, feature, connections]
id: F13
priority: P1
phase: 1
size: M
status: Not started
needs: []
---
# F13 Connection provenance

**Priority:** P1 · **Phase:** 1 Foundations · **Size:** M · **Needs:** nothing · **Unlocks:** [[F15 Events tab and event hub]], [[F22 AI follow-up drafts]] · back to [[00 Master To-Do]]

## What the owner asked for
On People and on a connected person's page, show how and where you connected:
- through a QR code at an event: **Connected via QR code at [event]**
- through a QR code with no event: **Connected via QR code**
- by typing the card code: **Connected via code** (or **Connected via code at [event]**)
- at the bottom of the page, the **date and time** you connected.

## Current state
- `connections` has `event_id` (set only if both people checked in), `card_id` and `created_at`. It doesn't record **how** the scan happened.
- `POST /api/connect` (`worker/index.js` ~815) takes `cardId`, an optional `eventId`, selfie and note.
- QR scans open `/c/:cardId`. Typed codes go through `GET /api/code/:code` (`Scan.vue`). Shared links also open `/c/:cardId`.
- `People.vue` shows name, subtitle, follow-up and selfie status, and the date (`metAt`). It doesn't show the event or the method.

## Plan
### Data
Migration: `ALTER TABLE connections ADD COLUMN via TEXT` with values `qr` | `code` | `link`. Old rows stay NULL, meaning "unknown".

### Recording the method
- **QR:** the card QR (generated live in `src/lib/qr.js` / `Badge.vue`) encodes `…/c/<cardId>?s=q`. A phone's own camera app then still counts as a QR scan.
- **Code:** `Scan.vue`, after `/api/code/:code` resolves, navigates to `/c/<cardId>?s=c`.
- **Link:** "Copy link" / share buttons add `?s=l`. A missing parameter also counts as `link` (except old printed badges, which have no parameter; accept that they show "link").
- `PublicCard.vue` reads `s` and passes `via` to `/api/connect`. The server whitelists the value and defaults to `link`. Only the **first** connection sets `via`. A later re-scan doesn't overwrite it.
- Remove the `?s=` parameter from the address bar after reading it (`router.replace`), so it isn't copied on.

### Showing it
- Shared helper `src/lib/provenance.js` → `connectedVia({ via, eventName })`:
  - `qr` + event → "Connected via QR code at {event}"
  - `qr` → "Connected via QR code"
  - `code` + event → "Connected via code at {event}"
  - `code` → "Connected via code"
  - `link` + event → "Connected via link at {event}"
  - `link` → "Connected via link"
  - NULL + event → "Connected at {event}"
  - NULL → "Connected"
- **People list:** a quiet second line under the subtitle, short form, e.g. "QR code · Spring networking night". It must not crowd the follow-up and selfie lines. Show at most two status lines per row; if three would show, the selfie request wins.
- **Person page** (the connection view on `PublicCard.vue`): the full sentence plus the date and time at the very bottom, e.g. "Connected via QR code at Spring networking night · Tue 4 Nov 2026, 18:42" (`en-GB`, the viewer's local time).
- `/api/connections` and `/api/connections/:id` return `via` (and `eventName`, `metAt`, which already exist).
- Data export includes `via`.

## Tasks
- [ ] F13.1 Migration, plus `via` in the connect API (whitelist, first-write-only), with tests.
- [ ] F13.2 Set `s=` on QR, code and link paths, and clean the URL after reading.
- [ ] F13.3 `connectedVia()` helper, People row line, person-page footer.
- [ ] F13.4 Export and vault updates ([[Data Model]], [[API Surface]]).

## Acceptance checks
- [ ] Scanning with the in-app scanner at an event both checked in to shows "Connected via QR code at <event>" for both people.
- [ ] Typing the 4-character code shows "Connected via code".
- [ ] Old connections show "Connected" (and the event if known), never "undefined".
- [ ] The date and time on the person page match `created_at` in local time.

## Log
-

Related: [[Features]], [[F15 Events tab and event hub]] · back to [[00 Master To-Do]]
