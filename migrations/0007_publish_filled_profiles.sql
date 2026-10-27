-- The "Profile page is public" checkbox never saved (the app sent isPublic,
-- the API only read is_public), so people who first connected or checked in
-- as a guest kept their private name-only stub after filling in a profile.
-- Make those filled-in profiles public, as a normal signup is. Profiles that
-- are still bare stubs (a name and nothing else) stay private.
UPDATE profiles
SET is_public = 1
WHERE is_public = 0
  AND (
       COALESCE(photo_key, '') <> ''
    OR TRIM(COALESCE(uni, '')) <> ''
    OR TRIM(COALESCE(course, '')) <> ''
    OR TRIM(COALESCE(year, '')) <> ''
    OR TRIM(COALESCE(headline, '')) <> ''
    OR TRIM(COALESCE(about, '')) <> ''
    OR COALESCE(tags, '[]') NOT IN ('[]', '')
    OR COALESCE(links, '{}') NOT IN ('{}', '')
  );
