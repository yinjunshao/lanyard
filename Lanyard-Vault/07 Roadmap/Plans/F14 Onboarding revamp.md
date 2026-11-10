---
tags: [roadmap, feature, onboarding]
id: F14
priority: P1
phase: 1
size: L
status: In progress
needs: [F06, F11, F12]
---
# F14 Onboarding revamp

**Priority:** P1 (the poster campaign brings new people now) · **Phase:** 1 Foundations · **Size:** L · **Needs:** [[F06 Edit profile and Cards buttons]], [[F11 Student and Career mode]], [[F12 Institution picker]] · back to [[00 Master To-Do]]

## What the owner asked for
Onboarding needs to be better. People don't bother filling in their profile.

## Current state
- First run of `EditProfile.vue` ("Make your card", one long form with suggestion chips, "Add more" collapsed).
- `MyCard.vue` has a "Your card is ready" welcome panel and a "Finish your card (n of N)" checklist (`STEPS`, snoozed for 3 days in `localStorage`).
- `AccountBanner.vue` asks for an email (3-day snooze). `TermsGate.vue` asks for terms. Guests who connect first get a stub profile with just a name.

## New flow: one question per screen
Route `/app/welcome` (first run, or "Finish your card" later). A thin progress bar at the top, Back on every step, Skip on optional steps. Each step saves to the server straight away (no `localStorage` progress), so it resumes on any device.

1. **Your name and photo.** Name required. Photo optional: camera or upload, using the existing `PhotoCropper`. Copy: "People remember faces. Add one so they remember yours."
2. **Student or working?** Two large choice tiles (from [[F11 Student and Career mode]]). Then the institution, course and year ([[F12 Institution picker]]) or the company and role.
3. **What can people come to you for?** Chips by mode, up to 4 highlighted for the badge, plus "Add your own". Then the one-line headline with a placeholder example (no AI).
4. **Links (optional).** LinkedIn, GitHub, portfolio. If they paste a full URL, the label is filled in for them.
5. **Save your card.** Verified email by code (`EmailSetup`), because email is becoming compulsory. Then an optional "Also add a passkey for one-tap sign-in". Explain in one line why: "So you can get back in on a new phone."
6. **Done.** Show the finished badge (the same `Badge.vue` as My card; later the preview from [[F18 Live previews for cards and events]]) with "Show this at your next event", the install-app prompt (`InstallGuide`), and "Got a code? Redeem it" when one is waiting (`src/lib/redeem.js`).

- Guests who connected before having a profile land on step 1 prefilled with their name after the connect sheet: "Finish your card so <name> can find you again."
- Terms and 18+ stay on step 1 (one tick box) for people who haven't accepted them, so `TermsGate` doesn't pop up on top.
- Suppress `AccountBanner` and the MyCard "Finish your card" panel while `/app/welcome` is in progress.
- After onboarding, the MyCard checklist only lists steps that are still missing.

## Measuring it (privacy-friendly)
Daily aggregate counters only (`onboarding_stats(day, step, reached, completed)`). No per-person tracking and no third-party analytics. The admin page shows a small funnel table.

## Copy rules
Plain, warm, short. No named universities ([[F03 Neutral copy with no named university]]). No AI-written bios ([[F16 Shared ground without AI]] explains why).

## Tasks
- [x] F14.1 Route and stepper shell (progress, Back, Skip, resume from server state).
  - `migrations/0022_onboarding.sql` (additive): `profiles.onboarding_step` (NULL = not in the steps; every old profile stays NULL) and `onboarding_max` (furthest step, so Back and forward are not counted twice), and the `onboarding_stats` table. `worker/onboarding.js` holds `moveTo`; `PUT /api/onboarding` takes `{ step: 1 to 6 }` or `{ done: true }` and changes nothing for anyone not in the steps. `POST /api/profile` with `onboarding: true` puts the new person at step 2 (step 1 was that request); a guest's stub profile made by connecting starts at step 1. The step is in the address (`/app/welcome?step=3`) and on the server, so a refresh or another device resumes. `src/views/Welcome.vue` is the shell: a progress bar, Back (Leave on step 1), Skip on steps 2 to 5, one Continue in the thumb bar. It is not a `meta.app` route, so the tab bar, the Terms pop-up and the account banner never sit over it. The step bodies come in F14.2 and F14.3.
  - First-load JS: the route added 67 B gzip to the entry, so `AccountBanner.vue` (in the entry) now loads the email form and the passkey library with a plain `import()` when tapped. Landing went from 65,178 to 60,605 B and the public card from 60,113 to 55,554 B. See the Log.
