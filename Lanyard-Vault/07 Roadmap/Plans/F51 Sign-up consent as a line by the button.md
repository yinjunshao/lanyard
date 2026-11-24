---
tags: [roadmap, feature, ui, legal]
id: F51
priority: P1
phase: 10
size: S
status: Done
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
- [x] F51.1 Replace the tick with the line in `ConnectSheet.vue`, `StepYou.vue`, `EventPage.vue` / `EventJoin.vue` and `HostSetup.vue`; keep the selfie tick; update guards in `test/` that read the old tick; add a test that each sign-up path still sends `acceptTerms` and `over18` true and that the Worker still refuses without them; browser check of each place at 375 and 1280 px, light and dark; vault notes ([[Screens and Routes]], [[Privacy and Data Retention]] if it describes the tick, D012 pointer line).

## Acceptance checks
- [x] A guest connecting from a card sees no Terms tick, sees the line above Connect with working Terms and Privacy links, and pressing Connect connects them; their account shows Terms accepted.
- [x] With a selfie attached, Connect still refuses until "Everyone in the shared selfie agrees to it" is ticked.
- [x] A new card's step 1 has no tick; Continue works with a name and shows the line; without a name it is still disabled.
- [x] A first-time event check-in has no tick, shows the line, and checks in.
- [x] Host setup's Terms step has no tick and shows the host line; Agree and continue completes it.
- [x] Someone who already accepted the Terms sees no line anywhere.
- [x] A direct API call without `acceptTerms`/`over18` is still refused (test).
- [x] The Terms update popup still has its tick.
- [x] `npm test` passes; public pages within budget.

## Log
- 2026-11-24 · Claude subagent (F51.1, db0b321): the connect sheet, welcome step 1, the check-in page and Host setup's Terms step have no Terms tick. Directly above the main button each shows one small muted line with underlined links: "By pressing Connect / Continue / Check in, you confirm you're 18 or over and agree to the Terms and Privacy Policy." and, for hosts, "By pressing Agree and continue, you confirm you're 18 or over, that you're authorised to act for the organisation you set up, and that you agree to the Host Terms and Privacy Policy." (links as before, new tab). Step 1's line is drawn by `Welcome.vue` in the thumb bar (StepYou exposes `termsLine`), so it sits by the fixed Continue button; the check-in line is inside the Check in bar. Pressing the button sends `acceptTerms: true, over18: true` (hosts `accept: true`, as before); Continue on step 1 needs only a name. The shared-selfie tick is unchanged and still required; `TermsGate.vue` is unchanged. The "Please tick the box..." messages are gone (nothing left to tick). One CSS rule in `main.css` (`.consent-line`; links underlined like `.checkbox-row a`).
- Consent record: `consent_log` already had `wording` and `version` (F31), so no migration: a Terms grant from these places is logged with `ref` `notice:connect`, `notice:welcome` or `notice:checkin` (a host's keeps `ref` `host_account`, which its download filters on), the line's exact words (`SIGNUP_NOTICE` in `worker/legal.js`) and the Terms version. Making a card logs a notice row only if the person had not agreed to this version already. Agreeing through the pop-up or `/api/terms/accept` (also used by step 1 for someone who has a card but not the current Terms) is logged as before, without a ref. Worker refusals are unchanged. Terms version not bumped (still `2026-11-22`).
- Terms and Privacy Policy: no sentence described ticking a box for 18+ or the Terms (Terms section 2 says "You confirm this when you create a profile", section 15 "when you create the account"; both still true), so neither page changed. Not material, in our view: how agreement is captured changed, not what anyone agrees to. The selfie sentence ("tick the confirmation when you do") is still true.
- Decisions made without the owner: (1) someone who has agreed still sees the connect sheet's existing "Connecting is covered by the Terms and Privacy Policy you've agreed to." note (not a consent line); (2) a host who goes Back to the Terms step after agreeing sees "You've agreed to the Host Terms and Privacy Policy." and a Continue button that does not record a second agreement; (3) step 1 shows the line, not a tick, also to someone with a card who has not accepted the current Terms version (the welcome page has no pop-up, as before); (4) a pointer line in D012 instead of a new decision note.
- Tests: new `test/consent-line.mjs` (73 checks, before the budget check) draws the real components on the server through Vite, runs their own `submit`, `save`, `checkIn` and `acceptTerms` against the real Worker, and checks: each line's words equal `SIGNUP_NOTICE` and sit directly above the button, links `/terms` and `/privacy` (hosts the main site's `/terms#hosts` and `/privacy`, `rel="noopener"`) with `target="_blank"`; each button sends both flags and the account shows Terms accepted with the notice row; someone who agreed sees no line and sends no flags; with a selfie, Connect is refused with "Both of you need to agree to the shared selfie." and nothing sent until the selfie tick is ticked; connect, making a card and check-in are refused with `terms_required` for six flag shapes (missing, one only, strings, numbers, false) and host terms for four, with nothing made; no message on these pages or in the Worker asks to tick a box for the Terms or 18+; the Terms pop-up keeps its unticked tick and disabled button; Terms version unchanged. Two mutations were tried (the sheet not sending `acceptTerms`, the check-in route not checking) and the test failed on each. Guards changed: `test/onboarding.mjs` (steps 1 and 2 of the old consent list now check the line, its links, no tick and both flags; the profile-creation recording regex follows the new `recordConsent` call), `test/named-attendance.mjs` (the saved pre-F31 check-in markup is compared with the old tick taken out of it and the new line out of today's, plus exact counts), `test/preview.mjs` (two check names only).
- Browser (local servers, `host.localhost:5173` for the host with the code from the wrangler console): step 1 at 375 px light and dark and 1280 px light (line above Continue, disabled without a name; pressed: card made, Terms accepted, row `notice:welcome`); a guest connecting at 375 px light and dark (with a selfie: refused until ticked, no request sent; ticked: connected, Terms accepted, row `notice:connect`) and the guest sheet at 1280 px light; a first-time check-in at 375 px light and 1280 px dark (line in the Check in bar, checked in, Terms accepted); Host setup's Terms step at 375 px light and 1280 px dark (pressed: on to the organisation step, row with the host line; Back: no line, Continue). Already agreed, no line: step 1, the connect sheet, the check-in page and the host Terms step. Every link had `target="_blank"` and an underline; the pane itself loaded the Terms link in the same tab (it does not open new windows), so a real new tab was not seen. Not looked at: every place in all four size and theme combinations (listed above), and the Terms pop-up in a browser (tested on the server only). Public pages: every one slightly smaller (PublicCard 48,799 to 48,793 B, PrivacyRequest 51,096 to 51,090 B).
- Owner steps: none beyond the usual push and deploy (no migration, no secret; 0028's `wording` and `version` columns, which the new rows use, are in the 0018 to 0038 set still to apply).

Related: [[D012 18 plus only]] · [[D005 Shared selfie needs both consents]] · [[F45 Email when someone new connects]] · back to [[00 Master To-Do]]
