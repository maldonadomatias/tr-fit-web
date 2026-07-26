-- 058_live_activity_jobs.sql
-- Schedules an ActivityKit "end" push at the countdown's end so the Live
-- Activity card is dismissed even when the app process is dead.
CREATE TABLE live_activity_jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  apns_token     text NOT NULL,
  activity_name  text NOT NULL,
  content_state  jsonb NOT NULL,
  end_at         timestamptz NOT NULL,
  status         text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued','running','done','failed')),
  attempts       int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL,
  last_error     text,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Claim index for the worker (status + due time).
CREATE INDEX live_activity_jobs_claim_idx
  ON live_activity_jobs (status, next_attempt_at);

-- One live job per token: a restart (pause/resume, ±30s) replaces the old one.
CREATE UNIQUE INDEX live_activity_jobs_token_active_idx
  ON live_activity_jobs (apns_token)
  WHERE status IN ('queued','running');