- [x] F14.2 Steps 1-4 using the F11 and F12 fields.
  - Shared, not copied: `src/components/ModeFields.vue` (the Student / Career switch, company and role, and the institution picker with its list loaded on open and the email-domain suggestion), `src/components/TagFields.vue` (tags and suggestion chips) and `src/lib/links.js` (`buildLinks`, moved out of `EditProfile.vue`, and `labelForUrl`). Edit profile now uses all three, with the same ids and labels (the switch still says Student and Career), so `#course`, `#company`, `#photo` and the other hash links still land on the field. The welcome steps are in `src/components/welcome/`: `StepYou` (name, photo by camera or upload through `PhotoCropper`, and the 18+ and Terms tick for anyone who has not accepted), `StepMode` (two large tiles, Student and Working, then the same fields), `StepFor` (chips by mode, "Add your own", and the one-line headline with an example, no AI) and `StepLinks` (paste an address and the label fills in: LinkedIn, GitHub and others, else the site's name). Each saves to the server as it is answered. Steps 1 to 4 fit a 375 px screen except Links with several rows.
  - `test/institutions.mjs` read `EditProfile.vue` for the picker. The picker moved to `ModeFields.vue`, so its guards now read that file: the data file is named only by `HostDashboard.vue` and `ModeFields.vue`, both use a plain `import()`, `ModeFields.vue` has no plain text field for the university and exactly two `UiCombobox`, and Edit profile and `StepMode.vue` use `<ModeFields` and build no picker of their own. The checks are the same strength, on the new file.
- [x] F14.3 Step 5 email and optional passkey. Step 6 done screen.
  - `StepSave.vue` is the same `EmailSetup` as Settings and the redeem page (code by email; the optional news tick is still unticked and still only offered after the code), then, once the email is saved and the browser supports it, "Also add a passkey for one-tap sign-in" with the one line "So you can get back in on a new phone". Continue only appears once the email is saved; Skip is there, except while a promo code is waiting (the email is what lets them claim it). A link to `/claim` keeps the recovery-key way of saving. `StepDone.vue` shows the same `Badge` as My card (QR with `?s=q`), "Show this at your next event", the install prompt by one shared rule (`offerInstall`, now also used by My card), and "Claim your code" as the one primary action when `pendingCode()` has one (otherwise "Open my card"). Reaching step 6 finishes onboarding on the server, so a closed tab there does not bring the steps back.
  - Decision: step 5 can be skipped. The owner said email is "becoming compulsory", but it is not today (D003: guest first), and the account banner still asks, so a hard stop would be a product change. See the Log.
- [x] F14.4 The guest-after-connect path and the redeem-code hand-off.
  - Every way into a first card now opens `/app/welcome` (Landing "Make your card", Sign in, the redeem page, My card with no card); `/app/profile` with no card redirects there. A guest who connected first has a stub profile that starts at step 1 (F14.1): People asks them "Finish your card so Sam can find you again." with one button, My card carries them on in the steps (unless they chose Leave in this session), and step 1 repeats the line with the name of the latest person they met and no Terms tick (they gave it in the connect sheet). The connect sheet and the public card are unchanged: a new person from a scanned badge still connects with a name and one tick, and `?s=` is still read once, removed from the address and sent as `via` (guarded in `test/onboarding.mjs`). The redeem hand-off: the poster code is held in `lanyard-redeem` through the steps, step 5 cannot be skipped while one is waiting, and the done screen's one primary action is "Claim your code" (`/redeem/CODE`), which claims it because there is now a card and a confirmed email.
- [ ] F14.5 Banner and panel suppression. Prune the MyCard checklist.
- [ ] F14.6 Funnel counters and the admin table.
- [ ] F14.7 Walk through on a 375 px phone in light and dark. Every step fits without scrolling (except Links).

## Acceptance checks
- [ ] A new person goes from QR scan of the poster → `/redeem` → account → onboarding → code claimed, without hitting a dead end.
- [ ] Closing the tab at step 3 and reopening resumes at step 3.
- [ ] The funnel table shows step counts after a test run.

## Consent and legal steps: old and new
Every consent or legal step the old first run had, and where it is now. Each is checked by `test/onboarding.mjs`.
| # | Old | Now |
| --- | --- | --- |
| 1 | One tick on "Make your card": 18+ and the Terms of Service and Privacy Policy (links open in a new tab), unticked, the card is not made without it | Step 1, the same words, links and tick, unticked. Continue stays off until it is ticked; the server still refuses with `terms_required` |
| 2 | The same tick in the connect sheet for a guest, and the server refuses without it | Unchanged (`ConnectSheet.vue`, `POST /api/connect`). A new person from a scanned badge goes no further than this |
| 3 | The Terms pop-up on every /app page for anyone with a card who has not accepted the current version | Unchanged on /app. The welcome page is not an /app page, so it does not sit over the question: step 1 asks for the tick again for such a person and sends it through the same `POST /api/terms/accept` |
| 4 | Consent recorded in `consents` and appended to `consent_log` under the Terms version, 18+ recorded with its time | Unchanged: step 1 calls the same `POST /api/profile`. The Terms version string (`2026-10-26`) is unchanged |
| 5 | News and offers tick in the email form, unticked, never required | Unchanged: step 5 is the same `EmailSetup` |
| 6 | Shared selfie consent in the connect sheet | Unchanged |
| 7 | A promo code needs a card and a confirmed email | Unchanged on the redeem page; step 5 cannot be skipped while a code is waiting |
| 8 | Guest-first with passkeys (D003), the claim page with the recovery key, the signed-in hint | Unchanged: step 5 links to `/claim`, the passkey is an extra after the email, and nothing here touches `src/lib/signedin.js` |

## Log
-

Related: [[F02 Logo goes to My card when signed in]], [[Features]] · back to [[00 Master To-Do]]
