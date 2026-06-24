-- 041 — Fixed, precise principal rest.
-- The seed prescribed RANGES for principal_descanso ("2 a 3 min", "3 a 5 min").
-- The app's rest timer (parseDescanso) reads the LOWER bound of a range, so
-- principals rested too little — 2 min where the coach intends a full 3. Pin
-- principals to a single precise value (the range's upper bound):
--   "2 a 3 min" → "3 min"   (the standard hypertrophy/strength weeks)
--   "3 a 5 min" → "5 min"   (RM-test wk 10/30, AMRAP wk 20, pre-RM deload wk 29)
--
-- Principal rest is read LIVE from periodization_config (engine.service builds
-- principal slots with cfg.principal_descanso — it is not copied per slot), so
-- this single update fixes the admin dashboard and every running routine at
-- once. Accessory rest is out of scope and keeps its ranges.

UPDATE periodization_config
   SET principal_descanso = '3 min'
 WHERE principal_descanso = '2 a 3 min';

UPDATE periodization_config
   SET principal_descanso = '5 min'
 WHERE principal_descanso = '3 a 5 min';
