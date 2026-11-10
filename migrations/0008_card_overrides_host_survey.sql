-- Per-card "what you do" and "about" (fall back to the profile's when empty).
ALTER TABLE cards ADD COLUMN headline TEXT;
ALTER TABLE cards ADD COLUMN about TEXT;

-- Host sign-up survey, answered when a host account is created.
ALTER TABLE orgs ADD COLUMN use_case TEXT;
ALTER TABLE orgs ADD COLUMN event_frequency TEXT;
ALTER TABLE orgs ADD COLUMN typical_size TEXT;
ALTER TABLE orgs ADD COLUMN referral TEXT;

-- The "profile is public" switch is gone: a card can only be opened with its
-- QR code, link or short code, so every profile is reachable the same way.
UPDATE profiles SET is_public = 1 WHERE is_public = 0;
