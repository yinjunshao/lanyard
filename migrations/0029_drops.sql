-- Drops for codes, keys and vouchers (F32). Additive: old code never reads these tables, so this is
-- safe to apply before the new code is deployed. Nothing existing is changed or deleted.
--
-- A drop belongs to one event. Its host pastes items (API keys, codes, links) or sets a voucher;
-- checked-in attendees reveal their own. Items are secrets: `cipher` holds AES-GCM ciphertext made
-- with the Worker secret DROP_KEY (worker/dropcrypto.js), never the plain value. Hosts see counts.

CREATE TABLE drops (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                 -- same | one_each | random | voucher
  title       TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',      -- the host's line shown with it ("Paste this into the portal")
  reuse       INTEGER NOT NULL DEFAULT 0,    -- random only: 1 = the same item may go to several people
  per_person  INTEGER NOT NULL DEFAULT 1,    -- voucher only: uses each person has
  valid_from  INTEGER,                       -- nothing is given (or used) before / from these moments
  valid_until INTEGER,
  status      TEXT NOT NULL DEFAULT 'on',    -- on | stopped (a stopped drop gives nothing new)
  pin_mac     TEXT,                          -- voucher only: HMAC of the staff PIN, never the PIN
  check_cipher TEXT,                         -- a fixed phrase sealed with the key, opened before an item is given, so a wrong key refuses instead of using one up
  -- Set by the retention purge (30 days after the event ends): the lists and uses are gone, the counts stay.
  purged_at   INTEGER,
  final_loaded INTEGER,
  final_given  INTEGER,
  final_used   INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_drops_event ON drops(event_id);

-- One row per pasted item. `seq` is its place in the host's list (what the host sees instead of a value).
CREATE TABLE drop_items (
  id         TEXT PRIMARY KEY,
  drop_id    TEXT NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  cipher     TEXT NOT NULL,                  -- v1.<base64url(iv + ciphertext + tag)>; '' once withdrawn
  created_at INTEGER NOT NULL,
  UNIQUE (drop_id, seq)
);

-- Who was given what. One row per person per drop (the unique constraint), and for a drop where an item
-- goes to one person only (exclusive = 1) one row per item (the partial unique index below). The give is a
-- single conditional INSERT, so two presses or a crowd racing for the last items cannot break either rule.
CREATE TABLE drop_gives (
  id         TEXT PRIMARY KEY,               -- an opaque handle the host's named view uses for "revoke"
  drop_id    TEXT NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id    TEXT NOT NULL REFERENCES drop_items(id) ON DELETE CASCADE,
  exclusive  INTEGER NOT NULL DEFAULT 0,
  given_at   INTEGER NOT NULL,
  revoked_at INTEGER,
  UNIQUE (drop_id, user_id)
);
CREATE UNIQUE INDEX uq_drop_gives_item ON drop_gives(item_id) WHERE exclusive = 1;
CREATE INDEX idx_drop_gives_user ON drop_gives(user_id);

-- An item that went to one person must never go to anyone else, so when that person's give row goes for any
-- reason (their account is deleted, a cascade) the item goes with it, rather than becoming "unused" again.
CREATE TRIGGER drop_gives_exclusive_gone AFTER DELETE ON drop_gives
WHEN OLD.exclusive = 1
BEGIN
  DELETE FROM drop_items WHERE id = OLD.item_id;
END;

-- Each use of a voucher: use number n of a person's per_person uses, and when. The primary key plus a
-- single conditional INSERT means a voucher is used at most per_person times, whatever the timing.
CREATE TABLE voucher_uses (
  drop_id  TEXT NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  n        INTEGER NOT NULL,
  used_at  INTEGER NOT NULL,
  PRIMARY KEY (drop_id, user_id, n)
);
CREATE INDEX idx_voucher_uses_user ON voucher_uses(user_id);

-- What a host did that touches secrets or other people: downloading the unused items, deleting, revoking, a new
-- staff PIN. No item values, no names. Kept for a year with the other audit logs.
CREATE TABLE drop_audit (
  id              TEXT PRIMARY KEY,
  event_id        TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  drop_id         TEXT NOT NULL,
  host_account_id TEXT NOT NULL,
  action          TEXT NOT NULL,
  n               INTEGER NOT NULL DEFAULT 0,
  at              INTEGER NOT NULL
);
CREATE INDEX idx_drop_audit_event ON drop_audit(event_id);
