-- Per-person notes + which card a connection was made through.
--
-- card_notes: a note the card owner attaches to their QR for the NEXT person
-- they meet. The note's id is the unguessable token carried in the QR URL
-- (/c/:cardId?n=<token>). It is validated server-side when the scanner
-- connects, redeemed exactly once, and delivered into that scanner's
-- connection as a message from the owner. Unredeemed notes expire after 24h
-- (enforced in the worker) and vanish with the card (ON DELETE CASCADE).
CREATE TABLE card_notes (
  id          TEXT PRIMARY KEY,
  card_id     TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  redeemed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  redeemed_at INTEGER
);
CREATE INDEX idx_card_notes_card ON card_notes(card_id);

-- Remember which card was scanned, so the Person page shows only the links
-- and tags that card permitted — not the owner's whole profile.
ALTER TABLE connections ADD COLUMN card_id TEXT;
