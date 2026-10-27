-- Invoice records must survive deletion of the person who raised them (kept
-- 6 years for accounting). Rebuild billing_requests so user_id is nullable and
-- becomes NULL, rather than the row cascading away, when the user is deleted.
PRAGMA foreign_keys = OFF;
CREATE TABLE billing_requests_new (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  sku           TEXT NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  amount_pence  INTEGER NOT NULL,
  contact_email TEXT NOT NULL,
  po_number     TEXT,
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'open',
  created_at    INTEGER NOT NULL
);
INSERT INTO billing_requests_new SELECT id, org_id, user_id, sku, quantity, amount_pence, contact_email, po_number, note, status, created_at FROM billing_requests;
DROP TABLE billing_requests;
ALTER TABLE billing_requests_new RENAME TO billing_requests;
CREATE INDEX idx_billing_requests_org ON billing_requests(org_id);
PRAGMA foreign_keys = ON;
