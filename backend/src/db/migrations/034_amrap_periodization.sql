-- AMRAP support: theoretical 1RM (Epley) at week 20, plus periodization resync.

ALTER TABLE periodization_config
  ADD COLUMN IF NOT EXISTS is_amrap BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE rm_tests
  ADD COLUMN IF NOT EXISTS amrap_weight NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS amrap_reps INT;

-- Resync weeks that diverged from the updated 30-week script.
-- is_deload / accesorio_* are intentionally left untouched. block_label is only
-- updated for week 20, which is no longer an RM test but an AMRAP test.
UPDATE periodization_config SET
  principal_series = 2, principal_reps = '2 a 3', principal_descanso = '2 a 3 min',
  principal_pct_rm = 0.80, principal_rm_source = 30
WHERE week_number = 9;

UPDATE periodization_config SET
  principal_series = 2, principal_reps = '2 a 3', principal_descanso = '2 a 3 min',
  principal_pct_rm = 0.80, principal_rm_source = 10
WHERE week_number = 18;

UPDATE periodization_config SET
  principal_series = 1, principal_reps = 'AMRAP', principal_descanso = '3 a 5 min',
  principal_pct_rm = 0.85, principal_rm_source = 10,
  is_rm_test = FALSE, is_amrap = TRUE, block_label = 'TESTEO AMRAP'
WHERE week_number = 20;

UPDATE periodization_config SET
  principal_series = 2, principal_reps = '2 a 3', principal_descanso = '2 a 3 min',
  principal_pct_rm = 0.80, principal_rm_source = 20
WHERE week_number = 27;
