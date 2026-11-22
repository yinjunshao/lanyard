-- F49: finish-your-profile emails. Additive only, safe to apply before the new code is deployed.
-- users.profile_nudges counts the emails sent (0, 1 or 2, in total and ever); users.profile_nudge_at is when the
-- latest one was claimed, so the second can check that the profile has not changed since the first
-- (profiles.updated_at already exists and moves on every save). The hourly job claims each email with one
-- conditional UPDATE before sending, so two runs at the same moment send it once.
ALTER TABLE users ADD COLUMN profile_nudges INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN profile_nudge_at INTEGER;
-- The job looks up recent connections across everyone (the other indexes start with a person), and people
-- who are waiting for their second email.
CREATE INDEX idx_conn_created ON connections(created_at);
CREATE INDEX idx_users_nudge2 ON users(profile_nudge_at) WHERE profile_nudges = 1;
