-- F66 (D061): company branding on paid events. Additive only, so it is safe to apply before the new code is deployed:
-- old code never reads these columns, and every existing organisation and event looks as it did.
--   orgs.brand_name          the display name shown on event pages (cleaned, 60 characters); NULL = none set
--   orgs.brand_logo_key      the logo in R2, logo/<org id>/<random>.<png|jpg|webp>; NULL = no logo
--   orgs.brand_logo_version  goes up by one with each new logo, and is in the logo's address so a cache never shows an old one
--   orgs.brand_off           1 when a Lanyard admin switched the organisation's branding off (moderation); the host cannot undo it
--   events.use_branding      the host's "Use our company branding" switch for one event, on unless switched off; branding
--                            shows only when the event is also paid (events.is_paid)
ALTER TABLE orgs ADD COLUMN brand_name TEXT;
ALTER TABLE orgs ADD COLUMN brand_logo_key TEXT;
ALTER TABLE orgs ADD COLUMN brand_logo_version INTEGER;
ALTER TABLE orgs ADD COLUMN brand_off INTEGER NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN use_branding INTEGER NOT NULL DEFAULT 1;

-- A logo the database no longer points at is waiting here to be deleted from R2. The two triggers put it here whenever
-- an organisation's logo is replaced or removed, and whenever an organisation is deleted (the host reset, or any later
-- route), so no path can leave one behind. The routes delete the object at once and clear the row; the daily clean-up
-- (worker/purge.js) deletes whatever is left.
CREATE TABLE media_deletes (
  key       TEXT PRIMARY KEY,
  queued_at INTEGER NOT NULL
);

CREATE TRIGGER orgs_logo_replaced AFTER UPDATE OF brand_logo_key ON orgs
WHEN OLD.brand_logo_key IS NOT NULL AND (NEW.brand_logo_key IS NULL OR NEW.brand_logo_key != OLD.brand_logo_key)
BEGIN
  INSERT OR IGNORE INTO media_deletes (key, queued_at) VALUES (OLD.brand_logo_key, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
END;

CREATE TRIGGER orgs_logo_org_gone AFTER DELETE ON orgs
WHEN OLD.brand_logo_key IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO media_deletes (key, queued_at) VALUES (OLD.brand_logo_key, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
END;
