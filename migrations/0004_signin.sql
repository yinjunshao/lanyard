-- Sign-in beyond passkeys: one-time device-link codes and recovery keys.
CREATE TABLE login_codes (
  code       TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_login_codes_user ON login_codes(user_id);

CREATE TABLE recovery_keys (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  key_hash   TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

ALTER TABLE users ADD COLUMN has_recovery INTEGER NOT NULL DEFAULT 0;
