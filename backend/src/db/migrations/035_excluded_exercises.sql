-- 035_excluded_exercises.sql
-- Permanent per-athlete exercise exclusions ("no tengo esta máquina") and the
-- two new informational coach-alert types.

CREATE TABLE IF NOT EXISTS athlete_excluded_exercises (
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id INT NOT NULL REFERENCES exercises(id),
  replacement_exercise_id INT REFERENCES exercises(id),
  reason TEXT NOT NULL DEFAULT 'no_machine',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (athlete_id, exercise_id)
);

-- Extend coach_alerts.type CHECK (mirror of 032_membership_notifications.sql).
ALTER TABLE coach_alerts DROP CONSTRAINT IF EXISTS coach_alerts_type_check;
ALTER TABLE coach_alerts ADD CONSTRAINT coach_alerts_type_check
  CHECK (type IN (
    'sos_pain','sos_machine','rpe_flag','rm_skipped','rm_week_starting',
    'membership_expiring','membership_overdue',
    'sos_no_machine','program_reset'
  ));
