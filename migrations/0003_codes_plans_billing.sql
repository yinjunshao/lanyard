-- 0003: rotating card codes, wrong-guess throttling, personal plans, host billing.

-- ---------- Rotating card codes ----------
ALTER TABLE cards ADD COLUMN code_rotates_at INTEGER;

CREATE TABLE card_codes (
  code        TEXT PRIMARY KEY,                 -- current code + old codes still in grace
  card_id     TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  valid_until INTEGER NOT NULL
);
CREATE INDEX idx_card_codes_card ON card_codes(card_id);

-- Existing codes get one full cycle (3 days + 6h grace) from now.
INSERT INTO card_codes (code, card_id, valid_until)
  SELECT code, id, (CAST(strftime('%s','now') AS INTEGER) + 259200 + 21600) * 1000
  FROM cards WHERE code IS NOT NULL;
UPDATE cards
  SET code_rotates_at = (CAST(strftime('%s','now') AS INTEGER) + 259200) * 1000
  WHERE code IS NOT NULL;

-- ---------- Wrong-guess throttling ----------
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

-- ---------- Personal plan ----------
ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';   -- free | plus
ALTER TABLE users ADD COLUMN plan_until INTEGER;

CREATE TABLE plus_waitlist (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

-- ---------- Host billing (invoice / PO first, Stripe later) ----------
ALTER TABLE orgs ADD COLUMN billing_email TEXT;
ALTER TABLE orgs ADD COLUMN stripe_customer_id TEXT;

CREATE TABLE billing_requests (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sku           TEXT NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  amount_pence  INTEGER NOT NULL,
  contact_email TEXT NOT NULL,
  po_number     TEXT,
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'open',    -- open | invoiced | paid | cancelled
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_billing_requests_org ON billing_requests(org_id);
