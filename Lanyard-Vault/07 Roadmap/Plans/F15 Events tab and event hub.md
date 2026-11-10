---
tags: [roadmap, feature, events]
id: F15
priority: P1
phase: 2
size: L
status: Done
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
- [x] F15.3 Events tab, icon and the ongoing dot.
  - Fourth tab in `AppShell.vue` (ticket glyph drawn in `AppShell.vue` in the same 24 px stroke style, not in `Icon.vue`, which public pages load and which would have cost the card and PrivacyRequest 46 B each; the bar is four equal columns). The dot is a small strap-coloured circle on the glyph while a checked-in event is ongoing, with ", an event is on now" in visually hidden text so it is not colour alone. `src/lib/eventlive.js` holds the state; the frame asks `/api/my/events` when it first shows, when an events page opens and otherwise at most every two minutes, and the events pages will pass in the list they already hold. `test/ui.mjs` guard extended (four tabs in order, glyph, four columns, dot text), not loosened.
- [x] F15.4 Events page with grouping, labels and attended dates.
  - `Events.vue`: "Happening now" (ongoing first, then upcoming, as cards with the status word, venue, "Checked in 18:04" and the count) and "Past events" (rows with "Attended Wed 4 Nov 2026", the count and "Ended"). The status is worked out in the app with the server clock (`now` from the API, re-worked every minute), so a wrong phone clock changes nothing and "Ongoing" turns to "Ended" on an open page. Words and dates are in `src/lib/eventtext.js` (no imports, en-GB, viewer time zone); the dot state and clock are in `src/lib/eventlive.js`. Text uses `--strap-deep` for Ongoing (4.5:1 on paper) and graphite for Ended.
- [x] F15.5 Event hub: back arrow, stats, people met here; `EventChoices` moves into a sheet. Stop fetching every event.
  - `EventDetail.vue` (same route, `/app/events/:id`): back arrow, status word, name and venue; a stats row (Connections, Checked in with the date if not today, People here or "In the room" once ended, left out when the directory is off); the feedback prompt; "People you met here" (photo or accepted selfie, name, subtitle, `connectedShort` without the event name, links to the card); Room, Album, Perks as before; a "Your choices at this event" row that opens a `UiSheet` (shown only when the event has the room or a named sponsor: `event.hasChoices` from the API). One request, `GET /api/my/events/:id`, through the exported `api()` so the shared `Api` object gains nothing. It reloads if the address changes to another event, and shows "Not available" with a link to Events on a 404 (no check-in, or the event was removed by the host reset). The back arrow goes to My card, or back to the Events list only if you came from it, so a check-in from the Scan page does not return to Scan. A slot comment marks where F17 puts who to meet, above the tabs.
- [x] F15.6 Check-in → hub → back arrow → `/app` → Events tab → hub works on a phone.
  - Checked in the browser pane at 375 px (an emulated phone viewport, not a real phone) against the local Worker and database, with a host account, three events (running, ended, later) and four attendees. Vault, decision [[D025 Event status is worked out from the clock, never stored]] and the other notes written in the same commit.

## Acceptance checks
- [x] Checking in lands on the hub. The back arrow goes to My card. The Events tab returns to the hub in two taps. (Browser, 375 px, a new attendee: `/e/<code>` then the real Check in button landed on `/app/events/<id>`; tapping the back arrow landed on `/app` (My card); tapping the Events tab then the event card, two taps, opened the hub; from a hub opened that way the arrow goes back to the Events list. A real phone was not used.)
- [x] An event the host ended shows "Ended" straight away; one still running shows "Ongoing". (Browser: the running event showed ONGOING on the hub and the Events page; after the host ended it with `POST /api/host/events/:id/end`, a reload of Events showed it under Past events as ENDED with the dot gone from the tab. `test/events-hub.mjs` checks the same in the list and the hub on the very next request, plus an end time in the past, and the clock edges.)
- [x] The connection count on the hub equals the number of people in "People you met here". (`test/events-hub.mjs`: the hub's `connectionCount` equals the length of its list and the list's count; browser: the hub showed 2 and listed 2 people.)

## Log
- 2026-11-10 (Claude subagent): The fourth tab, Events, lists what is on now (Ongoing, or "Starts 18:00") and past events with the date you attended, "Ended" and your connection count. Checking in lands on a hub with a back arrow, your figures (Connections, Checked in, People here), the people you met there, and the Room, Album and Perks tabs; your room and sponsor choices open in a sheet. Status is worked out from the clock by one helper shared by the Worker and the app ([[D025 Event status is worked out from the clock, never stored]]); nothing new is stored, so there is no migration, no export or deletion change, and hosts see nothing new.
- First-load JS (gzip, `test/budget.mjs`), before F15 (commit ac90b42) and after: Landing 44,595 to 44,671 B (+76), PublicCard 49,617 to 49,689 B (+72), PrivacyRequest 49,988 to 50,060 B (+72); Hosts, Privacy, Terms, Redeem and SignIn move by the same few bytes. All the growth is the file names of the new lazy chunks in the entry's preload list; no F15 code is imported by the entry or a public page (a test guards it). The Events glyph is drawn in `AppShell.vue` because putting it in `Icon.vue` cost the card and PrivacyRequest 46 B each; the hub fetches through the exported `api()` so the shared `Api` object did not grow. Headroom now: PublicCard about 1.5 KB, PrivacyRequest about 1.1 KB.
- Tests: new `test/events-hub.mjs` (in `npm test` before `test/budget.mjs`). Changed, same strength: `test/ui.mjs` (the tab guards now expect four tabs, the glyph in the frame, four columns and the dot's hidden text; the `<Icon>` fallback guard matches `<Icon v-else ...>` because the Events tab draws its own glyph). `selfieView` moved from `worker/index.js` to `worker/selfie.js`; the F13 guard in `test/provenance.mjs` is unchanged and still passes because the new routes are in `worker/myevents.js`, which is not on its host-code list.
- Checked in the browser at 375 px light and dark and 1280 px light and dark (hub); the Events page at 375 px dark. Seen and fixed: the stats labels wrapped at 375 px so the figures sat at different heights (now bottom-aligned); the hub did not reload when the address changed to another event (now it does). Not checked: a real phone, a screen reader reading the tab dot, the Events page at 1280 px, the Album tab with real selfies, the feedback prompt on the new hub (code unchanged, it showed on an ended event), an event with a named sponsor in the sheet (covered by the API test only).
- Left for others: [[F17 Event presence and who to meet]] slots in at the comment above the Room, Album and Perks tabs in `src/views/EventDetail.vue` and can call `eventStatus` for "only while Ongoing". [[F16 Shared ground without AI]] is unaffected. The tab dot asks `/api/my/events` when the frame shows and at most every two minutes; a person who stays on one page for hours may see it a little late.
- Decisions I made without the owner: the back arrow goes to My card unless you came from the Events list; an event with no end time ends 12 hours after the later of its start and your check-in, per person; "People here" counts the others who chose to be in the room (not names), is left out when the directory is off, and reads "In the room" once the event has ended; the tab dot counts Ongoing only; the Ended label is graphite and Ongoing uses `--strap-deep` for contrast; the hub's choices row appears only when the event has the room on or a named sponsor.

### Owner steps
- Review the F15 commits, `git push`, then `npm run deploy`. No migration for F15 (0018 to 0022 are still to be applied from earlier features).

Related: [[Screens and Routes]], [[Features]] · back to [[00 Master To-Do]]
