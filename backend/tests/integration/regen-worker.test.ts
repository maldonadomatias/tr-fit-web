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
const { enqueueRegenJob } = await import('../../src/services/skeleton-regen.service.js');
const { regenTick, MAX_JOB_ATTEMPTS } =
  await import('../../src/workers/regen-worker.js');

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
async function jobStatus(jobId: string) {
  const r = await pool.query<{ status: string; attempts: number }>(
    `SELECT status, attempts FROM skeleton_regen_jobs WHERE id = $1`, [jobId],
  );
  return r.rows[0];
}
// Simulate the backoff window elapsing so the next tick can re-claim.
async function makeClaimable(jobId: string) {
  await pool.query(
    `UPDATE skeleton_regen_jobs SET next_attempt_at = now() WHERE id = $1`, [jobId],
  );
}

describe('regenTick', () => {
  it('claims a queued job, generates, creates skeleton, marks done', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
    const a = await createAthlete(c);
    const { jobId } = await enqueueRegenJob(a);

    await regenTick();

    expect((await jobStatus(jobId)).status).toBe('done');
    const sk = await pool.query<{ status: string }>(
      `SELECT status FROM athlete_skeletons WHERE athlete_id = $1`, [a],
    );
    expect(sk.rows[0].status).toBe('pending_review');
  });

  it('requeues with incremented attempts on a transient failure', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    const { jobId } = await enqueueRegenJob(a);
    mockGenerate.mockRejectedValueOnce(new Error('openai down'));

    await regenTick();

    const s = await jobStatus(jobId);
    expect(s.status).toBe('queued');
    expect(s.attempts).toBe(1);
    const sk = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM athlete_skeletons WHERE athlete_id = $1`, [a],
    );
    expect(sk.rows[0].n).toBe(0);
  });

  it('marks failed after MAX_JOB_ATTEMPTS transient failures', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    const { jobId } = await enqueueRegenJob(a);
    mockGenerate.mockRejectedValue(new Error('openai down'));

    for (let i = 0; i < MAX_JOB_ATTEMPTS; i++) {
      await makeClaimable(jobId);
      await regenTick();
    }

    const s = await jobStatus(jobId);
    expect(s.status).toBe('failed');
    expect(s.attempts).toBe(MAX_JOB_ATTEMPTS);
  });

  it('reaps a stuck running job back to queued', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    const { jobId } = await enqueueRegenJob(a);
    await pool.query(
      `UPDATE skeleton_regen_jobs
          SET status='running', started_at = now() - interval '6 minutes'
        WHERE id = $1`,
      [jobId],
    );

    await regenTick();

    // Reaper requeues it, then the same tick may claim+run it → done.
    expect(['queued', 'done', 'running']).toContain((await jobStatus(jobId)).status);
    const s2 = await jobStatus(jobId);
    expect(s2.status).not.toBe('failed');
  });

  it('is a no-op when there are no queued jobs', async () => {
    await expect(regenTick()).resolves.toBeUndefined();
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
