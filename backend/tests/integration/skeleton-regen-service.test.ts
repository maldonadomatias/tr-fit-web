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
const { enqueueRegenJob, runRegenJob, PendingReviewExistsError } =
  await import('../../src/services/skeleton-regen.service.js');

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

describe('enqueueRegenJob', () => {
  it('creates a queued job and does not generate synchronously', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    const { jobId } = await enqueueRegenJob(a);
    expect(jobId).toBeDefined();
    const job = await pool.query<{ status: string }>(
      `SELECT status FROM skeleton_regen_jobs WHERE id = $1`, [jobId],
    );
    expect(job.rows[0].status).toBe('queued');
    expect(mockGenerate).not.toHaveBeenCalled();
    const sk = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM athlete_skeletons WHERE athlete_id = $1`, [a],
    );
    expect(sk.rows[0].n).toBe(0);
  });

  it('rejects a second enqueue while a job is active', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await enqueueRegenJob(a);
    await expect(enqueueRegenJob(a)).rejects.toBeInstanceOf(PendingReviewExistsError);
  });

  it('rejects enqueue while a pending_review skeleton exists', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await pool.query(
      `INSERT INTO athlete_skeletons
         (athlete_id, status, generated_by, generation_prompt, generation_rationale)
       VALUES ($1,'pending_review','ai','{}'::jsonb,'x')`,
      [a],
    );
    await expect(enqueueRegenJob(a)).rejects.toBeInstanceOf(PendingReviewExistsError);
  });
});

describe('runRegenJob', () => {
  it('generates, creates a pending_review skeleton, logs approved_gen', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
    const a = await createAthlete(c);
    const { skeletonId } = await runRegenJob(a);
    expect(skeletonId).toBeTruthy();
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    const sk = await pool.query<{ status: string }>(
      `SELECT status FROM athlete_skeletons WHERE id = $1`, [skeletonId],
    );
    expect(sk.rows[0].status).toBe('pending_review');
    const log = await pool.query<{ result: string }>(
      `SELECT result FROM skeleton_regen_log WHERE athlete_id = $1`, [a],
    );
    expect(log.rows[0].result).toBe('approved_gen');
  });

  it('is idempotent when a pending_review skeleton already exists', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await pool.query(
      `INSERT INTO athlete_skeletons
         (athlete_id, status, generated_by, generation_prompt, generation_rationale)
       VALUES ($1,'pending_review','ai','{}'::jsonb,'x')`,
      [a],
    );
    const { skeletonId } = await runRegenJob(a);
    expect(skeletonId).toBeNull();
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
