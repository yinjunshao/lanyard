---
tags: [roadmap, feature, admin, profile, privacy, email]
id: F75
priority: P1
phase: 13
size: M
status: In progress
needs: [F74]
---
# F75 Admin-suggested profile edits that the person approves

**Priority:** P1 · **Phase:** 13 Owner requests (2026-11-25, second batch) · **Size:** M · **Needs:** [[F74 Admin-made profiles with a claim link]] (same admin page) · back to [[00 Master To-Do]]

> [!note] Owner decision 2026-11-25: **they approve first**. The admin's edits to someone's card are saved as a suggestion. Nothing changes on their card until they press Accept.

## What the owner asked for (2026-11-25)
> "In the same section, allow me to easily make changes to someone's card in this admin page as well. So this helps, for example, if someone hasn't filled out their profile page on Lanyard, if their profile page is empty, I'll manually try to find them on perhaps like LinkedIn or something, and I'll fill out their information for them. And then after I do so, if they have registered an email, send an email telling them saying how your detail has been filled in for you."

Asked how admin edits should work (UK GDPR needs people told when their data comes from elsewhere, and their card is public), the owner chose **"They approve first"**.

## Current state
- After F74, `/admin/profiles` exists, behind the admin token.
- `/admin` has an account search (`GET /api/admin/users`, `worker/admin.js` about line 281) by name, university or card code, used for recovery.
- Profile completeness: `src/lib/profileScore.js`. F70's metrics count profile scores.
- Mail: `worker/mail.js` (`sendMail` and the shared mail layout that `test/mail-layout.mjs` guards). Emails only go to `email_verified = 1` addresses. `MAIL_LOG=1` captures mail locally.

## Plan
**Admin side** (a section on `/admin/profiles`, "Suggest details for someone"):
- Search people with the existing search. A filter shows people with a low profile score (for example 2 of 6 or under).
- Open one to see their current card fields next to an editable copy. Fill or change fields, and add the source (required, for example "LinkedIn"). Press Send suggestion.
- One open suggestion per person. A new one replaces the old one, and the person sees only the latest.
- The list shows open suggestions with status (waiting, accepted, declined, expired) and when each was sent.

**Data** (migration, additive): `profile_suggestions (user_id PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, fields TEXT NOT NULL (JSON of only the changed fields), source TEXT NOT NULL, created_at, expires_at, emailed_at)`. A suggested photo is stored under its own media key and deleted with the row. Kept 30 days, then deleted by the daily purge. Accepting or declining deletes it. Keep only counts of accepted and declined (for F70's metrics: `suggestions_accepted_30d`, `suggestions_declined_30d`); the field values are not kept after a decision.

**Person's side:**
- **Email,** only if the account has a verified email: "We filled in some details on your Lanyard card". It names the fields, not their values, says where they came from, says nothing shows until they accept, and gives a link to review. Sent once per suggestion. It is a service message about their own account, not marketing: it ignores `marketing_optin`, but respects any account-level "no emails" switch if one exists (check).
- **In the app:** a banner on My card ("We suggested some details for your card. Review"). The review page `/app/profile/suggested` shows each field as now and suggested, with a tick per field, **Accept selected** and **Decline all**. Accepted fields are written exactly as an Edit profile save would write them, with the same validation and limits. Nothing is written until then.
- People with no email see only the banner. That is the notice; record it in the Log.
- A suggestion can never touch sign-in, email, plan or settings: profile and card display fields only, checked on the server against an allow-list.

**F74 hand-off:** when someone claims a premade profile with an email that already has an account, F74 turns those details into a suggestion here. Wire that up.

**Privacy:**
- Add one Privacy Policy line next to F74's: we may suggest details from public sources; nothing changes until you accept; a suggestion is deleted after 30 days. No version bump; flag whether it is material.
- Add a decision note.
- Update [[Privacy and Data Retention]] (owner-modified: lines in the Log).

## Tasks
- [x] F75.1 Migration and admin routes (search for low scores, make or replace, list, withdraw), with an allow-list of fields and tests. (`migrations/0047_profile_suggestions.sql`, `worker/suggestedEdits.js`, `worker/suggestedEditsAdmin.js`, the Edit profile save moved into `readProfileEdit` and `profileEditStmt` in `worker/profileFields.js`, `test/suggested-edits.mjs`)
- [x] F75.2 The person's routes (read, accept selected, decline), the email, the banner and the review page, with tests. (`registerSuggestedEditsRoutes` and `mailSuggestion` in `worker/suggestedEdits.js`, `suggestedDetailsEmail` in `worker/mail-templates.js`, `src/views/SuggestedEdits.vue` on a lazy route, the My card banner from `/api/home`, `src/components/AdminSuggest.vue` on `/admin/profiles`)
- [ ] F75.3 The F74 existing-account hand-off, the 30-day purge, the metrics counts, the Privacy Policy line, vault notes, decision note, Log, Master To-Do.

## Acceptance checks
- [ ] Sending a suggestion of a headline and a company for a person changes nothing on `/c/<their card>` until they accept.
- [ ] A person with a verified email gets one email (captured with `MAIL_LOG=1`) naming the fields and the source, with no field values in it. A person with no verified email gets none and sees the banner.
- [ ] Accepting only the headline writes the headline and not the company, and the suggestion is gone afterwards.
- [ ] A suggestion that includes `email`, `plan` or any field outside the allow-list is refused with 400.
- [ ] Declining deletes it and writes nothing to the profile.
- [ ] A suggestion 31 days old is gone after `purgeExpired`, with its photo.
- [ ] Every admin route is 401 without the token and audited. The person's routes return 401 signed out, and 404 for another person's suggestion.
- [ ] Claiming an F74 link with an email that already has an account ends with a suggestion on that account and the premade account erased.
- [ ] The review page and the admin section read well at 375 px and 1280 px, light and dark.
- [ ] Owner check (cannot be ticked by an agent): on production, suggest details for your own test account, receive the email, and accept.

## Log
- 2026-11-25 (owner decision): suggestions need the person's approval; email only to verified addresses.

Related: [[F74 Admin-made profiles with a claim link]] · [[F49 Profile score and finish-your-profile emails]] · [[Privacy and Data Retention]] · back to [[00 Master To-Do]]
