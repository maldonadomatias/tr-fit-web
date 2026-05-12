export {};
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

describe('migration 015 — skeleton_regen_log', () => {
  it('table exists with FK cascade', async () => {
    const { rows: u } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('r1@t.local','x','athlete') RETURNING id`,
    );
    await pool.query(
      `INSERT INTO skeleton_regen_log (athlete_id, result)
       VALUES ($1, 'approved_gen')`, [u[0].id],
    );
    await pool.query(`DELETE FROM users WHERE id = $1`, [u[0].id]);
    const r = await pool.query(
      `SELECT 1 FROM skeleton_regen_log WHERE athlete_id = $1`, [u[0].id],
    );
    expect(r.rowCount).toBe(0);
  });

  it('rejects invalid result value', async () => {
    const { rows: u } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('r2@t.local','x','athlete') RETURNING id`,
    );
    await expect(
      pool.query(
        `INSERT INTO skeleton_regen_log (athlete_id, result)
         VALUES ($1, 'bogus')`, [u[0].id],
      ),
    ).rejects.toThrow();
  });

  it('accepts all 3 valid result values', async () => {
    const { rows: u } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('r3@t.local','x','athlete') RETURNING id`,
    );
    for (const result of ['approved_gen', 'rate_limited', 'tier_blocked']) {
      await expect(
        pool.query(
          `INSERT INTO skeleton_regen_log (athlete_id, result) VALUES ($1, $2)`,
          [u[0].id, result],
        ),
      ).resolves.not.toThrow();
    }
  });

  it('backfills legacy NULL plan_interest to basico', async () => {
    const r = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM athlete_profiles WHERE plan_interest IS NULL`,
    );
    expect(parseInt(r.rows[0].n, 10)).toBe(0);
  });
});
