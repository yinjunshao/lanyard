-- F22: whether follow-up drafts help. Counts per day and kind, for the admin page. Additive: old code ignores
-- the table, so this is safe to apply before the new code. There is no person, connection or text in it: a
-- row says "on this day, this many drafts were copied", nothing more. Kept 13 months (purge), like ai_daily.
--   drafted_ai        a draft written by the model was shown (a reply from the cache counts too)
--   drafted_template  the template was shown instead (AI off, a limit, a failed check, or not allowed)
--   copied            the person copied a draft
--   opened            the person opened a draft in LinkedIn, Mail or WhatsApp
--   marked            the person marked the connection as followed up from the draft sheet
CREATE TABLE followup_counts (
  day  TEXT NOT NULL,              -- UTC, YYYY-MM-DD
  kind TEXT NOT NULL,
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind)
);
