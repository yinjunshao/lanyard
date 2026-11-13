-- Named attendance with a check-in notice (F31). Additive: old code ignores the new columns and
-- table, so this is safe to apply before the new code is deployed. Nothing is changed or deleted.
--
-- 1. What an event collects. Off unless the host turns it on, per event (D004 narrowed by D038).
--    collect_items is a JSON list of keys from a fixed list the code knows how to honour
--    (worker/attendance.js); collect_why is the host's required line shown on the check-in page.
ALTER TABLE events ADD COLUMN collect_attendance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN collect_items TEXT NOT NULL DEFAULT '[]';
ALTER TABLE events ADD COLUMN collect_why TEXT NOT NULL DEFAULT '';

-- 2. The host's list: one row per person who left the attendance tick on at check-in (or ticked
--    it later), holding only the extra items they left ticked. A row exists only while that
--    choice stands: unticking, the host turning the list off, deleting the account and the
--    retention purge (12 months after the event ends) all delete it. Never read by an event
--    without collect_attendance = 1.
CREATE TABLE event_attendees (
  event_id       TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  items          TEXT NOT NULL DEFAULT '[]',   -- JSON: the extra items (email, card) they left ticked
  notice_version TEXT NOT NULL,                -- which wording they saw (src/lib/collects.js)
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX idx_event_attendees_user ON event_attendees(user_id);

-- 3. Proof of what was shown and what was chosen. consent_log already outlives the account;
--    these two columns hold the exact wording on the page and its version for the rows F31 writes
--    (scopes event_attendance:<event>, event_share_email:<event>, event_share_card:<event>).
--    Older rows keep NULL.
ALTER TABLE consent_log ADD COLUMN wording TEXT;
ALTER TABLE consent_log ADD COLUMN version TEXT;
