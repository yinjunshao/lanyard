-- Marketing broadcasts (opted-in users only). broadcast_sends makes a send resumable.
CREATE TABLE broadcasts (
  id         TEXT PRIMARY KEY,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE broadcast_sends (
  broadcast_id TEXT NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  sent_at      INTEGER NOT NULL,
  PRIMARY KEY (broadcast_id, user_id)
);
