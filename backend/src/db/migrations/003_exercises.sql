CREATE TABLE IF NOT EXISTS exercises (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  muscle_group TEXT NOT NULL,
  equipment TEXT NOT NULL CHECK (equipment IN
    ('barra', 'mancuerna', 'maquina', 'polea', 'smith',
     'bw', 'pesa_rusa', 'elastico', 'disco')),
  movement_pattern TEXT NOT NULL CHECK (movement_pattern IN
    ('squat', 'hinge', 'push_h', 'push_v', 'pull_h', 'pull_v',
     'isolation', 'core', 'cardio')),
  is_principal BOOLEAN NOT NULL DEFAULT FALSE,
  is_unilateral BOOLEAN NOT NULL DEFAULT FALSE,
  level_min TEXT NOT NULL DEFAULT 'principiante'
    CHECK (level_min IN ('principiante', 'intermedio', 'avanzado')),
  contraindicated_for TEXT[] NOT NULL DEFAULT '{}',
  default_increment_kg NUMERIC(4, 2) NOT NULL DEFAULT 2.5,
  alternatives_ids INT[] NOT NULL DEFAULT '{}',
  video_url TEXT,
  illustration_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_exercises_muscle_group ON exercises(muscle_group);
CREATE INDEX IF NOT EXISTS idx_exercises_principal
  ON exercises(is_principal) WHERE is_principal = TRUE;
CREATE INDEX IF NOT EXISTS idx_exercises_equipment ON exercises(equipment);
