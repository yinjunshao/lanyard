-- F43: let people name their passkeys and see when each was last used.
-- Additive only; both columns are NULL for passkeys saved before this (the app
-- then shows "Passkey added <date>" and "Not used yet"), so it is safe to apply
-- before the new code is deployed.
ALTER TABLE webauthn_credentials ADD COLUMN name TEXT;
ALTER TABLE webauthn_credentials ADD COLUMN last_used_at INTEGER;
