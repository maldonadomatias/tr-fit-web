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
const { regenerateSkeleton, PendingReviewExistsError } = await import('../../src/services/skeleton-regen.service.js');

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
  it('serializes concurrent calls — one succeeds, the other is rejected', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
    const a = await createAthlete(c);
    await setTier(a, 'basico');

    const results = await Promise.allSettled([
      regenerateSkeleton(a),
      regenerateSkeleton(a),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      PendingReviewExistsError,
    );

    const rows = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM athlete_skeletons
        WHERE athlete_id = $1 AND status = 'pending_review'`,
      [a],
    );
    expect(rows.rows[0].n).toBe(1);
  });
});

describe('regenerateSkeleton single-pending guard', () => {
  it('rejects a second regen while a pending_review skeleton exists', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
    const a = await createAthlete(c);
    await setTier(a, 'basico');

    const first = await regenerateSkeleton(a);
    expect(first.ok).toBe(true);

    await expect(regenerateSkeleton(a)).rejects.toBeInstanceOf(
      PendingReviewExistsError,
    );

    const rows = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM athlete_skeletons
        WHERE athlete_id = $1 AND status = 'pending_review'`,
      [a],
    );
    expect(rows.rows[0].n).toBe(1);
    // Second attempt must not call the (mocked) generator.
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('allows regen again after the pending is approved/superseded', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
    const a = await createAthlete(c);
    await setTier(a, 'basico');

    await regenerateSkeleton(a);
    await pool.query(
      `UPDATE athlete_skeletons SET status = 'superseded'
        WHERE athlete_id = $1 AND status = 'pending_review'`,
      [a],
    );
    const again = await regenerateSkeleton(a);
    expect(again.ok).toBe(true);
  });
});
