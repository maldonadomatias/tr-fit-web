-- 012 — Onboarding extension: enum extends + new columns + measurements table

-- Extend level enum: 3 → 5 values, backfill existing
ALTER TABLE athlete_profiles DROP CONSTRAINT IF EXISTS athlete_profiles_level_check;
UPDATE athlete_profiles SET level = CASE
  WHEN level='principiante' THEN 'bajo'
  WHEN level='intermedio' THEN 'medio'
  WHEN level='avanzado' THEN 'avanzado'
  ELSE level
END;
ALTER TABLE athlete_profiles ADD CONSTRAINT athlete_profiles_level_check
  CHECK (level IN ('nunca','bajo','medio','avanzado','muy_avanzado'));

-- Extend goal: add perdida_grasa
ALTER TABLE athlete_profiles DROP CONSTRAINT IF EXISTS athlete_profiles_goal_check;
ALTER TABLE athlete_profiles ADD CONSTRAINT athlete_profiles_goal_check
  CHECK (goal IN ('hipertrofia','fuerza','recomp','perdida_grasa'));

-- Extend days_per_week: 3-6 → 2-6
ALTER TABLE athlete_profiles DROP CONSTRAINT IF EXISTS athlete_profiles_days_per_week_check;
ALTER TABLE athlete_profiles ADD CONSTRAINT athlete_profiles_days_per_week_check
  CHECK (days_per_week BETWEEN 2 AND 6);

-- Helper: count distinct elements in a text[] (IMMUTABLE so it works inside CHECK).
CREATE OR REPLACE FUNCTION array_distinct_count(arr text[])
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT count(DISTINCT d)::int FROM unnest(arr) d
$$;

-- New columns (nullable for legacy compat)
ALTER TABLE athlete_profiles
  ADD COLUMN phone text CHECK (phone ~ '^\+\d{10,15}$'),
  ADD COLUMN plan_interest text CHECK (plan_interest IN ('basico','full','premium')),
  ADD COLUMN training_mode text CHECK (training_mode IN ('gym','casa','mixto')),
  ADD COLUMN commitment text CHECK (commitment IN ('suave','normal','exigente')),
  ADD COLUMN exercise_minutes smallint CHECK (exercise_minutes IN (30,45,60,75,90)),
  ADD COLUMN days_specific text[] CHECK (
    days_specific IS NULL
    OR (days_specific <@ ARRAY['lun','mar','mie','jue','vie','sab','dom']
        AND cardinality(days_specific) = days_per_week
        AND cardinality(days_specific) = array_distinct_count(days_specific))
  ),
  ADD COLUMN referral_source text CHECK (referral_source IN ('instagram','facebook','google','amigo','otro')),
  ADD COLUMN sport_focus text;

-- Measurements table (historizable)
CREATE TABLE athlete_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL DEFAULT now(),
  chest_cm numeric(5,1) CHECK (chest_cm IS NULL OR chest_cm BETWEEN 30 AND 200),
  waist_cm numeric(5,1) CHECK (waist_cm IS NULL OR waist_cm BETWEEN 30 AND 200),
  hip_cm   numeric(5,1) CHECK (hip_cm   IS NULL OR hip_cm   BETWEEN 30 AND 200),
  thigh_cm numeric(5,1) CHECK (thigh_cm IS NULL OR thigh_cm BETWEEN 20 AND 120),
  calf_cm  numeric(5,1) CHECK (calf_cm  IS NULL OR calf_cm  BETWEEN 15 AND 80),
  bicep_cm numeric(5,1) CHECK (bicep_cm IS NULL OR bicep_cm BETWEEN 15 AND 80),
  source text NOT NULL DEFAULT 'onboarding' CHECK (source IN ('onboarding','manual','coach')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_measurements_athlete_date ON athlete_measurements(athlete_id, measured_at DESC);
