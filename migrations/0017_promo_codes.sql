-- Promo codes (/redeem): each one grants Lanyard Plus for `days`, to the first
-- `max_uses` people (NULL = no limit). Everyone who tries gets a place in the
-- queue (position), so the 51st person can be told they were 51st.
CREATE TABLE promo_codes (
  code       TEXT PRIMARY KEY,               -- upper case, e.g. FIRST50
  reward     TEXT NOT NULL DEFAULT 'plus',
  days       INTEGER NOT NULL,               -- Plus for this many days
  max_uses   INTEGER,                        -- NULL = unlimited
  uses       INTEGER NOT NULL DEFAULT 0,     -- people who got the reward
  attempts   INTEGER NOT NULL DEFAULT 0,     -- people who tried (each person once)
  starts_at  INTEGER,
  expires_at INTEGER,
  active     INTEGER NOT NULL DEFAULT 1,
  note       TEXT,                           -- for us: where this code was printed
  created_at INTEGER NOT NULL
);

CREATE TABLE promo_claims (
  code       TEXT NOT NULL REFERENCES promo_codes(code) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,               -- 1 = first person to try this code
  granted    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (code, user_id)
);
CREATE INDEX idx_promo_claims_user ON promo_claims(user_id);

-- The campus poster code: a year of Plus for the first 50 people.
INSERT OR IGNORE INTO promo_codes (code, reward, days, max_uses, note, created_at)
VALUES ('FIRST50', 'plus', 365, 50, 'Campus poster, Nov 2026', CAST(strftime('%s','now') AS INTEGER) * 1000);
