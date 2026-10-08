-- 071_exercise_rotation.sql
--
-- Rotación automática: cada 2 semanas de programa se cambia 1 accesorio del
-- esqueleto activo por otro del mismo grupo muscular, rotando grupos en orden
-- Espalda → Pecho → Piernas → Biceps → Triceps → Hombros.

ALTER TABLE athlete_program_state
  ADD COLUMN IF NOT EXISTS rotation_index INT NOT NULL DEFAULT 0
    CHECK (rotation_index BETWEEN 0 AND 5);

CREATE TABLE IF NOT EXISTS exercise_rotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skeleton_id UUID NOT NULL REFERENCES athlete_skeletons(id) ON DELETE CASCADE,
  slot_id UUID NOT NULL,
  day_of_week INT NOT NULL,
  program_week INT NOT NULL,
  muscle_group TEXT NOT NULL,
  from_exercise_id INT NOT NULL REFERENCES exercises(id),
  to_exercise_id INT NOT NULL REFERENCES exercises(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exercise_rotations_athlete
  ON exercise_rotations(athlete_id, created_at DESC);

ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_type_check;
ALTER TABLE notification_log ADD CONSTRAINT notification_log_type_check
  CHECK (type IN (
    'session_reminder','session_missed','week_start',
    'skeleton_approved','sos_resolved','rm_test_week',
    'membership_expiring','membership_expired',
    'community_announcement','community_event','community_comment','community_report',
    'community_revision','exercise_rotated'
  ));

ALTER TABLE users ALTER COLUMN notification_prefs SET DEFAULT '{
  "session_reminder": true,
  "session_missed": true,
  "week_start": true,
  "skeleton_approved": true,
  "sos_resolved": true,
  "rm_test_week": true,
  "membership_expiring": true,
  "membership_expired": true,
  "community_announcement": true,
  "community_event": true,
  "community_comment": true,
  "community_report": true,
  "community_revision": true,
  "exercise_rotated": true
}'::jsonb;

UPDATE users SET notification_prefs = notification_prefs || '{"exercise_rotated": true}'::jsonb
  WHERE NOT (notification_prefs ? 'exercise_rotated');
