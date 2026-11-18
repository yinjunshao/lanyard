-- Voucher QR codes and the staff scanner link (F40). Additive: two new tables, nothing existing is changed or
-- deleted, and old code never reads them, so this is safe to apply before the new code is deployed.
--
-- A person's voucher shows a QR code and the same code as 6 digits. The code is made the first time they open
-- the voucher (so "opened" can be counted) and is unique within the event, so a code typed or scanned at the
-- wrong voucher's scanner is recognised as the wrong voucher, never as somebody else's.
CREATE TABLE voucher_codes (
  drop_id    TEXT NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,                  -- six digits
  created_at INTEGER NOT NULL,
  PRIMARY KEY (drop_id, user_id),
  UNIQUE (event_id, code)
);
CREATE INDEX idx_voucher_codes_user ON voucher_codes(user_id);

-- The scanner link a host sends to staff, one per voucher. The link holds a random token; only its SHA-256 is
-- kept here. A new link replaces the old one. It works from 15 minutes before the voucher (or the event) starts
-- until 15 minutes after it ends, and not at all once the host stops it.
CREATE TABLE voucher_scanners (
  drop_id         TEXT PRIMARY KEY REFERENCES drops(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,
  host_account_id TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);
