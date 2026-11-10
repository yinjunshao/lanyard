-- Host accounts, organisation applications, ownership transfers and tickets.

-- The sign-up survey belongs to the person (they may run events under their
-- own name, with no organisation), so it moves off orgs onto host_profiles.
ALTER TABLE orgs DROP COLUMN use_case;
ALTER TABLE orgs DROP COLUMN event_frequency;
ALTER TABLE orgs DROP COLUMN typical_size;
ALTER TABLE orgs DROP COLUMN referral;

CREATE TABLE host_profiles (
  user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL UNIQUE,          -- lower-case; how transfers find a person
  full_name       TEXT NOT NULL,
  use_case        TEXT,
  event_frequency TEXT,
  typical_size    TEXT,
  referral        TEXT,
  created_at      INTEGER NOT NULL
);

-- Society / institution application details.
ALTER TABLE orgs ADD COLUMN leader_name  TEXT;
ALTER TABLE orgs ADD COLUMN leader_email TEXT;
ALTER TABLE orgs ADD COLUMN org_link     TEXT;
ALTER TABLE orgs ADD COLUMN university   TEXT;
ALTER TABLE orgs ADD COLUMN applied_at   INTEGER;
ALTER TABLE orgs ADD COLUMN reviewed_at  INTEGER;
ALTER TABLE orgs ADD COLUMN review_note  TEXT;

-- Org types are now society | institution | company | individual.
UPDATE orgs SET org_type = 'institution' WHERE org_type = 'careers_service';
UPDATE orgs SET org_type = 'individual'  WHERE org_type NOT IN ('society', 'institution', 'company');
-- Organisations that already exist are grandfathered in as approved.
UPDATE orgs SET verification_status = 'approved', reviewed_at = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE verification_status = 'pending';

-- Existing organisation owners who already gave a recovery email keep working.
INSERT OR IGNORE INTO host_profiles (user_id, email, full_name, created_at)
  SELECT u.id, lower(trim(u.recovery_email)), COALESCE(NULLIF(trim(p.name), ''), 'Host'), u.created_at
  FROM org_members m
  JOIN users u ON u.id = m.user_id
  LEFT JOIN profiles p ON p.user_id = u.id
  WHERE u.recovery_email IS NOT NULL AND trim(u.recovery_email) <> '';

-- Handing an organisation to another host account. The new owner must accept.
CREATE TABLE org_transfers (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  from_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  to_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_email     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted | declined | cancelled
  created_at   INTEGER NOT NULL,
  resolved_at  INTEGER
);
CREATE INDEX idx_org_transfers_org ON org_transfers(org_id);
CREATE INDEX idx_org_transfers_to  ON org_transfers(to_user_id, status);

-- Requests to an admin: leader change, email change, anything else.
CREATE TABLE host_tickets (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL,                      -- leader_change | email_change | other
  new_email   TEXT,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',       -- open | approved | rejected | resolved
  admin_note  TEXT,
  created_at  INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX idx_host_tickets_org ON host_tickets(org_id, status);
