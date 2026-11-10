-- UK GDPR work (audit 2026-11-01).

-- 1. Shared selfies: the other person has to accept. selfie_by is who took it,
--    consent_b / consent_b_at is the other person's acceptance. Until then the
--    photo is "pending" and is deleted after 7 days.
ALTER TABLE connections ADD COLUMN selfie_by TEXT;
ALTER TABLE connections ADD COLUMN selfie_at INTEGER;
ALTER TABLE connections ADD COLUMN consent_b_at INTEGER;
-- Selfies that exist today were never accepted by the second person. They start
-- as pending now, so each gets a fresh 7 days to be accepted or removed.
UPDATE connections SET selfie_by = user_a, selfie_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE selfie_key IS NOT NULL;

-- 2. Consent history that outlives the account (no foreign key on purpose): the
--    proof of what was agreed and when, including withdrawals. Kept 6 years.
CREATE TABLE consent_log (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  scope   TEXT NOT NULL,                 -- 'terms:<version>' | 'selfie' | 'marketing' | 'selfie_accept' ...
  action  TEXT NOT NULL,                 -- 'granted' | 'withdrawn'
  ref     TEXT,                          -- e.g. the connection id
  at      INTEGER NOT NULL
);
CREATE INDEX idx_consent_log_user ON consent_log(user_id);
INSERT INTO consent_log (id, user_id, scope, action, ref, at)
  SELECT id, user_id, scope, 'granted', NULL, created_at FROM consents WHERE granted = 1;
INSERT INTO consent_log (id, user_id, scope, action, ref, at)
  SELECT lower(hex(randomblob(8))), id, 'marketing', 'granted', NULL, marketing_at FROM users WHERE marketing_optin = 1 AND marketing_at IS NOT NULL;

-- 3. Privacy requests and complaints, with the 30-day acknowledgement deadline.
CREATE TABLE privacy_requests (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,         -- 'complaint' | 'access' | 'erasure' | 'other'
  user_id         TEXT,                  -- if they were signed in
  email           TEXT NOT NULL,
  message         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'closed'
  created_at      INTEGER NOT NULL,
  acknowledged_at INTEGER,               -- we email straight away; this is when
  respond_by      INTEGER NOT NULL,      -- created_at + 30 days (a month for access/erasure)
  closed_at       INTEGER,
  outcome         TEXT
);
CREATE INDEX idx_privacy_requests_status ON privacy_requests(status, created_at);

-- 4. What the admin page was used for (who, what, from where). Kept 12 months.
CREATE TABLE admin_audit (
  id     TEXT PRIMARY KEY,
  at     INTEGER NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  ip     TEXT
);

-- 5. Inactive accounts: last time the account was used, and when we warned them.
ALTER TABLE users ADD COLUMN last_seen_at INTEGER;
ALTER TABLE users ADD COLUMN inactive_warned_at INTEGER;
UPDATE users SET last_seen_at = COALESCE((SELECT MAX(created_at) FROM sessions s WHERE s.user_id = users.id), created_at);
