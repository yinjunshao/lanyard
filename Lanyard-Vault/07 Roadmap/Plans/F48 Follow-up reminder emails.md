---
tags: [roadmap, feature, email, people]
id: F48
priority: P1
phase: 9
size: M
status: Not started
needs: [F45, F47]
---
# F48 Follow-up reminder emails

**Priority:** P1 · **Phase:** 9 Owner requests (2026-11-22) · **Size:** M · **Needs:** [[F45 Email when someone new connects]], [[F47 Tidy follow-up section]] · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-22)
"Make sure that follow up, when the time comes, they will receive an email notification as well to remind them to follow up."

## Current state
- A reminder is `remind_at` (ms, 9:00 in the person's local time, set in the browser) on the connection meta saved by `Api.connectionMeta`; `followed_up_at` marks it done. Find the table and route in `worker/` (search `remind_at`).
- Nothing emails a reminder today. The hourly cron (`47 * * * *` in `wrangler.toml`, `scheduled` in `worker/index.js` about line 1376) runs `sendEventEmails` (`worker/eventmail.js`), which shows the pattern: a per-run cap, `sendBatch`, a log so nothing is sent twice, a signed stop link from `worker/unsub.js`.
- Email preferences: `src/components/EmailPreferences.vue` (feedback reminders, news), backed by `users.notify_events` and `marketing_optin`.
- [[F45 Email when someone new connects]] gives `mailableAddress(user)` (verified address, or a pending one for at most two emails, each with a confirm button).

## Plan
1. **Migration 0037 (additive):** `users.notify_reminders INTEGER NOT NULL DEFAULT 1` (one switch for follow-up reminders and, in F49, finish-your-profile emails), and a "mailed" marker for a reminder (for example `reminder_mailed_at` on the connection meta row). Setting or changing `remind_at` clears the marker; marking followed up stops it.
2. **The hourly job** (new `worker/followupmail.js`, called from the hourly cron): reminders with `remind_at <= now`, `remind_at >= now - 48 h` (so the first deploy does not mail months of old reminders), not followed up, not mailed, whose owner has `notify_reminders = 1` and a `mailableAddress`. **One email per person per run** listing everyone due ("Time to follow up with Sam" / "with Sam, Priya and 2 others"), each name linking to that person's page; the connection must still exist and must not be blocked. Mark all of them mailed in the same batch. Per-run cap like `PER_RUN`; the next hour carries on.
3. **The email** (`worker/mail-templates.js`): subject "Time to follow up with Sam"; body names the event if the connection has one, the private reminder note is **not** included (email is less private than the app), a button to the person's page, a line "You set this reminder in Lanyard", the stop link (turns `notify_reminders` off) and, for a pending address, the F45 confirm button. Plain text and HTML like the others. UK English, no emoji.
4. **Settings:** in `EmailPreferences.vue` a switch "Email me when a follow-up reminder is due, and reminders to finish my card", shown when the person has a confirmed or pending email. Show the F47 hint "We'll email you then" under a set reminder only when a reminder email would actually go (switch on and an address).
5. **Privacy Policy:** section 2 and 6 rows for these emails (sent only for reminders you set; one switch to stop). No Terms version bump ([[F50 QuantLink as the operator]] does it).

## Tasks
- [ ] F48.1 Worker: migration 0037, the hourly job, the template, the stop link, the preference route; tests in a new `test/followup-mail.mjs` (due, not due, followed up, cleared, blocked, deleted connection, switched off, no address, pending address cap, two people due give one email, run twice sends once, a 3-day-old reminder at first deploy is not mailed).
- [ ] F48.2 Front end: the Settings switch and the F47 hint; Privacy Policy rows; vault notes ([[Data Model]], [[Integrations and Email]], [[Privacy and Data Retention]]), browser check at 375 and 1280 px, light and dark; the email seen in the `MAIL_LOG=1` console.

## Acceptance checks
- [ ] A reminder set for 09:00 today is emailed by the first hourly run after 09:00 and never again (test with a fixed clock).
- [ ] Two reminders due for the same person give one email naming both.
- [ ] A reminder marked followed up, cleared, for a removed or blocked connection, or for a person with the switch off, sends nothing.
- [ ] Changing a mailed reminder to another day mails again on that day.
- [ ] The email never contains the private note or the other person's email address (test searches it).
- [ ] The stop link turns the switch off without signing in, and the Settings switch shows it off.
- [ ] `npm test` passes; public pages within budget.

## Log
-

Related: [[F47 Tidy follow-up section]] · [[F49 Profile score and finish-your-profile emails]] · back to [[00 Master To-Do]]
