import { jest } from '@jest/globals';

const mockGenerate = jest.fn<() => Promise<{
  rationale: string;
  days: Array<{ day_index: number; focus: string;
    slots: Array<{ slot_index: number; exercise_id: number; role: 'principal', notes: null }> }>;
}>>();
jest.unstable_mockModule('../../src/services/openai.service.js', () => ({
  generateSkeleton: mockGenerate,
}));

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin, createAthlete } = await import('./helpers/fixtures.js');
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
      slots: [{ slot_index: 1, exercise_id: 1, role: 'principal', notes: null }] }],
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

// Tier-based gating was removed when the app unlocked all features client-side.
// Regeneration is now always allowed regardless of plan_interest or prior count.
describe('regenerateSkeleton (no tier gating)', () => {
  it('basico regen succeeds and logs approved_gen', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
    const a = await createAthlete(c);
    await setTier(a, 'basico');
    const r = await regenerateSkeleton(a);
    expect(r.ok).toBe(true);
    const log = await pool.query<{ result: string }>(
      `SELECT result FROM skeleton_regen_log WHERE athlete_id = $1`, [a],
    );
    expect(log.rows[0].result).toBe('approved_gen');
  });

  it('basico regen still succeeds after a prior regen (no 1-total limit)', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
    const a = await createAthlete(c);
    await setTier(a, 'basico');
    await pool.query(
      `INSERT INTO skeleton_regen_log (athlete_id, result) VALUES ($1, 'approved_gen')`,
      [a],
    );
    const r = await regenerateSkeleton(a);
    expect(r.ok).toBe(true);
    expect(mockGenerate).toHaveBeenCalled();
  });

  it('full regen still succeeds within 30 days (no monthly limit)', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
    const a = await createAthlete(c);
    await setTier(a, 'full');
    await pool.query(
      `INSERT INTO skeleton_regen_log (athlete_id, result) VALUES ($1, 'approved_gen')`,
      [a],
    );
    const r = await regenerateSkeleton(a);
    expect(r.ok).toBe(true);
  });

  it('regen succeeds with no plan_interest set (null tier)', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
    const a = await createAthlete(c);
    await pool.query(
      `UPDATE athlete_profiles SET plan_interest = NULL WHERE user_id = $1`, [a],
    );
    const r = await regenerateSkeleton(a);
    expect(r.ok).toBe(true);
  });

  it('premium regen succeeds (unchanged)', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
    const a = await createAthlete(c);
    await setTier(a, 'premium');
    const r = await regenerateSkeleton(a);
    expect(r.ok).toBe(true);
  });
});

describe('regenerateSkeleton concurrency', () => {
  it('serializes concurrent calls via advisory lock — both succeed', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
    const a = await createAthlete(c);
    await setTier(a, 'basico');

    // Fire two regens at once. The advisory lock still serializes them so they
    // don't race on the same athlete, but neither is blocked by a tier budget.
    const [r1, r2] = await Promise.all([
      regenerateSkeleton(a),
      regenerateSkeleton(a),
    ]);

    expect([r1, r2].filter((r) => r.ok).length).toBe(2);
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });
});
