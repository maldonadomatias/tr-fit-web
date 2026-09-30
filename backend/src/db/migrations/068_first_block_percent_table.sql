-- 068 — First block (weeks 1–9) on the coach's percentage table (ticket #57).
--
-- Every week now prescribes fixed reps at a % of the RM30. Weeks 3–8 stop
-- using casilleros. Athletes without an RM30 fall back to the engine's
-- first-block progression (week-to-week +increment, week 9 = week 1 load).
-- Rest follows 041: a single value, "2 a 3 min" pinned to "3 min".

UPDATE periodization_config AS p SET
  principal_series = v.series,
  principal_reps = v.reps,
  principal_descanso = v.descanso,
  principal_pct_rm = v.pct,
  principal_rm_source = 30,
  principal_use_casilleros = FALSE
FROM (VALUES
  (1, 3, '10', '2 min', 0.650),
  (2, 3, '10', '2 min', 0.700),
  (3, 3, '8',  '3 min', 0.750),
  (4, 3, '8',  '3 min', 0.775),
  (5, 3, '6',  '3 min', 0.800),
  (6, 3, '6',  '3 min', 0.825),
  (7, 3, '5',  '3 min', 0.850),
  (8, 3, '3',  '3 min', 0.875),
  (9, 2, '5',  '2 min', 0.600)
) AS v(week, series, reps, descanso, pct)
WHERE p.week_number = v.week;
