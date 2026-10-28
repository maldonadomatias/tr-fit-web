-- 074 — Default slot prescription on the exercise itself.
--
-- Molpo #143: the coach sets series, rest, and comments on a catalog
-- exercise (new or existing). Adding that exercise to a routine, or
-- swapping an accessory to it, copies those values the same way the
-- HYROX sessions already did. Reps / time / distance stay in
-- default_target. Warmups keep using default_target on their own.
--
-- Slot columns cap series at 6 and descanso at 40 (038). Notes on the
-- slot are unbounded; 2000 is enough for a coach block like HYROX.

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS default_series SMALLINT
    CHECK (default_series IS NULL OR default_series BETWEEN 1 AND 6),
  ADD COLUMN IF NOT EXISTS default_descanso TEXT
    CHECK (default_descanso IS NULL OR length(default_descanso) BETWEEN 1 AND 40),
  ADD COLUMN IF NOT EXISTS default_notes TEXT
    CHECK (default_notes IS NULL OR length(default_notes) BETWEEN 1 AND 2000);

-- Keep the two HYROX blocks that used to live only in the admin UI.
UPDATE exercises
   SET default_series = 2,
       default_descanso = '3 min',
       default_target = COALESCE(NULLIF(btrim(default_target), ''), '2,1 km'),
       default_notes = $hyrox$CINTA 400 MTS + LUNGES 20 REPS +
CINTA 400 MTS + REMO ROW 500 MTS +
CINTA 400 MTS + THRUSTERS 15 REPS +
CINTA 400 MTS - (Fin de Serie 1)$hyrox$
 WHERE lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = 'hyrox session lvl 1';

UPDATE exercises
   SET default_series = 1,
       default_descanso = '3 min',
       default_target = COALESCE(NULLIF(btrim(default_target), ''), '3,8 Km'),
       default_notes = $hyrox$CINTA 800 MTS + THRUSTERS 25 REPS +
CINTA 800 MTS + BURPEES TO PLATE 15 REPS +
CINTA 800 MTS + SLAMBALL 25 REPS +
CINTA 800 MTS + REMO ROW 600 MTS - (Fin de serie 1)$hyrox$
 WHERE lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = 'hyrox session lvl 2';
