-- Auto-generated from src/seeds/port-periodization.ts
-- Source of truth: Google Apps Script obtenerConfiguracionSemana()

INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    1, 'HIPERTROFIA BASE',
    false, false,
    3, '6 a 8', '2 a 3 min',
    0.75,
    30,
    false,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    2, 'HIPERTROFIA BASE',
    false, false,
    3, '6 a 8', '2 a 3 min',
    0.75,
    30,
    false,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    3, 'HIPERTROFIA',
    false, false,
    3, '6 a 8', '2 a 3 min',
    NULL,
    NULL,
    true,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    4, 'HIPERTROFIA',
    false, false,
    3, '6 a 8', '2 a 3 min',
    NULL,
    NULL,
    true,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    5, 'HIPERTROFIA',
    false, false,
    3, '6 a 8', '2 a 3 min',
    NULL,
    NULL,
    true,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    6, 'HIPERTROFIA',
    false, false,
    3, '6 a 8', '2 a 3 min',
    NULL,
    NULL,
    true,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    7, 'FUERZA SUBMÁXIMA',
    false, false,
    3, '4 a 6', '2 a 3 min',
    NULL,
    NULL,
    true,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    8, 'FUERZA MÁXIMA',
    false, false,
    3, '3', '3 min',
    NULL,
    NULL,
    true,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    9, 'DESCARGA',
    false, true,
    1, '5', '2 a 3 min',
    0.8,
    10,
    false,
    2, '12', '60 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    10, 'TESTEO RM',
    true, false,
    1, '1', '3 a 5 min',
    NULL,
    NULL,
    false,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    11, 'HIPERTROFIA',
    false, false,
    3, '8 a 10', '2 a 3 min',
    0.72,
    10,
    false,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    12, 'HIPERTROFIA',
    false, false,
    3, '8', '2 a 3 min',
    0.75,
    10,
    false,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    13, 'TPO. BAJO TENSIÓN (BAJAR EN 2 SEG, MANTENER 1 SEG, SUBIR EN 1 SEG.)',
    false, false,
    3, '6 a 8', '2 a 3 min',
    0.65,
    10,
    false,
    3, '10 a 12', '60 a 90 seg',
    'TIEMPO BAJO TENSIÓN 2-1-1'
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    14, 'FUERZA BASE',
    false, false,
    3, '5', '2 a 3 min',
    0.77,
    10,
    false,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    15, 'FUERZA',
    false, false,
    4, '4', '2 a 3 min',
    0.8,
    10,
    false,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    16, 'FUERZA MÁXIMA',
    false, false,
    4, '3', '3 min',
    0.82,
    10,
    false,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    17, 'FUERZA MÁXIMA',
    false, false,
    3, '3', '3 min',
    0.85,
    10,
    false,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    18, 'DESCARGA',
    false, true,
    1, '6 a 8', '2 a 3 min',
    0.6,
    10,
    false,
    2, '12', '60 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    19, 'FUERZA MÁXIMA',
    false, false,
    3, '3', '3 min',
    0.88,
    10,
    false,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    20, 'TESTEO RM',
    true, false,
    1, '1', '3 a 5 min',
    NULL,
    NULL,
    false,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    21, 'HIPERTROFIA',
    false, false,
    3, '6', '2 a 3 min',
    0.75,
    20,
    false,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    22, 'HIPERTROFIA',
    false, false,
    3, '6', '2 a 3 min',
    0.77,
    20,
    false,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    23, 'TPO. BAJO TENSIÓN (BAJAR EN 2 SEG, MANTENER 1 SEG, SUBIR EN 1 SEG.)',
    false, false,
    3, '6 a 8', '2 a 3 min',
    0.7,
    20,
    false,
    3, '10 a 12', '60 a 90 seg',
    'TIEMPO BAJO TENSIÓN 2-1-1'
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    24, 'FUERZA BASE',
    false, false,
    3, '6', '2 a 3 min',
    0.78,
    20,
    false,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    25, 'FUERZA',
    false, false,
    3, '4', '3 min',
    0.8,
    20,
    false,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    26, 'FUERZA MÁXIMA',
    false, false,
    3, '3', '3 min',
    0.83,
    20,
    false,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    27, 'DESCARGA',
    false, true,
    1, '6 a 8', '2 a 3 min',
    0.6,
    20,
    false,
    2, '12', '60 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    28, 'HIPERTROFIA',
    false, false,
    3, '6 a 8', '2 a 3 min',
    0.75,
    20,
    false,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    29, 'DESCARGA - PRE RM',
    false, true,
    2, '3', '3 a 5 min',
    0.72,
    20,
    false,
    2, '12', '60 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    30, 'TESTEO RM',
    true, false,
    1, '1', '3 a 5 min',
    NULL,
    NULL,
    false,
    3, '10 a 12', '60 a 90 seg',
    NULL
  ) ON CONFLICT (week_number) DO NOTHING;
