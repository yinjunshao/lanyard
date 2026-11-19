-- What each person in a connection shares with the other: which of their cards, and which of that card's links.
-- The card owner shares the card that was scanned. The scanner picks one of their own cards and the links on it in the
-- connect sheet (before this, they silently shared their default card with every link on it). links is a JSON list of
-- link labels, or NULL for every link the card shows. With no row, the old rule applies (worker/shares.js).
CREATE TABLE connection_shares (
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id       TEXT NOT NULL,
  links         TEXT,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (connection_id, user_id)
);
