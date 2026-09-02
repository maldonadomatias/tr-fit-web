-- 062 — Una carga por (ejercicio, esquema), no una por ejercicio.
--
-- La 038 le dio a cada slot su propio set-scheme, pero el peso siguió con
-- PRIMARY KEY (athlete_id, exercise_id): la mariposa 3x10 y la mariposa
-- 10x10x10 compartían celda, así que el bump semanal de una subía la otra
-- (reportado por el coach) y el peso logueado de un drop pisaba el de las
-- series rectas.
--
-- El coach las maneja como dos escaleras independientes:
--   dropset / superserie : 10x10x10 -> 12x12x12 -> 10x10x10 (+carga)
--   normal               : 6 -> 8 -> 10 -> 12 -> 6          (+carga)

ALTER TABLE athlete_exercise_weights
  ADD COLUMN IF NOT EXISTS scheme TEXT NOT NULL DEFAULT 'normal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'athlete_exercise_weights_scheme_check'
  ) THEN
    ALTER TABLE athlete_exercise_weights
      ADD CONSTRAINT athlete_exercise_weights_scheme_check
      CHECK (scheme IN ('normal', 'dropset'));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'athlete_exercise_weights_pkey'
       AND (SELECT COUNT(*) FROM unnest(conkey)) = 2
  ) THEN
    ALTER TABLE athlete_exercise_weights
      DROP CONSTRAINT athlete_exercise_weights_pkey;
    ALTER TABLE athlete_exercise_weights
      ADD CONSTRAINT athlete_exercise_weights_pkey
      PRIMARY KEY (athlete_id, exercise_id, scheme);
  END IF;
END $$;

-- Backfill: el bucket dropset arranca copiando la carga actual, para que
-- ninguna rutina activa quede sin peso sugerido el primer día. A partir de acá
-- cada escalera progresa por su lado y el coach ajusta la que quiera.
-- `current_reps_text` va NULL a propósito: la escalera del dropset arranca
-- desde la prescripción del slot, no desde el estado de las series rectas.
INSERT INTO athlete_exercise_weights
  (athlete_id, exercise_id, current_weight_kg, current_value, unit,
   current_reps_text, updated_by, scheme)
SELECT DISTINCT
       w.athlete_id, w.exercise_id, w.current_weight_kg, w.current_value,
       w.unit, NULL, w.updated_by, 'dropset'
  FROM athlete_exercise_weights w
  JOIN athlete_program_state ps ON ps.athlete_id = w.athlete_id
  JOIN skeleton_slots s
    ON s.skeleton_id = ps.active_skeleton_id
   AND s.exercise_id = w.exercise_id
 WHERE w.scheme = 'normal'
   AND s.reps ~ '^[[:space:]]*[0-9]+[[:space:]]*[x×][[:space:]]*[0-9]+[[:space:]]*[x×]'
ON CONFLICT (athlete_id, exercise_id, scheme) DO NOTHING;
