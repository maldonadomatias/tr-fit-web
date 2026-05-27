-- 028_fix_abdomen_bodyweight.sql
--
-- Bug: bodyweight abdomen exercises were misclassified as 'mancuerna' by
-- enrich-exercises.ts inferEquipment fallback, causing the mobile app to
-- require a weight input on exercises that have none.
--
-- Migration 025 used ON CONFLICT (name) DO NOTHING so the regenerated seed
-- alone cannot update existing rows. This migration patches them in-place.

UPDATE exercises
   SET equipment = 'bw',
       default_increment_kg = 1
 WHERE name IN (
   'Rueda Abdominal',
   'Elevaciones de Pierna Colgado',
   'Abdominales Cortos + Largos',
   'Abdominales Bicicleta'
 )
   AND equipment = 'mancuerna';
