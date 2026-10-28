-- Feedback, event end/RSVP/info, follow-up reminders, integrations, passkey
-- challenges held server-side, and indexes for the hot paths.

-- Events: when it ends, whether the host ended it, RSVP count (from Luma, the
-- Union site, etc.), practical info for attendees, and the feedback form.
ALTER TABLE events ADD COLUMN ends_at INTEGER;
ALTER TABLE events ADD COLUMN ended_at INTEGER;
ALTER TABLE events ADD COLUMN rsvp_count INTEGER;
ALTER TABLE events ADD COLUMN info TEXT NOT NULL DEFAULT '{}';
ALTER TABLE events ADD COLUMN feedback_on INTEGER NOT NULL DEFAULT 1;
ALTER TABLE events ADD COLUMN feedback_questions TEXT NOT NULL DEFAULT '[]';

-- Feedback answers are stored with NO user id. A separate table only records
-- that someone has answered (to stop duplicates). Both tables are WITHOUT ROWID
-- and keyed on random/user ids, so insertion order can't be used to join them,
-- and responses keep only the day, not the time.
CREATE TABLE feedback_responses (
  id       TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  answers  TEXT NOT NULL,
  day      INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX idx_feedback_event ON feedback_responses(event_id);

CREATE TABLE feedback_done (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, user_id)
) WITHOUT ROWID;
CREATE INDEX idx_feedback_done_user ON feedback_done(user_id);

-- Your private follow-up details for a connection live beside your note.
ALTER TABLE notes ADD COLUMN remind_at INTEGER;
ALTER TABLE notes ADD COLUMN followed_up_at INTEGER;
ALTER TABLE notes ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
CREATE INDEX idx_notes_remind ON notes(user_id, remind_at) WHERE remind_at IS NOT NULL;

-- Integrations: one outbound webhook and one inbound API key per organisation.
-- The API key is stored only as a SHA-256 hash.
CREATE TABLE org_integrations (
  org_id         TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  webhook_url    TEXT,
  webhook_secret TEXT,
  api_key_hash   TEXT,
  created_at     INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_org_integrations_key ON org_integrations(api_key_hash) WHERE api_key_hash IS NOT NULL;

-- WebAuthn challenges: server-side, single use, 5 minutes.
CREATE TABLE webauthn_challenges (
  id         TEXT PRIMARY KEY,
  challenge  TEXT NOT NULL,
  user_id    TEXT,
  expires_at INTEGER NOT NULL
);

-- Indexes for the hot paths.
CREATE INDEX idx_cards_user_default ON cards(user_id, is_default);
CREATE INDEX idx_blocks_blocked ON blocks(blocked_id);
CREATE INDEX idx_conn_selfie ON connections(selfie_key) WHERE selfie_key IS NOT NULL;
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_checkins_event_time ON checkins(event_id, created_at);
