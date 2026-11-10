---
tags: [roadmap, feature, events]
id: F15
priority: P1
phase: 2
size: L
status: In progress
needs: [F05, F13]
---
# F15 Events tab and event hub

**Priority:** P1 · **Phase:** 2 Events · **Size:** L · **Needs:** [[F05 QR icon for My card tab]] (icon style), [[F13 Connection provenance]] · **Unlocks:** [[F17 Event presence and who to meet]] · back to [[00 Master To-Do]]

## What the owner asked for
- After scanning an event QR and checking in, people land on an event page (the hub).
- A **back arrow at the top** takes them to the main app.
- A new **Events** button on the bottom navigation takes them back to their events.
- The Events page lists ongoing events, labelled **Ongoing** in text, and past attended events with the **date they attended**, labelled **Ended**.
- Per event: stats such as how many connections they made, when they checked in, and a people list of who they connected with at that event.

## Current state
- `EventJoin.vue` already redirects to `/app/events/:id` after check-in.
- `Events.vue` lists events (name, venue, start date), with no status and no grouping.
- `EventDetail.vue` fetches **all** `/api/my/events` to find one, then shows Room / Album / Perks tabs, the feedback prompt and `EventChoices`. It has a "‹ Events" text link.
- `App.vue` tabs: My card, Scan, People. No Events tab.
- `GET /api/my/events` (`worker/events.js` ~216) returns events with `checkedInAt`.

## Plan
### Status rules (one helper, used by server and client)
- **Ongoing:** started (`starts_at ≤ now`, or no start time) and not ended.
- **Ended:** `ended_at` set (host ended it), **or** `ends_at` has passed, **or** no `ends_at` and more than 12 hours since the later of `starts_at` and your check-in.
- **Upcoming:** checked in early, before `starts_at`. Show "Starts 18:00".
- The label is text, not just colour: "Ongoing" (strap colour, small caps) or "Ended" (graphite).

### API
- `GET /api/my/events` adds `startsAt`, `endsAt`, `endedAt`, `status`, `checkedInAt`, `connectionCount` (one query with `COUNT` over `connections` where `event_id = e.id` and you are `user_a` or `user_b`).
- New `GET /api/my/events/:id`: the event, `status`, `checkedInAt`, `connectionCount`, and `connections` (peer id, name, photo or selfie thumbnail, cardId, `via`, `metAt`) for this event only. Returns 404 unless you checked in.

### Navigation
- Tabs become four: My card (QR icon), Scan, People, **Events** (a new icon in the same stroke style, e.g. a ticket or calendar). Show a small dot on Events while an event you're checked in to is ongoing.
- Event hub header: "‹" back arrow at top left, which goes to `/app` (the owner's choice) or to the previous app page if there is history. Event name, venue, status label.

### Events page (`/app/events`)
- **Happening now:** ongoing and upcoming events, each a card with name, venue, "Ongoing" and "Checked in 18:04".
- **Past events:** a list of rows with name, "Attended Tue 4 Nov 2026" (check-in date), "Ended", and "5 connections".
- Empty state stays ("Scan an event QR to check in").

### Event hub (`/app/events/:id`)
Order, top to bottom. Keep it calm, with no wall of panels:
1. Header (back arrow, name, venue, status).
2. **Stats row:** three compact figures with labels. "Connections" `5`, "Checked in" `18:04`, "People here" (room size, if the directory is on). Tabular figures.
3. **Feedback prompt** (when open). Exists today.
4. **People you met here:** list rows (photo or selfie, name, subtitle, `connectedVia` short form from F13) linking to their card. Empty: "No connections at this event yet. Scan someone's badge to connect."
5. Tabs: Room / Album / Perks (existing). The "who to meet" section from [[F17 Event presence and who to meet]] slots in above the tabs.
6. `EventChoices` (directory and sponsor choices) as a "Your choices at this event" row that opens a sheet, not a full panel.

## Tasks
- [x] F15.1 Shared status helper (`worker/eventstatus.js`, mirrored in `src/lib/eventstatus.js`), with unit tests including clock edges.
  - `eventStatus(ev, checkedInAt, t)` returns `upcoming`, `ongoing` or `ended`; the two files are byte-identical and `test/events-hub.mjs` (new, in `npm test` before the budget check) fails if they differ. Edges: ended at exactly `ends_at`; with no end time, "more than 12 hours" means strictly more, counted from the later of the start and your check-in; started means `starts_at <= now`; a host-ended event is ended even before it started.
- [x] F15.2 Extend `/api/my/events`. Add `/api/my/events/:id`, with tests (404 when not checked in).
  - The two routes live in the new `worker/myevents.js`, not `events.js`: they return `via`, and `test/provenance.mjs` treats `events.js` as host-facing code that must never read it.
  - `GET /api/my/events` adds `endsAt`, `endedAt`, `status`, `connectionCount` and the server clock `now`. `GET /api/my/events/:id` returns the event, `status`, `checkedInAt`, `connectionCount`, `roomCount` (the others in the room, or null with the directory off) and `connections` (connection id, peer id, name, photo, course, uni, mode, company, role, headline, `cardId`, `via`, `metAt`, `selfie` only when the viewer may see it). The list count and the hub list use one shared join, so they cannot disagree. 404 unless you checked in, 401 signed out. No migration and nothing new stored. `selfieView` moved from `worker/index.js` to `worker/selfie.js` so `events.js` can use it without a circular import.
- [ ] F15.3 Events tab, icon and the ongoing dot.
- [ ] F15.4 Events page with grouping, labels and attended dates.
- [ ] F15.5 Event hub: back arrow, stats, people met here; `EventChoices` moves into a sheet. Stop fetching every event.
- [ ] F15.6 Check-in → hub → back arrow → `/app` → Events tab → hub works on a phone.

## Acceptance checks
- [ ] Checking in lands on the hub. The back arrow goes to My card. The Events tab returns to the hub in two taps.
- [ ] An event the host ended shows "Ended" straight away; one still running shows "Ongoing".
- [ ] The connection count on the hub equals the number of people in "People you met here".

## Log
-

Related: [[Screens and Routes]], [[Features]] · back to [[00 Master To-Do]]
