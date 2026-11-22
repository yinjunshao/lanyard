---
tags: [decision, email, privacy]
status: Accepted
date: 2026-11-22
---
# D051 Finish-your-profile emails follow a timing rule, at most two ever, claimed before they are sent

**Status:** Accepted  ·  **Date:** 2026-11-22

## Context
[[F49 Profile score and finish-your-profile emails]]: the owner asked for a reminder to complete the profile after a networking event, about an hour and a half on, and a second one a little later if nothing changed. The job emails people on a timing rule, so when, how often and to whom matter as much as the feature. It builds on [[D049 A new person's email is kept unconfirmed, never signs in, and gets at most two emails]] (`mailableAddress`), [[D050 A reminder is mailed once, by one conditional write, to one switch]] (the switch and the claim pattern) and [[D040 Limits and claims are enforced in the write itself, and a guess is counted before it is checked]].

## Decision
- **One score, one file.** `src/lib/profileScore.js` counts six items, one point each: name, photo, university (student) or company (career), course (student) or role (career), "what you do" (the profile's headline, the one line on the badge) and at least one link. A value of only spaces is empty. Edit profile shows it as "Profile N of 6" with the missing items as links to their fields; the Worker imports the same file, so the page and the email never disagree. It is imported by no public page.
- **The anchor.** The later of the end of an event the person checked in to (`COALESCE(ended_at, ends_at, starts_at + 4 h)`, as the event emails) and their latest connection, each only if within the last 24 hours. Someone still at an event that has not ended is never emailed, and the anchor moves on with every new connection, so nobody is emailed mid-event or while people are still being met.
- **Email 1** goes at the first hourly run at or after anchor + 75 minutes (the cron is at :47, so between 75 and 135 minutes). Only from 08:30 to 23:00 in the person's own time zone (`users.tz`, London if unknown); an email that would fall in the quiet hours waits for the first run from 08:30.
- **Email 2** only if the profile is still under 6 of 6 and has not been saved since email 1 (`profiles.updated_at`, already there): the first run from 19:00 on a later day in their time zone, at least 18 hours and at most 48 hours after email 1, and not after 23:00. The 48-hour edge is mine: without it a missed run would send the "last" email days late.
- **Never more than two, in total and ever** (`NUDGE_MAX`, one named constant, read inside both claim statements). This is the plan's answer to the owner's open question: two in total, or two again after each later event. Changing it later is the constant plus a per-event marker in place of `users.profile_nudges`; the owner confirmed two in total on 2026-11-22. Never at 6 of 6, never with the reminders switch off, never with no address; an unconfirmed address at its two emails (the confirm email at connect counts as one, shared with F48) gets nothing and nothing is marked sent.
- **Once, by the write.** `users.profile_nudges` (0, 1, 2) and `profile_nudge_at` (migration 0038). The job claims each email with one conditional `UPDATE ... RETURNING` that re-checks the rules in the same statement (the count, the switch, a profile exists, no connection in the last 75 minutes, and for email 2 the profile not saved since and the window), and only then calls `mailableAddress` (itself a claim for an unconfirmed address). A refused send or any error hands both claims back. At most once, not at least once: a crash between claim and send loses an email rather than sending it twice.
- **What the email holds.** At most two first names of people met in the 24 hours before, newest first, never someone blocked either way; the score; the missing items by name; one button to Edit profile; the stop link; and for an unconfirmed address the confirm button. Never a last name, an address, a tag, a note, a link or a headline of anyone. Email 2 names nobody new and says it is the last.
- **One switch.** `users.notify_reminders` (F48) covers these emails; the Settings label and the stop page now say so.
- **Not looked at on purpose.** Open rates (Apple's mail privacy makes them unreliable); success is profiles completed.
- Per run: 300 emails and 1,500 people looked at per kind; the next hour carries on.

## Consequences
- Migration 0038 is additive (two columns on `users`, an index on `connections(created_at)` and a partial one for people waiting for email 2) and safe before the deploy.
- The first hourly run after the deploy emails anyone with a connection or event end in the last 24 hours and a profile under 6 of 6 (the switch is on for everyone).
- The Privacy Policy gained a clause in section 2 and a row in section 6; the Terms version is not bumped here ([[F50 QuantLink as the operator]] does one bump).
- The account deletion removes the two columns with the row; the data download shows the count and the time of the latest.

**Evidence:** `migrations/0038_profile_nudges.sql`, `src/lib/profileScore.js`, `worker/profilenudge.js`, `worker/mail-templates.js` (`profileNudgeEmail`), `test/profile-nudge.mjs`

Related: [[Integrations and Email]], [[Privacy and Data Retention]] · back to [[Decision Log]]
