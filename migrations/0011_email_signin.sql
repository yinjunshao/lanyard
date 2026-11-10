-- Email sign-in: one-time codes emailed to a verified address, plus marketing consent.
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN marketing_optin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN marketing_at INTEGER;

-- A verified address belongs to exactly one account.
CREATE UNIQUE INDEX idx_users_verified_email ON users(recovery_email) WHERE email_verified = 1;

CREATE TABLE email_codes (
  email      TEXT NOT NULL,
  purpose    TEXT NOT NULL,              -- 'signin' | 'verify'
  user_id    TEXT NOT NULL DEFAULT '',   -- set for 'verify' (the account adding the address)
  code_hash  TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (email, purpose, user_id)
);
