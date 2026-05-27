-- 027_alert_resolutions_and_overrides.sql
-- Coach alert resolutions become real decisions, propagated to the athlete's
-- next session via a per-week override layer.

ALTER TABLE coach_alerts
  ADD COLUMN IF NOT EXISTS resolution_action TEXT
    CHECK (resolution_action IN (
      'swap_exercise','skip_week','regen_skeleton','approve_switch',
      'revert_switch','reduce_intensity','reschedule_rm','skip_rm_block',
      'acknowledge','note_only'
    )),
  ADD COLUMN IF NOT EXISTS resolution_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS resolution_note TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id);

CREATE TABLE IF NOT EXISTS weekly_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_week INT NOT NULL CHECK (program_week BETWEEN 1 AND 30),
  day_of_week INT CHECK (day_of_week BETWEEN 1 AND 7),
  original_exercise_id INT NOT NULL REFERENCES exercises(id),
  replacement_exercise_id INT REFERENCES exercises(id),
  override_type TEXT NOT NULL CHECK (override_type IN
    ('swap','skip','reduce_intensity')),
  intensity_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_alert_id UUID REFERENCES coach_alerts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  expires_after_week INT NOT NULL
    CHECK (expires_after_week >= program_week AND expires_after_week <= 30)
  ,
  UNIQUE (athlete_id, program_week, original_exercise_id)
  ,
  CHECK (override_type != 'swap' OR replacement_exercise_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_weekly_overrides_lookup
  ON weekly_overrides(athlete_id, program_week);
