import { jest } from '@jest/globals';

// Template-first generation only calls the AI adjuster when the profile
// can't use a coach template verbatim; the default fixture athlete is clean
// (male, 4 days, gym_completo, 60 min) so regen resolves from the template.
const mockAdjust = jest.fn<() => Promise<{
  rationale: string;
  days: Array<{ day_index: number; focus: string;
    slots: Array<{ slot_index: number; exercise_id: number; role: 'principal', notes: null,
      series: null, reps: null, descanso: null }> }>;
}>>();
jest.unstable_mockModule('../../src/services/openai.service.js', () => ({
  adjustSkeleton: mockAdjust,
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
  mockAdjust.mockReset();
  mockAdjust.mockResolvedValue({
    rationale: 'r',
    days: [{ day_index: 1, focus: 'f',
      slots: [{ slot_index: 1, exercise_id: 1, role: 'principal', notes: null,
        series: null, reps: null, descanso: null }] }],
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
    expect(mockAdjust).not.toHaveBeenCalled();
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
    // Clean fixture athlete → coach template verbatim, no AI call.
    expect(mockAdjust).not.toHaveBeenCalled();
    const sk = await pool.query<{ status: string; source: string }>(
      `SELECT status, generation_prompt->>'source' AS source
         FROM athlete_skeletons WHERE id = $1`, [skeletonId],
    );
    expect(sk.rows[0].status).toBe('pending_review');
    expect(sk.rows[0].source).toBe('template');
    const slotCount = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM skeleton_slots WHERE skeleton_id = $1`,
      [skeletonId],
    );
    expect(slotCount.rows[0].n).toBeGreaterThan(0);
    const log = await pool.query<{ result: string }>(
      `SELECT result FROM skeleton_regen_log WHERE athlete_id = $1`, [a],
    );
    expect(log.rows[0].result).toBe('approved_gen');
  });

  it('profile outside the template matrix goes through the AI adjuster', async () => {
    await ensureFirstExercise();
    const c = await createAdmin();
    // 2 days/week is outside the coach template matrix (3-5).
    const a = await createAthlete(c, { days_per_week: 2 });
    const { skeletonId } = await runRegenJob(a);
    expect(skeletonId).toBeTruthy();
    expect(mockAdjust).toHaveBeenCalledTimes(1);
    const sk = await pool.query<{ status: string; source: string }>(
      `SELECT status, generation_prompt->>'source' AS source
         FROM athlete_skeletons WHERE id = $1`, [skeletonId],
    );
    expect(sk.rows[0].status).toBe('pending_review');
    expect(sk.rows[0].source).toBe('template+ai');
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
    expect(mockAdjust).not.toHaveBeenCalled();
  });
});
