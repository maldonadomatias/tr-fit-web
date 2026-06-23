-- 039 — Lower starting accessory volume (coach "ley de entrenamiento").
-- The seed prescribed accessories at 3 × "10 a 12" on the normal hypertrophy
-- weeks, which is too much volume / too many reps to begin with. Drop those to
-- 2 × "6 a 8" (matches the principals' starting reps). Per-athlete progression
-- (athlete_exercise_weights.current_reps_text) still advances reps on its own
-- once every set is completed, so "6 a 8" is a safe, self-progressing floor.
--
-- Only the standard 3/"10 a 12" rows are touched; special weeks (RM tests,
-- deloads encoded as 2/"12", etc.) keep their bespoke accessory scheme.
UPDATE periodization_config
   SET accesorio_series = 2,
       accesorio_reps = '6 a 8'
 WHERE accesorio_series = 3
   AND accesorio_reps = '10 a 12';
