CREATE TABLE IF NOT EXISTS skeleton_regen_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('queued','running','done','failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regen_jobs_claim
  ON skeleton_regen_jobs(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_regen_jobs_athlete_status
  ON skeleton_regen_jobs(athlete_id, status);
