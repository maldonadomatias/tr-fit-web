CREATE TABLE IF NOT EXISTS athlete_program_state (
  athlete_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  active_skeleton_id UUID REFERENCES athlete_skeletons(id),
  current_week INT NOT NULL DEFAULT 1
    CHECK (current_week BETWEEN 1 AND 30),
  start_date DATE NOT NULL,
  last_week_advanced_at TIMESTAMPTZ,
  rm_test_blocking BOOLEAN NOT NULL DEFAULT FALSE
);
