-- 033_exercise_modality.sql
--
-- Exercises had no notion of modality: every prescription was assumed to be
-- repetitions. Time/distance exercises (e.g. "Bicicleta fija", a 5-min cardio
-- warmup) were forced to show "10 reps". Add an intrinsic modality + a free-text
-- default target, and backfill existing cardio exercises to 'tiempo'.

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS modality TEXT NOT NULL DEFAULT 'reps'
    CHECK (modality IN ('reps', 'tiempo', 'distancia')),
  ADD COLUMN IF NOT EXISTS default_target TEXT;

UPDATE exercises SET modality = 'tiempo' WHERE movement_pattern = 'cardio';
