import { jest } from '@jest/globals';

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin, createAthlete } = await import('./helpers/fixtures.js');
const {
  insertOverride, hasActiveOverride, applyOverridesToSlots,
} = await import('../../src/services/weekly-overrides.service.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

async function twoExerciseIds(): Promise<[number, number]> {
  const r = await pool.query<{ id: number }>(
    `SELECT id FROM exercises ORDER BY id LIMIT 2`,
  );
  return [r.rows[0].id, r.rows[1].id];
}

it('insertOverride + hasActiveOverride round-trip', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const [origId, replId] = await twoExerciseIds();

  await insertOverride({
    athleteId: ath, programWeek: 3, dayOfWeek: 2,
    originalExerciseId: origId, replacementExerciseId: replId,
    overrideType: 'swap', intensityPayload: {},
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 3,
  });

  expect(await hasActiveOverride(ath, 3, origId)).toBe(true);
  expect(await hasActiveOverride(ath, 3, replId)).toBe(false);
  expect(await hasActiveOverride(ath, 4, origId)).toBe(false); // expired
});

it('applyOverridesToSlots swaps the slot exercise_id', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const [origId, replId] = await twoExerciseIds();

  await insertOverride({
    athleteId: ath, programWeek: 3, dayOfWeek: 2,
    originalExerciseId: origId, replacementExerciseId: replId,
    overrideType: 'swap', intensityPayload: {},
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 3,
  });

  const slots = [
    { skeleton_id: 'x', slot_index: 0, exercise_id: origId, day_of_week: 2 },
    { skeleton_id: 'x', slot_index: 1, exercise_id: 999999, day_of_week: 2 },
  ] as unknown as import('../../src/services/weekly-overrides.service.js').SlotLike[];
  const out = await applyOverridesToSlots(ath, 3, 2, slots);
  expect(out).toHaveLength(2);
  expect(out[0].exercise_id).toBe(replId);
  expect(out[1].exercise_id).toBe(999999);
});

it('applyOverridesToSlots drops the slot on skip', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const [origId] = await twoExerciseIds();

  await insertOverride({
    athleteId: ath, programWeek: 3, dayOfWeek: 2,
    originalExerciseId: origId, replacementExerciseId: null,
    overrideType: 'skip', intensityPayload: {},
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 3,
  });

  const slots = [{ skeleton_id: 'x', slot_index: 0, exercise_id: origId, day_of_week: 2 }] as unknown as import('../../src/services/weekly-overrides.service.js').SlotLike[];
  const out = await applyOverridesToSlots(ath, 3, 2, slots);
  expect(out).toHaveLength(0);
});

it('applyOverridesToSlots ignores expired override', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const [origId, replId] = await twoExerciseIds();

  await insertOverride({
    athleteId: ath, programWeek: 2, dayOfWeek: 2,
    originalExerciseId: origId, replacementExerciseId: replId,
    overrideType: 'swap', intensityPayload: {},
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 2,
  });

  const slots = [{ skeleton_id: 'x', slot_index: 0, exercise_id: origId, day_of_week: 2 }] as unknown as import('../../src/services/weekly-overrides.service.js').SlotLike[];
  const out = await applyOverridesToSlots(ath, 3, 2, slots); // week 3, override died after 2
  expect(out[0].exercise_id).toBe(origId);
});

it('day_of_week NULL matches every day', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const [origId, replId] = await twoExerciseIds();

  await insertOverride({
    athleteId: ath, programWeek: 3, dayOfWeek: null,
    originalExerciseId: origId, replacementExerciseId: replId,
    overrideType: 'swap', intensityPayload: {},
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 3,
  });

  const out = await applyOverridesToSlots(
    ath, 3, 5,
    [{ skeleton_id: 'x', slot_index: 0, exercise_id: origId, day_of_week: 5 }] as unknown as import('../../src/services/weekly-overrides.service.js').SlotLike[],
  );
  expect(out[0].exercise_id).toBe(replId);
});

it('reduce_intensity carries intensity payload on the slot', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const [origId] = await twoExerciseIds();

  await insertOverride({
    athleteId: ath, programWeek: 3, dayOfWeek: 2,
    originalExerciseId: origId, replacementExerciseId: null,
    overrideType: 'reduce_intensity',
    intensityPayload: { sets_delta: -1, rpe_delta: -1 },
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 3,
  });

  const out = await applyOverridesToSlots(
    ath, 3, 2,
    [{ skeleton_id: 'x', slot_index: 0, exercise_id: origId, day_of_week: 2 }] as unknown as import('../../src/services/weekly-overrides.service.js').SlotLike[],
  );
  expect(out[0]._override?.override_type).toBe('reduce_intensity');
  expect(out[0]._override?.intensity_payload).toEqual({ sets_delta: -1, rpe_delta: -1 });
});

it('applyOverridesToSlots does not leak across athletes', async () => {
  const coach = await createAdmin();
  const athA = await createAthlete(coach);
  const athB = await createAthlete(coach);
  const [origId, replId] = await twoExerciseIds();

  await insertOverride({
    athleteId: athA, programWeek: 3, dayOfWeek: 2,
    originalExerciseId: origId, replacementExerciseId: replId,
    overrideType: 'swap', intensityPayload: {},
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 3,
  });

  const out = await applyOverridesToSlots(
    athB, 3, 2,
    [{ skeleton_id: 'x', slot_index: 0, exercise_id: origId, day_of_week: 2 }] as unknown as import('../../src/services/weekly-overrides.service.js').SlotLike[],
  );
  expect(out[0].exercise_id).toBe(origId); // athlete B sees no override
});

it('applyOverridesToSlots ignores override whose day_of_week mismatches slot', async () => {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const [origId, replId] = await twoExerciseIds();

  await insertOverride({
    athleteId: ath, programWeek: 3, dayOfWeek: 2,           // override targets day 2
    originalExerciseId: origId, replacementExerciseId: replId,
    overrideType: 'swap', intensityPayload: {},
    sourceAlertId: null, createdBy: coach, expiresAfterWeek: 3,
  });

  const out = await applyOverridesToSlots(
    ath, 3, 5,                                              // slot is on day 5
    [{ skeleton_id: 'x', slot_index: 0, exercise_id: origId, day_of_week: 5 }] as unknown as import('../../src/services/weekly-overrides.service.js').SlotLike[],
  );
  expect(out[0].exercise_id).toBe(origId);                  // no swap on day 5
});
