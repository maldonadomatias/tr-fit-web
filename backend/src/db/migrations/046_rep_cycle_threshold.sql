-- 046_rep_cycle_threshold.sql
--
-- Accessory progression previously hardcoded two rep "topes": a set of four
-- named exercises that climbed to 15 reps before bumping weight, and a default
-- of 12 for everything else (see progression-helpers.ts). Make the tope a
-- per-exercise, coach-editable value. Reps climb by +2 up to this threshold,
-- then reset to a sex-based value and bump the load.

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS rep_cycle_threshold INTEGER NOT NULL DEFAULT 12
    CHECK (rep_cycle_threshold BETWEEN 1 AND 50);

-- Backfill the four legacy "hasta 15" exercises.
UPDATE exercises
   SET rep_cycle_threshold = 15
 WHERE name IN (
   'Face Pull parado con Soga',
   'Vuelos Posteriores Sentado con Mancuernas',
   'Vuelos Laterales con Mancuerna',
   'Vuelo Lateral Unilateral en polea altura Rodilla'
 );
