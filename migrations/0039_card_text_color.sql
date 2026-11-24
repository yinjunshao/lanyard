-- F55.3: a Plus card's own text colour. Additive only, safe to apply before the new code is deployed:
-- a nullable column, empty (NULL) for every card that exists, which means "the theme's usual text colour".
-- The Worker keeps it as #RRGGBB, only for a Plus account, and only if it reads at 3:1 or better on the card's paper
-- (worker/cardcolour.js). A lapsed Plus account keeps what it saved; nothing here rewrites it.
ALTER TABLE cards ADD COLUMN text_color TEXT;
