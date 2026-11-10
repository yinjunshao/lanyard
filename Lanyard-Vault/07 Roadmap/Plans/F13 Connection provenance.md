---
tags: [roadmap, feature, connections]
id: F13
priority: P1
phase: 1
size: M
status: Done
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
- [x] F13.3 `connectedVia()` helper, People row line, person-page footer.
  - `connectedVia`, `connectedShort` and `metStamp` in `src/lib/profile.js` (see F13.2 for why not `provenance.js`); they never print `undefined`, `null` or a method that is not stored. People rows show "QR code · Spring networking night" (or just the event, for an old connection that has one, or nothing) in the same quiet style as the subtitle; if a selfie request and a follow-up are both showing, the how-we-met line is the one left out, so a row has at most two status lines. The person page ends with "Connected via QR code at Spring networking night · Wed 4 Nov 2026, 18:42" (en-GB, the viewer's own time zone, from `created_at`); the old "Met <date> at <event>" line in the Your connection panel was removed because the footer says the same. Tests in `test/provenance.mjs`. Browser check: see the Log.
- [x] F13.4 Export and vault updates ([[Data Model]], [[API Surface]]).
  - Export: `connections[].via` was added with F13.1 (null for old rows) and is tested for both people, for an old row, for deleting the connection and for deleting an account. Vault: [[Data Model]], [[API Surface]], [[Privacy and Data Retention]] (new section "How you met"), [[Codebase Map]], [[Testing]], [[Features]], [[D022 Record how a connection was made, once and without guessing]] and the [[Decision Log]]. The Privacy Policy data table in `src/views/Privacy.vue` now says how you met is kept. Hosts: nothing in the host, admin, report, CSV, webhook or event-mail code reads `via`, and `test/provenance.mjs` checks both the source and the host responses. `scripts/reset-hosts.mjs` needed no change (it nulls `event_id` only; `via` stays and the event name drops out of the wording).

## Acceptance checks
- [x] Scanning with the in-app scanner at an event both checked in to shows "Connected via QR code at <event>" for both people. (Local browser, real `Scan.vue` and `scanner.js`: the camera is blocked in the browser pane, so I stubbed `getUserMedia` with a canvas stream and `BarcodeDetector` to return the card address `/c/<id>`. The scanner opened the card, Connect sent `via: "qr"`, the address bar lost `?s=`, and the page ended "Connected via QR code at Spring networking night · Tue 10 Nov 2026, 13:42". The other person reads the same row: `test/provenance.mjs` checks both people get `via` and the event name. A real camera and a printed QR were not tried.)
- [x] Typing the 4-character code shows "Connected via code". (Browser: typed the code into Scan, Go opened the card, Connect, the page ended "Connected via code · Tue 10 Nov 2026, 13:39" and the People row read "Code".)
- [x] Old connections show "Connected" (and the event if known), never "undefined". (Browser: a connection set to `via` NULL showed "Connected · Tue 10 Nov 2026, 13:39" on its page and no extra line in the People row, with no "undefined" in the page text; `test/provenance.mjs` checks the wording for NULL, an unknown value, `__proto__` and no input, and that the API returns `null`, not a missing field.)
- [x] The date and time on the person page match `created_at` in local time. (The API gives `metAt` equal to `created_at` and `metStamp` formats it in the viewer's zone, both tested; in the browser the page showed 13:38 for a connection made at 13:38 local time.)

## Log
- 2026-11-10 (Claude subagent): Every new connection now records how it was made (QR code, typed code or link), shown on the People list as a quiet line and on the person page as "Connected via QR code at <event> · <date and time>". Migration 0021 adds one nullable column (additive, safe before the new code). Old connections stay unknown and read just "Connected"; nothing is guessed. Hosts never see it; it is in each person's export and goes with the connection or the account ([[D022 Record how a connection was made, once and without guessing]]).
- First-load JS, gzip of entry + static imports + page chunk, from `dist/`, before F13 (commit 31e67c5) and after: **Landing 65,167 to 65,178 B** (no F13 code is in the landing chunks; the entry's raw size differs by 2 bytes and its gzip by a few bytes only because the file-name hashes in its preload list changed, which moved between +5 and +27 B across builds). **Public card 59,564 to 60,113 B (+549 B)**: the card page chunk +153 B (reads `?s=`, shows the sentence and time) and the shared `profile` chunk +407 B (`viaOfS`, `connectedVia`, `metStamp`, plus `withSource` and `connectedShort`, which only the scanner, My card and People use but share the chunk). Part of that is code the card never calls (not measured separately); it is the cost of keeping the helpers in a chunk the entry already lists. A module of its own cost the landing page +27 B, so I kept them in `profile.js`. Both pages are still over 50 KB and stay with [[F28 Public-page JS budget]].
- Checked in a local browser (Chrome engine, local test accounts): the typed-code and scanner paths above, the footer and People rows at 375 px light and dark and 1280 px light and dark, the address bar losing `?s=`, Share sending `?s=l`, and the People row dropping the how-we-met line when a selfie request and a follow-up are both showing (with the method set, the row showed only those two). Not checked: a real camera, decoding the QR image on My card to see `?s=q` in it (the QR is drawn from `qrUrl`, which a test guards), a screen reader.
- Seen and left alone: at 375 px the Report button in the connection panel runs to the panel edge (it did before F13).
- Decisions I made without the owner: `via` is one value per connection for both people; a re-scan never fills in an old connection; the in-app scanner always sets `q` and a typed code always sets `c`, even if the pasted text was an address with another `s`; the helpers are in `src/lib/profile.js` rather than `src/lib/provenance.js`; the old "Met <date> at <event>" line in the Your connection panel was removed because the footer says it; the row's how-we-met line is the one dropped when it would be a third line; short forms read "QR code", "Code" and "Link".
- Left for others: [[F15 Events tab and event hub]] needs `via` on `GET /api/my/events/:id` and can use `connectedShort` from `src/lib/profile.js` (it takes `{ via, eventName }`; leave `eventName` out inside an event). [[F22 AI follow-up drafts]] can build "how you connected" from `connectedVia` or the `via`, `eventName` and `metAt` on `GET /api/connections/:id`. [[F24 Do I know someone who]] can read `via`, `eventName` and `metAt` from `GET /api/connections`. None of them should send `via` to a host or into a prompt for anyone but the two people.

### Owner steps
- Review the F13 commits, `git push`, `npm run db:remote` (applies `0021_connection_via.sql`, one nullable column, safe before the new code; 0018, 0019 and 0020 are also still to be applied), then `npm run deploy`.
- If the F10 host reset runs, nothing extra is needed for F13: connections keep their method and lose the event name.
- Old printed badges and saved badge images have no `?s=`, so people who scan them read as "link" until the badge is printed again.

Related: [[Features]], [[F15 Events tab and event hub]] · back to [[00 Master To-Do]]
