export {};

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin, createAthlete } = await import('./helpers/fixtures.js');
const { insertOverride } = await import('../../src/services/weekly-overrides.service.js');
const { buildTodaySession } = await import('../../src/services/engine.service.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

// Helper: minimal active skeleton with 2 slots on day 1 for an athlete.
// Uses week 3 (principal_series=3, principal_use_casilleros=true, no pct_rm).
async function seedTwoSlotDay1Skeleton(athId: string): Promise<{ exA: number; exB: number }> {
  const ex = await pool.query<{ id: number }>(
    `SELECT id FROM exercises ORDER BY id LIMIT 2`,
  );
  const [exA, exB] = [ex.rows[0].id, ex.rows[1].id];
  const sk = await pool.query<{ id: string }>(
    `INSERT INTO athlete_skeletons (athlete_id, status, generation_prompt)
     VALUES ($1, 'approved', '{}'::jsonb) RETURNING id`,
    [athId],
  );
  await pool.query(
    `INSERT INTO skeleton_slots (skeleton_id, day_of_week, slot_index, exercise_id, role)
     VALUES ($1, 1, 1, $2, 'principal'), ($1, 1, 2, $3, 'principal')`,
    [sk.rows[0].id, exA, exB],
  );
  await pool.query(
    `INSERT INTO athlete_program_state (athlete_id, current_week, active_skeleton_id, rm_test_blocking, start_date)
     VALUES ($1, 3, $2, false, CURRENT_DATE)
     ON CONFLICT (athlete_id) DO UPDATE SET current_week = 3,
       active_skeleton_id = EXCLUDED.active_skeleton_id, rm_test_blocking = false`,
    [athId, sk.rows[0].id],
  );
  return { exA, exB };
}

it('buildTodaySession returns swapped exercise when override is active', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const { exA, exB } = await seedTwoSlotDay1Skeleton(ath);

  await insertOverride({
    athleteId: ath, programWeek: 3, dayOfWeek: 1,
    originalExerciseId: exA, replacementExerciseId: exB,
    overrideType: 'swap', intensityPayload: {},
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 3,
  });

  const items = await buildTodaySession(ath, 1);
  expect(items.find((i) => i.exercise.id === exA)).toBeUndefined();
  const exBSlots = items.filter((i) => i.exercise.id === exB);
  expect(exBSlots.length).toBeGreaterThanOrEqual(2); // original slot 2 + swapped slot 1
});

it('buildTodaySession drops the slot on skip override', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const { exA } = await seedTwoSlotDay1Skeleton(ath);

  await insertOverride({
    athleteId: ath, programWeek: 3, dayOfWeek: 1,
    originalExerciseId: exA, replacementExerciseId: null,
    overrideType: 'skip', intensityPayload: {},
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 3,
  });

  const items = await buildTodaySession(ath, 1);
  expect(items.find((i) => i.exercise.id === exA)).toBeUndefined();
  expect(items.length).toBe(1); // only slot index 2 remains
});

it('buildTodaySession is unchanged when no overrides exist', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const { exA, exB } = await seedTwoSlotDay1Skeleton(ath);

  const items = await buildTodaySession(ath, 1);
  expect(items.length).toBe(2);
  const ids = items.map((i) => i.exercise.id).sort();
  expect(ids).toEqual([exA, exB].sort());
});

it('reduce_intensity override subtracts series', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const { exA } = await seedTwoSlotDay1Skeleton(ath);

  // Week 3: principal_series=3. After sets_delta=-1 → 2.
  await insertOverride({
    athleteId: ath, programWeek: 3, dayOfWeek: 1,
    originalExerciseId: exA, replacementExerciseId: null,
    overrideType: 'reduce_intensity',
    intensityPayload: { sets_delta: -1 },
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 3,
  });

  const items = await buildTodaySession(ath, 1);
  const it = items.find((i) => i.exercise.id === exA);
  expect(it).toBeDefined();
  expect(it!.series).toBe(2); // was 3 (from periodization_config week 3), minus 1
});

it('reduce_intensity with weight_pct scales suggested_value', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const { exA } = await seedTwoSlotDay1Skeleton(ath);

  // Seed an existing weight so the principal item has a non-null suggested_value.
  await pool.query(
    `INSERT INTO athlete_exercise_weights
       (athlete_id, exercise_id, current_value, current_weight_kg, unit, updated_by)
     VALUES ($1, $2, 100, 100, 'kg', 'progression_cron')
     ON CONFLICT (athlete_id, exercise_id) DO UPDATE
       SET current_value = 100, current_weight_kg = 100, unit = 'kg'`,
    [ath, exA],
  );

  await insertOverride({
    athleteId: ath, programWeek: 3, dayOfWeek: 1,
    originalExerciseId: exA, replacementExerciseId: null,
    overrideType: 'reduce_intensity',
    intensityPayload: { weight_pct: 0.9 },
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 3,
  });

  const items = await buildTodaySession(ath, 1);
  const it = items.find((i) => i.exercise.id === exA);
  expect(it).toBeDefined();
  expect(it!.suggested_value).not.toBeNull();
  // 100 * 0.9 = 90. Exact value depends on rounding (barra→nearest 25, else round).
  // Either branch produces 90 because 90 is divisible by both.
  expect(it!.suggested_value).toBe(90);
});
