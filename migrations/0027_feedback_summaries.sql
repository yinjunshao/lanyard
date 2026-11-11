-- F23: the AI summary of an event's written feedback, one row per event. Additive: old code ignores the table, so
-- it is safe to apply before the new code (0018 to 0026 are not yet on production either).
--   result      the checked summary as JSON (paragraph, points with counts worked out by the Worker, exact
--               quotes). NULL on a row that only records that the automatic run tried and did not finish.
--   source      'auto' (written when the feedback window closed) or 'manual' (a host asked)
--   answers     how many written answers it was made from, to tell the host when newer ones have arrived
--   auto_tries  automatic attempts that failed for a real reason (stops at 3); auto_at the last attempt
-- The summary derives from the event's anonymous feedback, so it goes when the event does (cascade, and the host
-- reset), and when the free-text answers are removed after 12 months (the daily purge). It holds no name, no
-- account and no answer that is not an exact quote.
CREATE TABLE feedback_summaries (
  event_id   TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  result     TEXT,
  source     TEXT,
  answers    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER,
  auto_tries INTEGER NOT NULL DEFAULT 0,
  auto_at    INTEGER
) WITHOUT ROWID;
