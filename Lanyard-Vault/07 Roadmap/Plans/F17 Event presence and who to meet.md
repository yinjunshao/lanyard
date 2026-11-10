---
tags: [roadmap, feature, events, privacy]
id: F17
priority: P2
phase: 2
size: L
status: In progress
needs: [F15, F11, F16]
---
# F17 Event presence and who to meet

**Priority:** P2 · **Phase:** 2 Events · **Size:** L · **Needs:** [[F15 Events tab and event hub]], [[F11 Student and Career mode]], [[F16 Shared ground without AI]] (matching reasons) · **Unlocks:** [[F25 AI who-to-meet ranking]] · back to [[00 Master To-Do]]

> [!note] Owner decision 2026-11-10: presence rows and selfies are deleted **48 hours after the event ends**, as planned.

## What the owner asked for
After checking in, people can optionally:
- take a **selfie** and add **short info** about themselves, so others can find them in the room
- say **"I want to meet someone who is…"**
- see **suggested people to meet**, showing their selfie and name only, **not their card**, because they have to meet in person to connect.

## Design principles
- **Opt-in, per event, off by default.** This is a separate choice from the attendee room, and it's withdrawable at any time from the hub. Record it as consent scope `event_presence:<eventId>`, like `event_directory:`.
- **Only at the event, only while ongoing.** Suggestions and presence are visible only to people checked in to the same event, and only while it's Ongoing ([[F15 Events tab and event hub]] status).
- **No card, no links, no messaging** in suggestions. Name (first name plus last initial), event selfie, intro line, and one "why" reason. To connect, you find the person and scan their badge.
- 18+ only already ([[D012 18 plus only]]). Report and block work on suggestions, and blocked people never appear either way.
- Requires the host to have the directory on (`events.directory_on`).

## Data
New table, in a new migration:
```sql
CREATE TABLE event_presence (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  selfie_key TEXT,            -- R2, private media
  intro TEXT,                 -- "Here for…" ≤ 80
  looking_for TEXT,           -- "I want to meet someone who…" ≤ 120
  visible INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);
```
**Retention:** delete the presence row and its R2 selfie **48 hours after the event ends** (add this to the daily purge in `worker/purge.js`), or immediately when the person withdraws. The selfie only exists to spot someone in a room.

## Matching (no AI in this feature)
For a viewer with `looking_for` text, score each other visible person at the same event:
- Words in `looking_for` (normalised like `src/lib/search.js`) matched against their intro, tags, headline, role, company and course: +3 per hit.
- Shared ground from [[F16 Shared ground without AI]] (same institution, overlapping tags, same company): +1 each.
- Recency of check-in: tie-breaker.
- Show the top 5 with one reason each, e.g. "Into robotics" or "Also at University of Example". With no `looking_for` text, rank by shared ground only. With nothing in common, show "Say hi to someone new" with three random visible people.
- AI ranking is a later layer: [[F25 AI who-to-meet ranking]].

## API
- `PUT /api/e/:id/presence`: selfie (data URL through `putImage`, private), intro, `looking_for`, visible. Requires a check-in, an ongoing event and the directory on. Rate-limited.
- `DELETE /api/e/:id/presence`: withdraw (deletes the selfie now).
- `GET /api/e/:id/suggestions`: only for checked-in viewers with presence on (you must be findable to find others, which stops lurking). Returns `[{ presenceId, displayName, selfieUrl (short-lived signed), intro, reason }]`. Never returns card ids, links, user ids or emails.

## UI (event hub)
- Card under the stats: "Be easy to find tonight". Buttons "Take a selfie" and "Add a line about you", plus a toggle "Show me to people here". Copy says who sees it and that it's deleted 48 hours after the event.
- "I want to meet someone who…" field with chips from popular tags at this event, then "People you might want to meet": a horizontal row of large photos with name, intro and reason. Tapping one opens a sheet with a bigger photo, intro and the hint "Find them in the room and scan their badge to connect."

## Privacy work
- Privacy Policy: a new purpose and retention row. Update the DPIA ([[UK GDPR Audit 2026-11-01]] Medium 6; face photos and a student audience).
- Hosts see only an aggregate: "23 people used Be easy to find" ([[D004 Aggregate-only host analytics]]).

## Tasks
- [x] F17.1 Migration, purge job and consent scope, with tests (deleted 48 h after end; deleted on withdraw).
  - `migrations/0023_event_presence.sql`; `worker/presence.js` (`eventEndsAt`, `removePresence`, `purgePresence`, export, erase); the purge, account deletion, data export and `scripts/reset-hosts.mjs` (deletes the selfies from R2 first) are wired in. `test/presence.mjs` is in `npm test` before the budget check.
- [ ] F17.2 Presence endpoints, with security tests: not checked in → 403; ended event → 403; blocked users excluded both ways; no card or user ids in the response.
- [ ] F17.3 Matching function, with unit tests and reasons text.
- [ ] F17.4 Hub UI: presence card, "I want to meet" field, suggestions row and sheet.
- [ ] F17.5 Policy and DPIA text, host aggregate count.

## Acceptance checks
- [ ] Two test accounts at one ongoing event both turn on presence. Each sees the other with a reason, and neither sees a card link.
- [ ] After the host ends the event plus 48 hours (simulate the clock), presence rows and selfies are gone.
- [ ] Withdrawing removes you from others' suggestions immediately.

## Log
-

Related: [[D005 Shared selfie needs both consents]], [[Privacy and Data Retention]] · back to [[00 Master To-Do]]
