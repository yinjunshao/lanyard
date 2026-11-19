---
tags: [roadmap, feature, security]
id: F43
priority: P1
phase: 8
size: M
status: Not started
needs: []
---
# F43 Manage passkeys

**Priority:** P1 · **Phase:** 8 Owner requests (2026-11-18) · **Size:** M · **Needs:** none · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-19)
"Let's add a feature to delete passkeys if possible, because I added passkey for like a the from one device and it says my passkey is saved everywhere and therefore I can't save multiple passkeys on different devices."

## Current state
- `src/views/settings/SettingsSecurity.vue`: "Add a passkey" shows only when `!me.user?.hasPasskey` (about line 38), so after the first passkey there is no way to add one on another device, and no list.
- `worker/passkeys.js`: register and login options and verify; `registerOptions` already sends `excludeCredentials` for the user's saved credentials (so the same authenticator is not saved twice). Routes are in `worker/index.js` about 396-412.
- No route lists or removes passkeys.

## Plan
1. `GET /api/passkeys`: the signed-in user's own passkeys: id (opaque), a name, created, last used, and whether it is the one this session signed in with (if known). Never the public key or counter.
2. `PATCH /api/passkeys/:id` `{ name }`: rename (1-40 characters, plain text). Default name from the authenticator (AAGUID to a known provider name if the library gives it, else the device type and date, for example "Passkey added 19 Nov 2026").
3. `DELETE /api/passkeys/:id`: remove one of your own. Refused (409, plain message) if it is your last way to sign in (no other passkey, no verified email, no recovery key, no authenticator app). Same-origin and session rules as other account changes; another user's id gives 404, not 403. Removing one does not sign out other sessions; say so.
4. Settings > Security: a "Passkeys" list (name, added, last used, "This device" if known) with Rename and Remove (Remove asks once in a small confirm sheet that uses F40's motion). "Add a passkey on this device" always shows when passkeys are supported. If the browser says this device already has one (`InvalidStateError` from `excludeCredentials`), say "This device already has a passkey for Lanyard. Use another device, or remove it first." Tell people that synced passkeys (phone or password manager) may appear on all their devices already.
5. Remove the passkey from the user's account only; the copy in their device or password manager stays, and the page says how to delete that too ("you can also delete it from your device's password settings").
6. Audit and data: a removed passkey row is deleted (not soft-deleted); the data export lists passkeys by name and dates; [[Privacy and Data Retention]] updated if needed.

## Tasks
- [ ] F43.1 Worker: list, rename, remove with the last-sign-in-method rule, `last_used_at` set on login if the column does not exist yet (new additive migration, next free number), tests in a new `test/passkeys-manage.mjs` wired into `npm test` before `test/budget.mjs`.
- [ ] F43.2 Settings > Security list, rename, remove confirm, "Add a passkey on this device" always on, the already-saved message; browser check; vault ([[API Surface]], [[Data Model]], [[Security]]).

## Acceptance checks
- [ ] A user with one passkey and a verified email can add a second passkey from another browser profile, sees both listed, and removes the first.
- [ ] A user whose only sign-in method is one passkey cannot remove it (409, message shown).
- [ ] User A deleting user B's passkey id gets 404 and B's passkey is still there.
- [ ] Signed out: 401 on all three routes. A cross-site request is refused as other account changes are.
- [ ] The list never contains the public key or counter (test checks the raw response).
- [ ] `npm test` passes.

## Log
-

Related: [[Security]] · back to [[00 Master To-Do]]
