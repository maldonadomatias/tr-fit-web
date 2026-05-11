CREATE TABLE IF NOT EXISTS athlete_skeletons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN
    ('pending_review', 'approved', 'rejected', 'superseded')),
  generated_by TEXT NOT NULL DEFAULT 'ai'
    CHECK (generated_by IN ('ai', 'coach')),
  generation_prompt JSONB NOT NULL,
  generation_rationale TEXT,
  rejection_feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_skeletons_athlete_status
  ON athlete_skeletons(athlete_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_skeletons_one_approved
  ON athlete_skeletons(athlete_id) WHERE status = 'approved';

CREATE TABLE IF NOT EXISTS skeleton_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skeleton_id UUID NOT NULL REFERENCES athlete_skeletons(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  slot_index INT NOT NULL CHECK (slot_index BETWEEN 1 AND 12),
  exercise_id INT NOT NULL REFERENCES exercises(id),
  role TEXT NOT NULL CHECK (role IN ('principal', 'accesorio')),
  UNIQUE (skeleton_id, day_of_week, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_slots_skeleton_day
  ON skeleton_slots(skeleton_id, day_of_week);
