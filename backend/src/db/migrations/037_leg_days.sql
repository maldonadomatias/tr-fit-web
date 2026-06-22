-- 037 — Men leg-day preference (1 or 2 leg days).
-- Chosen by the athlete in onboarding; reshapes the split. Nullable: women and
-- legacy profiles leave it NULL (women's split is lower-biased implicitly).
-- See docs/routine-corpus/hombre/LOGIC.md (H0).
ALTER TABLE athlete_profiles
  ADD COLUMN IF NOT EXISTS leg_days smallint
    CHECK (leg_days IS NULL OR leg_days IN (1, 2));
