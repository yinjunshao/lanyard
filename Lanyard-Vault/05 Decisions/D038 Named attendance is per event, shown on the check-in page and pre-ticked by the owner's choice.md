---
tags: [decision, privacy]
status: Accepted
date: 2026-11-13
---
# D038 Named attendance is per event, shown on the check-in page and pre-ticked by the owner's choice

**Status:** Accepted  ·  **Date:** 2026-11-13  ·  Narrows [[D004 Aggregate-only host analytics]]

## Context
[[D004 Aggregate-only host analytics]] says hosts see aggregate numbers only. The owner asked (2026-11-13) that some events can keep a list of the exact people who showed up, with what the event collects shown on the check-in page and the ticks pre-ticked, so a person has to untick to opt out. The owner was told that ICO guidance says a pre-ticked box is not valid consent and chose this anyway. [[F31 Named attendance with check-in notice]] builds it.

## Decision
- **D004 is narrowed, not dropped.** A host sees names only for an event that has named attendance switched on, only for people who left the attendance tick on, and for each of them only the extra items they left ticked. Everywhere else (an event with it off, the Present page and poster, the report, the live counts, the webhook, the admin pages) hosts see aggregates as before. Hosts still never see who connected with whom, selfies, or how anyone met.
- **Per event, off by default.** Three columns on `events` (`collect_attendance`, `collect_items`, `collect_why`). The host switches it on in step 3 of Create event or on the Details tab. A copy of an earlier event does not carry the setting over: the host chooses again.
- **A fixed list the code honours.** The attendance list itself, and two extra items: the person's verified email address, and what their default card shows (headline, the line under their name, the links the card shows). Nothing else can be enabled and there is no free-text data item. The wording of each item and its version live in one file (`src/lib/collects.js`) that the Worker, the check-in page and the host's preview all read.
- **A required "why" line.** 10 to 200 characters, cleaned of control, zero-width and direction-changing characters, shown to attendees as text with the organiser's name, never as HTML.
- **Pre-ticked, untickable.** On the check-in page every item is a full-width row with a tick already in it, a 44 px target, and the person unticks to opt out. Only what the person's request says counts: the Worker records each item the person was shown as granted only when the request says `true`, and a request with no choices (an old page, a script) puts nobody on the list and changes nothing. Sponsors stay never pre-ticked; that is a different rule for a different kind of sharing.
- **Recorded.** Each offered item writes a row to `consent_log` (`event_attendance:<event>`, `event_share_email:<event>`, `event_share_card:<event>`) with `granted`, `refused` or `withdrawn`, the exact wording shown (including the organiser's name and the "why" line) and the wording's version (new columns `wording` and `version`, migration 0028).
- **The list is a table that holds only people who are on it.** `event_attendees` has a row while the person's attendance tick stands. Unticking deletes the row; the host's next request no longer shows them. Switching the list off, deleting the account and the retention purge delete rows too. The host list route and CSV live in `worker/attendance.js`, which `worker/hosts.js` calls; it joins the check-in time, the profile name and, only for people who ticked it, the verified email and the card.
- **Retention.** The attendee list is kept 12 months after the event ends (proposed by the build, default in the daily purge; the owner is asked to confirm). The consent record stays 6 years like the others.
- **Basis.** The attendance list rests on legitimate interests (written up in [[UK GDPR Audit 2026-11-01]]), with the notice on the page and the untick as the objection route. The extra items (email and card to the organisers) are not covered by that: a pre-ticked box is not valid consent under UK GDPR, so they need another lawful basis or a lawyer's review before launch. Built as the owner asked.

## Consequences
Hosts can now hold personal data about attendees, so the organiser becomes a controller for that list and Lanyard is a processor for it, or the two are joint controllers; the Host Terms and the Privacy Policy need a lawyer's look before launch. The Privacy Policy has a new section (the Terms version was not bumped; the owner decides whether to). Anything that says "hosts only see aggregates" must now say "except an event's named list, for people who left the tick on": the check-in page notice, Settings, the Privacy Policy and the Terms were changed. The host guards (`test/hostsecurity.mjs`, `provenance.mjs`, `presence.mjs` and the others) stay as they were: they are about events without the list, which is still true. `test/named-attendance.mjs` pins the narrowing itself: names only through the list route, only for events with it on, only for people who left the tick on.

**Evidence:** `migrations/0028_named_attendance.sql`, `worker/attendance.js`, `src/lib/collects.js`, `src/components/EventPage.vue`, `test/named-attendance.mjs`

Related: [[D011 Retention limits]], [[D005 Shared selfie needs both consents]], [[D027 Event presence is opt-in, private and deleted 48 hours after the event]], [[D029 A preview is the real component fed from the same data]] · back to [[Decision Log]]
