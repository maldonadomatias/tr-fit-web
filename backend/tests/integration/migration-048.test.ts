export {};
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin, createAthlete } = await import('./helpers/fixtures.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('migration 048 skeleton_regen_jobs', () => {
  it('accepts a queued job row with defaults', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    const r = await pool.query(
      `INSERT INTO skeleton_regen_jobs (athlete_id, status) VALUES ($1, 'queued')
       RETURNING attempts, next_attempt_at, created_at`,
      [a],
    );
    expect(r.rows[0].attempts).toBe(0);
    expect(r.rows[0].next_attempt_at).toBeDefined();
  });

  it('rejects an off-list status', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await expect(
      pool.query(
        `INSERT INTO skeleton_regen_jobs (athlete_id, status) VALUES ($1, 'bogus')`,
        [a],
      ),
    ).rejects.toThrow();
  });

  it('cascades on athlete delete', async () => {
    const c = await createAdmin();
    const a = await createAthlete(c);
    await pool.query(
      `INSERT INTO skeleton_regen_jobs (athlete_id, status) VALUES ($1, 'queued')`, [a],
    );
    await pool.query(`DELETE FROM users WHERE id = $1`, [a]);
    const r = await pool.query(
      `SELECT count(*)::int AS n FROM skeleton_regen_jobs WHERE athlete_id = $1`, [a],
    );
    expect(r.rows[0].n).toBe(0);
  });
});
