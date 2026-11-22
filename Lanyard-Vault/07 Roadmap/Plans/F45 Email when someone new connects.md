---
tags: [roadmap, feature, accounts, privacy]
id: F45
priority: P1
phase: 9
size: M
status: Not started
needs: []
---
# F45 Email when someone new connects

**Priority:** P1 · **Phase:** 9 Owner requests (2026-11-22) · **Size:** M · **Needs:** none · back to [[00 Master To-Do]]

> [!note] Owner decision 2026-11-22: the email is typed, not checked with a code. The person connects straight away; our first email to them carries a "Confirm it's you" button. Until it is confirmed the address can never sign anyone in, and an unconfirmed address gets at most two emails from us in total.

## What the owner asked for (2026-11-22)
"require email when onboarding/connecting with someone if they dont got an account. this isn't shown to the person they're connecting with."

"Another important part that we should start doing now that we have email during onboarding is that we should remind the users to complete their profile on email." (that is [[F49 Profile score and finish-your-profile emails]]; this item gives it an address to send to)

Answer (2026-11-22) to "how should we check the address is theirs": **Confirm link later**: "They type it and connect straight away. Our first email has a 'Confirm it's you' button. Until they confirm, the address can't be used to sign in, and if they never confirm we stop emailing after two tries."

## Current state
- `src/components/ConnectSheet.vue`: a guest (no profile) types only a name (about line 160) and ticks Terms and 18+; `Api.connect` posts `{ cardId, name, message, note, ..., acceptTerms, over18 }`. `src/views/Connect.vue` is the older full-page form with the same name-only rule.
- `worker/index.js` handles `/api/connect` (find it) and creates the guest user and profile.
- Email today is only ever added verified, by a 6-digit code: `worker/email-auth.js` (`addStart`, `addConfirm`) writes `users.recovery_email` with `email_verified = 1`. `findUserByEmail` still lets a legacy **unverified** `recovery_email` sign in as a fallback, so an unconfirmed typed address must NOT go into `recovery_email`.
- Onboarding step 5 `src/components/welcome/StepSave.vue` asks for a verified email with `EmailSetup.vue` and can be skipped (`SKIPPABLE` in `src/views/Welcome.vue`).
- Signed email links already exist for unsubscribe: `worker/unsub.js` (`emailLink`). Mail goes through `worker/mail.js` (`MAIL_LOG=1` prints locally).

## Plan
1. **Storage (migration 0036, additive).** On `users`: `pending_email TEXT` (lower-case, never unique, never used to sign in), `pending_email_at INTEGER`, `pending_mails INTEGER NOT NULL DEFAULT 0` (emails sent to it while unconfirmed), `tz TEXT` (the browser's IANA time zone, for [[F49 Profile score and finish-your-profile emails]]). A table or columns for one confirm token (store only its hash, expires after 14 days, single use).
2. **Connect sheet and Connect page.** A guest (no profile) sees "Your email" under "Your name": required, `type=email`, `autocomplete=email`, the line "Only we see this. It isn't shown to {first} or on your card." and a quiet "Already on Lanyard? Sign in" link (to `/signin` with a return to this card). The browser sends `email` and `tz` (`Intl.DateTimeFormat().resolvedOptions().timeZone`) with the connect request. The server refuses a guest connect without a valid email (400, plain words, using `validEmail`), and ignores `email` from someone who already has a profile.
3. **Onboarding step 5.** Email becomes required: step 5 is no longer skippable unless an email is already on file (confirmed, or pending). If a pending email exists it is shown with "We'll send you a link to confirm it" and Continue works; "Confirm now with a code" uses the existing code flow. If none, they type one and it is saved as pending (same endpoint as the sheet uses, signed in). Keep the passkey extra as it is. Send `tz` when a profile is created or saved if it is missing.
4. **Confirming.** `GET /api/email/confirm?t=<token>` (or a page that posts it): single use, expires, constant-time compare. If no other account has that address verified: set `recovery_email`, `email_domain`, `email_verified = 1`, `is_guest = 0`, clear `pending_*`. If another account already has it verified: clear the pending address and show "That email already has a Lanyard account. Sign in with it instead." Never say which account. Lands on a small confirmed page (or `/app` with a notice). This endpoint is also what F48 and F49 emails link to.
5. **The two-email cap.** One helper, e.g. `mailableAddress(user)`, that F48 and F49 call: a verified address always; a pending address only while `pending_mails < 2`, and it increments `pending_mails` in the same write that claims the send. Every email to a pending address includes the "Confirm it's you" button. Sign-in codes, security alerts and feedback reminders still go only to verified addresses.
6. **Who sees it.** Nobody but the account: not the person they connected with, not hosts or a named-attendance list (F31 uses only verified emails, keep it so), not public card pages, not other people's data downloads. It is in the person's own data download and is deleted with the account.
7. **Privacy Policy.** Add the pending email to section 2 (what we collect: "your email, which you must give when you connect or make a card; only we see it") and section 6 (kept until confirmed, replaced or the account is deleted; an unconfirmed address that is never confirmed is cleared after 30 days without a confirm). Do **not** bump the Terms version: [[F50 QuantLink as the operator]] does one bump for F45 to F50.

## Tasks
- [ ] F45.1 Worker: migration 0036, guest connect requires an email, `tz`, pending storage, the confirm token and endpoint, `mailableAddress` with the two-email cap, export and deletion; tests in a new `test/connect-email.mjs`.
- [ ] F45.2 Front end: email field on `ConnectSheet.vue` and `Connect.vue`, required email at onboarding step 5, confirmed page or notice; Privacy Policy wording; vault notes ([[Data Model]], [[API Surface]], [[Privacy and Data Retention]], [[Auth and Sessions]]), decision note; browser check at 375 and 1280 px, light and dark.

## Acceptance checks
- [ ] A guest pressing Connect with a name but no email sees "Add your email…" and nothing is sent; the server refuses the same request with 400.
- [ ] A guest connects with `sam@example.com`: the connection is made; `users.pending_email` is `sam@example.com`; `recovery_email` is unchanged and `email_verified` is 0.
- [ ] Asking for a sign-in code for `sam@example.com` before confirming does not send a code for that account and does not sign anyone in (test).
- [ ] The card owner's view of the connection, their People list, their data download, the host's attendee list and CSV, and the public card JSON never contain the guest's email (test searches every response for the address).
- [ ] The confirm link verifies the address once; a second use, an expired token and a made-up token all fail the same way; confirming an address another account already has verified does not verify it and does not reveal the other account.
- [ ] `mailableAddress` returns a pending address for the first two sends and `null` for the third (test).
- [ ] Onboarding step 5 cannot be skipped without an email; with a pending email it shows the address and Continue works.
- [ ] Someone already signed in with a profile sees no email field on the connect sheet.
- [ ] `npm test` passes and public pages stay inside the budget (report the numbers).

## Log
-

Related: [[F48 Follow-up reminder emails]] · [[F49 Profile score and finish-your-profile emails]] · [[D003 Guest first with passkeys]] · back to [[00 Master To-Do]]
