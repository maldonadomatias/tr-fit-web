CREATE TABLE IF NOT EXISTS athlete_exercise_weights (
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id INT NOT NULL REFERENCES exercises(id),
  current_weight_kg NUMERIC(6, 2),
  current_reps_text TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL CHECK (updated_by IN
    ('progression_cron', 'coach', 'athlete_initial', 'athlete_correction')),
  PRIMARY KEY (athlete_id, exercise_id)
);

CREATE TABLE IF NOT EXISTS rm_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id INT NOT NULL REFERENCES exercises(id),
  program_week INT NOT NULL CHECK (program_week IN (10, 20, 30)),
  value_kg NUMERIC(6, 2) NOT NULL,
  tested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (athlete_id, exercise_id, program_week)
);

CREATE INDEX IF NOT EXISTS idx_rm_athlete_exercise
  ON rm_tests(athlete_id, exercise_id);
