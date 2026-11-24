-- F60: intention at check-in and who to meet for everyone (D054). Additive only: one column on events
-- and one new table, so it is safe to apply before the new code is deployed (old code never reads either,
-- and every existing and new event gets the switch on, the owner's default).
--
-- events.suggest_on: the host's "Suggest people to each other" switch, per event, on by default.
-- event_suggest: one row per person per event who saw the notice at check-in (or on the hub), holding
--   suggest         1 = "Suggest me to people here" ticked (the default), 0 = unticked
--   intention       "What are you hoping to get from this event?", up to 120 characters, may be empty
--   notice_version  the version of the notice's words they saw (src/lib/suggest.js); the words are in consent_log
--   id              an opaque id used in other people's lists (never a user id)
--   ai_at           when the AI last ranked this person's own list at this event (at most once every 20 minutes)
-- Deleted 48 hours after the event ends (the daily purge), with the account (cascade) and by the host reset.
ALTER TABLE events ADD COLUMN suggest_on INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS event_suggest (
  id TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  suggest INTEGER NOT NULL DEFAULT 1,
  intention TEXT NOT NULL DEFAULT '',
  notice_version TEXT NOT NULL,
  ai_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS event_suggest_user ON event_suggest(user_id);
