-- F59: feature stages and tutorials (D055). Additive only: two new tables, nothing changed, so it is safe to apply
-- before the new code is deployed (old code never reads either).
--
-- user_stages: one row per person per tutorial they have been shown, so a tutorial shows once per account
--   (on any device) and at most one a day (the newest seen_at says whether one was shown today).
--   stage     one of the ids in worker/stages.js (STAGES); the route refuses any other
--   seen_at   when the tutorial started
--   outcome   NULL while it is running or was left without a choice, then 'finished' or 'skipped'
--   Deleted with the account (cascade), in the data download, and cleared by "Show tips again" in Settings > Help.
-- stage_stats: the admin funnel, daily counts per stage and nothing about who (like onboarding_stats).
CREATE TABLE IF NOT EXISTS user_stages (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  outcome TEXT,
  PRIMARY KEY (user_id, stage)
);
CREATE INDEX IF NOT EXISTS user_stages_seen ON user_stages(user_id, seen_at);

CREATE TABLE IF NOT EXISTS stage_stats (
  day TEXT NOT NULL,
  stage TEXT NOT NULL,
  shown INTEGER NOT NULL DEFAULT 0,
  finished INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, stage)
);
