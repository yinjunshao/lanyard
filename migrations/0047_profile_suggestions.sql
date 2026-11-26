-- F75 (D064): details the Lanyard admin suggests for someone's card (for example found on LinkedIn). Nothing changes on
-- the card until the person accepts, field by field. Additive only, so it is safe to apply before the new code is
-- deployed: old code never reads these tables.
--
-- One open suggestion per person (user_id is the key); a new one replaces the old one.
--   id          new for every suggestion, so an Accept or Decline is for the one the person saw (one conditional write)
--   fields      JSON of only the suggested fields, in Edit profile's shape, already cleaned by its checks
--   photo_key   a suggested photo, stored under suggest/ (never served at /media), deleted with the row
--   source      where the admin found the details (for example "LinkedIn"), shown to the person
--   expires_at  30 days after it was made; the daily purge deletes it then, with its photo
--   emailed_at  when the one email about it went (NULL: no verified email, or not sent)
-- The row goes on Accept, on Decline, when the admin withdraws or replaces it, after 30 days and when the account is
-- erased (cascade). The values are not kept after a decision: only the counts below.
CREATE TABLE IF NOT EXISTS profile_suggestions (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  id         TEXT NOT NULL UNIQUE,
  fields     TEXT NOT NULL,
  photo_key  TEXT,
  source     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  emailed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_profile_suggestions_expires ON profile_suggestions(expires_at);

-- How suggestions ended, as counts per UTC day (accepted, declined, expired), for the admin page and the platform
-- metrics (F70). No account, field or value: only the number.
CREATE TABLE IF NOT EXISTS suggestion_counts (
  day     TEXT NOT NULL,
  outcome TEXT NOT NULL,
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, outcome)
);
