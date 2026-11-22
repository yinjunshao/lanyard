-- F45: a new person gives an email when they connect or make a card. It is kept
-- unconfirmed in pending_email until they open the link in our first email; it is
-- never unique, never shown to anyone else and never used to sign in (sign-in reads
-- only recovery_email). pending_mails counts the emails sent to it while unconfirmed
-- (at most two). tz is the browser's IANA time zone, for F49's quiet hours.
-- Additive only: every column is NULL or 0 for existing accounts, so it is safe to
-- apply before the new code is deployed.
ALTER TABLE users ADD COLUMN pending_email TEXT;
ALTER TABLE users ADD COLUMN pending_email_at INTEGER;
ALTER TABLE users ADD COLUMN pending_mails INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN tz TEXT;

-- One row per confirm link sent. Only a SHA-256 of the link's secret is kept; a row
-- is deleted when it is used, when the address is confirmed or changed, and by the
-- daily purge once it has expired (14 days).
CREATE TABLE email_confirms (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX idx_email_confirms_user ON email_confirms(user_id);
CREATE INDEX idx_users_pending_email_at ON users(pending_email_at) WHERE pending_email IS NOT NULL;
