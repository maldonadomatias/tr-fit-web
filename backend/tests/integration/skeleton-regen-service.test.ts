import { jest } from '@jest/globals';

const mockGenerate = jest.fn<() => Promise<{
  rationale: string;
  days: Array<{ day_index: number; focus: string;
    slots: Array<{ slot_index: number; exercise_id: number; role: 'principal' }> }>;
}>>();
jest.unstable_mockModule('../../src/services/openai.service.js', () => ({
  generateSkeleton: mockGenerate,
}));

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createCoach, createAthlete } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const { regenerateSkeleton } = await import('../../src/services/skeleton-regen.service.js');

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => {
  await resetDatabase();
  mockGenerate.mockReset();
  mockGenerate.mockResolvedValue({
    rationale: 'r',
    days: [{ day_index: 1, focus: 'f',
      slots: [{ slot_index: 1, exercise_id: 1, role: 'principal' }] }],
  });
});
afterAll(async () => { await closePool(); });

async function setTier(athleteId: string, tier: 'basico'|'full'|'premium') {
  await pool.query(
    `UPDATE athlete_profiles SET plan_interest = $1 WHERE user_id = $2`,
    [tier, athleteId],
  );
}

async function ensureFirstExercise() {
  const r = await pool.query<{ id: number }>(`SELECT id FROM exercises LIMIT 1`);
  if (r.rows[0]) return;
  await pool.query(
    `INSERT INTO exercises (name, muscle_group, equipment, movement_pattern,
                            is_principal, is_unilateral, level_min)
     VALUES ('Sentadilla','pierna','barra','squat',true,false,'principiante')
     ON CONFLICT DO NOTHING`,
  );
}

describe('regenerateSkeleton', () => {
  it('basico first regen succeeds (1 total budget)', async () => {
    await ensureFirstExercise();
    const c = await createCoach();
    const a = await createAthlete(c);
    await setTier(a, 'basico');
    const r = await regenerateSkeleton(a);
    expect(r.ok).toBe(true);
    const log = await pool.query<{ result: string }>(
      `SELECT result FROM skeleton_regen_log WHERE athlete_id = $1`, [a],
    );
    expect(log.rows[0].result).toBe('approved_gen');
  });

  it('basico second regen blocked', async () => {
    await ensureFirstExercise();
    const c = await createCoach();
    const a = await createAthlete(c);
    await setTier(a, 'basico');
    await pool.query(
      `INSERT INTO skeleton_regen_log (athlete_id, result) VALUES ($1, 'approved_gen')`,
      [a],
    );
    const r = await regenerateSkeleton(a);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('tier_blocked');
    const log = await pool.query<{ result: string }>(
      `SELECT result FROM skeleton_regen_log
        WHERE athlete_id = $1 ORDER BY requested_at DESC LIMIT 1`, [a],
    );
    expect(log.rows[0].result).toBe('tier_blocked');
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('full first regen succeeds', async () => {
    await ensureFirstExercise();
    const c = await createCoach();
    const a = await createAthlete(c);
    await setTier(a, 'full');
    const r = await regenerateSkeleton(a);
    expect(r.ok).toBe(true);
  });

  it('full second regen within 30 days is rate_limited', async () => {
    await ensureFirstExercise();
    const c = await createCoach();
    const a = await createAthlete(c);
    await setTier(a, 'full');
    await pool.query(
      `INSERT INTO skeleton_regen_log (athlete_id, result) VALUES ($1, 'approved_gen')`,
      [a],
    );
    const r = await regenerateSkeleton(a);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('rate_limited');
  });

  it('full second regen after 31 days succeeds', async () => {
    await ensureFirstExercise();
    const c = await createCoach();
    const a = await createAthlete(c);
    await setTier(a, 'full');
    await pool.query(
      `INSERT INTO skeleton_regen_log (athlete_id, result, requested_at)
       VALUES ($1, 'approved_gen', now() - interval '31 days')`,
      [a],
    );
    const r = await regenerateSkeleton(a);
    expect(r.ok).toBe(true);
  });

  it('premium has no limit', async () => {
    await ensureFirstExercise();
    const c = await createCoach();
    const a = await createAthlete(c);
    await setTier(a, 'premium');
    await pool.query(
      `INSERT INTO skeleton_regen_log (athlete_id, result, requested_at)
       VALUES ($1, 'approved_gen', now()),
              ($1, 'approved_gen', now() - interval '1 day')`,
      [a],
    );
    const r = await regenerateSkeleton(a);
    expect(r.ok).toBe(true);
  });
});
