-- 020_equipment_units.sql
-- Add per-user equipment-unit preference + value/unit columns on weight tables.

CREATE TABLE IF NOT EXISTS athlete_equipment_units (
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  equipment TEXT NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('kg','ladrillos')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (athlete_id, equipment)
);

ALTER TABLE set_logs
  ADD COLUMN IF NOT EXISTS value NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE set_logs DROP CONSTRAINT IF EXISTS set_logs_unit_check;
ALTER TABLE set_logs
  ADD CONSTRAINT set_logs_unit_check CHECK (unit IS NULL OR unit IN ('kg','ladrillos'));

ALTER TABLE athlete_exercise_weights
  ADD COLUMN IF NOT EXISTS current_value NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE athlete_exercise_weights DROP CONSTRAINT IF EXISTS aew_unit_check;
ALTER TABLE athlete_exercise_weights
  ADD CONSTRAINT aew_unit_check CHECK (unit IS NULL OR unit IN ('kg','ladrillos'));

ALTER TABLE rm_tests
  ADD COLUMN IF NOT EXISTS value NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE rm_tests DROP CONSTRAINT IF EXISTS rm_tests_unit_check;
ALTER TABLE rm_tests
  ADD CONSTRAINT rm_tests_unit_check CHECK (unit IS NULL OR unit IN ('kg','ladrillos'));

-- Backfill from legacy kg columns
UPDATE set_logs                  SET value = weight_kg,           unit = 'kg' WHERE value IS NULL AND weight_kg IS NOT NULL;
UPDATE athlete_exercise_weights  SET current_value = current_weight_kg, unit = 'kg' WHERE current_value IS NULL AND current_weight_kg IS NOT NULL;
UPDATE rm_tests                  SET value = value_kg,            unit = 'kg' WHERE value IS NULL;
