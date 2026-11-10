-- F10: host accounts separate from attendee accounts.
--
-- Adds only. Every existing table and row is kept, so this is safe to apply on
-- production before the host reset (scripts/reset-hosts.mjs) runs: the old
-- host tables (host_profiles, org_members, org_transfers, org_invites,
-- host_tickets) stay as they are and the code that ships with this migration
-- stops reading them. The reset empties them; a later migration can drop them.
-- billing_requests is rebuilt with every row copied (see the end).

-- A host account: an email address that has received a sign-in code. Nothing
-- here points at users: a person can have a card and a host account, or either.
CREATE TABLE host_accounts (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,            -- lower-case
  email_verified_at INTEGER,
  full_name         TEXT,                            -- NULL until the details step
  use_case          TEXT,
  event_frequency   TEXT,
  typical_size      TEXT,
  referral          TEXT,
  terms_version     TEXT,                            -- Host Terms version agreed to
  terms_at          INTEGER,
  status            TEXT NOT NULL DEFAULT 'active',  -- active | disabled
  created_at        INTEGER NOT NULL,
  last_login_at     INTEGER,
  deleted_at        INTEGER
);

-- Host sessions: the id is the SHA-256 of the cookie token, as for sessions.
CREATE TABLE host_sessions (
  id              TEXT PRIMARY KEY,
  host_account_id TEXT NOT NULL REFERENCES host_accounts(id) ON DELETE CASCADE,
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,
  user_agent      TEXT
);
CREATE INDEX idx_host_sessions_account ON host_sessions(host_account_id);
CREATE INDEX idx_host_sessions_expires ON host_sessions(expires_at);

-- Email sign-in codes for the host site: one live code per address, stored
-- hashed, 10 minutes, 5 tries, single use.
CREATE TABLE host_login_codes (
  email      TEXT PRIMARY KEY,
  code_hash  TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);

-- The organisation tables, pointing at host accounts instead of users.
CREATE TABLE host_org_members (
  org_id          TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  host_account_id TEXT NOT NULL REFERENCES host_accounts(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'owner',   -- owner | staff | sponsor_viewer
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (org_id, host_account_id)
);
CREATE INDEX idx_host_org_members_account ON host_org_members(host_account_id);

CREATE TABLE host_org_transfers (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  from_host_id TEXT REFERENCES host_accounts(id) ON DELETE SET NULL,
  to_host_id   TEXT NOT NULL REFERENCES host_accounts(id) ON DELETE CASCADE,
  to_email     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',    -- pending | accepted | declined | cancelled
  created_at   INTEGER NOT NULL,
  resolved_at  INTEGER
);
CREATE INDEX idx_host_org_transfers_org ON host_org_transfers(org_id);
CREATE INDEX idx_host_org_transfers_to  ON host_org_transfers(to_host_id, status);

-- Team invites. With an email, only the host account with that email can use it.
CREATE TABLE host_org_invites (
  code       TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'staff',
  email      TEXT,
  created_by TEXT NOT NULL REFERENCES host_accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_host_org_invites_org ON host_org_invites(org_id);

CREATE TABLE host_org_tickets (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  host_account_id TEXT REFERENCES host_accounts(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL,                   -- leader_change | email_change | other
  new_email       TEXT,
  message         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',    -- open | approved | rejected | resolved
  admin_note      TEXT,
  created_at      INTEGER NOT NULL,
  resolved_at     INTEGER
);
CREATE INDEX idx_host_org_tickets_org ON host_org_tickets(org_id, status);

-- The event recap to the owner, sent once per event. (event_mail_log.user_id
-- points at users, so host mail can't go there.)
CREATE TABLE host_mail_log (
  event_id        TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,                   -- host_summary
  host_account_id TEXT,
  sent_at         INTEGER NOT NULL,
  PRIMARY KEY (event_id, kind)
);

-- Invoice records are kept for 6 years, even when the organisation goes (the
-- reset deletes organisations). Rebuild billing_requests so org_id becomes NULL
-- instead of the row cascading away, keep the organisation's name on the row,
-- and add who raised it on the new model. Every row is copied.
CREATE TABLE billing_requests_new (
  id              TEXT PRIMARY KEY,
  org_id          TEXT REFERENCES orgs(id) ON DELETE SET NULL,
  org_name        TEXT,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,          -- before F10
  host_account_id TEXT REFERENCES host_accounts(id) ON DELETE SET NULL,  -- from F10
  sku             TEXT NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 1,
  amount_pence    INTEGER NOT NULL,
  contact_email   TEXT NOT NULL,
  po_number       TEXT,
  note            TEXT,
  status          TEXT NOT NULL DEFAULT 'open',
  created_at      INTEGER NOT NULL
);
INSERT INTO billing_requests_new (id, org_id, org_name, user_id, host_account_id, sku, quantity, amount_pence, contact_email, po_number, note, status, created_at)
  SELECT b.id, b.org_id, (SELECT o.name FROM orgs o WHERE o.id = b.org_id), b.user_id, NULL,
         b.sku, b.quantity, b.amount_pence, b.contact_email, b.po_number, b.note, b.status, b.created_at
  FROM billing_requests b;
DROP TABLE billing_requests;
ALTER TABLE billing_requests_new RENAME TO billing_requests;
CREATE INDEX idx_billing_requests_org ON billing_requests(org_id);
