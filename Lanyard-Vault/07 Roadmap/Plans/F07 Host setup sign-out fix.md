---
tags: [roadmap, feature, host, bug]
id: F07
priority: P0
phase: 0
size: S
status: Not started
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
- [ ] F07.1 Reproduce: start host signup, make a recovery key, close the tab, reopen. Write down the exact steps here.
- [ ] F07.2 Add Back and Sign out to every setup state, plus the `/host/signout` route.
- [ ] F07.3 Clear service-worker cache entries on logout (attendee logout too, in `Settings.vue`).
- [ ] F07.4 Test the repro steps now end with a clean signed-out host home.

## Acceptance checks
- [ ] From any host setup step, the owner can sign out in one tap and lands signed out.
- [ ] After sign out, reloading never shows the old setup step.

## Log
-

Related: [[Auth and Sessions]] · back to [[00 Master To-Do]]
