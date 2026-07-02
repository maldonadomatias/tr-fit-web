-- Coach-corrections-004: with a lumbar injury, standing barbell overhead
-- press is prohibited ("por el arqueo del lumbar al levantar"), same as
-- barbell rows. The catalog only listed 'hombro'; add 'lumbar'.
UPDATE exercises
   SET contraindicated_for = array_append(contraindicated_for, 'lumbar')
 WHERE name = 'Press Militar con Barra parado'
   AND NOT ('lumbar' = ANY(contraindicated_for));
