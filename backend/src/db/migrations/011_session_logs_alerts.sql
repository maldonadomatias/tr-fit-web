-- Extend set_logs (sub-proyecto 1 left minimal)
ALTER TABLE set_logs
  ADD COLUMN IF NOT EXISTS session_log_id UUID,
  ADD COLUMN IF NOT EXISTS client_id UUID,
  ADD COLUMN IF NOT EXISTS client_ts TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rpe NUMERIC(3,1),
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uq_set_logs_client_id
  ON set_logs(client_id) WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_set_logs_session
  ON set_logs(session_log_id) WHERE session_log_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS session_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skeleton_id UUID NOT NULL REFERENCES athlete_skeletons(id),
  program_week INT NOT NULL CHECK (program_week BETWEEN 1 AND 30),
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  fatigue_rating TEXT CHECK (fatigue_rating IN ('suave','normal','exigente')),
  total_sets_target INT,
  total_sets_completed INT,
  compliance_pct NUMERIC(5,2),
  total_volume_kg NUMERIC(10,2),
  duration_seconds INT,
  client_id UUID UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_session_logs_athlete_week_day
  ON session_logs(athlete_id, program_week, day_of_week);

CREATE INDEX IF NOT EXISTS idx_session_logs_unfinished
  ON session_logs(athlete_id) WHERE finished_at IS NULL;

CREATE TABLE IF NOT EXISTS coach_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN
    ('sos_pain','sos_machine','rpe_flag','rm_skipped','rm_week_starting')),
  severity TEXT NOT NULL CHECK (severity IN ('red','yellow','info')),
  exercise_id INT REFERENCES exercises(id),
  session_log_id UUID REFERENCES session_logs(id),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coach_alerts_coach_unread
  ON coach_alerts(coach_id) WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_coach_alerts_athlete_recent
  ON coach_alerts(athlete_id, created_at DESC);
