---
tags: [decision, email, privacy]
status: Accepted
date: 2026-11-22
---
# D050 A reminder is mailed once, by one conditional write, to one switch

**Status:** Accepted  ·  **Date:** 2026-11-22

## Context
[[F48 Follow-up reminder emails]]: the owner asked that a follow-up reminder, when it comes due, also reaches the person by email. The job sends email to people, so who gets it, how often and what it may hold matter as much as the feature. It builds on [[D049 A new person's email is kept unconfirmed, never signs in, and gets at most two emails]] (`mailableAddress`) and [[D040 Limits and claims are enforced in the write itself, and a guess is counted before it is checked]].

## Decision
- **Once, by the write.** `notes.reminder_mailed_for` (migration 0037) holds the `remind_at` an email was claimed for. The hourly job claims each reminder with one `UPDATE ... RETURNING` that sets it to the `remind_at` it read and re-checks, in the same statement, that the reminder is due and at most 48 hours overdue, not followed up, not already mailed for that time, the switch is on, the connection exists and nobody blocked anyone. Only the caller whose write changed the row sends. Three jobs at once, over a database that yields at every query, send six reminders six times.
- **A new time mails again, the same time does not.** Marking by value (not a flag cleared by the save route) means the meta route needed no change: a reminder moved to another time differs from the marker and is mailed then; the same time set again, or followed up and then undone, is not.
- **At most once, not at least once.** A claim is made before the send. If the job dies between the two, that reminder is lost rather than sent twice. A claim the job could not use (no address now, the confirm link could not be made, any error, a refused send) is handed back, so the next hour tries again inside the 48 hours.
- **48 hours overdue is the edge.** The first run after a deploy therefore does not mail months of old reminders. Older reminders are never mailed.
- **One email per person per run.** Everyone due for a person is claimed and named in one email: first names (at most three, then "and N others"), the event name, a link to each named person's page and a People list link for the rest. Never the private note, tags, any email address or the other person's links (a source guard and a test over the captured message).
- **`mailableAddress` after the claim.** For an unconfirmed address the call is itself a claim, so it is made only for someone who will be emailed, and handed back with `releaseMail` on any failure. A pending address gets the confirm button (`withConfirm`).
- **One switch: `users.notify_reminders` (default 1).** It covers reminders you set and, in F49, finish-your-profile emails. Stop link scope `reminders` (signed, never expires, GET shows a button, POST turns it off, no sign-in). Settings shows it for a confirmed or an unconfirmed address.
- **`/api/me` says what would really go.** `reminderEmails` is the switch; `reminderEmailsGo` is the switch with an address that may be emailed. The card page's "We'll email you then." follows `reminderEmailsGo`, so it never promises an email that would not be sent.
- Per run: 300 people, 1,500 reminders looked at; the next hour carries on.

## Consequences
- Migration 0037 is additive and safe before the deploy; the first hourly run after the deploy mails everyone who has a reminder due within the last 48 hours and a usable address (the switch is on for everyone).
- F49 reuses `notify_reminders` and the `reminders` stop link; the Settings label and the stop-page wording then need F49's words.
- The Privacy Policy changed (one row edited in section 2 and one in section 6); the Terms version is not bumped here ([[F50 QuantLink as the operator]]).

**Evidence:** `migrations/0037_reminder_emails.sql`, `worker/followupmail.js`, `worker/mail-templates.js` (`followupReminderEmail`), `worker/unsub.js`, `worker/alerts.js`, `test/followup-mail.mjs`

Related: [[Integrations and Email]], [[Privacy and Data Retention]] · back to [[Decision Log]]
