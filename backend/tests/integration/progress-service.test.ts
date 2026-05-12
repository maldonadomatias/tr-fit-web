export {};
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createCoach, createAthlete } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;
const {
  listRmHistory, listCompliance, listVolume,
} = await import('../../src/services/progress.service.js');

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('listRmHistory', () => {
  it('groups rm_tests by exercise sorted by program_week', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    const ex = await pool.query<{ id: number }>(`SELECT id FROM exercises LIMIT 1`);
    const exId = ex.rows[0].id;
    await pool.query(
      `INSERT INTO rm_tests (athlete_id, exercise_id, program_week, value_kg)
       VALUES ($1, $2, 10, 100), ($1, $2, 20, 110), ($1, $2, 30, 120)`,
      [a, exId],
    );
    const r = await listRmHistory(a);
    expect(r).toHaveLength(1);
    expect(r[0].exercise_id).toBe(exId);
    expect(r[0].data.map((p) => p.program_week)).toEqual([10, 20, 30]);
    expect(r[0].data.map((p) => Number(p.value_kg))).toEqual([100, 110, 120]);
  });

  it('returns empty when no rm_tests', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    const r = await listRmHistory(a);
    expect(r).toEqual([]);
  });
});

describe('listCompliance', () => {
  it('groups finished sessions by program_week', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    const sk = await pool.query<{ id: string }>(
      `INSERT INTO athlete_skeletons (athlete_id, status, generation_prompt)
       VALUES ($1, 'approved', '{}'::jsonb) RETURNING id`,
      [a],
    );
    await pool.query(
      `INSERT INTO session_logs
         (athlete_id, skeleton_id, program_week, day_of_week, finished_at,
          compliance_pct, total_sets_target, total_sets_completed)
       VALUES
         ($1, $2, 1, 1, now(), 100, 5, 5),
         ($1, $2, 1, 3, now(), 80, 5, 4)`,
      [a, sk.rows[0].id],
    );
    const r = await listCompliance(a, 12);
    expect(r).toHaveLength(1);
    expect(r[0].program_week).toBe(1);
    expect(r[0].completed).toBe(2);
  });
});

describe('listVolume', () => {
  it('returns volume per finished session', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    const sk = await pool.query<{ id: string }>(
      `INSERT INTO athlete_skeletons (athlete_id, status, generation_prompt)
       VALUES ($1, 'approved', '{}'::jsonb) RETURNING id`,
      [a],
    );
    await pool.query(
      `INSERT INTO session_logs
         (athlete_id, skeleton_id, program_week, day_of_week,
          finished_at, total_volume_kg)
       VALUES ($1, $2, 1, 1, now(), 1500.50)`,
      [a, sk.rows[0].id],
    );
    const r = await listVolume(a, 12);
    expect(r).toHaveLength(1);
    expect(Number(r[0].total_kg)).toBeCloseTo(1500.50, 1);
  });

  it('excludes unfinished sessions', async () => {
    const c = await createCoach();
    const a = await createAthlete(c);
    const sk = await pool.query<{ id: string }>(
      `INSERT INTO athlete_skeletons (athlete_id, status, generation_prompt)
       VALUES ($1, 'approved', '{}'::jsonb) RETURNING id`,
      [a],
    );
    await pool.query(
      `INSERT INTO session_logs
         (athlete_id, skeleton_id, program_week, day_of_week, total_volume_kg)
       VALUES ($1, $2, 1, 1, 1000)`,
      [a, sk.rows[0].id],
    );
    const r = await listVolume(a, 12);
    expect(r).toEqual([]);
  });
});
