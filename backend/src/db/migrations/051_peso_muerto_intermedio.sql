-- Coach-corrections-001 (D3 mujer): "Debería hacer peso muerto con barra
-- (principal)" — prescribed to a nivel-medio athlete. The catalog had it as
-- 'avanzado', which excluded it from every non-advanced athlete's pool and
-- forced an AI swap on the coach's own template ham days. The coach's real
-- floor is intermedio (same tier as Sentadilla/Remo con Barra).
UPDATE exercises
   SET level_min = 'intermedio'
 WHERE name = 'Peso Muerto con Barra';
