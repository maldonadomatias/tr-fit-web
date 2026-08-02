-- days_specific[i] is the weekday of session i+1, so it has to be stored in
-- weekday order. The app saved it in tap order, so an athlete who picked
-- lun/mar/vie/jue ended up shown as "Día 3 · Viernes, Día 4 · Jueves".
-- Normalizes the existing rows; new writes are sorted in domain/schemas.ts.
UPDATE athlete_profiles p
   SET days_specific = s.sorted
  FROM (
    SELECT user_id,
           ARRAY(
             SELECT d
               FROM unnest(days_specific) AS d
              ORDER BY array_position(
                ARRAY['lun','mar','mie','jue','vie','sab','dom'], d)
           ) AS sorted
      FROM athlete_profiles
     WHERE days_specific IS NOT NULL
  ) s
 WHERE p.user_id = s.user_id
   AND p.days_specific IS DISTINCT FROM s.sorted;
