-- Free-text note the athlete leaves when finishing a session ("no me animé a
-- tirar el RM", "me dolió el hombro en la 3ra"). Coach-facing only.
ALTER TABLE session_logs
  ADD COLUMN IF NOT EXISTS note TEXT;
