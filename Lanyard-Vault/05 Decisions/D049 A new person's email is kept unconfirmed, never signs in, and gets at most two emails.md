---
tags: [decision, privacy, accounts]
status: Accepted
date: 2026-11-22
---
# D049 A new person's email is kept unconfirmed, never signs in, and gets at most two emails

**Status:** Accepted  ·  **Date:** 2026-11-22

## Context
[[F45 Email when someone new connects]]: the owner asked that a person without an account gives an email when they connect or make a card, and that the person they connect with never sees it. On 2026-11-22 the owner chose "Confirm link later": the person types it and connects at once, our first email has a "Confirm it's you" button, the address cannot sign in until confirmed, and an unconfirmed address gets at most two emails. Before this, email was only ever added verified by a code (`recovery_email`), and sign-in still falls back to a legacy unverified `recovery_email`, so a typed address could not go there. This narrows [[D003 Guest first with passkeys]] (a guest now gives a name and an email) and changes [[D023 Welcome steps keep their place on the server and count only]] (step 5 can no longer be skipped without an email).

## Decision
- **Its own column.** The typed address is `users.pending_email` (lower-case, not unique, migration 0036) with `pending_email_at` and `pending_mails`. It is never written to `recovery_email`, and sign-in (`findUserByEmail`) reads only `recovery_email`, so it cannot find or sign in an account. Only its own account sees it (`/api/me`, the own data download); a source guard keeps the column out of every file but `index.js`, `pending-email.js` and `email-auth.js`.
- **Checked before anything is written.** `/api/connect` no longer mints a guest in middleware: card, name, email, Terms and the selfie tick are checked first and the guest is made only then, so a refused connect leaves no user, profile or connection. An `email` from someone who already has a card is ignored. Saying "that email has an account" at typing time would tell anyone which addresses have accounts, so nothing is said then; the confirm page says it, to the mailbox.
- **The confirm link.** `email_confirms` keeps one row per link: a random id and secret (`newId` + `newToken`), only the secret's SHA-256, 14 days. Opening it shows a "Confirm it's me" button and changes nothing, because mail scanners open links; pressing it (POST) compares in constant time, deletes the row in one `DELETE ... RETURNING` (single use under a burst), and confirms. It never signs anyone in. A used, expired, wrong, made-up or out-of-date link gives one page. Both GET and POST count a wrong try per IP before checking (10 per 10 minutes, [[D040 Limits and claims are enforced in the write itself, and a guess is counted before it is checked]]). The page sends `Referrer-Policy: same-origin` (no-referrer would make the button send `Origin: null`, which the same-origin check refuses).
- **Taken.** If another account already has the address confirmed, it is not confirmed, the pending address is cleared, and the page says "That email already has a Lanyard account. Sign in with it instead." without naming the account.
- **Two emails, one claim.** `mailableAddress(db, userId)` returns a confirmed address always, and a pending one only while `pending_mails < 2`; for a pending one the call is the claim, one conditional `UPDATE ... RETURNING`, so jobs running at once never send a third. The first email (sent when an address is new) is one of the two. A new address starts again at 0; the same one typed again does not. At most 3 first emails a day go to one address from all accounts together (counter keyed by a hash).
- **Retention.** An address nobody confirms is cleared 30 days after it was typed (daily purge); it is in the person's data download and goes with the account.
- **Time zone.** `users.tz` is the browser's IANA zone, kept only if `Intl` knows it (canonical spelling), latest valid value wins, sent with connect, step 5, making a card and Edit profile. For [[F49 Profile score and finish-your-profile emails]].

## Consequences
- F48 and F49 call `mailableAddress`, then `confirmLink(db, origin, userId, to)` and `withConfirm(message, url)` for a pending address, and `releaseMail` if a send fails. Sign-in codes, security alerts and feedback reminders still go only to confirmed addresses.
- A person who never confirms can still be reached twice; after that only the app reaches them.
- Migration 0036 must be applied before the new code is deployed (connect writes the new columns).
- The Privacy Policy gained two rows; the Terms version was not bumped ([[F50 QuantLink as the operator]] does one bump for F45 to F50).

**Evidence:** `migrations/0036_pending_email.sql`, `worker/pending-email.js`, `worker/index.js` (`/api/connect`, `/api/account/pending-email`, `/api/me`, export), `worker/email-auth.js`, `worker/purge.js`, `src/components/ConnectSheet.vue`, `src/components/welcome/StepSave.vue`, `test/connect-email.mjs`

Related: [[Auth and Sessions]], [[Privacy and Data Retention]] · back to [[Decision Log]]
