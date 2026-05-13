CREATE TABLE IF NOT EXISTS skeleton_days (
  skeleton_id UUID NOT NULL
    REFERENCES athlete_skeletons(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  focus TEXT NOT NULL,
  PRIMARY KEY (skeleton_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_skeleton_days_skeleton
  ON skeleton_days(skeleton_id);
