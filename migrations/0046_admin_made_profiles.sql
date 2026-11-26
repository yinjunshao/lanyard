-- F74 (D063): a profile the Lanyard admin makes for someone who is not on Lanyard yet, claimed by them with a link.
-- Additive only, so it is safe to apply before the new code is deployed: every existing account gets admin_made = 0,
-- old code never reads the new columns or the table, and the two triggers only ever refuse a row for an account
-- with admin_made = 1, which only the new code makes.
--   users.admin_made   1 for an account the admin made; it stays 1 after the claim, for the record
--   users.claimed_at   when the person claimed it (NULL until then, and for every other account)
-- An unclaimed admin-made account is admin_made = 1 AND is_guest = 1: a guest with a profile and one card, no
-- session, no email and no way to sign in. It is private: only whoever holds the claim link sees it.
ALTER TABLE users ADD COLUMN admin_made INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN claimed_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_users_admin_made ON users(created_at) WHERE admin_made = 1;

-- The claim link of an unclaimed admin-made account, one per account. The link is /claim/p/<token>, where the token
-- is 32 random bytes (base64url); only its SHA-256 is kept here. Copy link replaces the hash, so the old link stops at
-- once. The row goes when the account is claimed (the claim deletes it in the same write) or erased (cascade).
--   source      where the admin found the details (for example "LinkedIn"), shown on the claim page (UK GDPR Article 14)
--   expires_at  30 days after the account was made, so a link never outlives its profile
CREATE TABLE IF NOT EXISTS claim_links (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  source     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Private until claimed, held by the database too: an unclaimed admin-made account can never be checked in to an
-- event or be one side of a connection, whatever route tries. The routes refuse first (404, as for a missing card).
CREATE TRIGGER IF NOT EXISTS premade_no_checkin BEFORE INSERT ON checkins
WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND admin_made = 1 AND is_guest = 1)
BEGIN
  SELECT RAISE(ABORT, 'unclaimed admin-made account');
END;

CREATE TRIGGER IF NOT EXISTS premade_no_connection BEFORE INSERT ON connections
WHEN EXISTS (SELECT 1 FROM users WHERE id IN (NEW.user_a, NEW.user_b) AND admin_made = 1 AND is_guest = 1)
BEGIN
  SELECT RAISE(ABORT, 'unclaimed admin-made account');
END;
