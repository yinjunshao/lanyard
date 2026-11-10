-- Onboarding (F14). Additive: old code ignores the new columns and table.
-- onboarding_step is where a person is in the welcome steps (1 to 6), so they can
-- carry on from any device. NULL means not in onboarding: every profile made before
-- this migration stays NULL, so nobody is pulled into it. onboarding_max is the
-- furthest step reached; it only exists so going Back and forward again is not
-- counted twice in the funnel.
ALTER TABLE profiles ADD COLUMN onboarding_step INTEGER;
ALTER TABLE profiles ADD COLUMN onboarding_max INTEGER NOT NULL DEFAULT 0;

-- Daily counts per step, with nothing about who. reached = people who got to the
-- step for the first time that day; completed = people who got past it.
CREATE TABLE onboarding_stats (
  day TEXT NOT NULL,
  step INTEGER NOT NULL,
  reached INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, step)
);
