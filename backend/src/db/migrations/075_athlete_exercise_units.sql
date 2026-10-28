-- 075_athlete_exercise_units.sql
-- Per-athlete, per-exercise unit override (kg ↔ ladrillos). Wins over the
-- per-equipment preference in athlete_equipment_units: two poleas in the same
-- gym can carry different stacks (athlete request 2026-10-28).

CREATE TABLE IF NOT EXISTS athlete_exercise_units (
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  unit TEXT NOT NULL CHECK (unit IN ('kg','ladrillos')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (athlete_id, exercise_id)
);
