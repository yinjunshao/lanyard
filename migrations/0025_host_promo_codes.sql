-- F20: promo codes for hosts that give event credits.
--
-- Adds only, so it is safe to apply on production before the new code is
-- deployed. The code that is live today never reads the new columns, and no
-- host code exists until an admin makes one with the new code, so nothing
-- changes for attendees: every existing row keeps audience 'user'.

-- One table of codes, two audiences. 'user' codes (F04) give an attendee Lanyard
-- Plus for `days`. 'host' codes give an organisation `credits` event credits
-- that last `credit_days`. A host code has reward 'credits', and always a
-- limit (max_uses): credits are spent on events, so a host code is never
-- unlimited. `days` stays NOT NULL, so a host code stores credit_days there too.
-- org_kinds, when set, is a JSON list such as ["society"]: only those kinds of
-- organisation may use the code.
ALTER TABLE promo_codes ADD COLUMN audience    TEXT NOT NULL DEFAULT 'user';  -- user | host
ALTER TABLE promo_codes ADD COLUMN credits     INTEGER;                       -- host codes: event credits
ALTER TABLE promo_codes ADD COLUMN credit_days INTEGER;                       -- host codes: how long they last
ALTER TABLE promo_codes ADD COLUMN org_kinds   TEXT;                          -- host codes: JSON list, NULL = any

-- Who took a host code, and what they were given. A code is used once per
-- organisation and once per host account, so one person cannot farm credits by
-- making five organisations. Every claim takes a slot at once (it is counted in
-- promo_codes.uses in the same transaction); credits are issued at once when
-- the organisation is approved, and when an admin approves it otherwise (credit_id
-- stays NULL, "held"). credits and credit_days are copied from the code at claim
-- time, so a later edit never changes a claim that is waiting.
-- org_id becomes NULL if the organisation is deleted (the host account can still
-- not claim the code again); the claim goes only with the host account.
CREATE TABLE host_promo_claims (
  claim_id        TEXT PRIMARY KEY,
  code            TEXT NOT NULL REFERENCES promo_codes(code) ON DELETE CASCADE,
  org_id          TEXT REFERENCES orgs(id) ON DELETE SET NULL,
  host_account_id TEXT NOT NULL REFERENCES host_accounts(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,                 -- 1 = the first claim of this code
  credits         INTEGER NOT NULL,
  credit_days     INTEGER NOT NULL,
  credit_id       TEXT,                             -- the credits row; NULL while held
  created_at      INTEGER NOT NULL,
  granted_at      INTEGER
);
CREATE UNIQUE INDEX uq_host_promo_claims_org  ON host_promo_claims(code, org_id);
CREATE UNIQUE INDEX uq_host_promo_claims_host ON host_promo_claims(code, host_account_id);
CREATE INDEX idx_host_promo_claims_org  ON host_promo_claims(org_id);
CREATE INDEX idx_host_promo_claims_host ON host_promo_claims(host_account_id);
