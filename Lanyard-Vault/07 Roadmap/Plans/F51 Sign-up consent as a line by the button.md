---
tags: [roadmap, feature, ui, legal]
id: F51
priority: P1
phase: 10
size: S
status: Not started
needs: []
---
# F51 Sign-up consent as a line by the button

**Priority:** P1 · **Phase:** 10 Owner requests (2026-11-24) · **Size:** S · **Needs:** none · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-24)
"When connecting, I think you know how there is currently two checkboxes. I think that one is plenty. So that be I am 18 and over and I agree to terms and privacy and policy. That doesn't need to be a checkbox, but it should be like a text for saying like if you click connect, then that is true. The only one that you need to do is for taking a selfie, and then that's for everyone in the selfie has agreed to it. This is also for when they create a new account or create a card."

Asked where else it applies, the owner answered (2026-11-24): "its anywhere that applies where a user needs to sign up if they dont already have an account."

## Current state
- `src/components/ConnectSheet.vue` about lines 48-105 and 227-243: a guest without accepted Terms sees a tick "I'm 18 or over and I agree to the Terms and Privacy Policy" (`agreed`), plus, only when a selfie is attached, the tick "Everyone in the shared selfie agrees to it" (`consent`). Sends `acceptTerms` and `over18`.
- `src/components/welcome/StepYou.vue` lines 16-37 and 72-76: the same tick on step 1 of a new card; the Continue button is disabled until it is ticked.
- `src/components/EventPage.vue` lines 158-161 and `src/views/EventJoin.vue` lines 17-67: first-timers checking in to an event tick it.
- `src/components/HostSetup.vue` lines 22, 65-67 and 132-136: Host Terms step, "I'm 18 or over, I'm authorised to act for the organisation I set up, and I agree to the Host Terms and Privacy Policy".
- `src/components/TermsGate.vue`: shown to existing accounts after the Terms change. This is not a sign-up, so it keeps its tick.
- The Worker refuses without `acceptTerms === true && over18 === true` (`worker/index.js` about 281, 330, 1001; `worker/events.js` about 97). That stays: the client sends `true` when the person presses the button.

## Plan
- In the four sign-up places (connect sheet, welcome step 1, event check-in for first-timers, Host setup Terms step) remove the tick. Put one small line directly above the main button, in the button's own words:
  - Connect: "By pressing Connect, you confirm you're 18 or over and agree to the [Terms] and [Privacy Policy]."
  - Welcome step 1: "By pressing Continue, ..." (use the button's real label).
  - Check-in: "By pressing Check in, ..."
  - Host setup: "By pressing Agree and continue, you confirm you're 18 or over, that you're authorised to act for the organisation you set up, and that you agree to the [Host Terms] and [Privacy Policy]." (keep the existing links)
- The line only shows when the person has not yet accepted the current Terms (the existing `needsAgree` / `needsTerms` conditions). Pressing the button sends `acceptTerms: true, over18: true`. The Continue button on step 1 is no longer disabled by a tick (still disabled without a name).
- The selfie tick in the connect sheet stays exactly as it is, and stays required when a selfie is attached ([[D005 Shared selfie needs both consents]]).
- `TermsGate.vue` keeps its tick (an existing account re-agreeing is not a sign-up).
- Consent records: wherever the acceptance is logged (`worker/legal.js`, `consent_log`), record that it was given by pressing the button with the notice shown, if the log has a field for how (`ref`). Do not change the Terms version.
- Update the error messages that say "Please tick the box..." so none mentions a box that no longer exists.
- Terms section on the selfie ("tick the confirmation when you do") is still true; no change.
- Legal note for the owner: a clear line next to the button ("clickwrap") is a normal, accepted way to agree to terms under English law, provided the line is next to the button and the links work. The age check was already a self-declaration ([[D012 18 plus only]]). The Privacy Policy is a notice, not something consent is needed for, so nothing is lost.

## Tasks
- [ ] F51.1 Replace the tick with the line in `ConnectSheet.vue`, `StepYou.vue`, `EventPage.vue` / `EventJoin.vue` and `HostSetup.vue`; keep the selfie tick; update guards in `test/` that read the old tick; add a test that each sign-up path still sends `acceptTerms` and `over18` true and that the Worker still refuses without them; browser check of each place at 375 and 1280 px, light and dark; vault notes ([[Screens and Routes]], [[Privacy and Data Retention]] if it describes the tick, D012 pointer line).

## Acceptance checks
- [ ] A guest connecting from a card sees no Terms tick, sees the line above Connect with working Terms and Privacy links, and pressing Connect connects them; their account shows Terms accepted.
- [ ] With a selfie attached, Connect still refuses until "Everyone in the shared selfie agrees to it" is ticked.
- [ ] A new card's step 1 has no tick; Continue works with a name and shows the line; without a name it is still disabled.
- [ ] A first-time event check-in has no tick, shows the line, and checks in.
- [ ] Host setup's Terms step has no tick and shows the host line; Agree and continue completes it.
- [ ] Someone who already accepted the Terms sees no line anywhere.
- [ ] A direct API call without `acceptTerms`/`over18` is still refused (test).
- [ ] The Terms update popup still has its tick.
- [ ] `npm test` passes; public pages within budget.

## Log
-

Related: [[D012 18 plus only]] · [[D005 Shared selfie needs both consents]] · [[F45 Email when someone new connects]] · back to [[00 Master To-Do]]
