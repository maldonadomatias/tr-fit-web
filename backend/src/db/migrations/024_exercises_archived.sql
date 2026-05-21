ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_exercises_active
  ON exercises(id) WHERE archived_at IS NULL;
