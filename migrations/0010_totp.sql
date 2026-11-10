-- Authenticator-app (TOTP) sign-in as a passkey backup. The secret is stored
-- encrypted when the TOTP_KEY secret is set. last_step blocks code replay.
CREATE TABLE totp_secrets (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret     TEXT NOT NULL,
  confirmed  INTEGER NOT NULL DEFAULT 0,
  last_step  INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
ALTER TABLE users ADD COLUMN has_totp INTEGER NOT NULL DEFAULT 0;
