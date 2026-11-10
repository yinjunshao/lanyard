-- Post-event emails and sign-in alerts.
-- notify_events: feedback reminders after events the person checked in to (on by default, one-click off).
ALTER TABLE users ADD COLUMN notify_events INTEGER NOT NULL DEFAULT 1;

-- One row per email sent, so a run of the scheduler never sends the same one twice.
-- kind: 'feedback' (attendee reminder) | 'host_summary' (event owner recap).
CREATE TABLE event_mail_log (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind     TEXT NOT NULL,
  sent_at  INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id, kind)
);
