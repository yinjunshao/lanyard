-- F70: one row a day of platform totals for the admin page and the CSV export. Additive only: one new table,
-- safe to apply before the new code is deployed (nothing reads it until the admin routes and the nightly job exist).
-- `data` is a JSON object of flat numbers (counts, percentages, pence): nothing about any one person, no id, name,
-- email or text. It has no foreign key and is not touched by the daily purge or by erasing an account, so the
-- history stays as it was when it was taken.
CREATE TABLE IF NOT EXISTS metrics_daily (
  day       TEXT PRIMARY KEY,     -- 'YYYY-MM-DD', the UTC day the row was taken
  taken_at  INTEGER NOT NULL,     -- unix ms
  version   INTEGER NOT NULL,     -- METRICS_VERSION in worker/metrics.js, bumped when a metric's meaning changes
  data      TEXT NOT NULL         -- JSON object of the flat metrics
);
