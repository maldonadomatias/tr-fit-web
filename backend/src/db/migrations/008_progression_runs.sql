CREATE TABLE IF NOT EXISTS progression_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES users(id),
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  from_week INT NOT NULL,
  to_week INT NOT NULL,
  compliance NUMERIC(4, 3),
  weights_bumped JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL CHECK (status IN
    ('success', 'partial', 'failed', 'skipped')),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_progression_runs_athlete_ran
  ON progression_runs(athlete_id, ran_at DESC);
