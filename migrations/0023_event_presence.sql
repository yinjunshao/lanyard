-- Event presence (F17). Additive: old code ignores the new table and column.
-- A row exists only while someone has chosen "Show me to people here" at one event, so
-- turning it off, or withdrawing, deletes the row (and the selfie in R2, outside SQL).
-- Rows and selfies are deleted 48 hours after the event ends (the daily purge, worker/purge.js).
-- id is an opaque id the app can use for a card in a list; it is not a user id and never
-- leaves the Worker with one. selfie_key is private media: served only through /media/presence/...
CREATE TABLE event_presence (
  id          TEXT NOT NULL UNIQUE,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  selfie_key  TEXT,
  intro       TEXT NOT NULL DEFAULT '',
  looking_for TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX idx_event_presence_user ON event_presence(user_id);

-- How many people have ever turned it on at this event: the only figure a host sees (D004).
-- A counter, not a list: it stays after the rows are deleted and says nothing about who.
ALTER TABLE events ADD COLUMN presence_used INTEGER NOT NULL DEFAULT 0;
