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
- [x] F17.2 Presence endpoints, with security tests: not checked in → 403; ended event → 403; blocked users excluded both ways; no card or user ids in the response.
  - `worker/presenceApp.js`: `GET`, `PUT` and `DELETE /api/e/:id/presence`, `GET /api/e/:id/suggestions`, `POST /api/e/:id/presence/:presenceId/report`; selfies are served by `/media/presence/...` only to people allowed to see that person, never cached; `putImage` can strip metadata. 112 checks in `test/presence.mjs`.
- [x] F17.3 Matching function, with unit tests and reasons text.
  - `worker/presenceMatch.js`: `words`, `rank` (pure) and `suggest`. +3 for each word of the wish found in what a person shows, +1 for each F16 shared-ground fact, ties to the later check-in, top five; with nothing in common, three at random as 'Say hi to someone new'. It reads only what `visibleSide` keeps plus their line, the default card's headline and the role of a career profile.
- [x] F17.4 Hub UI: presence card, "I want to meet" field, suggestions row and sheet.
  - `src/components/EventPresence.vue` in the event hub (above the tabs): the opt-in card, selfie and line, the wish field with chips (tags two or more people show), a row of people, a sheet with the hint and Report or block. Checked in the browser pane against the local Worker at 375 and 1280 px, light and dark. Not checked: taking a selfie with the camera or the file chooser (the pane blocks both); the photo was sent through the API instead.
- [x] F17.5 Policy and DPIA text, host aggregate count.
  - Privacy Policy: a data row, a retention row, the consent list and a new section 8b; the DPIA draft is in [[UK GDPR Audit 2026-11-01]]; vault notes and [[D027 Event presence is opt-in, private and deleted 48 hours after the event]]. Hosts: `events.presence_used` (a counter, migration 0023) is shown as "Used Be easy to find" on the live screen and report, and in the CSV, only from 3 up (null below).

## Acceptance checks
- [x] Two test accounts at one ongoing event both turn on presence. Each sees the other with a reason, and neither sees a card link. (`test/presence.mjs`: people at one event each see the others as `{ presenceId, name, selfie, intro, reason }` and nothing else; the response has no card id, user id, link or email. Browser: three people at a local event, the list showed two with the reason "Into robotics" and the sheet has no link.)
- [x] After the host ends the event plus 48 hours (simulate the clock), presence rows and selfies are gone. (`test/presence.mjs`: `purgeExpired(env, ts)` one millisecond before and exactly at `endedAt + 48 h`; the same for an end time and for no end time; R2 objects are checked in the stub bucket.)
- [x] Withdrawing removes you from others' suggestions immediately. (`test/presence.mjs`: the very next list and the photo route no longer have the person; browser: unticking the box returned 404 for the photo at once.)

## Log
- 2026-11-10 (Claude subagent): Built. At an event that is on, people checked in can turn on "Be easy to find" (face photo, a line, a wish), off by default and per event; the others who did the same see them in a row of people on the event hub (photo, first name and last initial, line, one reason). Decision: [[D027 Event presence is opt-in, private and deleted 48 hours after the event]]. Migration `0023_event_presence.sql`.
- Privacy bar and where each line is tested (all in `test/presence.mjs`, 172 checks): opt-in only (first PUT without `consent: true` is 400 and stores nothing; "yes" is not consent; nobody is listed until on; someone off cannot see the list); who can see (signed out 401 or a guest with no check-in 403; signed in but not checked in 403; checked in elsewhere 403; directory off 403; not started 403; ended 403 the moment the host ends it; the photo route 404 for each of those and for a person with presence off); entries (exact key set, no card id, user id, email, surname, link); blocking (reported and blocked from the list, a block made by the other person, both directions for list and photo, connection removed); the selfie (private route, `no-store`, real image bytes, 600 KB ceiling, HTML, SVG, mislabelled and malformed files refused with nothing stored, EXIF, XMP, JPEG segments and PNG text removed, the old photo deleted on replace); retention (48 h on a simulated clock for an end time, a host-ended event and no end time, edge to the millisecond, never while on, row without a selfie, consent logged withdrawn); account deletion, host reset (`scripts/reset-hosts.mjs` now needs 0023, lists and deletes the R2 selfies before the wipe and stops if one fails) and the data export; consent in `consents` and `consent_log`; hosts (count only, null under 3, no per-person field in live, report, CSV or export; source guard that no host-facing file reads the table); rate limits (30 changes an hour, 10 selfies a day, 120 lists an hour); hidden fields (a career profile's course, a student's company, a tag or headline the default card overrides never match or show in a reason).
- First-load JS (gzip, `test/budget.mjs`), before (commit 434445a) and after: PublicCard 49,851 to 49,906 B (+55), PrivacyRequest 50,064 to 50,086 B (+22), Landing 44,671 to 44,698 B (+27), Privacy 46,916 to 47,379 B (+463, the policy text). All code is in the lazy event-hub chunk; the small rise on every page is the longer chunk map in the entry. Headroom now: PublicCard about 1.3 KB, PrivacyRequest about 1.1 KB.
- Tests changed: `test/hosts-accounts.mjs` (the reset script's schema check now needs both 0018 and 0023, so it expects 4 tables and a new check that 0018 alone is refused; strengthened, not weakened). `package.json` runs `test/presence.mjs` before the budget check.
- Decisions I made without the owner: no `visible` column (the row exists only while on); an opaque `id` column on the row; the photo is served by an authenticated route with an unguessable key, not a short-lived signed URL; limits 80 characters for the line, 120 for the wish, 600 KB per photo; suggestions need presence on yourself; chips are tags that two or more people show; a report-or-block route for the list; the host count is `events.presence_used` (people who ever turned it on, hidden under 3); the reason priority is tag, course, role, company, headline or line, institution. The photo is a normal member of the media store, so it is not encrypted beyond R2's own.
- Checked in a browser (pane, local Worker and database, 375 and 1280 px, light and dark): the card, turning on, the list from three people, the sheet with the hint, turning off. Not checked: taking a selfie with the camera or the file chooser (the pane blocks both; a photo was sent through the API instead and shown), a real phone, a screen reader, the Report or block form in the browser (only in tests).
- Not done on purpose: no AI, no messaging, no card link. [[F25 AI who-to-meet ranking]] can start from `presenceCandidates()` and `visibleFields()` in `worker/presence.js` and `worker/presenceMatch.js`.

> [!question] Terms and Privacy version. A face-photo feature probably does warrant a new Terms and Privacy version so every user re-accepts. The agent did not bump `TERMS_VERSION` (it forces everyone to accept again). The Privacy Policy text now describes the feature (section 8b). Owner: decide whether to bump it before deploying.

### Owner steps
- Review the F17 commits, `git push`, then `npm run db:remote` (applies 0018 to 0023; none are on production yet) and `npm run deploy`.
- Decide on the Terms and Privacy version bump above, and review the DPIA draft in [[UK GDPR Audit 2026-11-01]] and the hub wording.
- If the F10 host reset has not run yet, it now needs 0023 applied first and deletes presence selfies from R2 itself (`npx wrangler r2 object delete`); on a `--sqlite` copy it only lists them. Nobody has run it against R2.

Related: [[D005 Shared selfie needs both consents]], [[Privacy and Data Retention]] · back to [[00 Master To-Do]]
