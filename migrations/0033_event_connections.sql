-- Event analytics: every event a connection was made at. A connection counts for an event when both people checked in
-- to it and it was made during the event's time window (worker/eventConnections.js). connections.event_id still says
-- which event a connection is filed under for the two people; this table is what an organiser's figures count, so a
-- second meeting at a later event, or a scan just before someone checked in, is counted too.
CREATE TABLE event_connections (
  event_id      TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (event_id, connection_id)
);
CREATE INDEX idx_event_connections_conn ON event_connections(connection_id);

-- Every earlier connection made during an event both people checked in to, by the same rule as the Worker (the
-- event a connection is filed under is not copied on its own: that filing does not look at the time). The window:
-- from two hours before the start to two hours after the end; the end is when it was ended, else the planned end,
-- else 18 hours after the start; with no start time, the first of their check-ins stands in for it).
INSERT OR IGNORE INTO event_connections (event_id, connection_id, created_at)
  SELECT a.event_id, cn.id, cn.created_at
    FROM connections cn
    JOIN checkins a ON a.user_id = cn.user_a
    JOIN checkins b ON b.user_id = cn.user_b AND b.event_id = a.event_id
    JOIN events e ON e.id = a.event_id
   WHERE cn.created_at >= COALESCE(e.starts_at, MIN(a.created_at, b.created_at)) - 7200000
     AND cn.created_at <= COALESCE(e.ended_at, e.ends_at, COALESCE(e.starts_at, MAX(a.created_at, b.created_at)) + 64800000) + 7200000;
