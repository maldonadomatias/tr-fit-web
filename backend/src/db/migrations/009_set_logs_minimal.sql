-- Minimal set_logs for progression cron input.
-- Sub-project 3 will extend this table with session_log_id, rpe, etc.
CREATE TABLE IF NOT EXISTS set_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id INT NOT NULL REFERENCES exercises(id),
  week INT NOT NULL,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  set_index INT NOT NULL,
  weight_kg NUMERIC(6,2),
  reps INT,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_set_logs_athlete_week
  ON set_logs(athlete_id, week);
