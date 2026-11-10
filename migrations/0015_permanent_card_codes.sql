-- Card codes no longer rotate: each card keeps its code, so it can be printed.
-- Plus members can choose their own code once a week (code_custom = 1 marks a
-- chosen one; code_changed_at is when it was last chosen).
ALTER TABLE cards ADD COLUMN code_custom INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN code_changed_at INTEGER;

-- Every card's current code becomes permanent.
INSERT OR REPLACE INTO card_codes (code, card_id, valid_until)
  SELECT code, id, 9007199254740991 FROM cards WHERE code IS NOT NULL;
UPDATE cards SET code_rotates_at = NULL;
