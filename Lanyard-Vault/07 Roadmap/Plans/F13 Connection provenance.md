---
tags: [roadmap, feature, connections]
id: F13
priority: P1
phase: 1
size: M
status: In progress
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
- [x] F13.1 Migration, plus `via` in the connect API (whitelist, first-write-only), with tests.
  - `migrations/0021_connection_via.sql`: one nullable `connections.via` column (additive, safe before the new code). `POST /api/connect` takes `via`: `qr`, `code` or `link`; anything else, or nothing, is stored as `link`. It is written only when the connection is first made, so a re-scan by either person never changes it, and old rows stay NULL (unknown) even after a re-scan. `GET /api/connections`, `GET /api/connections/:id` (now also `eventName`) and the connection on `GET /api/c/:cardId` return `via` (null for old rows); the data export has it. `test/provenance.mjs` (in `npm test`) covers migration 0021 on an old row, the whitelist, first write only, what the API returns, a connection whose event is gone (the host reset sets `event_id` to NULL: `via` stays, the event reads as empty), export, deletion and that no host code reads it.
- [x] F13.2 Set `s=` on QR, code and link paths, and clean the URL after reading.
  - The QR on My card and the saved badge image encode `?s=q` (after any `?n=` note token); Copy link and Share use `?s=l`; the in-app scanner opens `/c/<id>?s=q` and a typed code opens `?s=c` (`Scan.vue`, through `withSource`). `PublicCard.vue` reads `s` once, takes it out of the address bar with `router.replace` (keeping `n` and `event`) and passes it to `ConnectSheet`, which sends `via`. A missing or unknown `s` sends nothing and the server stores `link`. Printed badges and downloaded images made before this have no `s`, so they read as a link; a phone camera on a new QR counts as QR. The helpers (`viaOfS`, `withSource`, and later `connectedVia`) are in `src/lib/profile.js`, not the `src/lib/provenance.js` the plan names: a separate small module shared by four pages became its own chunk and added its file name to the preload list in the entry that every page loads (+27 B gzip on the landing page). A page reload before connecting loses `s`, so that connection reads as a link.
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
