-- 038 — Per-slot prescription for accessories.
-- The generator now assigns each accessory its own set-scheme (series/reps/
-- descanso) so a routine reproduces the coach's intra-block variation
-- (e.g. a `10x10x10` drop-set finisher vs straight `8`). See
-- docs/routine-corpus/shared-mechanics.md (M1, M3).
--
-- Nullable: principals + warmups leave these NULL and keep their periodization /
-- warmup defaults; legacy slots also stay NULL (engine falls back to
-- periodization_config). Only accessories use them.
ALTER TABLE skeleton_slots
  ADD COLUMN IF NOT EXISTS series smallint
    CHECK (series IS NULL OR series BETWEEN 1 AND 6),
  ADD COLUMN IF NOT EXISTS reps text
    CHECK (reps IS NULL OR length(reps) BETWEEN 1 AND 40),
  ADD COLUMN IF NOT EXISTS descanso text
    CHECK (descanso IS NULL OR length(descanso) BETWEEN 1 AND 40);
