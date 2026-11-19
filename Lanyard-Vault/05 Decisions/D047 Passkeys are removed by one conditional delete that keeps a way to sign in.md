---
tags: [decision, security, auth]
status: Accepted
date: 2026-11-19
---
# D047 Passkeys are removed by one conditional delete that keeps a way to sign in

**Status:** Accepted  ·  **Date:** 2026-11-19

## Context
[[F43 Manage passkeys]]: the owner could not add a passkey on a second device (Settings hid the button once one existed) and could not remove one. Removing a passkey changes how a person signs in, so a mistake could lock someone out or let one account touch another's credentials.

## Decision
- **Own rows only, 404 otherwise.** Every query carries `user_id = ?`. Another person's id and an id that does not exist give the same 404 and words, so ids cannot be probed. Signed out is 401 and mints no guest account (`/api/passkeys` is a no-guest route).
- **Never lock yourself out.** `DELETE /api/passkeys/:id` is one conditional `DELETE`: it runs only if the person has another passkey, or a verified email, a recovery key or an authenticator app. Otherwise 409 (`last_method`) with plain words. Being one statement, two removals racing for the last two passkeys cannot both pass (tested 8 times under `withLatency`). `users.has_passkey` is recomputed in the same batch.
- **Opaque ids, no key material.** The list uses the row id, not the credential id, and returns only name, added and last-used. The data export lists name and dates only.
- **Names are plain text.** 1 to 40 characters after trimming; control, zero-width, direction-override characters and angle brackets are removed (not rejected); over-length is 400. The page prints names as text.
- **Removing keeps sessions.** No session is ended, this one or others. The copy on a device or in a password manager is not touched; the confirm sheet says it can be deleted there too.
- **No "This device" label.** A session does not record which passkey made it, and a browser cannot say whether a passkey is on this device, so the label would be a guess. The page says instead that a passkey saved to a phone or password manager may already work on other devices, and a browser's `InvalidStateError` becomes "This device already has a passkey for Lanyard...".
- **No default name from the authenticator.** The library gives no provider name we trust; an unnamed passkey shows as "Passkey added 19 Nov 2026" (made on the page from its date, not stored).
- **Migration 0035** adds nullable `name` and `last_used_at`. Login records the last use in a separate statement that may fail, so signing in never depends on the migration.

## Consequences
- A person with only a passkey must add another way first. The message names the ways.
- No email is sent when a passkey is removed (the session is the person's own). Worth adding if account takeover alerts are extended.
- Removing the last passkey with another method present makes `hasPasskey` false, so the Settings line shows the next method.

**Evidence:** `worker/passkeys.js` (`listPasskeys`, `renamePasskey`, `removePasskey`), `worker/index.js`, `src/components/PasskeyList.vue`, `test/passkeys-manage.mjs`

Related: [[Security]], [[API Surface]], [[Data Model]] · back to [[Decision Log]]
