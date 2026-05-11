CREATE TABLE IF NOT EXISTS periodization_config (
  week_number INT PRIMARY KEY CHECK (week_number BETWEEN 1 AND 30),
  block_label TEXT NOT NULL,
  is_rm_test BOOLEAN NOT NULL DEFAULT FALSE,
  is_deload BOOLEAN NOT NULL DEFAULT FALSE,
  principal_series INT NOT NULL,
  principal_reps TEXT NOT NULL,
  principal_descanso TEXT NOT NULL,
  principal_pct_rm NUMERIC(4, 3),
  principal_rm_source INT CHECK (principal_rm_source IN (10, 20, 30)),
  principal_use_casilleros BOOLEAN NOT NULL DEFAULT FALSE,
  accesorio_series INT NOT NULL,
  accesorio_reps TEXT NOT NULL,
  accesorio_descanso TEXT NOT NULL,
  notes TEXT
);
