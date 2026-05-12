ALTER TABLE athlete_profiles
  ADD COLUMN IF NOT EXISTS plan_interest TEXT
  CHECK (plan_interest IN ('basico', 'full', 'premium'));
