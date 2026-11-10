-- Institution picker (F12). Additive: old code ignores these columns.
-- institution_id is a slug from src/data/institutions-uk.json, or NULL for a
-- custom or empty entry. profiles.uni and orgs.university stay the display text.
ALTER TABLE profiles ADD COLUMN institution_id TEXT;
ALTER TABLE orgs ADD COLUMN institution_id TEXT;
