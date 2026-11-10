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
- [ ] F14.1 Route and stepper shell (progress, Back, Skip, resume from server state).
- [ ] F14.2 Steps 1-4 using the F11 and F12 fields.
- [ ] F14.3 Step 5 email and optional passkey. Step 6 done screen.
- [ ] F14.4 The guest-after-connect path and the redeem-code hand-off.
- [ ] F14.5 Banner and panel suppression. Prune the MyCard checklist.
- [ ] F14.6 Funnel counters and the admin table.
- [ ] F14.7 Walk through on a 375 px phone in light and dark. Every step fits without scrolling (except Links).

## Acceptance checks
- [ ] A new person goes from QR scan of the poster → `/redeem` → account → onboarding → code claimed, without hitting a dead end.
- [ ] Closing the tab at step 3 and reopening resumes at step 3.
- [ ] The funnel table shows step counts after a test run.

## Log
-

Related: [[F02 Logo goes to My card when signed in]], [[Features]] · back to [[00 Master To-Do]]
