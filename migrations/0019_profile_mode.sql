-- Student and Career mode (F11). Additive: old code ignores these columns and
-- every existing profile reads as a student, exactly as before.
ALTER TABLE profiles ADD COLUMN mode TEXT NOT NULL DEFAULT 'student';
ALTER TABLE profiles ADD COLUMN company TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN role TEXT NOT NULL DEFAULT '';
