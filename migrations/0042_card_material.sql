-- F56: a Plus card's strap material (gold, silver, rose-gold, copper, pearl or carbon). Additive only, safe to apply before the
-- new code is deployed: a nullable column, empty (NULL) for every card that exists, which means "no material, the strap colour shows".
-- The Worker keeps one of the six exact ids, only for a Plus account (worker/cardcolour.js); a lapsed Plus account keeps what it saved
-- and may clear it. Nothing here rewrites any row.
ALTER TABLE cards ADD COLUMN material TEXT;
