-- Onboarding now offers clearer session-time options (1 h, 1 h 15, 1 h 45, 2 h
-- = 60/75/105/120). Widen the CHECK to a superset that adds 105/120 while
-- keeping the legacy values so existing athlete profiles stay valid.
ALTER TABLE athlete_profiles
  DROP CONSTRAINT IF EXISTS athlete_profiles_exercise_minutes_check;
ALTER TABLE athlete_profiles
  ADD CONSTRAINT athlete_profiles_exercise_minutes_check
  CHECK (exercise_minutes IN (30, 45, 60, 75, 90, 105, 120));
