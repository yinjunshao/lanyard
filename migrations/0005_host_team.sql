-- Team invites for host organisations.
CREATE TABLE org_invites (
  code       TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'staff',
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_org_invites_org ON org_invites(org_id);
