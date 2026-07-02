-- Coach-corrections-003: "Elevaciones de Pierna Colgado es un ejercicio de
-- avanzados" — the catalog had it as principiante, so the generator offered
-- it to any level. Restrict to advanced athletes; non-advanced plans should
-- get Giro Ruso / Rueda / planchas instead.
UPDATE exercises
   SET level_min = 'avanzado'
 WHERE name = 'Elevaciones de Pierna Colgado';
