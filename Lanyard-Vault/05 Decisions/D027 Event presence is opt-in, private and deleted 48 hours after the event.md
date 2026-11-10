---
tags: [decision]
status: Accepted
date: 2026-11-10
---
# D027 Event presence is opt-in, private and deleted 48 hours after the event

**Status:** Accepted  ·  **Date:** 2026-11-10

## Context
[[F17 Event presence and who to meet]] lets people at an event show a face photo, a line and a wish to the others there, so they can find each other in a room. The audience is adults at student events ([[D012 18 plus only]]), the photo is a face, and hosts must see only aggregates ([[D004 Aggregate-only host analytics]]). The owner decided on 2026-11-10 that rows and photos are deleted 48 hours after the event ends.

## Decision
- **Opt-in per event, off by default.** A row in `event_presence` exists only while someone has it on. Turning it off or withdrawing deletes the row, the R2 photo and the consent at once, and the person drops out of everyone's list on the next request. (The plan's `visible` column is not needed and was left out.)
- **Who can see:** only people checked in to the same event, while it is Ongoing (the shared status rule, per person), with the directory on, who have turned it on themselves. Blocking works both ways, for the list and the photo.
- **The photo is private media, not a signed URL.** It lives under `presence/` with an unguessable key and is served by `/media/presence/...` only after the Worker checks the viewer is allowed to see that person right now; it is `private, no-store`. We chose the session check over a short-lived signed link because it reuses the existing media route and takes effect on the next request, with nothing to expire or leak. The Worker re-checks the bytes and removes EXIF, XMP and text chunks.
- **An entry shows** a photo, first name and last initial, their line and one reason. No card link, no user id, no contact details. Reasons use only what each person shows ([[D026 Shared ground is worked out from what each person shows, and never stored]]): the default card's tags and headline, a student's course, a career profile's company and role, never a kept-but-hidden field. The ids in the response are opaque presence ids.
- **Retention:** 48 hours after the event ends, by the daily purge, using the same end rule as the status (host end, end time, or 12 hours after the later of the start and the person's check-in). Also on account deletion and by the host reset script, which deletes the R2 objects before wiping rows.
- **Hosts:** only `events.presence_used`, a counter of people who ever turned it on, shown from 3 up. No host-facing file reads presence per person.
- **Matching without AI:** +3 for each wish word found in what a person shows, +1 per F16 shared-ground fact, ties to the later check-in, top five; with nothing in common, three random people as "Say hi to someone new". [[F25 AI who-to-meet ranking]] starts from `presenceCandidates()` and `visibleFields()`.
- **Consent record:** scope `event_presence:<eventId>` in `consents` and `consent_log`, with `photo` lines for each selfie added or deleted. The Terms and Privacy version is **not** bumped by the agent; see the owner step.

## Consequences
A selfie can be fetched by any other opted-in person at the event while it is on, so it must be treated as shown to the whole room. Someone could screenshot it; the copy says who sees it. Reports and blocks work from the list. Rate limits: 30 changes an hour, 10 selfies a day, 120 list requests an hour.

**Evidence:** `worker/presence.js`, `worker/presenceApp.js`, `worker/presenceMatch.js`, `migrations/0023_event_presence.sql`, `test/presence.mjs`

Related: [[Privacy and Data Retention]], [[UK GDPR Audit 2026-11-01]] · back to [[Decision Log]]
