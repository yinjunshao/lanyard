-- F48: follow-up reminder emails. Additive only, safe to apply before the new code is deployed.
-- users.notify_reminders is one switch (1 = on) for the emails about reminders a person set
-- (and, in F49, finish-your-profile emails). It is on for everyone until they turn it off.
-- notes.reminder_mailed_for is the remind_at value an email was last claimed for, so a reminder
-- is mailed once: the job claims it with one conditional UPDATE before sending. A reminder moved
-- to another time differs from it and is mailed again then; the same time set again is not.
ALTER TABLE users ADD COLUMN notify_reminders INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notes ADD COLUMN reminder_mailed_for INTEGER;
-- The hourly job looks up reminders by time across everyone (idx_notes_remind starts with user_id).
CREATE INDEX idx_notes_remind_due ON notes(remind_at) WHERE remind_at IS NOT NULL AND followed_up_at IS NULL;
