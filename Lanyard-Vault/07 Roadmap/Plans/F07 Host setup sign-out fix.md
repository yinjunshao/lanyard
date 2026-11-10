---
tags: [roadmap, feature, host, bug]
id: F07
priority: P0
phase: 0
size: S
status: In progress
needs: []
---
# F07 Host setup sign-out fix

**Priority:** P0 (the owner is stuck right now) · **Phase:** 0 Quick fixes · **Size:** S · **Needs:** nothing · back to [[00 Master To-Do]]

## Bug
If a half-finished host account setup is remembered in the browser, the owner can't go back or log out of the host portal.

## Likely cause (check before fixing)
- `src/views/HostDashboard.vue` has setup states `account`, `terms`, `profile` and `welcome`. None of them shows a sign-out button. The only way out is the "‹ lanyard" link, and on the host site that goes to the main site, where the session cookie is a different one (sessions are per hostname, see [[D014 Separate host subdomain]]). So the host session survives, and the next visit drops back into the same half-finished step.
- An account counts as a "host user" once it has any sign-in method (`hostUser()` in `worker/hosts.js`: passkey, recovery key, TOTP or verified email). A recovery key made in the "No passkey? Use a recovery key" path creates that state before the profile is saved, so the user is locked into `profile`.
- The service worker answers `/api/me?boot=1` from cache on slow networks (`networkFirstFast` in `sw.js`), which can show a stale state after logout.

## Fix (stopgap until [[F10 Separate host accounts on host subdomain]])
- Every host setup state shows a small header row: "‹ Back to Lanyard" and "Sign out".
- "Sign out" calls `Api.logout()`, clears the service-worker cache entries for `/api/me` and `/api/host/me` (`caches.open(...)` then `delete`), clears session-scoped local keys, and reloads to the host home.
- Add a `/host/signout` route that does the same, so a stuck owner can type it.

## Tasks
- [x] F07.1 Reproduce: start host signup, make a recovery key, close the tab, reopen. Write down the exact steps here.

### F07.1 Reproduction and confirmed cause (2026-11-10, by reading the code and an offline test)
Exact steps (also run as `test/hostsetup.mjs`, wired into `npm test`):
1. On the host site, open `/host` signed out. `GET /api/host/me` returns `account_required`, so `HostDashboard.vue` shows the `account` step.
2. Tap "No passkey on this device? Use a recovery key instead". `createWithKey()` calls `POST /api/auth/recovery` **first**. That sets `users.has_recovery = 1`, so `hostUser()` and the host middleware now treat the account as a host user.
3. `createWithKey()` then calls `Api.hostAcceptTerms()` and `saveDetails()`. If either fails or the tab is closed before it finishes (the key is on screen, the person is told to save it, and may leave), the account has a recovery key but no `host_profiles` row.
4. Reopen `/host`. The session cookie is still valid. `/api/host/me` answers `terms_required` or `profile_required`, so the page shows the `terms` or `profile` step. Every reload gives the same answer, because the browser's only memory is the cookie and the cookie is never cleared.
5. No setup step (`account`, `terms`, `profile`, `welcome`) has a sign-out control. The only exit is the "‹ lanyard" link, which goes to the main site (`MAIN_ORIGIN`). Sessions are per hostname, so that does not touch the host-site cookie. The person comes back to the same step. Confirmed in the test: after `POST /api/logout` the same client gets `account_required` (clean start), and the recovery key signs them back in to the `profile` step, so nothing is lost by signing out.

Confirmed cause: the missing exit, as the note guessed. The server side behaves correctly (the lock is by design: terms and profile are needed before anything else, and `POST /api/logout` works from every state).

Parts of "Likely cause" that were **not** right:
- The service worker is not part of the trap. `public/sw.js` only caches `GET /api/me`. Every other `/api/` path, including `/api/host/me` which drives the setup step, goes straight to the network. So there is nothing at `/api/host/me` to clear. The `/api/me` copy is already cleared by `Api.logout()` (`clearOfflineData()`). F07.3 therefore only needs to make sure the attendee logout and the new host sign-out both clear it and that it still runs if the page is reloaded straight after.
- A recovery key does not need to be made "before the profile is saved" to get stuck: any account with a sign-in method and no profile (for example one made before profiles were asked for) is in the same state.
- [x] F07.2 Add Back and Sign out to every setup state, plus the `/host/signout` route.
- [x] F07.3 Clear service-worker cache entries on logout (attendee logout too, in `Settings.vue`).
  - Both the attendee logout (`Settings.vue`) and the host sign-out go through `Api.logout()`, which already deleted the `lanyard-data-*` caches. The gap was that it only did so when the logout request succeeded. It now clears them in a `finally`, so a failed request (no signal) can't leave the old `/api/me` badge cached. `/api/host/me` is never cached by `sw.js`, so there is nothing to delete for it.
- [ ] F07.4 Test the repro steps now end with a clean signed-out host home.

## Acceptance checks
- [ ] From any host setup step, the owner can sign out in one tap and lands signed out.
- [ ] After sign out, reloading never shows the old setup step.

## Log
-

Related: [[Auth and Sessions]] · back to [[00 Master To-Do]]
