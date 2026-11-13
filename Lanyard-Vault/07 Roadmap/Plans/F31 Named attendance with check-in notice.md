---
tags: [roadmap, feature, host, privacy]
id: F31
priority: P1
phase: 6
size: L
status: Not started
needs: [F10, F15, F30]
---
# F31 Named attendance with check-in notice

**Priority:** P1 · **Phase:** 6 Owner requests 2026-11-13 · **Size:** L · **Needs:** [[F10 Separate host accounts on host subdomain]], [[F15 Events tab and event hub]], [[F30 Create event in steps]] · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-13)
"Some events can log exact people that showed up, not just a number, but on the check-in page when the user scans in they will see what the event collects. Also these ticks are ticked by default on the check-in page; they have to untick them."

Asked whether pre-ticked boxes are acceptable, given ICO guidance that a pre-ticked box is not valid consent, the owner answered: "pre-ticked that can be unticked manually. Many companies do this." Build it that way.

## Changes an earlier decision
[[D004 Aggregate-only host analytics]] says hosts only see aggregates. This feature lets a host turn on named attendance per event. Write a new decision note that narrows D004 (hosts see names only for events with named attendance on, only for people who left the tick on, and only what those ticks cover) and link it from D004.

## Plan
### Host side
- A "What this event collects" section, in step 3 of [[F30 Create event in steps]] and on the event's Details tab:
  - **Attendance list:** "Keep a list of who checked in" (off by default for the host).
  - Optional extra items the host can add, each shown to attendees as its own tick, chosen from a fixed list the code knows how to honour, for example "Your email address, so the organisers can contact you after the event" and "Your card, shared with the organisers". No free-text data items: each item must map to something the code actually does.
  - A required "Why we collect this" line, shown to attendees with the organiser's name.
- The live tab and the report gain an "Attendees" list (name, check-in time, and only the items each person left ticked) and a CSV of it, for events with the list on. The list shows only people who left the attendance tick on.
- Attendee data in this list belongs to the host organisation: it goes in the host export, is wiped by the F10 reset script, and is deleted on a retention period (propose one, for example 12 months after the event, as an owner decision; default to that in code).

### Check-in page
- Above the Check in button, "This event collects" with one row per item, each a checkbox **ticked by default**, the organiser's name and their "why" line, and a link to the Privacy Policy. Unticking a row means that item is not collected. Leaving the attendance tick on puts the person on the list.
- The ticks must be easy to see and untick: plain words, full-width rows, 44 px targets, nothing hidden behind "More".
- What the person chose is recorded in `consent_log` per item (granted or refused, with the wording shown and its version), so the host's list can be proved.
- The person can change their mind afterwards from the event hub ([[F15 Events tab and event hub]]) and from Settings, Privacy and data: unticking removes them from the host's list at once.
- Events without named attendance look exactly as today.

### Legal basis and policy
- Attendance list: legitimate interests (event safety, numbers, follow-up for that event), with the notice on the check-in page and the untick as the objection route. Write a short legitimate-interests assessment in [[UK GDPR Audit 2026-11-01]].
- Extra items (email to organisers, card to organisers): record in the Log and the audit note that ICO guidance says a pre-ticked box is not valid **consent**, so these must rest on another basis or be reviewed by a lawyer before launch. Built pre-ticked as the owner asked.
- Privacy Policy: a section on named attendance, what organisers receive, how to opt out and how long they keep it. Do not bump the Terms version; flag it.

## Tasks
- [ ] F31.1 Migration: per-event collection settings and per-person choices; the decision note narrowing D004.
- [ ] F31.2 Host settings for what the event collects (create step and Details tab), with validation.
- [ ] F31.3 Check-in page notice with pre-ticked items; choices recorded.
- [ ] F31.4 Host attendees list, CSV and export; retention purge; reset script.
- [ ] F31.5 Change of mind from the event hub and Settings.
- [ ] F31.6 Policy, legitimate-interests assessment, vault notes, tests and browser check.

## Acceptance checks
- [ ] An event with named attendance on: a person who checks in with the ticks left on appears on the host's list with only those items; a person who unticks attendance does not appear at all.
- [ ] An event without it: the check-in page and host views are exactly as before.
- [ ] Unticking later from the event hub removes the person from the host's list on the next request.
- [ ] Each person's choices are in their data export and in `consent_log`.

## Log
-

Related: [[D004 Aggregate-only host analytics]], [[Privacy and Data Retention]], [[F32 Drops for codes, keys and vouchers]] · back to [[00 Master To-Do]]
